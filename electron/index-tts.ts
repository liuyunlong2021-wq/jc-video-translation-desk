import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { executeFFmpeg } from './ffmpeg/index.ts'
import { getRunDir, mediaDuration } from './media-workspace.ts'
import { getVoiceLibraryDir, getVoicePackDir } from './voice-library.ts'
import type { GenerateEpisodeVoiceParams, IndexTtsServiceStatus } from './types.ts'

const processes = new Map<string, ChildProcess>()
let serviceProcess: ChildProcess | null = null
let serviceStartedAt: string | undefined
let serviceError: string | undefined
let stoppingService = false

function cliPath() {
  return process.env.INDEXTTS2_CLI || path.join(runtimeDir(), '.venv', 'bin', 'indextts2')
}

function runtimeDir() {
  return process.env.INDEXTTS2_RUNTIME || path.join(app.getPath('home'), 'Documents', 'index-tts')
}

function modelDir() {
  return process.env.INDEXTTS2_MODEL || path.join(app.getPath('home'), 'Documents', 'peiyin-pyvideotrans', 'models', 'IndexTTS-2')
}

function pythonPath() {
  return process.env.INDEXTTS2_PYTHON || path.join(runtimeDir(), '.venv', 'bin', 'python')
}

function webuiPath() {
  return process.env.INDEXTTS2_WEBUI || path.join(runtimeDir(), 'webui.py')
}

function uvPath() {
  return process.env.INDEXTTS2_UV || path.join(app.getPath('home'), '.local', 'bin', 'uv')
}

function serviceUrl() {
  return process.env.INDEXTTS2_URL || 'http://127.0.0.1:7860'
}

function run(runId: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const output: string[] = []
    const child = spawn(cliPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    processes.set(runId, child)
    child.stdout?.on('data', (value) => output.push(String(value)))
    child.stderr?.on('data', (value) => output.push(String(value)))
    child.once('error', reject)
    child.once('close', (code, signal) => {
      processes.delete(runId)
      const detail = output.join('').replace(/\x1b\[[0-9;]*m/g, '').trim()
      if (signal) reject(new Error('IndexTTS2 配音已停止'))
      else if (code) reject(new Error(detail || `IndexTTS2 退出码 ${code}`))
      else resolve(detail)
    })
  })
}

async function isServiceHealthy() {
  return new Promise<boolean>((resolve) => {
    const request = http.get(`${serviceUrl()}/config`, (response) => {
      response.resume()
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300))
    })
    request.setTimeout(1000, () => request.destroy())
    request.once('error', () => resolve(false))
  })
}

function status(state: IndexTtsServiceStatus['state'], available: boolean): IndexTtsServiceStatus {
  return {
    engine: 'indextts2',
    state,
    available,
    runtimePath: runtimeDir(),
    modelPath: modelDir(),
    ...(serviceProcess?.pid ? { pid: serviceProcess.pid } : {}),
    ...(serviceStartedAt ? { startedAt: serviceStartedAt } : {}),
    ...(serviceError ? { error: serviceError } : {}),
  }
}

async function detectIndexTts() {
  await fs.promises.access(pythonPath(), fs.constants.X_OK)
  await fs.promises.access(webuiPath(), fs.constants.R_OK)
  await fs.promises.access(modelDir(), fs.constants.R_OK)
  if (!process.env.INDEXTTS2_PYTHON && !process.env.INDEXTTS2_WEBUI) {
    await fs.promises.access(uvPath(), fs.constants.X_OK)
    await fs.promises.access(cliPath(), fs.constants.X_OK)
    await run('__status__', [
      'check',
      '--model-dir',
      modelDir(),
      '--device',
      process.platform === 'darwin' ? 'mps' : 'cpu',
    ])
  }
}

export async function getIndexTtsStatus(): Promise<IndexTtsServiceStatus> {
  if (await isServiceHealthy()) return status('running', true)
  if (serviceProcess) return status(serviceError ? 'failed' : 'starting', !serviceError)
  try {
    await detectIndexTts()
    return status(serviceError ? 'failed' : 'stopped', true)
  } catch (error) {
    serviceError = String(error)
    return status('unavailable', false)
  }
}

export async function startIndexTtsService(): Promise<IndexTtsServiceStatus> {
  const current = await getIndexTtsStatus()
  if (current.state === 'running' || serviceProcess) return current
  if (!current.available) return current
  const url = new URL(serviceUrl())
  serviceError = undefined
  stoppingService = false
  serviceStartedAt = new Date().toISOString()
  const command = process.env.INDEXTTS2_PYTHON ? pythonPath() : uvPath()
  const child = spawn(command, [
    ...(process.env.INDEXTTS2_PYTHON ? [] : ['run']),
    webuiPath(),
    '--host',
    url.hostname,
    '--port',
    url.port || '7860',
    '--model_dir',
    modelDir(),
  ], { cwd: runtimeDir(), stdio: ['ignore', 'ignore', 'pipe'] })
  serviceProcess = child
  const errors: string[] = []
  child.stderr?.on('data', (value) => errors.push(String(value)))
  child.once('error', (error) => { serviceError = String(error) })
  child.once('exit', (code, signal) => {
    if (!stoppingService && code !== 0)
      serviceError = errors.join('').trim() || `IndexTTS2 服务异常退出：${signal || code}`
    serviceProcess = null
    serviceStartedAt = undefined
  })
  for (let attempt = 0; attempt < 240; attempt++) {
    if (await isServiceHealthy()) return status('running', true)
    if (!serviceProcess || serviceError) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (serviceProcess) serviceProcess.kill('SIGTERM')
  serviceProcess = null
  serviceStartedAt = undefined
  serviceError ||= 'IndexTTS2 服务启动超时'
  return status('failed', true)
}

export async function stopIndexTtsService(): Promise<IndexTtsServiceStatus> {
  const child = serviceProcess
  if (child) {
    stoppingService = true
    child.kill('SIGTERM')
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ])
  }
  serviceProcess = null
  serviceStartedAt = undefined
  serviceError = undefined
  stoppingService = false
  try {
    await detectIndexTts()
    return status('stopped', true)
  } catch (error) {
    serviceError = String(error)
    return status('unavailable', false)
  }
}

function emotionKey(value: string) {
  if (/惊|意外/.test(value)) return 'surprised'
  if (/怒|生气|愤/.test(value)) return 'angry'
  if (/悲|难过|伤心|失落/.test(value)) return 'sad'
  if (/怕|恐|紧张/.test(value)) return 'fearful'
  if (/厌|恶心/.test(value)) return 'disgusted'
  if (/喜|开心|兴奋|愉快/.test(value)) return 'happy'
  return 'neutral'
}

async function manifestFor(voiceProfileId: string, text: string) {
  const root = getVoicePackDir(voiceProfileId)
  const manifests: string[] = []
  const visit = async (dir: string) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.name === 'manifest.json') manifests.push(target)
    }
  }
  await visit(root)
  const chinese = /[\u3400-\u9fff]/.test(text)
  const selected = manifests.find((item) => chinese && /[/\\]zh(?:-|[/\\])/.test(item)) || manifests[0]
  if (!selected) throw new Error(`${voiceProfileId} 没有可用的 IndexTTS2 情绪包`)
  const manifest = JSON.parse(await fs.promises.readFile(selected, 'utf8'))
  if (manifest.status !== 'confirmed' || manifest.model?.id !== 'indextts-2')
    throw new Error(`${voiceProfileId} 的 IndexTTS2 情绪包尚未确认`)
  const reference = path.resolve(getVoiceLibraryDir(), manifest.source?.referenceRelativePath || '')
  await fs.promises.access(reference, fs.constants.R_OK)
  return { manifest, dir: path.dirname(selected), reference }
}

async function binding(projectId: string, speakerId: string) {
  const file = path.join(getRunDir(projectId), 'wiki', '声音', '角色', `${speakerId}.md`)
  const content = await fs.promises.readFile(file, 'utf8').catch(() => '')
  const voiceProfileId = content.match(/^voiceProfileId:\s*([^\s]+)$/m)?.[1]
  if (!voiceProfileId) throw new Error(`请先在资产页为 ${speakerId} 绑定音色包`)
  return voiceProfileId
}

export async function generateEpisodeVoice(params: GenerateEpisodeVoiceParams) {
  if (!params.tasks.length) throw new Error('本集没有需要生成的配音任务')
  const runDir = getRunDir(params.runId)
  const workDir = path.join(runDir, 'voice-tasks')
  const outputDir = path.join(workDir, 'clips')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const rows = []
  for (const task of params.tasks) {
    if (!task.text.trim() || task.startMs < 0 || task.endMs <= task.startMs) throw new Error(`${task.shotId} 配音任务无效`)
    const voiceProfileId = await binding(params.runId, task.speakerId)
    const pack = await manifestFor(voiceProfileId, task.text)
    const emotion = pack.manifest.emotions?.[emotionKey(task.emotion)] || pack.manifest.emotions?.neutral
    const emotionAudio = emotion?.audio ? path.resolve(pack.dir, emotion.audio) : undefined
    if (emotionAudio) await fs.promises.access(emotionAudio, fs.constants.R_OK)
    rows.push({ text: task.text.trim(), voice: pack.reference, ...(emotionAudio ? { emotion_audio: emotionAudio } : {}) })
  }
  const batchFile = path.join(workDir, 'episode.jsonl')
  await fs.promises.writeFile(batchFile, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
  await run(params.runId, ['batch', '--batch-file', batchFile, '--output-dir', outputDir, '--output-prefix', 'shot', '--device', process.platform === 'darwin' ? 'mps' : 'cpu', '--force'])
  const clips = params.tasks.map((_, index) => path.join(outputDir, `shot-${String(index + 1).padStart(4, '0')}.wav`))
  for (let index = 0; index < clips.length; index++) {
    const duration = await mediaDuration(clips[index])
    const budget = (params.tasks[index].endMs - params.tasks[index].startMs) / 1000
    if (duration > budget + 0.1) throw new Error(`${params.tasks[index].shotId} 配音超过时间窗 ${budget.toFixed(1)} 秒，请缩短台词或调整分镜`)
  }
  const output = path.join(runDir, 'episode-voice.wav')
  const totalDuration = Math.max(...params.tasks.map((task) => task.endMs)) / 1000
  const filters = clips.map((_, index) => {
    const delay = params.tasks[index].startMs
    return `[${index}:a]aresample=48000,adelay=${delay}|${delay}[a${index}]`
  })
  filters.push(`[${clips.map((_, index) => `a${index}`).join('][')}]amix=inputs=${clips.length}:duration=longest:dropout_transition=0,apad,atrim=0:${totalDuration}[out]`)
  const args: string[] = []
  clips.forEach((clip) => args.push('-i', clip))
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', '-y', output)
  await executeFFmpeg(args)
  return { path: output, duration: await mediaDuration(output) }
}

export function cancelIndexTts(runId: string) {
  const child = processes.get(runId)
  if (!child) return 0
  child.kill('SIGTERM')
  return 1
}
