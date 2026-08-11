import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import { isDev } from './lib/is-dev.ts'

const require = createRequire(import.meta.url)

function unpackedPath(binaryPath: string) {
  return isDev ? binaryPath : binaryPath.replace('app.asar', 'app.asar.unpacked')
}

export function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH) return path.resolve(process.env.FFMPEG_PATH)
  return unpackedPath(require('ffmpeg-static') as string)
}

export function resolveFfprobePath() {
  if (process.env.FFPROBE_PATH) return path.resolve(process.env.FFPROBE_PATH)
  const ffprobe = require('ffprobe-static') as { path?: string }
  if (!ffprobe.path) throw new Error('安装包缺少 ffprobe，请重新下载 Windows 安装包')
  return unpackedPath(ffprobe.path)
}

export function resolveBundledUvPath() {
  if (process.env.UV_PATH) return path.resolve(process.env.UV_PATH)
  const executable = process.platform === 'win32' ? 'uv.exe' : 'uv'
  const arch = process.arch === 'ia32' ? 'ia32' : process.arch === 'arm64' ? 'arm64' : 'x64'
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'runtime-tools', 'uv', arch, executable)]
    : [
        path.join(process.cwd(), 'dist-native', 'runtime-tools', 'uv', arch, executable),
        path.join(process.cwd(), 'runtime', 'tools', 'uv', arch, executable),
      ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}
