import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import { executeFFmpeg } from './ffmpeg/index.ts'
import { assertVideoTranslationSource, getRunDir, relativeRunAsset } from './media-workspace.ts'

const runFile = promisify(execFile)
const FUNASR_ENGINE = 'funasr-1.4.1-sensevoice-small-ct-punc-v3'

export interface FunAsrCue {
  cueId: string
  startMs: number
  endMs: number
  recognizedText: string
  speakerCluster?: string
  language?: string
  emotion?: string
  audioEvent?: string
  words?: Array<{ text: string; startMs: number; endMs: number }>
}

interface FunAsrTranscript {
  schemaVersion: 1
  engine: string
  device: string
  sourceHash: string
  sourceAudioPath: string
  loadSeconds?: number
  inferSeconds?: number
  cues: FunAsrCue[]
}

function funAsrHome() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  return app.getPath('userData')
}

function pythonPath() {
  if (process.env.FUNASR_PYTHON) return path.resolve(process.env.FUNASR_PYTHON)
  return path.join(
    funAsrHome(),
    'runtime',
    'funasr-venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
}

function runtimeScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'funasr', 'runtime.py')
    : path.join(process.cwd(), 'runtime', 'funasr', 'runtime.py')
}

function modelRoot() {
  return path.join(funAsrHome(), 'models', 'funasr')
}

async function fileHash(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function srtTime(milliseconds: number) {
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1_000)
  const millis = milliseconds % 1_000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export function funAsrCuesToSrt(cues: FunAsrCue[], text: (cue: FunAsrCue) => string) {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${text(cue)}\n`,
    )
    .join('\n')
}

function validateTranscript(value: unknown, durationMs: number): FunAsrTranscript {
  const transcript = value as FunAsrTranscript
  if (transcript?.schemaVersion !== 1 || !Array.isArray(transcript.cues))
    throw new Error('FunASR 没有返回有效转写结果')
  const ids = new Set<string>()
  for (const cue of transcript.cues) {
    if (
      !cue?.cueId ||
      ids.has(cue.cueId) ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs <= cue.startMs ||
      cue.endMs > durationMs + 100 ||
      !cue.recognizedText?.trim()
    )
      throw new Error('FunASR 字幕时间或文字无效')
    ids.add(cue.cueId)
  }
  return transcript
}

async function runFunAsr(audioPath: string, durationMs: number, abortSignal?: AbortSignal) {
  const python = pythonPath()
  const runtime = runtimeScriptPath()
  await Promise.all([
    fs.promises.access(python, fs.constants.X_OK),
    fs.promises.access(runtime),
  ]).catch(() => {
    throw new Error('本地字幕引擎尚未安装，请打开“生成设置”并点击“一键安装”')
  })
  let stdout = ''
  try {
    ;({ stdout } = await runFile(
      python,
      [runtime, 'transcribe', '--model-root', modelRoot(), '--audio', audioPath],
      {
        maxBuffer: 64 * 1024 * 1024,
        signal: abortSignal,
        env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
      },
    ))
  } catch (error) {
    if (abortSignal?.aborted) throw error
    throw new Error('FunASR 识别失败，请运行 pnpm probe:funasr 检查本地环境和模型')
  }
  const resultLine = stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith('FUNASR_RESULT_JSON='))
  if (!resultLine) throw new Error('FunASR 没有返回结构化结果')
  return validateTranscript(
    JSON.parse(resultLine.slice('FUNASR_RESULT_JSON='.length)),
    durationMs,
  )
}

export async function transcribeVideoTranslationDubbingBlock(
  audioPath: string,
  durationMs: number,
  abortSignal?: AbortSignal,
) {
  if (!(await fs.promises.stat(audioPath).catch(() => null))?.size)
    throw new Error('完整配音块不存在')
  return runFunAsr(audioPath, durationMs, abortSignal)
}

async function atomicWriteFiles(files: Array<{ path: string; content: string }>) {
  const temporary = files.map((file) => `${file.path}.${randomUUID()}.tmp`)
  try {
    await Promise.all(
      files.map(async (file, index) => {
        await fs.promises.mkdir(path.dirname(file.path), { recursive: true })
        await fs.promises.writeFile(temporary[index], file.content, 'utf8')
      }),
    )
    for (let index = 0; index < files.length; index++)
      await fs.promises.rename(temporary[index], files[index].path)
  } catch (error) {
    await Promise.all(temporary.map((file) => fs.promises.rm(file, { force: true })))
    throw error
  }
}

export async function transcribeVideoTranslationAudio(
  runId: string,
  episodeId: string,
  videoPath: string,
  durationMs: number,
  reportProgress: (message: string) => void,
  abortSignal?: AbortSignal,
) {
  const source = assertVideoTranslationSource(runId, episodeId, videoPath)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('识别视频时长无效')
  const sourceHash = await fileHash(source)
  const audioPath = path.join(path.dirname(source), 'source.wav')
  const audioFingerprintPath = `${audioPath}.source.sha256`
  const translationRoot = path.join(getRunDir(runId), 'wiki', '翻译', episodeId)
  const jsonPath = path.join(translationRoot, '原始转写.json')
  const srtPath = path.join(translationRoot, '原始转写.srt')
  const cached = await fs.promises
    .readFile(jsonPath, 'utf8')
    .then((content) => validateTranscript(JSON.parse(content), durationMs))
    .catch(() => null)
  if (cached?.sourceHash === sourceHash && cached.engine === FUNASR_ENGINE) {
    await atomicWriteFiles([
      { path: srtPath, content: funAsrCuesToSrt(cached.cues, (cue) => cue.recognizedText) },
    ])
    reportProgress('已复用同一原片的 FunASR 原始转写')
    return { transcript: cached, jsonPath, srtPath }
  }

  const audioFingerprint = await fs.promises.readFile(audioFingerprintPath, 'utf8').catch(() => '')
  if (
    !(await fs.promises.stat(audioPath).catch(() => null))?.size ||
    audioFingerprint.trim() !== sourceHash
  ) {
    reportProgress('第 1/3 步：FFmpeg 正在提取 16 kHz 单声道音频')
    await executeFFmpeg(
      ['-i', source, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', audioPath],
      { abortSignal },
    )
    await fs.promises.writeFile(audioFingerprintPath, `${sourceHash}\n`, 'utf8')
  }

  reportProgress('第 2/3 步：FunASR 正在识别文字、时间、说话人和可用情绪')
  const transcript = validateTranscript(
    {
      ...(await runFunAsr(audioPath, durationMs, abortSignal)),
      sourceHash,
      sourceAudioPath: relativeRunAsset(runId, audioPath),
    },
    durationMs,
  )
  await atomicWriteFiles([
    { path: jsonPath, content: `${JSON.stringify(transcript, null, 2)}\n` },
    { path: srtPath, content: funAsrCuesToSrt(transcript.cues, (cue) => cue.recognizedText) },
  ])
  return { transcript, jsonPath, srtPath }
}
