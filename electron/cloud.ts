import fs from 'node:fs'
import path from 'node:path'
import axios, { AxiosError } from 'axios'
import { app, safeStorage } from 'electron'
import { generateUniqueFileName } from './lib/tools.ts'
import type { PendingCloudTask, ResumedCloudTask } from './types.ts'
import type { MediaScriptBrief } from './types.ts'
import {
  assertRunAsset,
  downloadMedia,
  ensureRunDir,
  getRunAssetPath,
  mediaDuration,
  relativeRunAsset,
  getRunDir,
  writeDataUrl,
} from './media-workspace.ts'

export const API_ORIGIN = 'https://api.jiucaihezi.studio'
export const OPENAI_BASE_URL = `${API_ORIGIN}/v1`
export const API_KEYS_URL = `${API_ORIGIN}/keys`
export const TEXT_MODEL = 'gemini-3.6-flash'

const KEY_FILE = 'jiucai-api-key.bin'
const SKILLS = new Set(['jc-media-script', 'jc-script-storyboard', 'jc-gpt-image', 'jc-voice-design'])
const runControllers = new Map<string, Set<AbortController>>()
const runJsonWrites = new Map<string, Promise<void>>()
let sessionApiKey = ''

function keyPath() {
  return path.join(app.getPath('userData'), KEY_FILE)
}

export async function hasApiKey() {
  try {
    return Boolean(await readApiKey())
  } catch {
    return false
  }
}

export async function saveApiKey(apiKey: string) {
  const clean = apiKey.trim()
  if (!clean) {
    sessionApiKey = ''
    await fs.promises.rm(keyPath(), { force: true })
    return true
  }
  sessionApiKey = clean
  if (!safeStorage.isEncryptionAvailable()) {
    await fs.promises.rm(keyPath(), { force: true })
    return false
  }
  await fs.promises.mkdir(path.dirname(keyPath()), { recursive: true })
  await fs.promises.writeFile(keyPath(), safeStorage.encryptString(clean), { mode: 0o600 })
  return true
}

async function readApiKey() {
  if (sessionApiKey) return sessionApiKey
  let encrypted: Buffer
  try {
    encrypted = await fs.promises.readFile(keyPath())
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw new Error('请先配置韭菜盒子 API Key')
    throw error
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用')
  return safeStorage.decryptString(encrypted).trim()
}

function friendlyError(error: unknown): Error {
  if (axios.isCancel(error)) return new Error('任务已停止；云端任务可能仍会继续并产生费用')
  if (!(error instanceof AxiosError))
    return error instanceof Error ? error : new Error(String(error))
  if (error.response?.status === 401 || error.response?.status === 403)
    return new Error('API Key 无效或没有权限')
  if (error.response?.status === 429) return new Error('请求过于频繁，请稍后重试')
  const detail =
    typeof error.response?.data === 'string'
      ? error.response.data
      : (error.response?.data as any)?.error?.message || (error.response?.data as any)?.message
  return new Error(
    detail
      ? `云端请求失败：${String(detail).slice(0, 180)}`
      : `云端请求失败 (${error.response?.status || '网络错误'})`,
  )
}

async function request<T = any>(
  method: 'GET' | 'POST',
  route: string,
  data?: unknown,
  signal?: AbortSignal,
) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request<T>({
      method,
      url: `${API_ORIGIN}${route}`,
      data,
      timeout: method === 'GET' ? 60_000 : 300_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal,
    })
    const payload: any = response.data
    if (payload?.success === false || payload?.error?.message) {
      throw new Error(payload?.error?.message || payload?.message || '上游任务失败')
    }
    return response.data
  } catch (error) {
    throw friendlyError(error)
  }
}

async function downloadResultMedia(url: string, outputPath: string, signal?: AbortSignal) {
  const apiKey = new URL(url).origin === API_ORIGIN ? await readApiKey() : ''
  return downloadMedia(
    url,
    outputPath,
    signal,
    apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : undefined,
  )
}

export async function testApiKey() {
  await request('GET', '/v1/models')
  return true
}

export async function generateScript(brief: MediaScriptBrief) {
  if (!brief?.request?.trim()) throw new Error('视频诉求不能为空')
  if (![10, 15, 30].includes(brief.targetDuration)) throw new Error('目标时长无效')
  if (brief.ratio !== '9:16' && brief.ratio !== '16:9') throw new Error('画面比例无效')
  if (!['live-action', 'illustration', '3d', 'clay'].includes(brief.styleId)) {
    throw new Error('视觉风格无效')
  }
  const result = await runSkill('jc-media-script', JSON.stringify(brief))
  const text = String(result?.text || '').trim()
  if (!text) throw new Error('文稿模型没有返回正文')
  return text
}

export async function runSkill(skillName: string, input: string, runId?: string) {
  if (!SKILLS.has(skillName)) throw new Error('未知的内置 Skill')
  const skillPath = path.join(process.env.APP_ROOT, 'skills', skillName, 'SKILL.md')
  const system = await fs.promises.readFile(skillPath, 'utf8')
  const prompt = `${input}\n\n只输出合法 JSON，不要使用 Markdown 代码块。`
  const action = async (signal?: AbortSignal) => {
    const output = await generateText(system, prompt, signal)
    try {
      return parseJson(output)
    } catch {
      return parseJson(
        await generateText(system, `${prompt}\n\n上次输出不是合法 JSON，请严格修正。`, signal),
      )
    }
  }
  return runId ? withRunAbort(runId, action) : action()
}

async function generateText(system: string, prompt: string, signal?: AbortSignal) {
  const data: any = await request(
    'POST',
    '/v1/chat/completions',
    {
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      stream: false,
    },
    signal,
  )
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('文稿模型没有返回内容')
  return text.trim()
}

function parseJson(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(clean)
  } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1))
    throw new Error('模型返回的 JSON 无法解析')
  }
}

function extractTaskId(data: any): string {
  const nested = data?.data
  return String(
    data?.rh_task_id ||
      (typeof nested === 'string' ? nested : nested?.task_id || nested?.taskId || nested?.id) ||
      data?.task_id ||
      data?.taskId ||
      data?.id ||
      '',
  )
}

function extractStatus(data: any): string {
  return String(
    data?.status || data?.data?.status || data?.state || data?.data?.state || '',
  ).toLowerCase()
}

function extractMediaUrl(data: any, kind: 'image' | 'video' | 'audio'): string {
  const seen = new Set<object>()
  const walk = (value: any): string => {
    if (typeof value === 'string') return /^(https:|data:)/.test(value) ? value : ''
    if (!value || typeof value !== 'object' || seen.has(value)) return ''
    seen.add(value)
    if (typeof value.b64_json === 'string')
      return `data:${kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg'};base64,${value.b64_json}`
    for (const key of [
      'url',
      'result_url',
      'video_url',
      'videoUrl',
      'audio_url',
      'audioUrl',
      'image_url',
      'imageUrl',
      'output',
    ]) {
      if (typeof value[key] === 'string' && /^(https:|data:)/.test(value[key])) return value[key]
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = walk(item)
          if (found) return found
        }
      } else {
        const found = walk(child)
        if (found) return found
      }
    }
    return ''
  }
  return walk(data)
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('任务已停止；云端任务可能仍会继续并产生费用'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('任务已停止；云端任务可能仍会继续并产生费用'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function poll(pollRoute: string, kind: 'image' | 'video' | 'audio', signal?: AbortSignal) {
  for (let attempt = 0; attempt < 120; attempt++) {
    await wait(5_000, signal)
    const data: any = await request('GET', pollRoute, undefined, signal)
    const status = extractStatus(data)
    if (/^(completed|complete|success|succeeded|done)$/.test(status)) {
      const url = extractMediaUrl(data, kind)
      if (url) return url
    }
    if (/^(failed|failure|fail|error|cancelled|canceled)$/.test(status)) {
      throw Object.assign(
        new Error(String(data?.fail_reason || data?.error?.message || data?.message || '生成失败')),
        { terminal: true },
      )
    }
  }
  throw new Error('生成超时，请稍后重试')
}

function runJsonPath(runId: string) {
  return path.join(getRunDir(runId), 'run.json')
}

async function readPending(runId: string): Promise<PendingCloudTask[]> {
  try {
    const data = JSON.parse(await fs.promises.readFile(runJsonPath(runId), 'utf8'))
    return Array.isArray(data?.pending) ? data.pending : []
  } catch (error: any) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function mutatePending(
  runId: string,
  change: (tasks: PendingCloudTask[]) => PendingCloudTask[],
) {
  const previous = runJsonWrites.get(runId) || Promise.resolve()
  const next = previous.then(async () => {
    await ensureRunDir(runId)
    const filePath = runJsonPath(runId)
    const tempPath = `${filePath}.tmp`
    await fs.promises.writeFile(
      tempPath,
      JSON.stringify({ pending: change(await readPending(runId)) }, null, 2),
    )
    await fs.promises.rename(tempPath, filePath)
  })
  runJsonWrites.set(runId, next)
  try {
    await next
  } finally {
    if (runJsonWrites.get(runId) === next) runJsonWrites.delete(runId)
  }
}

async function putPending(runId: string, task: PendingCloudTask) {
  await mutatePending(runId, (tasks) => [...tasks.filter((item) => item.id !== task.id), task])
}

async function removePending(runId: string, id: string) {
  await mutatePending(runId, (tasks) => tasks.filter((item) => item.id !== id))
}

async function finishPending(runId: string, task: PendingCloudTask, signal?: AbortSignal) {
  const outputPath = assertRunAsset(runId, task.outputPath)
  if (!fs.existsSync(outputPath)) {
    let url = task.resultUrl
    if (!url && task.pollRoute) {
      try {
        url = await poll(
          task.pollRoute,
          task.kind === 'voice' ? 'audio' : task.kind === 'storyboard' ? 'image' : 'video',
          signal,
        )
      } catch (error) {
        if ((error as any)?.terminal) await removePending(runId, task.id)
        throw error
      }
      task = { ...task, resultUrl: url }
      await putPending(runId, task)
    }
    if (!url) throw new Error('任务缺少结果地址')
    if (url.startsWith('data:')) await writeDataUrl(url, outputPath)
    else await downloadResultMedia(url, outputPath, signal)
  }
  await removePending(runId, task.id)
  return outputPath
}

export async function withRunAbort<T>(runId: string, action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const controllers = runControllers.get(runId) || new Set<AbortController>()
  controllers.add(controller)
  runControllers.set(runId, controllers)
  try {
    return await action(controller.signal)
  } finally {
    if (controller.signal.aborted) await mutatePending(runId, () => [])
    controllers.delete(controller)
    if (!controllers.size) runControllers.delete(runId)
  }
}

export async function cancelRun(runId: string) {
  const controllers = runControllers.get(runId)
  controllers?.forEach((controller) => controller.abort())
  await mutatePending(runId, () => [])
  return controllers?.size || 0
}

function pendingTask(
  runId: string,
  kind: PendingCloudTask['kind'],
  index: number,
  outputPath: string,
  data: any,
  resultUrl: string,
  pollRoute?: string,
): PendingCloudTask {
  return {
    id: `${kind}:${index}`,
    kind,
    index,
    taskId: extractTaskId(data) || undefined,
    pollRoute,
    resultUrl: resultUrl || undefined,
    outputPath: relativeRunAsset(runId, outputPath),
    createdAt: new Date().toISOString(),
  }
}

export async function generateVoice(runId: string, text: string, voicePrompt: string) {
  return withRunAbort(runId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === 'voice:0')
    if (existing) {
      const filePath = await finishPending(runId, existing, signal)
      return { path: filePath, duration: await mediaDuration(filePath) }
    }
    const nodeInfoList = [
      { nodeId: '14', fieldName: 'text', fieldValue: text, description: '文稿' },
      {
        nodeId: '15',
        fieldName: 'text',
        fieldValue: voicePrompt,
        description: '【人设】+【音色特征】+【风格】+【情感】+【节奏】',
      },
    ]
    const data: any = await request(
      'POST',
      '/v1/audio/speech',
      {
        model: 'rh-aiapp-voice-design',
        nodeInfoList,
        voice: `__rh_nodeinfo__${Buffer.from(JSON.stringify(nodeInfoList)).toString('base64')}`,
      },
      signal,
    )
    let url = extractMediaUrl(data, 'audio')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('声音任务没有返回任务 ID')
      pollRoute = `/rh/tasks/${encodeURIComponent(taskId)}?ai_app=true`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'voice',
      0,
      generateUniqueFileName(getRunAssetPath(runId, 'voice')),
      data,
      url,
      pollRoute,
    )
    await putPending(runId, task)
    const filePath = await finishPending(runId, task, signal)
    return { path: filePath, duration: await mediaDuration(filePath) }
  })
}

function imageSize(ratio: string) {
  const sizes: Record<string, string> = {
    '9:16': '1152x2048',
    '16:9': '2048x1152',
    '1:1': '2048x2048',
    '4:3': '2731x2048',
    '3:4': '2048x2731',
    '21:9': '4779x2048',
  }
  const size = sizes[ratio]
  if (!size) throw new Error('不支持的画面比例')
  return size
}

export async function generateStoryboardImage(
  runId: string,
  index: number,
  prompt: string,
  ratio: string,
  referencePath?: string,
) {
  return withRunAbort(runId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === `storyboard:${index}`)
    if (existing) return finishPending(runId, existing, signal)
    let data: any
    if (referencePath) {
      const localReference = assertRunAsset(runId, referencePath)
      try {
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${API_ORIGIN}/v1/images/edits`,
          {
            model: 'gpt-image-2',
            prompt,
            size: imageSize(ratio),
            response_format: 'url',
            image: fs.createReadStream(localReference),
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
      } catch (error) {
        throw friendlyError(error)
      }
    } else {
      data = await request(
        'POST',
        '/v1/images/generations',
        {
          model: 'gpt-image-2',
          prompt,
          n: 1,
          size: imageSize(ratio),
          response_format: 'url',
        },
        signal,
      )
    }
    let url = extractMediaUrl(data, 'image')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('图片任务没有返回结果')
      pollRoute = `/rh/tasks/${encodeURIComponent(taskId)}`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'storyboard',
      index,
      generateUniqueFileName(getRunAssetPath(runId, 'storyboard', index)),
      data,
      url,
      pollRoute,
    )
    await putPending(runId, task)
    return finishPending(runId, task, signal)
  })
}

export async function generateSegmentVideo(
  runId: string,
  index: number,
  prompt: string,
  ratio: string,
  generationDuration: number,
  imagePath: string,
) {
  return withRunAbort(runId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === `video:${index}`)
    if (existing) return finishPending(runId, existing, signal)
    imageSize(ratio)
    if (![4, 6, 8].includes(generationDuration)) {
      throw new Error('Veo 3.1 生成时长只能为 4、6 或 8 秒')
    }
    if (ratio !== '9:16' && ratio !== '16:9') throw new Error('Veo 3.1 仅支持 9:16 或 16:9')
    const localImage = assertRunAsset(runId, imagePath)
    let data: any
    try {
      const apiKey = await readApiKey()
      const response = await axios.postForm(
        `${OPENAI_BASE_URL}/videos`,
        {
          model: 'veo-3.1-generate-preview',
          prompt,
          input_reference: fs.createReadStream(localImage),
          seconds: String(generationDuration),
          size: ratio === '9:16' ? '720x1280' : '1280x720',
          resolution: '720p',
          aspectRatio: ratio,
        },
        {
          timeout: 300_000,
          headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
          signal,
          maxBodyLength: Infinity,
        },
      )
      data = response.data
    } catch (error) {
      throw friendlyError(error)
    }
    let url = extractMediaUrl(data, 'video')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('视频任务没有返回任务 ID')
      pollRoute = `/v1/video/generations/${encodeURIComponent(taskId)}`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'video',
      index,
      generateUniqueFileName(getRunAssetPath(runId, 'clip', index)),
      data,
      url,
      pollRoute,
    )
    await putPending(runId, task)
    return finishPending(runId, task, signal)
  })
}

export async function resumePendingTasks(runId: string): Promise<ResumedCloudTask[]> {
  const results: ResumedCloudTask[] = []
  for (const task of await readPending(runId)) {
    try {
      const path = await withRunAbort(runId, (signal) => finishPending(runId, task, signal))
      results.push({
        id: task.id,
        kind: task.kind,
        index: task.index,
        status: 'success',
        path,
        duration: task.kind === 'voice' ? await mediaDuration(path) : undefined,
      })
    } catch (error) {
      results.push({
        id: task.id,
        kind: task.kind,
        index: task.index,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
