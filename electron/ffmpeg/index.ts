import fs from 'node:fs'
import os from 'os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'child_process'
import { app } from 'electron'
import { parseFile } from 'music-metadata'
import type {
  ComposeGeneratedVideoParams,
  ComposePictureMasterParams,
  ComposeVideoTranslationParams,
  AdoptInstrumentParams,
  ExecuteFFmpegResult,
  MixBackgroundAudioParams,
  SeparateSourceAudioParams,
  SubtitleCue,
} from './types.ts'
import { generateUniqueFileName } from '../lib/tools.ts'
import { isDev } from '../lib/is-dev.ts'
import {
  assertEpisodeAsset,
  assertVideoTranslationAsset,
  ensureEpisodeDir,
  getEpisodeDir,
  getRunDir,
  getRunAssetPath,
  mediaDuration,
  relativeRunAsset,
  writeFinalArtifacts,
} from '../media-workspace.ts'
import type { AudioProcessingRecord } from '../../src/runtime/productionContract.ts'

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
  const videoFiles = params.videoFiles.map((file) =>
    assertEpisodeAsset(params.runId, params.episodeId, file),
  )
  const sourceHasAudio = await Promise.all(videoFiles.map(hasAudioStream))
  const voiceFile = params.voiceFile
    ? assertEpisodeAsset(params.runId, params.episodeId, params.voiceFile)
    : ''
  if (params.audioMode !== 'keep-original' && !voiceFile)
    throw new Error('生成最终成片前必须先生成本集配音')
  await ensureEpisodeDir(params.runId, params.episodeId)
  const outputPath = generateUniqueFileName(
    getRunAssetPath(params.runId, params.episodeId, 'final'),
  )
  const [width, height] = OUTPUT_SIZES[params.ratio]
  const timelineDuration = durations.reduce((total, duration) => total + duration, 0)
  const voiceDuration = voiceFile ? await mediaDuration(voiceFile) : 0
  if (voiceDuration > timelineDuration + 0.1)
    throw new Error('正式配音超过分镜时间轴，请调整对白时长或镜头时长')
  const totalDuration = timelineDuration
  const args: string[] = []
  videoFiles.forEach((file) => args.push('-i', file))
  if (voiceFile) args.push('-i', voiceFile)

  const streams = videoFiles.map((_, index) => `v${index}`)
  const filters = videoFiles.map((_, index) => {
    const duration = durations[index]
    return `[${index}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration}[v${index}]`
  })
  filters.push(`[${streams.join('][')}]concat=n=${streams.length}:v=1:a=0[vout]`)
  if (params.audioMode === 'keep-original') {
    const originalAudio = videoFiles.map((_, index) => {
      const duration = durations[index]
      filters.push(
        sourceHasAudio[index]
          ? `[${index}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000[a${index}]`
          : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration}[a${index}]`,
      )
      return `a${index}`
    })
    filters.push(`[${originalAudio.join('][')}]concat=n=${originalAudio.length}:v=0:a=1[original]`)
  }
  if (params.audioMode === 'keep-original') {
    filters.push(`[original]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`)
  } else {
    filters.push(
      `[${videoFiles.length}:a]apad=pad_dur=${totalDuration},atrim=0:${totalDuration},asetpts=PTS-STARTPTS[voice]`,
    )
    filters.push(`[voice]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`)
  }

  let videoOutput = '[vout]'
  if (params.subtitleCues?.length) {
    const subtitlePath = path.join(path.dirname(outputPath), `subtitles-${Date.now()}.srt`)
    await fs.promises.writeFile(subtitlePath, formatSrt(params.subtitleCues), 'utf8')
    const escapedPath = subtitlePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/'/g, "'\\\\''")
    filters.push(
      `[vout]subtitles='${escapedPath}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=90'[vsub]`,
    )
    videoOutput = '[vsub]'
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    videoOutput,
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
  await writeFinalArtifacts(params.runId, params.episodeId, outputPath, params.audioMode)
  return outputPath
}

export async function composePictureMaster(
  params: ComposePictureMasterParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
) {
  if (!params.timeline?.shots?.length) throw new Error('剪辑时间轴没有镜头')
  const videoFiles = params.timeline.shots.map((shot) =>
    assertEpisodeAsset(params.runId, params.episodeId, shot.sourceVideoPath),
  )
  const sourceHasAudio = await Promise.all(videoFiles.map(hasAudioStream))
  const [width, height] = OUTPUT_SIZES[params.ratio]
  const filters = params.timeline.shots.flatMap((shot, index) => {
    if (
      !Number.isFinite(shot.adoptedStartMs) ||
      !Number.isFinite(shot.adoptedEndMs) ||
      shot.adoptedStartMs < 0 ||
      shot.adoptedStartMs >= shot.adoptedEndMs ||
      shot.adoptedEndMs > shot.sourceDurationMs
    )
      throw new Error(`${shot.shotId} 裁切区间无效`)
    const start = shot.adoptedStartMs / 1000
    const end = shot.adoptedEndMs / 1000
    return [
      `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[v${index}]`,
      sourceHasAudio[index]
        ? `[${index}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=48000[a${index}]`
        : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${end - start}[a${index}]`,
    ]
  })
  filters.push(
    `${params.timeline.shots.map((_, index) => `[v${index}][a${index}]`).join('')}concat=n=${videoFiles.length}:v=1:a=1[vout][aout]`,
  )
  await ensureEpisodeDir(params.runId, params.episodeId)
  const outputPath = generateUniqueFileName(
    getRunAssetPath(params.runId, params.episodeId, 'picture-master'),
  )
  const timelinePath = path.join(
    getRunDir(params.runId),
    'wiki',
    '剪辑',
    params.episodeId,
    'editing-timeline.json',
  )
  await fs.promises.mkdir(path.dirname(timelinePath), { recursive: true })
  await fs.promises.writeFile(timelinePath, `${JSON.stringify(params.timeline, null, 2)}\n`, 'utf8')
  const args: string[] = []
  videoFiles.forEach((file) => args.push('-i', file))
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-r',
    '30',
    '-map',
    '[aout]',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-y',
    outputPath,
  )
  await executeFFmpeg(args, params)
  return outputPath
}

function separationRoot() {
  return process.env.FUNASR_HOME ? path.resolve(process.env.FUNASR_HOME) : app.getPath('userData')
}

export async function separateAudioStems(
  sourcePath: string,
  vocalPath: string,
  instrumentPath: string,
  abortSignal?: AbortSignal,
) {
  const root = separationRoot()
  const python =
    process.env.PEIYIN_PYVIDEOTRANS_PYTHON ||
    path.join(root, 'runtime', 'funasr-venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
  const vocalsModel = path.join(root, 'models', 'separation', 'vocals.fp16.onnx')
  const accompanimentModel = path.join(root, 'models', 'separation', 'accompaniment.fp16.onnx')
  await Promise.all([
    fs.promises.access(python, fs.constants.X_OK),
    fs.promises.access(vocalsModel),
    fs.promises.access(accompanimentModel),
  ]).catch(() => {
    throw new Error('人声分离引擎尚未安装，请打开“生成设置”并点击“一键安装”')
  })
  const script = [
    'import sys, numpy as np, sherpa_onnx, soundfile as sf',
    'config = sherpa_onnx.OfflineSourceSeparationConfig(model=sherpa_onnx.OfflineSourceSeparationModelConfig(spleeter=sherpa_onnx.OfflineSourceSeparationSpleeterModelConfig(vocals=sys.argv[4], accompaniment=sys.argv[5]), provider="cpu"))',
    'if not config.validate(): raise RuntimeError("人声分离模型配置无效")',
    'samples, rate = sf.read(sys.argv[1], dtype="float32", always_2d=True)',
    'output = sherpa_onnx.OfflineSourceSeparation(config).process(sample_rate=rate, samples=np.ascontiguousarray(samples.T))',
    'if len(output.stems) != 2: raise RuntimeError("人声分离未返回两个 stem")',
    'sf.write(sys.argv[2], output.stems[0].data.T, output.sample_rate)',
    'sf.write(sys.argv[3], output.stems[1].data.T, output.sample_rate)',
  ].join('\n')
  await executeProcess(
    python,
    ['-c', script, sourcePath, vocalPath, instrumentPath, vocalsModel, accompanimentModel],
    abortSignal,
  )
  for (const file of [vocalPath, instrumentPath])
    if (!(await fs.promises.stat(file).catch(() => null))?.size)
      throw new Error('人声分离没有生成有效 stem')
}

function audioPaths(
  runId: string,
  episodeId: string,
  workflow: 'creative' | 'video-translation' = 'creative',
  targetLanguage?: string,
) {
  const language = String(targetLanguage || '').trim()
  if (workflow === 'video-translation' && !/^[A-Za-z0-9_-]+$/.test(language))
    throw new Error('目标语言无效')
  const root =
    workflow === 'video-translation'
      ? path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
      : path.join(getRunDir(runId), 'wiki', '声音', episodeId)
  const dir = workflow === 'video-translation' ? path.join(root, '音频') : root
  return {
    dir,
    source: path.join(dir, 'source.wav'),
    vocal: path.join(dir, 'vocal.wav'),
    instrument: path.join(dir, 'instrument.wav'),
    mixed: path.join(dir, 'mixed.wav'),
    record: path.join(root, '音频处理.json'),
  }
}

function translationAsset(runId: string, episodeId: string, filePath: string, roots: string[]) {
  const resolved = assertVideoTranslationAsset(runId, episodeId, filePath)
  const relative = relativeRunAsset(runId, resolved)
  if (!roots.some((root) => relative.startsWith(root)))
    throw new Error('素材不属于当前目标语言翻译任务')
  return resolved
}

async function writeAudioProcessingRecord(
  params: Pick<SeparateSourceAudioParams, 'runId' | 'episodeId' | 'workflow' | 'targetLanguage'>,
  record: AudioProcessingRecord,
) {
  const target = audioPaths(params.runId, params.episodeId, params.workflow, params.targetLanguage)
  await fs.promises.mkdir(target.dir, { recursive: true })
  await fs.promises.writeFile(
    `${target.record}.tmp`,
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  )
  await fs.promises.rename(`${target.record}.tmp`, target.record)
  return record
}

export async function separateSourceAudio(
  params: SeparateSourceAudioParams & { abortSignal?: AbortSignal },
) {
  const pictureMaster =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.pictureMasterPath, [
          `episodes/${params.episodeId}/video-translate/source.`,
          `episodes/${params.episodeId}/video-translate/final-master.`,
        ])
      : assertEpisodeAsset(params.runId, params.episodeId, params.pictureMasterPath)
  const target = audioPaths(params.runId, params.episodeId, params.workflow, params.targetLanguage)
  await fs.promises.mkdir(target.dir, { recursive: true })
  await executeFFmpeg(
    [
      '-i',
      pictureMaster,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-y',
      target.source,
    ],
    params,
  )

  await separateAudioStems(target.source, target.vocal, target.instrument, params.abortSignal)
  return writeAudioProcessingRecord(params, {
    schemaVersion: 1,
    audioMode: 'replace-preserve-ambience',
    vocalPath: relativeRunAsset(params.runId, target.vocal),
    instrumentPath: relativeRunAsset(params.runId, target.instrument),
    originalVocalRemoved: false,
    status: 'ready',
  })
}

export async function removeOriginalVocal(params: AdoptInstrumentParams) {
  const languageRoot = `wiki/翻译/${params.episodeId}/${params.targetLanguage}/音频/`
  const vocal =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.vocalPath, [languageRoot])
      : assertEpisodeAsset(params.runId, params.episodeId, params.vocalPath)
  const instrument =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.instrumentPath, [languageRoot])
      : assertEpisodeAsset(params.runId, params.episodeId, params.instrumentPath)
  await Promise.all([fs.promises.access(vocal), fs.promises.access(instrument)])
  return writeAudioProcessingRecord(params, {
    schemaVersion: 1,
    audioMode: 'replace-preserve-ambience',
    vocalPath: relativeRunAsset(params.runId, vocal),
    instrumentPath: relativeRunAsset(params.runId, instrument),
    originalVocalRemoved: true,
    status: 'ready',
  })
}

export async function mixBackgroundAudio(
  params: MixBackgroundAudioParams & { abortSignal?: AbortSignal },
) {
  const languageRoot = `wiki/翻译/${params.episodeId}/${params.targetLanguage}/音频/`
  const voiceRoot = `episodes/${params.episodeId}/video-translate/${params.targetLanguage}/`
  const vocal =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.vocalPath, [languageRoot])
      : assertEpisodeAsset(params.runId, params.episodeId, params.vocalPath)
  const instrument =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.instrumentPath, [languageRoot])
      : assertEpisodeAsset(params.runId, params.episodeId, params.instrumentPath)
  const voice =
    params.workflow === 'video-translation'
      ? translationAsset(params.runId, params.episodeId, params.voiceFile, [voiceRoot])
      : assertEpisodeAsset(params.runId, params.episodeId, params.voiceFile)
  await Promise.all([
    fs.promises.access(vocal),
    fs.promises.access(instrument),
    fs.promises.access(voice),
  ])
  const target = audioPaths(params.runId, params.episodeId, params.workflow, params.targetLanguage)
  await executeFFmpeg(
    [
      '-i',
      instrument,
      '-i',
      voice,
      '-filter_complex',
      '[0:a]aresample=48000,loudnorm=I=-24:TP=-2:LRA=7[bg];[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=7[voice];[bg][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.95[out]',
      '-map',
      '[out]',
      '-c:a',
      'pcm_s16le',
      '-y',
      target.mixed,
    ],
    params,
  )
  return writeAudioProcessingRecord(params, {
    schemaVersion: 1,
    audioMode: 'replace-preserve-ambience',
    vocalPath: relativeRunAsset(params.runId, vocal),
    instrumentPath: relativeRunAsset(params.runId, instrument),
    mixedAudioPath: relativeRunAsset(params.runId, target.mixed),
    originalVocalRemoved: true,
    status: 'ready',
  })
}

export async function composeVideoTranslation(
  params: ComposeVideoTranslationParams & { abortSignal?: AbortSignal },
) {
  if (!/^[A-Za-z0-9_-]+$/.test(params.targetLanguage)) throw new Error('目标语言无效')
  if (
    !params.finalScriptId ||
    !/^[a-f0-9]{64}$/i.test(params.scriptHash) ||
    !/^[A-Za-z0-9_-]+$/.test(params.voiceVersionId) ||
    !/^[a-f0-9]{64}$/i.test(params.dubDialogueTimestampHash)
  )
    throw new Error('成片来源 ID 或哈希无效')
  const translationWiki = path.join(getRunDir(params.runId), 'wiki', '翻译', params.episodeId)
  const contract = JSON.parse(
    await fs.promises.readFile(path.join(translationWiki, '最终时间戳剧本.json'), 'utf8'),
  ) as {
    finalScriptId: string
    scriptHash: string
    targetLanguage: string
    sourceFingerprint: string
    sourceLanguage: string
    cues: Array<{ startMs: number; endMs: number; translatedText: string }>
  }
  const actualScriptHash = createHash('sha256')
    .update(
      JSON.stringify({
        sourceFingerprint: contract.sourceFingerprint,
        sourceLanguage: contract.sourceLanguage,
        targetLanguage: contract.targetLanguage,
        cues: contract.cues,
      }),
    )
    .digest('hex')
  if (
    contract.finalScriptId !== params.finalScriptId ||
    contract.scriptHash !== params.scriptHash ||
    actualScriptHash !== params.scriptHash ||
    contract.targetLanguage !== params.targetLanguage
  )
    throw new Error('最终时间戳剧本权威文件与成片请求不一致')
  const timestamps = JSON.parse(
    await fs.promises.readFile(path.join(translationWiki, '成片', '配音对白时间戳.json'), 'utf8'),
  ) as {
    finalScriptId: string
    scriptHash: string
    voiceVersionId: string
    dubDialogueTimestampHash: string
  }
  if (
    timestamps.finalScriptId !== params.finalScriptId ||
    timestamps.scriptHash !== params.scriptHash ||
    timestamps.voiceVersionId !== params.voiceVersionId ||
    timestamps.dubDialogueTimestampHash !== params.dubDialogueTimestampHash
  )
    throw new Error('配音对白时间戳与成片请求不一致')
  const subtitleCues = contract.cues.map((cue) => ({
    start: cue.startMs / 1000,
    end: cue.endMs / 1000,
    text: cue.translatedText,
  }))
  if (!subtitleCues.length) throw new Error('没有可烧录的目标语言字幕')
  const source = translationAsset(params.runId, params.episodeId, params.sourceVideoPath, [
    `episodes/${params.episodeId}/video-translate/source.`,
    `episodes/${params.episodeId}/video-translate/final-master.`,
  ])
  const mixed = translationAsset(params.runId, params.episodeId, params.mixedAudioPath, [
    `wiki/翻译/${params.episodeId}/${params.targetLanguage}/音频/mixed.wav`,
  ])
  const duration = await mediaDuration(source)
  const outputDir = path.join(
    getEpisodeDir(params.runId, params.episodeId),
    'video-translate',
    params.targetLanguage,
  )
  const wikiDir = path.join(
    getRunDir(params.runId),
    'wiki',
    '翻译',
    params.episodeId,
    params.targetLanguage,
  )
  await Promise.all([
    fs.promises.mkdir(outputDir, { recursive: true }),
    fs.promises.mkdir(wikiDir, { recursive: true }),
  ])
  const output = generateUniqueFileName(path.join(outputDir, 'final.mp4'))
  const subtitlePath = path.join(wikiDir, 'target.srt')
  await fs.promises.writeFile(subtitlePath, formatSrt(subtitleCues), 'utf8')
  const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\''")
  await executeFFmpeg(
    [
      '-i',
      source,
      '-i',
      mixed,
      '-filter_complex',
      `[1:a]apad,atrim=0:${duration},alimiter=limit=0.95[aout]`,
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-vf',
      `subtitles='${escaped}':force_style='FontName=Arial,FontSize=10,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=80'`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-t',
      String(duration),
      '-y',
      output,
    ],
    params,
  )
  const relativeOutput = relativeRunAsset(params.runId, output)
  const finalVideoVersionId = `final-${Date.now()}-${randomUUID().slice(0, 8)}`
  const finalPage = path.join(wikiDir, '成片.md')
  const recordPath = path.join(wikiDir, '成片记录.json')
  const existingRecords = await fs.promises
    .readFile(recordPath, 'utf8')
    .then((value) => JSON.parse(value).versions as unknown[])
    .catch(() => [])
  const record = {
    finalVideoVersionId,
    createdAt: new Date().toISOString(),
    finalScriptId: params.finalScriptId,
    scriptHash: params.scriptHash,
    voiceVersionId: params.voiceVersionId,
    dubDialogueTimestampHash: params.dubDialogueTimestampHash,
    outputPath: relativeOutput,
  }
  await fs.promises.writeFile(
    `${finalPage}.tmp`,
    `# ${params.episodeId} ${params.targetLanguage} 翻译成片\n\n- 成片版本 ID：${finalVideoVersionId}\n- 最终剧本：${params.finalScriptId}（sha256: ${params.scriptHash}）\n- 配音版本：${params.voiceVersionId}\n- 配音对白时间戳：sha256:${params.dubDialogueTimestampHash}\n- [打开成片](../../../../${relativeOutput})\n- [目标字幕](./target.srt)\n- [音频处理](./音频处理.json)\n`,
    'utf8',
  )
  await fs.promises.rename(`${finalPage}.tmp`, finalPage)
  await fs.promises.writeFile(
    `${recordPath}.tmp`,
    `${JSON.stringify({ versions: [...existingRecords, record] }, null, 2)}\n`,
    'utf8',
  )
  await fs.promises.rename(`${recordPath}.tmp`, recordPath)
  return relativeOutput
}

function executeProcess(command: string, args: string[], abortSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    })
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr || `进程退出码 ${code}`)),
    )
    abortSignal?.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
  })
}

async function hasAudioStream(file: string) {
  const metadata = await parseFile(file)
  return Boolean(metadata.format.sampleRate && metadata.format.numberOfChannels)
}

function formatSrt(cues: SubtitleCue[]) {
  return cues
    .filter((cue) => cue.text.trim() && cue.end > cue.start)
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text.trim()}\n`,
    )
    .join('\n')
}

function formatSrtTime(value: number) {
  const milliseconds = Math.max(0, Math.round(value * 1000))
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1000)
  const millis = milliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
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
