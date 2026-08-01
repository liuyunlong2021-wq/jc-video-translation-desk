import fs from 'node:fs'
import os from 'os'
import { spawn } from 'child_process'
import type { ComposeGeneratedVideoParams, ExecuteFFmpegResult } from './types.ts'
import { generateUniqueFileName } from '../lib/tools.ts'
import { isDev } from '../lib/is-dev.ts'
import { assertRunAsset, ensureRunDir, getRunAssetPath, mediaDuration } from '../media-workspace.ts'

const isWindows = process.platform === 'win32'

const ffmpegPath: string = isDev
  ? require('ffmpeg-static')
  : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

const OUTPUT_SIZES = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:3': [1440, 1080],
  '3:4': [1080, 1440],
  '21:9': [1920, 824],
} as const

export async function composeGeneratedVideo(
  params: ComposeGeneratedVideoParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
) {
  if (!params.videoFiles.length || params.videoFiles.length !== params.playDurations.length) {
    throw new Error('视频片段和时长不匹配')
  }
  const durations = params.playDurations.map(Number)
  if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error('视频片段时长无效')
  }
  const videoFiles = params.videoFiles.map((file) => assertRunAsset(params.runId, file))
  const voiceFile = assertRunAsset(params.runId, params.voiceFile)
  await ensureRunDir(params.runId)
  const outputPath = generateUniqueFileName(getRunAssetPath(params.runId, 'final'))
  const [width, height] = OUTPUT_SIZES[params.ratio]
  const totalDuration = await mediaDuration(voiceFile)
  durations[durations.length - 1] +=
    totalDuration - durations.reduce((total, duration) => total + duration, 0)
  const args: string[] = []
  videoFiles.forEach((file) => args.push('-i', file))
  args.push('-i', voiceFile)

  const streams = videoFiles.map((_, index) => `v${index}`)
  const filters = videoFiles.map((_, index) => {
    const duration = durations[index]
    return `[${index}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration}[v${index}]`
  })
  filters.push(`[${streams.join('][')}]concat=n=${streams.length}:v=1:a=0[vout]`)
  filters.push(
    `[${videoFiles.length}:a]loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${totalDuration},asetpts=PTS-STARTPTS[aout]`,
  )

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-t',
    String(totalDuration),
    '-y',
    outputPath,
  )
  await executeFFmpeg(args, params)
  return outputPath
}

export async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  isWindows && validateExecutables()

  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    }

    const child = spawn(ffmpegPath, args, defaultOptions)

    let stdout = ''
    let stderr = ''
    let progress = 0

    child.stdout.on('data', (data) => {
      stdout += data.toString()
      // 处理进度信息
      progress = parseProgress(data.toString()) ?? 0
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      // 实时输出进度信息
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`))
    })

    // 提供取消功能
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    }
  })
}

function validateExecutables() {
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`)
  }

  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK)
  } catch (error) {
    // Windows 上可能没有 X_OK 权限标志
    if (os.platform() !== 'win32') {
      throw new Error('FFmpeg executables do not have execute permissions')
    }
  }
}

function parseProgress(stderrLine: string) {
  // 解析时间信息：frame=  123 fps= 45 q=25.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.5x
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseFloat(timeMatch[3])
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}
