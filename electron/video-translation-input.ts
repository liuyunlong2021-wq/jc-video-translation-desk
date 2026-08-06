import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertVideoTranslationAsset, mediaDuration, relativeRunAsset } from './media-workspace.ts'

const runFile = promisify(execFile)
export const VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES = 20 * 1024 * 1024
export const VIDEO_TRANSLATION_MODEL_INPUT_TARGET_BYTES = 12 * 1024 * 1024

export async function prepareVideoTranslationModelInput(
  runId: string,
  episodeId: string,
  filePath: string,
  knownDurationMs?: number,
) {
  const source = assertVideoTranslationAsset(runId, episodeId, filePath)
  const relative = relativeRunAsset(runId, source)
  if (!relative.startsWith(`episodes/${episodeId}/video-translate/source.`))
    throw new Error('模型分析原片不属于当前视频翻译任务')
  if ((await fs.promises.stat(source)).size <= VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES)
    return source

  const target = path.join(path.dirname(source), 'analysis.mp4')
  const cached = await fs.promises.stat(target).catch(() => null)
  if (
    cached?.isFile() &&
    cached.size > 0 &&
    cached.size <= VIDEO_TRANSLATION_MODEL_INPUT_TARGET_BYTES
  )
    return target

  const durationMs = knownDurationMs || Math.round((await mediaDuration(source)) * 1000)
  const durationSeconds = durationMs / 1000
  let videoBitrate = Math.min(
    4_000_000,
    Math.floor((VIDEO_TRANSLATION_MODEL_INPUT_TARGET_BYTES * 8) / durationSeconds - 64_000),
  )
  if (!Number.isFinite(videoBitrate) || videoBitrate < 160_000)
    throw new Error('原片过长，无法在模型大小限制内保留可用画面，请先分段处理')

  const temporary = `${target}.${randomUUID()}.tmp.mp4`
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await runFile(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-y',
          '-i',
          source,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          'scale=w=min(1280\\,iw):h=-2',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-b:v',
          String(videoBitrate),
          '-maxrate',
          String(videoBitrate),
          '-bufsize',
          String(videoBitrate * 2),
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-ac',
          '1',
          '-movflags',
          '+faststart',
          temporary,
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      )
      const size = (await fs.promises.stat(temporary)).size
      if (size > 0 && size <= VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES) {
        await fs.promises.rename(temporary, target)
        return target
      }
      videoBitrate = Math.floor(
        ((videoBitrate * VIDEO_TRANSLATION_MODEL_INPUT_TARGET_BYTES) / size) * 0.9,
      )
      if (videoBitrate < 160_000) break
    }
    throw new Error('原片压缩后仍超过模型大小限制，请先分段处理')
  } finally {
    await fs.promises.rm(temporary, { force: true })
  }
}

export async function prepareVideoTranslationReviewSlices(
  runId: string,
  episodeId: string,
  filePath: string,
  plan: Array<{ startMs: number; endMs: number }>,
  abortSignal?: AbortSignal,
) {
  const source = assertVideoTranslationAsset(runId, episodeId, filePath)
  const directory = path.join(path.dirname(source), 'review-slices')
  await fs.promises.mkdir(directory, { recursive: true })
  const slices: Array<{ path: string; startMs: number; endMs: number }> = []
  for (let index = 0; index < plan.length; index++) {
    const { startMs, endMs } = plan[index]
    const target = path.join(
      directory,
      `slice-${String(index + 1).padStart(3, '0')}-${startMs}-${endMs}.mp4`,
    )
    const temporary = `${target}.${randomUUID()}.tmp.mp4`
    try {
      await runFile(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-y',
          '-i',
          source,
          '-ss',
          String(startMs / 1000),
          '-t',
          String((endMs - startMs) / 1000),
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          'scale=w=min(1280\\,iw):h=-2',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '24',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-ac',
          '1',
          '-movflags',
          '+faststart',
          temporary,
        ],
        { maxBuffer: 10 * 1024 * 1024, signal: abortSignal },
      )
      await fs.promises.rename(temporary, target)
    } finally {
      await fs.promises.rm(temporary, { force: true })
    }
    slices.push({ path: target, startMs, endMs })
  }
  return slices
}
