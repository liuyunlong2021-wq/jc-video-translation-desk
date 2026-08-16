import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import {
  assertVideoTranslationSource,
  getRunDir,
  relativeRunAsset,
} from './media-workspace.ts'
import { funAsrCuesToSrt } from './video-translation-asr.ts'
import { resolveVideoSubFinderPath } from './video-subfinder.ts'

const runFile = promisify(execFile)
const OCR_ENGINE = 'rapid-videocr-3.1.1-rapidocr-vsf'

function localRuntimeHome() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  return app.getPath('userData')
}

function pythonPath() {
  if (process.env.FUNASR_PYTHON) return path.resolve(process.env.FUNASR_PYTHON)
  return path.join(
    localRuntimeHome(),
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

function validateOcrTranscript(value: unknown, durationMs: number) {
  const transcript = value as {
    schemaVersion?: number
    engine?: string
    cues?: Array<{ cueId: string; startMs: number; endMs: number; recognizedText: string }>
  }
  if (transcript?.schemaVersion !== 1 || !Array.isArray(transcript.cues))
    throw new Error('视频字幕 OCR 没有返回有效结果')
  const ids = new Set<string>()
  for (const cue of transcript.cues) {
    if (
      !cue?.cueId ||
      ids.has(cue.cueId) ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs <= cue.startMs ||
      cue.endMs > durationMs + 500 ||
      !cue.recognizedText?.trim()
    )
      throw new Error('视频字幕 OCR 时间或文字无效')
    ids.add(cue.cueId)
  }
  return {
    schemaVersion: 1 as const,
    engine: transcript.engine || OCR_ENGINE,
    device: 'cpu',
    cues: transcript.cues,
  }
}

function normalizeRuntimeFailure(error: unknown) {
  const details = [
    (error as { stderr?: string })?.stderr,
    (error as { stdout?: string })?.stdout,
    error instanceof Error ? error.message : String(error || ''),
  ]
    .flatMap((value) => String(value || '').split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
  const tail = details.slice(-8).join('\n')
  if (/VideoSubFinder did not extract subtitle key frames|没有从画面中识别到字幕/i.test(tail))
    return new Error('未检测到清晰硬字幕，请改用“导入SRT”或选择“上传无字幕视频”')
  if (/VideoSubFinder executable is missing|VideoSubFinder executable is required/i.test(tail))
    return new Error('本地硬字幕识别工具缺失，请到生成设置点击“一键安装/修复”')
  if (/Cannot open video|Video file does not exist/i.test(tail))
    return new Error('视频文件无法读取，请确认源视频仍存在且格式可播放')
  return new Error(
    tail
      ? `视频字幕 OCR 失败：${tail}`
      : '视频字幕 OCR 失败，请到生成设置点击“一键安装/修复本地字幕引擎”',
  )
}

function ocrRuntimeArgs(runId: string, episodeId: string, source: string, videoSubFinderPath: string) {
  return [
    runtimeScriptPath(),
    'ocr-video',
    '--video',
    source,
    '--vsf-exe',
    videoSubFinderPath,
    '--work-dir',
    path.join(getRunDir(runId), 'tmp', 'rapid-videocr', episodeId),
  ]
}

export async function recognizeVideoTranslationHardSubtitles(
  runId: string,
  episodeId: string,
  videoPath: string,
  durationMs: number,
  reportProgress: (message: string) => void,
  abortSignal?: AbortSignal,
) {
  const source = assertVideoTranslationSource(runId, episodeId, videoPath)
  const videoSubFinder = await resolveVideoSubFinderPath()
  await Promise.all([
    fs.promises.access(pythonPath(), fs.constants.X_OK),
    fs.promises.access(runtimeScriptPath()),
    videoSubFinder ? fs.promises.access(videoSubFinder, fs.constants.X_OK) : Promise.reject(),
  ]).catch(() => {
    throw new Error('本地字幕引擎尚未安装，请打开“生成设置”并点击“一键安装”')
  })
  reportProgress('视频字幕 OCR 正在读取画面字幕')
  let stdout = ''
  try {
    ;({ stdout } = await runFile(
      pythonPath(),
      ocrRuntimeArgs(runId, episodeId, source, videoSubFinder!),
      {
        maxBuffer: 64 * 1024 * 1024,
        signal: abortSignal,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      },
    ))
  } catch (error) {
    if (abortSignal?.aborted) throw error
    throw normalizeRuntimeFailure(error)
  }
  const resultLine = stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith('OCR_RESULT_JSON='))
  if (!resultLine) throw new Error('视频字幕 OCR 没有返回结构化结果')
  const transcript = validateOcrTranscript(
    JSON.parse(resultLine.slice('OCR_RESULT_JSON='.length)),
    durationMs,
  )
  if (!transcript.cues.length)
    throw new Error('没有从画面中识别到字幕，请确认视频有清晰硬字幕或改用导入 SRT')
  const translationRoot = path.join(getRunDir(runId), 'wiki', '翻译', episodeId)
  const jsonPath = path.join(translationRoot, '原始转写.json')
  const srtPath = path.join(translationRoot, '原始字幕.srt')
  await fs.promises.mkdir(translationRoot, { recursive: true })
  await fs.promises.writeFile(
    `${jsonPath}.tmp`,
    `${JSON.stringify(
      {
        ...transcript,
        sourceMediaPath: relativeRunAsset(runId, source),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  await fs.promises.rename(`${jsonPath}.tmp`, jsonPath)
  await fs.promises.writeFile(
    `${srtPath}.tmp`,
    funAsrCuesToSrt(transcript.cues, (cue) => cue.recognizedText),
    'utf8',
  )
  await fs.promises.rename(`${srtPath}.tmp`, srtPath)
  reportProgress(`视频字幕 OCR 完成：${transcript.cues.length} 条`)
  return {
    transcript,
    jsonPath,
    srtPath,
  }
}
