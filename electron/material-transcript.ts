import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertEpisodeAsset, ensureRunDir, relativeRunAsset } from './media-workspace.ts'
import type { GenerateMaterialTranscriptParams, MaterialTranscriptResult } from './types.ts'
import {
  materialTranscriptToSrt,
  normalizeWhisperOutput,
  type WhisperOutput,
} from '../src/runtime/materialTranscript.ts'

const run = promisify(execFile)
const DEFAULT_PYTHON = '/Users/by3/Documents/peiyin-pyvideotrans/.venv/bin/python'
const DEFAULT_MODEL =
  '/Users/by3/Documents/peiyin-pyvideotrans/models/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo'
const DEFAULT_RUNTIME_ROOT = '/Users/by3/Documents/peiyin-pyvideotrans'
const MEDIA_ID = /^[A-Za-z0-9_-]+$/

const TRANSCRIBE_SCRIPT = String.raw`
import json
import os
import sys
from faster_whisper import WhisperModel

sys.path.insert(0, sys.argv[3])
from videotrans.process._stt_utils import _resegment

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
segments, info = model.transcribe(
    sys.argv[2],
    beam_size=5,
    best_of=5,
    condition_on_previous_text=False,
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 140, "min_speech_duration_ms": 0},
    word_timestamps=True,
    no_speech_threshold=0.5,
    compression_ratio_threshold=2.2,
    temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
)
items = [{
    "text": item.text,
    "start": item.start,
    "end": item.end,
    "words": [{"word": word.word, "start": word.start, "end": word.end} for word in (item.words or [])],
} for item in segments]
resegmented = _resegment(items, info.language, 6000, os.devnull) if items else []
print(json.dumps({
    "duration": info.duration,
    "words": [word for item in items for word in item["words"]],
    "segments": [{
        "start": item["start_time"] / 1000,
        "end": item["end_time"] / 1000,
        "text": item["text"],
    } for item in resegmented],
}, ensure_ascii=False))
`

export async function runFasterWhisper(
  sourcePath: string,
  abortSignal?: AbortSignal,
): Promise<WhisperOutput> {
  const python = process.env.FASTER_WHISPER_PYTHON || DEFAULT_PYTHON
  const model = process.env.FASTER_WHISPER_MODEL || DEFAULT_MODEL
  const runtimeRoot = process.env.FASTER_WHISPER_RUNTIME_ROOT || DEFAULT_RUNTIME_ROOT
  await Promise.all([
    fs.promises.access(python, fs.constants.X_OK),
    fs.promises.access(model, fs.constants.R_OK),
    fs.promises.access(
      path.join(runtimeRoot, 'videotrans', 'process', '_stt_utils.py'),
      fs.constants.R_OK,
    ),
  ]).catch(() => {
    throw new Error('Faster-Whisper 运行时或 large-v3-turbo 模型不可用')
  })
  const { stdout } = await run(python, ['-c', TRANSCRIBE_SCRIPT, model, sourcePath, runtimeRoot], {
    maxBuffer: 16 * 1024 * 1024,
    signal: abortSignal,
  })
  try {
    return JSON.parse(stdout) as WhisperOutput
  } catch {
    throw new Error('Faster-Whisper 没有返回有效转录结果')
  }
}

async function replacePair(files: Array<{ path: string; content: string }>) {
  const backups = await Promise.all(
    files.map(async (file) =>
      fs.promises
        .readFile(file.path)
        .catch((error: any) => (error?.code === 'ENOENT' ? null : Promise.reject(error))),
    ),
  )
  const temporary = files.map((file) => `${file.path}.${process.pid}.tmp`)
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
    await Promise.all(
      files.map((file, index) =>
        backups[index] === null
          ? fs.promises.rm(file.path, { force: true })
          : fs.promises.writeFile(file.path, backups[index]!),
      ),
    )
    throw error
  }
}

export async function generateMaterialTranscript(
  params: GenerateMaterialTranscriptParams,
): Promise<MaterialTranscriptResult> {
  if (!MEDIA_ID.test(params.mediaId)) throw new Error('无效的素材 ID')
  const sourcePath = assertEpisodeAsset(params.runId, params.episodeId, params.videoPath)
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile()) throw new Error('视频素材不可读')
  const output = await runFasterWhisper(sourcePath)
  const transcript = normalizeWhisperOutput(
    params.mediaId,
    relativeRunAsset(params.runId, sourcePath),
    output,
  )
  const root = await ensureRunDir(params.runId)
  const jsonPath = path.join(
    root,
    'wiki',
    '转录',
    params.episodeId,
    `${params.mediaId}-whisper.json`,
  )
  const srtPath = path.join(
    root,
    'wiki',
    '字幕',
    '素材',
    params.episodeId,
    `${params.mediaId}-whisper.srt`,
  )
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
