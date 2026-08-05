import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { generateUniqueFileName } from './lib/tools.ts'
import { ensureEpisodeDir, getEpisodeDir, mediaDuration } from './media-workspace.ts'
import type { LocalVoiceStatus } from './types.ts'

const MODEL_CACHE = 'models--mlx-community--Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
const localProcesses = new Map<string, ChildProcess>()

function runtimePath() {
  return path.join(app.getPath('userData'), 'local-tts', 'bin', 'python')
}

async function modelPath() {
  const root = path.join(app.getPath('home'), '.cache', 'huggingface', 'hub', MODEL_CACHE)
  const revision = (await fs.promises.readFile(path.join(root, 'refs', 'main'), 'utf8')).trim()
  const snapshot = path.join(root, 'snapshots', revision)
  await Promise.all([
    fs.promises.access(path.join(snapshot, 'model.safetensors'), fs.constants.R_OK),
    fs.promises.access(
      path.join(snapshot, 'speech_tokenizer', 'model.safetensors'),
      fs.constants.R_OK,
    ),
  ])
  return snapshot
}

export async function getLocalVoiceStatus(): Promise<LocalVoiceStatus> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return { available: false, reason: 'platform' }
  }
  const python = runtimePath()
  try {
    await fs.promises.access(python, fs.constants.X_OK)
  } catch {
    return { available: false, reason: 'runtime', runtimePath: python }
  }
  try {
    return { available: true, reason: 'ready', runtimePath: python, modelPath: await modelPath() }
  } catch {
    return { available: false, reason: 'model', runtimePath: python }
  }
}

export async function generateLocalVoice(runId: string, episodeId: string, text: string, instruct: string) {
  const status = await getLocalVoiceStatus()
  if (!status.available || !status.runtimePath || !status.modelPath) {
    throw new Error('本地配音环境不可用，请在设置中检查')
  }
  await ensureEpisodeDir(runId, episodeId)
  const outputPath = generateUniqueFileName(path.join(getEpisodeDir(runId, episodeId), 'voice.wav'))
  const prefix = path.basename(outputPath, path.extname(outputPath))
  const logs: string[] = []
  const child = spawn(
    status.runtimePath,
    [
      '-m',
      'mlx_audio.tts.generate',
      '--model',
      status.modelPath,
      '--text',
      text,
      '--instruct',
      instruct,
      '--lang_code',
      'chinese',
      '--output_path',
      path.dirname(outputPath),
      '--file_prefix',
      prefix,
      '--audio_format',
      'wav',
      '--join_audio',
      '--max_tokens',
      '4096',
    ],
    { env: { ...process.env, HF_HUB_OFFLINE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  localProcesses.set(runId, child)
  child.stdout?.on('data', (value) => logs.push(String(value)))
  child.stderr?.on('data', (value) => logs.push(String(value)))
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    },
  ).finally(() => localProcesses.delete(runId))
  if (result.signal) throw new Error('本地配音已停止')
  const stat = await fs.promises.stat(outputPath).catch(() => null)
  if (result.code !== 0 || !stat?.size) {
    const detail = logs.join('').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-600)
    throw new Error(detail ? `本地配音失败：${detail}` : '本地配音没有生成音频')
  }
  return { path: outputPath, duration: await mediaDuration(outputPath) }
}

export function cancelLocalVoice(runId: string) {
  const child = localProcesses.get(runId)
  if (!child) return 0
  child.kill('SIGTERM')
  return 1
}
