import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, dialog } from 'electron'
import axios from 'axios'
import { parseBuffer } from 'music-metadata'
import { generateUniqueFileName } from './lib/tools.ts'
import type { CoreReferenceAsset } from './types.ts'

const RUN_ID = /^[A-Za-z0-9_-]+$/
const stateWrites = new Map<string, Promise<void>>()

export function getRunDir(runId: string) {
  if (!RUN_ID.test(runId)) throw new Error('无效的任务 ID')
  return path.join(app.getPath('userData'), 'media-runs', runId)
}

export async function ensureRunDir(runId: string) {
  const dir = getRunDir(runId)
  await Promise.all([
    fs.promises.mkdir(path.join(dir, 'inputs'), { recursive: true }),
    fs.promises.mkdir(path.join(dir, 'storyboards'), { recursive: true }),
    fs.promises.mkdir(path.join(dir, 'clips'), { recursive: true }),
  ])
  return dir
}

const REFERENCE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const

export async function importCoreReference(
  runId: string,
  sourcePath: string,
): Promise<CoreReferenceAsset> {
  const extension = path.extname(sourcePath).toLowerCase() as keyof typeof REFERENCE_TYPES
  const mimeType = REFERENCE_TYPES[extension]
  if (!mimeType) throw new Error('只支持 PNG、JPEG 或 WebP 参考图')
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile()) throw new Error('参考图不是可读文件')
  if (stat.size > 20 * 1024 * 1024) throw new Error('参考图不能超过 20 MB')
  await ensureRunDir(runId)
  const outputPath = generateUniqueFileName(
    path.join(getRunDir(runId), 'inputs', `core-reference${extension}`),
  )
  await fs.promises.copyFile(sourcePath, outputPath)
  return {
    id: `core-${randomUUID()}`,
    label: path.basename(sourcePath),
    relativePath: relativeRunAsset(runId, outputPath),
    mimeType,
    source: 'upload',
  }
}

export async function selectCoreReference(runId: string) {
  const result = await dialog.showOpenDialog({
    title: '选择核心参考图',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return importCoreReference(runId, result.filePaths[0])
}

export async function saveMediaState(runId: string, value: string) {
  const state = JSON.parse(value)
  if (state?.runId !== runId) throw new Error('任务状态与任务 ID 不匹配')
  const previous = stateWrites.get(runId) || Promise.resolve()
  const next = previous.then(async () => {
    await ensureRunDir(runId)
    const filePath = path.join(getRunDir(runId), 'state.json')
    await fs.promises.writeFile(`${filePath}.tmp`, JSON.stringify(state, null, 2))
    await fs.promises.rename(`${filePath}.tmp`, filePath)
  })
  stateWrites.set(runId, next)
  try {
    await next
  } finally {
    if (stateWrites.get(runId) === next) stateWrites.delete(runId)
  }
}

export async function loadLatestMediaState() {
  const root = path.join(app.getPath('userData'), 'media-runs')
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true })
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  const candidates = await Promise.all(
    entries.filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name)).map(async (entry) => {
      const filePath = path.join(root, entry.name, 'state.json')
      try {
        return { filePath, mtime: (await fs.promises.stat(filePath)).mtimeMs }
      } catch {
        return null
      }
    }),
  )
  for (const candidate of candidates.filter(Boolean).sort((a, b) => b!.mtime - a!.mtime)) {
    try {
      const value = await fs.promises.readFile(candidate!.filePath, 'utf8')
      const state = JSON.parse(value)
      if (RUN_ID.test(state?.runId)) return JSON.stringify(state)
    } catch {
      // Try the next recoverable run.
    }
  }
  return null
}

export function getRunAssetPath(
  runId: string,
  kind: 'voice' | 'storyboard' | 'clip' | 'final',
  index = 0,
) {
  const dir = getRunDir(runId)
  if (kind === 'voice') return path.join(dir, 'voice.mp3')
  if (kind === 'final') return path.join(dir, 'final.mp4')
  if (!Number.isInteger(index) || index < 1) throw new Error('无效的素材序号')
  const name = String(index).padStart(3, '0')
  return path.join(
    dir,
    kind === 'storyboard' ? 'storyboards' : 'clips',
    `${name}.${kind === 'storyboard' ? 'png' : 'mp4'}`,
  )
}

export function assertRunAsset(runId: string, filePath: string) {
  const runDir = path.resolve(getRunDir(runId))
  const root = `${runDir}${path.sep}`
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(runDir, filePath)
  if (!resolved.startsWith(root)) throw new Error('素材不属于当前任务')
  return resolved
}

export function relativeRunAsset(runId: string, filePath: string) {
  return path.relative(getRunDir(runId), assertRunAsset(runId, filePath)).split(path.sep).join('/')
}

export async function downloadMedia(
  url: string,
  outputPath: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
) {
  assertHttpsMediaUrl(url)
  const response = await axios.get<ArrayBuffer>(url, {
    headers,
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxRedirects: 3,
    beforeRedirect: (options) => assertHttpsMediaUrl(`${options.protocol}//${options.hostname}`),
    signal,
  })
  const finalUrl = (response as any).request?.res?.responseUrl
  if (finalUrl) assertHttpsMediaUrl(finalUrl)
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, Buffer.from(response.data))
  return outputPath
}

function assertHttpsMediaUrl(url: string) {
  if (new URL(url).protocol !== 'https:') throw new Error('媒体结果地址不安全')
}

export async function writeDataUrl(dataUrl: string, outputPath: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s)
  if (!match) throw new Error('媒体结果格式无效')
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, Buffer.from(match[1], 'base64'))
  return outputPath
}

export async function mediaDuration(filePath: string) {
  const buffer = await fs.promises.readFile(filePath)
  const metadata = await parseBuffer(buffer)
  const duration = metadata.format.duration
  if (!duration || !Number.isFinite(duration)) throw new Error('无法读取媒体时长')
  return duration
}

export async function exportMedia(sourcePath: string) {
  const result = await dialog.showSaveDialog({
    defaultPath: path.basename(sourcePath),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.promises.copyFile(sourcePath, result.filePath)
  return result.filePath
}
