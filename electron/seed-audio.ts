import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { app, safeStorage } from 'electron'
import { generateUniqueFileName } from './lib/tools.ts'
import { executeFFmpeg } from './ffmpeg/index.ts'
import {
  assertEpisodeAsset,
  assertVideoTranslationAsset,
  ensureEpisodeDir,
  getEpisodeDir,
  getRunDir,
  mediaDuration,
  relativeRunAsset,
} from './media-workspace.ts'
import {
  buildSeedAudioRequest,
  type SeedAudioArrangement,
  type SeedAudioMode,
  type SeedAudioReference,
  type SeedAudioLine,
  alignSeedDialogue,
} from '../src/runtime/seedAudio.ts'
import type { MaterialTranscript } from '../src/runtime/productionContract.ts'

const KEY_FILE = 'seed-audio-api-key.bin'
const DEFAULT_URL = 'https://openspeech.bytedance.com/api/v3/tts/create'
const DEFAULT_MODEL = 'seed-audio-1.0'
let sessionApiKey = ''

function keyPath() {
  return path.join(app.getPath('userData'), KEY_FILE)
}

export async function saveSeedAudioApiKey(apiKey: string) {
  const clean = apiKey.trim()
  sessionApiKey = clean
  if (!clean) {
    await fs.promises.rm(keyPath(), { force: true })
    return true
  }
  if (!safeStorage.isEncryptionAvailable()) {
    await fs.promises.rm(keyPath(), { force: true })
    return false
  }
  await fs.promises.mkdir(path.dirname(keyPath()), { recursive: true })
  await fs.promises.writeFile(keyPath(), safeStorage.encryptString(clean), { mode: 0o600 })
  return true
}

async function readSeedAudioApiKey() {
  const environmentApiKey = process.env.SEED_AUDIO_API_KEY?.trim()
  if (environmentApiKey) return environmentApiKey
  if (sessionApiKey) return sessionApiKey
  const encrypted = await fs.promises.readFile(keyPath()).catch((error: any) => {
    if (error?.code === 'ENOENT') throw new Error('请先配置 Seed Audio API Key')
    throw error
  })
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用')
  return safeStorage.decryptString(encrypted).trim()
}

export async function hasSeedAudioApiKey() {
  try {
    return Boolean(await readSeedAudioApiKey())
  } catch {
    return false
  }
}

export interface GenerateSeedAudioParams {
  runId: string
  episodeId: string
  mode: SeedAudioMode
  durationMs: number
  prompt: string
  language?: 'zh' | 'en'
  references?: SeedAudioReference[]
  outputName?: string
  workflow?: 'creative' | 'video-translation'
  targetLanguage?: string
  abortSignal?: AbortSignal
}

export async function writeSeedAudioArrangement(
  runId: string,
  episodeId: string,
  arrangement: SeedAudioArrangement,
) {
  const root = getRunDir(runId)
  const target = path.join(root, 'wiki', '声音', episodeId, 'seed-audio', '整段配音安排.json')
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  await fs.promises.writeFile(`${target}.tmp`, `${JSON.stringify(arrangement, null, 2)}\n`, 'utf8')
  await fs.promises.rename(`${target}.tmp`, target)
  return relativeRunAsset(runId, target)
}

function outputPath(params: GenerateSeedAudioParams) {
  const safeName = String(params.outputName || `seed-${params.mode}`).replace(
    /[^A-Za-z0-9_-]/g,
    '-',
  )
  const directory = params.workflow === 'video-translation'
    ? path.join(getEpisodeDir(params.runId, params.episodeId), 'video-translate', safeLanguage(params.targetLanguage), 'seed-audio')
    : path.join(getEpisodeDir(params.runId, params.episodeId), 'seed-audio')
  const target = path.join(directory, `${safeName}.mp3`)
  return params.workflow === 'video-translation' ? target : generateUniqueFileName(target)
}

function safeLanguage(value?: string) {
  const language = String(value || '').trim()
  if (!/^[A-Za-z0-9_-]+$/.test(language)) throw new Error('目标语言无效')
  return language
}

async function saveResponseAudio(data: any, target: string, abortSignal?: AbortSignal) {
  data = data?.data || data
  if (typeof data?.url === 'string' && data.url.startsWith('https://')) {
    const response = await axios.get<ArrayBuffer>(data.url, {
      responseType: 'arraybuffer',
      timeout: 300_000,
      signal: abortSignal,
    })
    await fs.promises.writeFile(target, Buffer.from(response.data))
  } else if (typeof data?.audio === 'string' && data.audio.trim()) {
    await fs.promises.writeFile(target, Buffer.from(data.audio, 'base64'))
  } else {
    throw new Error('Seed Audio 响应没有可保存的音频')
  }
}

export async function generateSeedAudio(params: GenerateSeedAudioParams) {
  const apiKey = await readSeedAudioApiKey()
  const references = params.references
    ?.filter((reference) => reference.apiSpeakerId?.trim())
    .map((reference) => ({ speaker: reference.apiSpeakerId! }))
  const payload = buildSeedAudioRequest({
    mode: params.mode,
    language: params.language || 'zh',
    durationMs: params.durationMs,
    prompt: params.prompt,
    references,
  })
  await ensureEpisodeDir(params.runId, params.episodeId)
  const directory = path.dirname(outputPath({ ...params, outputName: 'probe' }))
  await fs.promises.mkdir(directory, { recursive: true })
  const response = await axios.post(process.env.SEED_AUDIO_URL || DEFAULT_URL, payload, {
    timeout: 300_000,
    signal: params.abortSignal,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
  })
  const mp3Path = outputPath(params)
  await saveResponseAudio(response.data, mp3Path, params.abortSignal)
  const wavPath = mp3Path.replace(/\.mp3$/i, '.wav')
  await executeFFmpeg([
    '-i',
    mp3Path,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    '-y',
    wavPath,
  ], { abortSignal: params.abortSignal })
  const duration = await mediaDuration(wavPath)
  const result = {
    path: wavPath,
    mp3Path,
    duration,
    model: process.env.SEED_AUDIO_MODEL || DEFAULT_MODEL,
    responseDuration:
      Number(response.data?.duration || response.data?.original_duration || 0) || undefined,
  }
  const recordPath = params.workflow === 'video-translation'
    ? path.join(getRunDir(params.runId), 'wiki', '翻译', params.episodeId, safeLanguage(params.targetLanguage), '声音生成记录.json')
    : path.join(getRunDir(params.runId), 'wiki', '声音', params.episodeId, 'seed-audio', '声音生成记录.json')
  const existing = await fs.promises
    .readFile(recordPath, 'utf8')
    .then(JSON.parse)
    .catch(() => ({ schemaVersion: 1, generations: [] }))
  existing.generations = [
    ...(Array.isArray(existing.generations) ? existing.generations : []),
    {
      mode: params.mode,
      prompt: params.prompt,
      references:
        params.references?.map(({ speakerId, voiceProfileId, apiSpeakerId }) => ({
          speakerId,
          voiceProfileId,
          apiSpeakerId,
        })) || [],
      wavPath: relativeRunAsset(params.runId, wavPath),
      mp3Path: relativeRunAsset(params.runId, mp3Path),
      duration,
      model: result.model,
      createdAt: new Date().toISOString(),
    },
  ]
  await fs.promises.mkdir(path.dirname(recordPath), { recursive: true })
  await fs.promises.writeFile(`${recordPath}.tmp`, `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
  await fs.promises.rename(`${recordPath}.tmp`, recordPath)
  return result
}

export async function mixSeedAudioTracks(
  runId: string,
  episodeId: string,
  audioPaths: string[],
  durationMs: number,
  workflow: 'creative' | 'video-translation' = 'creative',
  targetLanguage?: string,
  abortSignal?: AbortSignal,
) {
  if (!audioPaths.length) throw new Error('没有可混合的 Seed Audio 音轨')
  const assertAsset = workflow === 'video-translation' ? assertVideoTranslationAsset : assertEpisodeAsset
  const inputs = audioPaths.map((audioPath) => assertAsset(runId, episodeId, audioPath))
  const target = workflow === 'video-translation'
    ? path.join(getEpisodeDir(runId, episodeId), 'video-translate', safeLanguage(targetLanguage), '目标人声.wav')
    : path.join(getEpisodeDir(runId, episodeId), 'seed-audio', '完整声音轨.wav')
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  if (inputs.length === 1) {
    await fs.promises.copyFile(inputs[0], target)
    return relativeRunAsset(runId, target)
  }
  const args = inputs.flatMap((input) => ['-i', input])
  args.push(
    '-filter_complex',
    `${inputs.map((_, index) => `[${index}:a]aresample=48000[a${index}]`).join(';')};${inputs.map((_, index) => `[a${index}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0,atrim=0:${durationMs / 1000}[out]`,
    '-map',
    '[out]',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    '-y',
    target,
  )
  await executeFFmpeg(args, { abortSignal })
  return relativeRunAsset(runId, target)
}

function srtTime(ms: number) {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = Math.floor(ms % 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export async function writeSeedDialogueTimeline(
  runId: string,
  episodeId: string,
  lines: SeedAudioLine[],
  transcript: MaterialTranscript,
) {
  const dialogue = alignSeedDialogue(lines, transcript.cues)
  const root = getRunDir(runId)
  const timelinePath = path.join(root, 'wiki', '时间轴', episodeId, 'dialogue-timeline.json')
  const srtPath = path.join(root, 'wiki', '字幕', `${episodeId}-seed-dialogue.srt`)
  const srt = dialogue
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}\n`,
    )
    .join('\n')
  await Promise.all([
    fs.promises.mkdir(path.dirname(timelinePath), { recursive: true }),
    fs.promises.mkdir(path.dirname(srtPath), { recursive: true }),
  ])
  await Promise.all([
    fs.promises.writeFile(
      `${timelinePath}.tmp`,
      `${JSON.stringify({ schemaVersion: 1, source: transcript.sourceMediaPath, cues: dialogue }, null, 2)}\n`,
      'utf8',
    ),
    fs.promises.writeFile(`${srtPath}.tmp`, srt, 'utf8'),
  ])
  await Promise.all([
    fs.promises.rename(`${timelinePath}.tmp`, timelinePath),
    fs.promises.rename(`${srtPath}.tmp`, srtPath),
  ])
  return {
    timelinePath: relativeRunAsset(runId, timelinePath),
    srtPath: relativeRunAsset(runId, srtPath),
  }
}
