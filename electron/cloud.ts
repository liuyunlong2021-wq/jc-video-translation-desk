import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import axios, { AxiosError } from 'axios'
import { app, safeStorage } from 'electron'
import { generateUniqueFileName } from './lib/tools.ts'
import type { PendingCloudTask, ResumedCloudTask } from './types.ts'
import type { MediaScriptBrief, TextModel, VideoModel } from './types.ts'
import {
  assertRunAsset,
  downloadMedia,
  ensureRunDir,
  getRunAssetPath,
  mediaDuration,
  relativeRunAsset,
  getRunDir,
  listProjectMarkdown,
  readProjectMarkdown,
  searchAssetImage,
  writeStoryboardMarkdownBatch,
  writeDataUrl,
} from './media-workspace.ts'

export const API_ORIGIN = 'https://api.jiucaihezi.studio'
export const OPENAI_BASE_URL = `${API_ORIGIN}/v1`
export const API_KEYS_URL = `${API_ORIGIN}/keys`
export const TEXT_MODELS: TextModel[] = [
  'gemini-3.6-flash',
  'claude-fable-5',
  'claude-opus-5',
  'gpt-5.6-sol',
  'deepseek-v4-pro',
]

const KEY_FILE = 'jiucai-api-key.bin'
const SKILLS = new Set([
  'jc-media-script',
  'jc-script-storyboard',
  'jc-gpt-image',
  'jc-voice-design',
  'jc-context-revision',
  'jc-character-prompt',
  'jc-scene-prompt',
  'jc-prop-prompt',
  'jc-asset-reference-search',
])
const runControllers = new Map<string, Set<AbortController>>()
const taskControllers = new Map<
  string,
  { controller: AbortController; finished: Promise<void> }
>()
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
  const message = error instanceof Error ? error.message : String(error)
  if (/system cpu overloaded|cpu.*threshold/i.test(message))
    return new Error('云端当前繁忙，本次内容尚未生成，请稍后重试。')
  if (axios.isCancel(error)) return new Error('任务已停止；云端任务可能仍会继续并产生费用')
  if (!(error instanceof AxiosError))
    return error instanceof Error ? error : new Error(String(error))
  if (error.response?.status === 401 || error.response?.status === 403)
    return new Error('API Key 无效或没有权限')
  if (error.response?.status === 429) return new Error('请求过于频繁，请稍后重试')
  if (error.response?.status === 524)
    return new Error('当前模型响应超时，内容尚未生成。请重试或切换其他文本模型。')
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
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : undefined
  try {
    return await downloadMedia(url, outputPath, signal, headers)
  } catch (error) {
    if (!/ERR_CONNECTION_CLOSED/.test(error instanceof Error ? error.message : String(error))) throw error
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 300_000,
      maxRedirects: 0,
      headers,
      signal,
    })
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.promises.writeFile(outputPath, Buffer.from(response.data))
    return outputPath
  }
}

export async function testApiKey() {
  await request('GET', '/v1/models')
  return true
}

export async function generateScript(brief: MediaScriptBrief) {
  if (!brief?.request?.trim()) throw new Error('视频诉求不能为空')
  if (
    !Number.isInteger(brief.targetDuration) ||
    brief.targetDuration < 5 ||
    brief.targetDuration > 180
  ) {
    throw new Error('目标时长必须是 5 到 180 秒的整数')
  }
  if (brief.ratio !== '9:16' && brief.ratio !== '16:9') throw new Error('画面比例无效')
  if (
    ![
      'cinematic-contrast',
      'commercial-bright',
      'natural-documentary',
      'ink-wash',
      'cel-cinematic',
      'gongbi-color',
      'eastern-xianxia-cg',
      'realistic-fantasy-cg',
      'handmade-clay',
    ].includes(brief.styleId)
  ) {
    throw new Error('视觉风格无效')
  }
  const result = await runSkill('jc-media-script', JSON.stringify(brief), undefined, brief.textModel)
  const text = String(result?.text || '').trim()
  if (!text) throw new Error('文稿模型没有返回正文')
  return text
}

export async function runSkill(
  skillName: string,
  input: string,
  runId?: string,
  textModel: TextModel = 'gpt-5.6-sol',
) {
  if (!SKILLS.has(skillName)) throw new Error('未知的内置 Skill')
  if (!TEXT_MODELS.includes(textModel)) throw new Error('不支持的文本模型')
  const skillPath = path.join(process.env.APP_ROOT, 'skills', skillName, 'SKILL.md')
  let system = await fs.promises.readFile(skillPath, 'utf8')
  const formatFile = {
    'jc-character-prompt': 'prompt-format.md',
    'jc-scene-prompt': 'scene-format.md',
    'jc-prop-prompt': 'prop-format.md',
  }[skillName]
  if (formatFile) {
    system += `\n\n# 必须遵守的完整设计 JSON 模板\n\n${await fs.promises.readFile(
      path.join(path.dirname(skillPath), 'references', formatFile),
      'utf8',
    )}`
  }
  const prompt = `${input}\n\n只输出合法 JSON，不要使用 Markdown 代码块。`
  const action = async (signal?: AbortSignal) => {
    const output = await generateText(system, prompt, textModel, signal)
    try {
      return parseJson(output)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return parseJson(
        await generateText(
          system,
          `${prompt}\n\n上次输出解析失败（${reason}）。请只修复 JSON 语法，保留原有内容、镜头数量和字段，不要解释。`,
          textModel,
          signal,
        ),
      )
    }
  }
  return runId ? withRunAbort(runId, action) : action()
}

export async function runReferenceSearchSkill(
  runId: string,
  assetId: string,
  searchQuery: string,
  rejectedPinIds: string[] = [],
) {
  const contract = await fs.promises.readFile(
    path.join(process.env.APP_ROOT, 'skills', 'jc-asset-reference-search', 'SKILL.md'),
    'utf8',
  )
  if (!contract.includes('search_and_download') || !contract.includes('selectedImage'))
    throw new Error('资产参考搜索 Skill 合同无效')
  const version = await searchAssetImage(runId, assetId, searchQuery, rejectedPinIds)
  if (version.searchQuery !== searchQuery.trim() || !version.relativePath || !version.sourceUrl)
    throw new Error('资产参考搜索 Skill 返回无效')
  return {
    ...version,
    generatedBySkill: 'jc-asset-reference-search',
  }
}

const WIKI_TOOLS = [
  { type: 'function', function: { name: 'write_batch', description: '一次创建或替换整套导演总览和单镜 Markdown。生成分镜时必须使用此工具，不要逐文件 write/edit', parameters: { type: 'object', required: ['files'], properties: { files: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } } } } } },
] as const

export async function runWikiSkill(
  skillName: string,
  input: string,
  projectId: string,
  textModel: TextModel = 'gpt-5.6-sol',
) {
  if (!SKILLS.has(skillName)) throw new Error('未知的内置 Skill')
  if (!TEXT_MODELS.includes(textModel)) throw new Error('不支持的文本模型')
  const system = await fs.promises.readFile(
    path.join(process.env.APP_ROOT, 'skills', skillName, 'SKILL.md'),
    'utf8',
  )
  const contextPaths = (await listProjectMarkdown(projectId)).filter(
    (value) => value === 'wiki/文稿/确认文稿.md' || value.startsWith('wiki/资产/'),
  )
  const context = await Promise.all(
    contextPaths.map(async (value) => {
      const document = await readProjectMarkdown(projectId, value)
      return `## ${value}\n\n${document.content}`
    }),
  )
  const messages: any[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `${input}\n\n以下是 App 已读取的确认文稿和已确认资产。只能引用这些资产 Markdown 中现有的 entityId，不得创建或改写资产。完成整套设计后，使用一次 write_batch 提交导演总览和全部镜头 Markdown：\n\n${context.join('\n\n')}`,
    },
  ]
  return withRunAbort(projectId, async (signal) => {
    const result = await generateToolTurn(messages, textModel, signal)
    if (result.toolCalls.length !== 1 || result.toolCalls[0].function.name !== 'write_batch')
      throw new Error('导演没有一次性提交完整的分镜文件')
    const args = JSON.parse(result.toolCalls[0].function.arguments || '{}')
    for (const file of args.files || []) assertStoryboardWritePath(file?.path)
    const documents = await writeStoryboardMarkdownBatch(projectId, args.files)
    return { text: result.text, writtenPaths: documents.map((document) => document.path) }
  })
}

function assertStoryboardWritePath(value: unknown) {
  const target = String(value || '')
  if (!target.startsWith('wiki/分镜/')) throw new Error('导演 Skill 只能修改分镜 Markdown')
}

async function generateToolTurn(messages: any[], textModel: TextModel, signal?: AbortSignal) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request({
      method: 'POST',
      url: `${API_ORIGIN}/v1/chat/completions`,
      data: {
        model: textModel,
        messages,
        tools: WIKI_TOOLS,
        tool_choice: { type: 'function', function: { name: 'write_batch' } },
        temperature: 0.2,
        max_tokens: 32_000,
        stream: true,
      },
      responseType: 'stream',
      timeout: 300_000,
      headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      signal,
    })
    let pending = ''
    const decoder = new StringDecoder('utf8')
    let text = ''
    const calls: any[] = []
    let finishReason = ''
    let done = false
    const processLine = (line: string) => {
      if (!line.startsWith('data:')) return
      const value = line.slice(5).trim()
      if (!value) return
      if (value === '[DONE]') {
        done = true
        return
      }
      const choice = JSON.parse(value)?.choices?.[0] || {}
      finishReason = choice.finish_reason || finishReason
      const delta = choice.delta || {}
      text += delta.content || ''
      for (const part of delta.tool_calls || []) {
        const index = Number(part.index || 0)
        calls[index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } }
        calls[index].id += part.id || ''
        calls[index].function.name += part.function?.name || ''
        calls[index].function.arguments += part.function?.arguments || ''
      }
    }
    for await (const chunk of response.data) {
      pending += decoder.write(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) processLine(line)
    }
    pending += decoder.end()
    if (pending.trim()) processLine(pending)
    if (!done && !finishReason) throw new Error('模型响应流提前中断')
    if (finishReason && !['stop', 'tool_calls'].includes(finishReason))
      throw new Error(`模型响应未完整结束（${finishReason}）`)
    for (const call of calls) JSON.parse(call.function.arguments || '{}')
    return { text: text.trim(), toolCalls: calls.filter((call) => call.function.name) }
  } catch (error) {
    throw friendlyError(error)
  }
}

async function generateText(
  system: string,
  prompt: string,
  textModel: TextModel,
  signal?: AbortSignal,
) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request({
      method: 'POST',
      url: `${API_ORIGIN}/v1/chat/completions`,
      data: {
        model: textModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 16_000,
        stream: true,
      },
      responseType: 'stream',
      timeout: 300_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal,
    })
    let pending = ''
    const decoder = new StringDecoder('utf8')
    let text = ''
    for await (const chunk of response.data) {
      pending += decoder.write(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const value = line.slice(5).trim()
        if (!value || value === '[DONE]') continue
        const event = JSON.parse(value)
        if (event?.error?.message) throw new Error(event.error.message)
        text += event?.choices?.[0]?.delta?.content || ''
      }
    }
    pending += decoder.end()
    if (!text.trim()) throw new Error('文稿模型没有返回内容')
    return text.trim()
  } catch (error) {
    throw friendlyError(error)
  }
}

function parseJson(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let firstError: unknown
  try {
    return JSON.parse(clean)
  } catch (error) {
    firstError = error
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1))
  }
  const message = firstError instanceof Error ? firstError.message : String(firstError)
  throw new Error(`模型返回的 JSON 无法解析：${message}`)
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
    const tasks = Array.isArray(data?.tasks) ? data.tasks : data?.pending
    return Array.isArray(tasks)
      ? tasks.map((task: PendingCloudTask) => ({
          ...task,
          targetId: task.targetId || String(task.index),
          targetLabel:
            task.targetLabel ||
            (task.kind === 'asset' ? String(task.targetId || task.id.slice(6)) : `镜头 ${task.index}`),
          status:
            task.status ||
            (task.resultUrl ? 'stopped' : task.pollRoute ? 'stopped' : 'failed'),
          resumeFrom:
            task.resumeFrom ||
            (task.resultUrl ? 'downloading' : task.pollRoute ? 'generating' : undefined),
          updatedAt: task.updatedAt || task.createdAt,
        }))
      : []
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
      JSON.stringify({ tasks: change(await readPending(runId)) }, null, 2),
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
  await mutatePending(runId, (tasks) => {
    const current = tasks.find((item) => item.id === task.id)
    const archived =
      current &&
      current.createdAt !== task.createdAt &&
      ['success', 'failed', 'stopped'].includes(current.status || '')
        ? { ...current, id: `${current.id}@${current.updatedAt || current.createdAt}` }
        : undefined
    return [...tasks.filter((item) => item.id !== task.id), ...(archived ? [archived] : []), task]
  })
}

async function removePending(runId: string, id: string) {
  await mutatePending(runId, (tasks) => tasks.filter((item) => item.id !== id))
}

async function updateTask(
  runId: string,
  id: string,
  change: (task: PendingCloudTask) => PendingCloudTask,
) {
  await mutatePending(runId, (tasks) =>
    tasks.map((task) => (task.id === id ? change(task) : task)),
  )
}

export async function listCloudTasks(runId: string) {
  return (await readPending(runId))
    .filter((task) => task.kind !== 'voice')
    .map((task) =>
      ['generating', 'downloading'].includes(task.status || '') &&
      !taskControllers.has(taskControllerKey(runId, task.id))
        ? {
            ...task,
            status: 'stopped' as const,
            resumeFrom: task.resultUrl ? ('downloading' as const) : ('generating' as const),
          }
        : task,
    )
}

function taskControllerKey(runId: string, taskId: string) {
  return `${runId}:${taskId}`
}

async function withTaskAbort<T>(
  runId: string,
  taskId: string,
  action: (signal: AbortSignal) => Promise<T>,
) {
  const key = taskControllerKey(runId, taskId)
  if (taskControllers.has(key)) throw new Error('该任务正在执行')
  const controller = new AbortController()
  let finish!: () => void
  const entry = { controller, finished: new Promise<void>((resolve) => (finish = resolve)) }
  taskControllers.set(key, entry)
  try {
    return await action(controller.signal)
  } finally {
    if (taskControllers.get(key) === entry) taskControllers.delete(key)
    finish()
  }
}

async function markCloudTaskStopped(runId: string, taskId: string) {
  const now = new Date().toISOString()
  await updateTask(runId, taskId, (task) => ({
    ...task,
    status: 'stopped',
    resumeFrom: task.resultUrl ? 'downloading' : 'generating',
    error: task.resultUrl
      ? '已停止本地下载'
      : '已停止本地等待；云端任务可能仍在执行并产生费用',
    updatedAt: now,
  }))
}

export async function stopCloudTask(runId: string, taskId: string) {
  const entry = taskControllers.get(taskControllerKey(runId, taskId))
  entry?.controller.abort()
  await markCloudTaskStopped(runId, taskId)
  await entry?.finished
  return Boolean(entry)
}

export async function abandonCloudTask(runId: string, taskId: string) {
  taskControllers.get(taskControllerKey(runId, taskId))?.controller.abort()
  await removePending(runId, taskId)
}

async function finishPending(runId: string, task: PendingCloudTask, signal?: AbortSignal) {
  const outputPath = assertRunAsset(runId, task.outputPath)
  if (!fs.existsSync(outputPath)) {
    let url = task.resultUrl
    if (!url && task.pollRoute) {
      await updateTask(runId, task.id, (current) => ({
        ...(current.status === 'stopped'
          ? current
          : {
              ...current,
              status: 'generating',
              resumeFrom: undefined,
              error: undefined,
              updatedAt: new Date().toISOString(),
            }),
      }))
      try {
        url = await poll(
          task.pollRoute,
          task.kind === 'voice'
            ? 'audio'
            : task.kind === 'storyboard' || task.kind === 'asset'
              ? 'image'
              : 'video',
          signal,
        )
      } catch (error) {
        if (!signal?.aborted)
          await updateTask(runId, task.id, (current) => ({
            ...current,
            status: 'failed',
            resumeFrom: current.pollRoute ? 'generating' : undefined,
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date().toISOString(),
          }))
        throw error
      }
      task = { ...task, resultUrl: url, status: 'downloading', updatedAt: new Date().toISOString() }
      await putPending(runId, task)
    }
    if (!url) throw new Error('任务缺少结果地址')
    await updateTask(runId, task.id, (current) => ({
      ...(current.status === 'stopped'
        ? { ...current, resultUrl: url, resumeFrom: 'downloading' }
        : {
            ...current,
            resultUrl: url,
            status: 'downloading',
            resumeFrom: undefined,
            error: undefined,
            updatedAt: new Date().toISOString(),
          }),
    }))
    if (signal?.aborted) throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    try {
      if (url.startsWith('data:')) await writeDataUrl(url, outputPath)
      else await downloadResultMedia(url, outputPath, signal)
    } catch (error) {
      if (!signal?.aborted)
        await updateTask(runId, task.id, (current) => ({
          ...current,
          status: 'failed',
          resumeFrom: 'downloading',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        }))
      throw error
    }
  }
  await updateTask(runId, task.id, (current) => ({
    ...current,
    status: 'success',
    resumeFrom: undefined,
    error: undefined,
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  }))
  return outputPath
}

export async function resumeCloudTask(runId: string, taskId: string) {
  const task = (await readPending(runId)).find((item) => item.id === taskId)
  if (!task) throw new Error('任务不存在')
  if (!task.resultUrl && !task.pollRoute) throw new Error('该任务没有可恢复的结果或任务 ID')
  return withTaskAbort(runId, task.id, (signal) => finishPending(runId, task, signal))
}

export async function withRunAbort<T>(runId: string, action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const controllers = runControllers.get(runId) || new Set<AbortController>()
  controllers.add(controller)
  runControllers.set(runId, controllers)
  try {
    return await action(controller.signal)
  } finally {
    if (controller.signal.aborted)
      await mutatePending(runId, (tasks) => tasks.filter((task) => task.kind !== 'voice'))
    controllers.delete(controller)
    if (!controllers.size) runControllers.delete(runId)
  }
}

export async function cancelRun(runId: string) {
  const controllers = runControllers.get(runId)
  controllers?.forEach((controller) => controller.abort())
  await mutatePending(runId, (tasks) => tasks.filter((task) => task.kind !== 'voice'))
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
  pendingId?: string,
  targetId?: string,
  targetLabel?: string,
): PendingCloudTask {
  const now = new Date().toISOString()
  return {
    id: pendingId || `${kind}:${index}`,
    kind,
    index,
    targetId: targetId || String(index),
    targetLabel: targetLabel || `镜头 ${index}`,
    status: resultUrl ? 'downloading' : 'generating',
    taskId: extractTaskId(data) || undefined,
    pollRoute,
    resultUrl: resultUrl || undefined,
    outputPath: relativeRunAsset(runId, outputPath),
    createdAt: now,
    startedAt: now,
    updatedAt: now,
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
  referencePath?: string | string[],
) {
  const pendingId = `storyboard:${index}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (existing && existing.status !== 'success' && (existing.resultUrl || existing.pollRoute))
      return finishPending(runId, existing, signal)
    const references = Array.isArray(referencePath)
      ? referencePath.filter(Boolean)
      : referencePath
        ? [referencePath]
        : []
    const outputPath = generateUniqueFileName(getRunAssetPath(runId, 'storyboard', index))
    const started = pendingTask(runId, 'storyboard', index, outputPath, {}, '', undefined, pendingId)
    await putPending(runId, started)
    let data: any
    try {
      if (references.length) {
        const localReferences = references.map((item) => assertRunAsset(runId, item))
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${API_ORIGIN}/v1/images/edits`,
          {
            model: 'gpt-image-2',
            prompt,
            size: imageSize(ratio),
            response_format: 'url',
            image:
              localReferences.length === 1
                ? fs.createReadStream(localReferences[0])
                : localReferences.map((item) => fs.createReadStream(item)),
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
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
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
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
      outputPath,
      data,
      url,
      pollRoute,
    )
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function generateAssetImage(
  runId: string,
  assetId: string,
  role: 'character' | 'scene' | 'prop',
  design: Record<string, unknown>,
  referencePath?: string | string[],
  assetLabel?: string,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) throw new Error('无效的资产 ID')
  if (!['character', 'scene', 'prop'].includes(role)) throw new Error('无效的资产类型')
  if (!design || typeof design !== 'object' || Array.isArray(design)) throw new Error('资产设计 JSON 无效')
  const ratio = String((design as any).project?.aspectRatio || '')
  imageSize(ratio)
  const designJson = JSON.stringify(design, null, 2)
  const prompt = referencePath
    ? `请结合全部参考图生成，最终内容、画风和比例以资产设计 JSON 为准。\n\n${designJson}`
    : designJson
  const pendingId = `asset:${assetId}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (existing && existing.status !== 'success' && (existing.resultUrl || existing.pollRoute))
      return finishPending(runId, existing, signal)
    const references = (Array.isArray(referencePath) ? referencePath : referencePath ? [referencePath] : [])
      .filter(Boolean)
      .map((item) => assertRunAsset(runId, item))
    const outputPath = generateUniqueFileName(
      path.join(getRunDir(runId), 'assets', assetId, 'generated.png'),
    )
    await putPending(
      runId,
      pendingTask(runId, 'asset', 0, outputPath, {}, '', undefined, pendingId, assetId, assetLabel || assetId),
    )
    let data: any
    try {
      if (references.length) {
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${API_ORIGIN}/v1/images/edits`,
          {
            model: 'gpt-image-2',
            prompt,
            size: imageSize(ratio),
            response_format: 'url',
            image:
              references.length === 1
                ? fs.createReadStream(references[0])
                : references.map((item) => fs.createReadStream(item)),
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
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
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
    const url = extractMediaUrl(data, 'image')
    if (!url) throw new Error('资产图片任务没有返回结果')
    const task = pendingTask(
      runId,
      'asset',
      0,
      outputPath,
      data,
      url,
      undefined,
      pendingId,
      assetId,
      assetLabel || assetId,
    )
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function generateSegmentVideo(
  runId: string,
  index: number,
  model: VideoModel,
  prompt: string,
  ratio: string,
  generationDuration: number,
  imagePath: string,
) {
  if (!['veo-3.1-generate-preview', 'rh-grok-image-video'].includes(model))
    throw new Error('不支持的视频模型')
  const pendingId = `video:${index}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (
      existing &&
      (existing.model || 'veo-3.1-generate-preview') === model &&
      existing.status !== 'success' &&
      (existing.resultUrl || existing.pollRoute)
    )
      return finishPending(runId, existing, signal)
    imageSize(ratio)
    if (![4, 6, 8].includes(generationDuration)) throw new Error('视频生成时长只能为 4、6 或 8 秒')
    if (ratio !== '9:16' && ratio !== '16:9') throw new Error('视频模型仅支持 9:16 或 16:9')
    const seconds = model === 'rh-grok-image-video' ? Math.max(6, generationDuration) : generationDuration
    const localImage = assertRunAsset(runId, imagePath)
    const outputPath = generateUniqueFileName(getRunAssetPath(runId, 'clip', index))
    await putPending(
      runId,
      { ...pendingTask(runId, 'video', index, outputPath, {}, '', undefined, pendingId), model },
    )
    let data: any
    try {
      if (model === 'rh-grok-image-video') {
        const extension = path.extname(localImage).toLowerCase()
        const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png'
        const image = `data:${mimeType};base64,${await fs.promises.readFile(localImage, 'base64')}`
        data = await request(
          'POST',
          '/v1/videos',
          {
            model,
            prompt,
            duration: seconds,
            aspectRatio: ratio,
            resolution: '720p',
            images: [image],
          },
          signal,
        )
      } else {
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${OPENAI_BASE_URL}/videos`,
          {
            model,
            prompt,
            input_reference: fs.createReadStream(localImage),
            seconds: String(seconds),
            duration: String(seconds),
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
      }
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
    let url = extractMediaUrl(data, 'video')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('视频任务没有返回任务 ID')
      pollRoute = model === 'rh-grok-image-video'
        ? /^task_/.test(taskId)
          ? `/v1/videos/${encodeURIComponent(taskId)}`
          : `/rh/tasks/${encodeURIComponent(taskId)}`
        : `/v1/video/generations/${encodeURIComponent(taskId)}`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'video',
      index,
      outputPath,
      data,
      url,
      pollRoute,
    )
    task.model = model
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function resumePendingTasks(runId: string): Promise<ResumedCloudTask[]> {
  const results: ResumedCloudTask[] = []
  for (const task of (await readPending(runId)).filter((item) => item.status !== 'success')) {
    try {
      const path = await (task.kind === 'voice'
        ? withRunAbort(runId, (signal) => finishPending(runId, task, signal))
        : withTaskAbort(runId, task.id, (signal) => finishPending(runId, task, signal)))
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
