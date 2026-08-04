import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertRunAsset, ensureRunDir, relativeRunAsset } from './media-workspace.ts'
import type { GenerateMaterialTranscriptParams, MaterialTranscriptResult } from './types.ts'
import {
  materialTranscriptToSrt,
  normalizeWhisperOutput,
  type WhisperOutput,
} from '../src/runtime/materialTranscript.ts'

const run = promisify(execFile)
const DEFAULT_PYTHON = '/Users/by3/Documents/peiyin-pyvideotrans/.venv/bin/python'
const DEFAULT_MODEL = '/Users/by3/Documents/peiyin-pyvideotrans/models/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo'
const MEDIA_ID = /^[A-Za-z0-9_-]+$/

const TRANSCRIBE_SCRIPT = String.raw`
import json
import sys
from faster_whisper import WhisperModel

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[2], vad_filter=True)
print(json.dumps({
    "duration": info.duration,
    "segments": [{"start": item.start, "end": item.end, "text": item.text} for item in segments],
}, ensure_ascii=False))
`

async function replacePair(files: Array<{ path: string; content: string }>) {
  const backups = await Promise.all(files.map(async (file) =>
    fs.promises.readFile(file.path).catch((error: any) => error?.code === 'ENOENT' ? null : Promise.reject(error)),
  ))
  const temporary = files.map((file) => `${file.path}.${process.pid}.tmp`)
  try {
    await Promise.all(files.map(async (file, index) => {
      await fs.promises.mkdir(path.dirname(file.path), { recursive: true })
      await fs.promises.writeFile(temporary[index], file.content, 'utf8')
    }))
    for (let index = 0; index < files.length; index++)
      await fs.promises.rename(temporary[index], files[index].path)
  } catch (error) {
    await Promise.all(temporary.map((file) => fs.promises.rm(file, { force: true })))
    await Promise.all(files.map((file, index) => backups[index] === null
      ? fs.promises.rm(file.path, { force: true })
      : fs.promises.writeFile(file.path, backups[index]!)))
    throw error
  }
}

export async function generateMaterialTranscript(
  params: GenerateMaterialTranscriptParams,
): Promise<MaterialTranscriptResult> {
  if (!MEDIA_ID.test(params.mediaId)) throw new Error('无效的素材 ID')
  const sourcePath = assertRunAsset(params.runId, params.videoPath)
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile()) throw new Error('视频素材不可读')
  const python = process.env.FASTER_WHISPER_PYTHON || DEFAULT_PYTHON
  const model = process.env.FASTER_WHISPER_MODEL || DEFAULT_MODEL
  await Promise.all([
    fs.promises.access(python, fs.constants.X_OK),
    fs.promises.access(model, fs.constants.R_OK),
  ]).catch(() => {
    throw new Error('Faster-Whisper 运行时或 large-v3-turbo 模型不可用')
  })
  const { stdout } = await run(python, ['-c', TRANSCRIBE_SCRIPT, model, sourcePath], {
    maxBuffer: 16 * 1024 * 1024,
  })
  let output: WhisperOutput
  try {
    output = JSON.parse(stdout)
  } catch {
    throw new Error('Faster-Whisper 没有返回有效转录结果')
  }
  const transcript = normalizeWhisperOutput(
    params.mediaId,
    relativeRunAsset(params.runId, sourcePath),
    output,
  )
  const root = await ensureRunDir(params.runId)
  const jsonPath = path.join(root, 'wiki', '转录', 'episode-001', `${params.mediaId}-whisper.json`)
  const srtPath = path.join(root, 'wiki', '字幕', '素材', `${params.mediaId}-whisper.srt`)
  await replacePair([
    { path: jsonPath, content: `${JSON.stringify(transcript, null, 2)}\n` },
    { path: srtPath, content: materialTranscriptToSrt(transcript) },
  ])
  return {
    transcript,
    transcriptJsonPath: relativeRunAsset(params.runId, jsonPath),
    transcriptSrtPath: relativeRunAsset(params.runId, srtPath),
  }
}
