import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dialog } from 'electron'
import {
  assertVideoTranslationAsset,
  assertVideoTranslationSource,
  ensureEpisodeDir,
  getRunDir,
  mediaDuration,
  removeSharedVideoTranslationRole,
  relativeRunAsset,
} from './media-workspace.ts'
import type {
  TranslationRole,
  VideoTranslationCue,
  VideoTranslationDialogueArrangement,
  VideoTranslationVoiceVersion,
} from '../src/runtime/videoTranslation.ts'
import {
  alignDialogueBlockWords,
  validateConfirmedTranslation,
  validateVideoTranslationDialoguePrompt,
} from '../src/runtime/videoTranslation.ts'
import { generateSeedAudio } from './seed-audio.ts'
import { runFasterWhisper } from './material-transcript.ts'
import { executeFFmpeg } from './ffmpeg/index.ts'
import type { VideoTranslationMasterUploadResult, VideoTranslationUploadResult } from './types.ts'
import { appendVideoTranslationTrace } from './video-translation-trace.ts'

const runFile = promisify(execFile)
const translationWrites = new Map<string, Promise<unknown>>()

async function probeVideo(filePath: string) {
  const { stdout } = await runFile(
    process.env.FFPROBE_PATH || 'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height,avg_frame_rate:format=duration',
      '-of',
      'json',
      filePath,
    ],
    { maxBuffer: 1024 * 1024 },
  )
  const value = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{
      codec_type?: string
      width?: number
      height?: number
      avg_frame_rate?: string
    }>
  }
  const durationMs = Math.round(Number(value.format?.duration) * 1000)
  const streams = value.streams || []
  const hasVideo = streams.some((stream) => stream.codec_type === 'video')
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio')
  const video = streams.find((stream) => stream.codec_type === 'video')
  if (!hasVideo || !Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error('上传文件不是可读取的视频')
  const [numerator, denominator] = String(video?.avg_frame_rate || '')
    .split('/')
    .map(Number)
  const fps = denominator ? numerator / denominator : numerator
  return {
    durationMs,
    hasAudio,
    width: Number(video?.width) || 0,
    height: Number(video?.height) || 0,
    fps: Number.isFinite(fps) ? fps : 0,
  }
}

function safeId(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label}无效`)
  return value
}

function safeLanguage(value: string) {
  return safeId(value, '目标语言')
}

async function atomicWrite(filePath: string, content: string | Buffer) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await fs.promises.writeFile(temporary, content)
  await fs.promises.rename(temporary, filePath)
}

async function atomicCopy(source: string, target: string) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_FICLONE)
  await fs.promises.rename(temporary, target)
}

async function replaceFiles(files: Array<{ path: string; content: string }>) {
  const backups = await Promise.all(
    files.map((file) =>
      fs.promises
        .readFile(file.path)
        .catch((error: any) => (error?.code === 'ENOENT' ? null : Promise.reject(error))),
    ),
  )
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
    await Promise.all(
      files.map((file, index) =>
        backups[index] === null
          ? fs.promises.rm(file.path, { force: true })
          : atomicWrite(file.path, backups[index]!),
      ),
    )
    throw error
  }
}

async function serializeTranslationWrite<T>(runId: string, action: () => Promise<T>) {
  const previous = translationWrites.get(runId) || Promise.resolve()
  const next = previous.then(action, action)
  translationWrites.set(runId, next)
  try {
    return await next
  } finally {
    if (translationWrites.get(runId) === next) translationWrites.delete(runId)
  }
}

async function fileHash(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function selectVideoTranslationSource(
  runId: string,
  episodeId: string,
): Promise<VideoTranslationUploadResult | null> {
  safeId(episodeId, '剧集 ID')
  const selected = await dialog.showOpenDialog({
    title: '上传视频翻译原片',
    properties: ['openFile'],
  })
  const source = selected.filePaths[0]
  if (selected.canceled || !source) return null
  const extension = path.extname(source).toLowerCase()
  const stat = await fs.promises.stat(source)
  if (!stat.isFile() || !stat.size) throw new Error('视频文件不可读')
  const sourceFingerprint = await fileHash(source)
  const { durationMs, hasAudio } = await probeVideo(source)
  const episodeDir = await ensureEpisodeDir(runId, episodeId)
  const rawSnapshot = path.join(
    getRunDir(runId),
    '.raw',
    '视频翻译',
    episodeId,
    `${sourceFingerprint.slice(0, 12)}${extension}`,
  )
  const controlled = path.join(episodeDir, 'video-translate', `source${extension}`)
  if (!(await fs.promises.stat(rawSnapshot).catch(() => null)))
    await atomicCopy(source, rawSnapshot)
  await atomicCopy(rawSnapshot, controlled)
  await fs.promises.rm(path.join(path.dirname(controlled), 'analysis.mp4'), { force: true })
  return {
    sourceVideoPath: relativeRunAsset(runId, controlled),
    rawSnapshotPath: relativeRunAsset(runId, rawSnapshot),
    sourceFingerprint,
    durationMs,
    hasAudio,
  }
}

export async function selectVideoTranslationFinalMaster(
  runId: string,
  episodeId: string,
  sourceVideoPath: string,
): Promise<VideoTranslationMasterUploadResult | null> {
  safeId(episodeId, '剧集 ID')
  const source = assertVideoTranslationSource(runId, episodeId, sourceVideoPath)
  const sourceInfo = await probeVideo(source)
  const selected = await dialog.showOpenDialog({
    title: '上传无字幕成片母版',
    properties: ['openFile'],
  })
  const chosen = selected.filePaths[0]
  if (selected.canceled || !chosen) return null
  const stat = await fs.promises.stat(chosen)
  if (!stat.isFile() || !stat.size) throw new Error('视频文件不可读')
  const chosenInfo = await probeVideo(chosen)
  if (!chosenInfo.hasAudio) throw new Error('无字幕成片母版必须包含可分离的音轨')
  if (
    Math.abs(chosenInfo.durationMs - sourceInfo.durationMs) > 250 ||
    chosenInfo.width !== sourceInfo.width ||
    chosenInfo.height !== sourceInfo.height ||
    Math.abs(chosenInfo.fps - sourceInfo.fps) > 0.01
  )
    throw new Error('无字幕成片母版与识别视频不是同一剪辑')
  const fingerprint = await fileHash(chosen)
  const extension = path.extname(chosen).toLowerCase()
  const episodeDir = await ensureEpisodeDir(runId, episodeId)
  const controlled = path.join(episodeDir, 'video-translate', `final-master${extension}`)
  await atomicCopy(chosen, controlled)
  return {
    finalMasterVideoPath: relativeRunAsset(runId, controlled),
    finalMasterFingerprint: fingerprint,
    durationMs: chosenInfo.durationMs,
    hasAudio: chosenInfo.hasAudio,
  }
}

export async function writeVideoTranslationContext(
  runId: string,
  episodeId: string,
  contextPaths: Array<{ path: string; hash: string }>,
) {
  safeId(episodeId, '剧集 ID')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '来源上下文.md')
  await atomicWrite(
    target,
    `# 来源上下文\n\n${contextPaths.map((item) => `- [[${item.path}]]（sha256: ${item.hash}）`).join('\n') || '- 无'}\n`,
  )
  return relativeRunAsset(runId, target)
}

function roleMarkdown(role: TranslationRole) {
  return `---\ntranslationRoleId: ${role.translationRoleId}\nstatus: confirmed${role.linkedCreativeRoleId ? `\nlinkedCreativeRoleId: ${role.linkedCreativeRoleId}` : ''}\n---\n\n# ${role.displayName}\n\n- 别名：${role.aliases.join('、') || '无'}\n- 来源剧集：${role.sourceEpisodeIds.join('、')}${role.description ? `\n- 角色说明：${role.description}` : ''}\n`
}

export async function writeConfirmedVideoTranslation(
  runId: string,
  episodeId: string,
  sourceLanguage: string,
  targetLanguage: string,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
) {
  safeId(episodeId, '剧集 ID')
  const roleIds = new Set<string>()
  for (const role of roles) {
    safeId(role.translationRoleId, '翻译角色 ID')
    if (roleIds.has(role.translationRoleId)) throw new Error('翻译角色 ID 重复')
    roleIds.add(role.translationRoleId)
    if (!role.displayName.trim() || /[\r\n]/.test(role.displayName))
      throw new Error('翻译角色名称无效')
  }
  validateConfirmedTranslation(cues, roles)
  const root = getRunDir(runId)
  const base = path.join(root, 'wiki', '翻译')
  const markdownPath = path.join(base, episodeId, '角色台词确认.md')
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  await serializeTranslationWrite(runId, async () => {
    const indexFiles = await videoTranslationIndexFiles(runId, episodeId, roles)
    await replaceFiles([
      {
        path: markdownPath,
        content: `# 角色与字幕确认\n\n- 源语言：${sourceLanguage}\n- 目标语言：${targetLanguage}\n\n${cues.map((cue) => `## ${cue.cueId}\n\n- 时间：${cue.startMs}-${cue.endMs}ms\n- 角色 ID：${cue.translationRoleId}\n- 角色：${roleById.get(cue.translationRoleId!)!.displayName}\n\n### 原文\n\n${cue.sourceText}\n\n### 译文\n\n${cue.translatedText}`).join('\n\n')}\n`,
      },
      ...roles.map((role) => ({
        path: path.join(base, '角色', `${role.translationRoleId}.md`),
        content: roleMarkdown(role),
      })),
      ...indexFiles,
    ])
  })
  await appendVideoTranslationTrace(
    runId,
    episodeId,
    '人工确认角色、源字幕与译文',
    '人工审核',
    [
      { label: '扒片最终稿', target: '04-最终稿.md' },
      { label: '来源上下文', target: '来源上下文.md' },
      { label: '最终确认稿', target: '角色台词确认.md' },
    ],
    { sourceLanguage, targetLanguage, cues },
  )
  return relativeRunAsset(runId, markdownPath)
}

export async function writeTranslationVoiceBinding(runId: string, role: TranslationRole) {
  safeId(role.translationRoleId, '翻译角色 ID')
  if (!role.voiceProfileId) throw new Error('翻译角色尚未选择声音')
  safeId(role.voiceProfileId, '声音档案 ID')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', '声音', `${role.translationRoleId}.md`)
  await atomicWrite(
    target,
    `---\ntranslationRoleId: ${role.translationRoleId}\nvoiceProfileId: ${role.voiceProfileId}\nstatus: confirmed\n---\n\n# ${role.displayName}的翻译声音\n\n- 声音档案：[[声音库/音色/${role.voiceProfileId}]]\n`,
  )
  return relativeRunAsset(runId, target)
}

export async function writeVideoTranslationSeedPlan(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  arrangement: VideoTranslationDialogueArrangement,
  promptMarkdown: string,
) {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  if (
    !arrangement?.blocks?.length ||
    arrangement.blocks.some(
      (block) =>
        block.references.length > 3 ||
        !block.lines.length ||
        block.lines.some((line) => !line.cueId || !line.speakerId || !line.text.trim()),
    )
  )
    throw new Error('视频翻译连续对白安排无效')
  if (!promptMarkdown.trim() || Buffer.byteLength(promptMarkdown, 'utf8') > 2 * 1024 * 1024)
    throw new Error('豆包语音稿无效')
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const arrangementPath = path.join(base, '连续对白安排.json')
  const promptPath = path.join(base, '连续对白导演稿.md')
  await Promise.all([
    atomicWrite(arrangementPath, `${JSON.stringify(arrangement, null, 2)}\n`),
    atomicWrite(promptPath, `${promptMarkdown.trim()}\n`),
  ])
  return {
    arrangementPath: relativeRunAsset(runId, arrangementPath),
    promptPath: relativeRunAsset(runId, promptPath),
  }
}

function blockPrompts(markdown: string) {
  return new Map(
    markdown
      .split(/^##\s+/m)
      .slice(1)
      .flatMap((section) => {
        const newline = section.indexOf('\n')
        return newline < 0
          ? []
          : [[section.slice(0, newline).trim(), section.slice(newline + 1).trim()]]
      }),
  )
}

function voiceVersionId(prefix: string, value: string) {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}

export async function listVideoTranslationVoiceVersions(
  runId: string,
  episodeId: string,
  targetLanguage: string,
): Promise<VideoTranslationVoiceVersion[]> {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const readJson = (filePath: string) =>
    fs.promises
      .readFile(filePath, 'utf8')
      .then(JSON.parse)
      .catch(() => null)
  const continuousRecord = await readJson(path.join(base, '连续对白生成记录.json'))
  const versions: VideoTranslationVoiceVersion[] = Array.isArray(continuousRecord?.versions)
    ? continuousRecord.versions.filter(
        (version: VideoTranslationVoiceVersion) =>
          version?.versionId && version.previewPath && version.targetVoicePath,
      )
    : []
  const usedPreviewPaths = new Set(versions.map((version) => version.previewPath))
  const continuousTimeline = await readJson(path.join(base, '连续对白时间轴.json'))
  const continuousGeneration = [...(continuousRecord?.generations || [])]
    .reverse()
    .find((generation: any) => generation?.wavPath && !usedPreviewPaths.has(generation.wavPath))
  if (continuousGeneration && continuousTimeline?.targetVoicePath)
    versions.push({
      versionId: voiceVersionId(
        'continuous-legacy',
        `${continuousGeneration.createdAt}:${continuousGeneration.wavPath}`,
      ),
      kind: 'continuous',
      createdAt: continuousGeneration.createdAt || new Date(0).toISOString(),
      prompt: continuousGeneration.prompt || '',
      previewPath: continuousGeneration.wavPath,
      targetVoicePath: continuousTimeline.targetVoicePath,
      blockAudioPaths: [continuousGeneration.wavPath],
      durationMs: Math.round(Number(continuousGeneration.duration || 0) * 1000),
      model: continuousGeneration.model,
    })
  const timelineRecord = await readJson(path.join(base, '声音生成记录.json'))
  const timeline = await readJson(path.join(base, '目标人声时间轴.json'))
  for (const generation of timelineRecord?.generations || []) {
    if (!generation?.wavPath || usedPreviewPaths.has(generation.wavPath)) continue
    versions.push({
      versionId: voiceVersionId('timeline-legacy', `${generation.createdAt}:${generation.wavPath}`),
      kind: 'timeline',
      createdAt: generation.createdAt || new Date(0).toISOString(),
      prompt: generation.prompt || '',
      previewPath: generation.wavPath,
      targetVoicePath: timeline?.targetVoicePath || generation.wavPath,
      blockAudioPaths: [generation.wavPath],
      durationMs: Math.round(Number(generation.duration || 0) * 1000),
      model: generation.model,
    })
  }
  const available: VideoTranslationVoiceVersion[] = []
  for (const version of versions) {
    const [preview, target] = await Promise.all(
      [version.previewPath, version.targetVoicePath].map((value) =>
        fs.promises.stat(assertVideoTranslationAsset(runId, episodeId, value)).catch(() => null),
      ),
    )
    if (preview?.size && target?.size) available.push(version)
  }
  return available.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function generateVideoTranslationTargetVoice(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  options: { forceNewVersion?: boolean } = {},
  abortSignal?: AbortSignal,
  reportProgress: (message: string) => void = () => {},
): Promise<VideoTranslationVoiceVersion> {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const arrangement = JSON.parse(
    await fs.promises.readFile(path.join(base, '连续对白安排.json'), 'utf8'),
  ) as VideoTranslationDialogueArrangement
  const promptMarkdown = await fs.promises.readFile(path.join(base, '连续对白导演稿.md'), 'utf8')
  const prompts = blockPrompts(promptMarkdown)
  if (!arrangement?.blocks?.length) throw new Error('连续对白安排无效')
  const recordPath = path.join(base, '连续对白生成记录.json')
  const readRecord = () =>
    fs.promises
      .readFile(recordPath, 'utf8')
      .then((value) => JSON.parse(value))
      .catch(() => ({ schemaVersion: 2, generations: [], versions: [] })) as {
      schemaVersion?: number
      generations?: unknown[]
      versions?: Array<VideoTranslationVoiceVersion & { fingerprint?: string }>
      pending?: {
        versionId: string
        fingerprint: string
        createdAt: string
        tasks: Record<string, { fingerprint: string; path: string; durationMs: number }>
      }
    }
  let record = await readRecord()
  const generationFingerprint = createHash('sha256')
    .update(JSON.stringify({ language, arrangement, promptMarkdown }))
    .digest('hex')
  const completed = [...(record.versions || [])]
    .reverse()
    .find((version) => version.fingerprint === generationFingerprint)
  if (!options.forceNewVersion && completed) return completed
  const pending =
    !options.forceNewVersion && record.pending?.fingerprint === generationFingerprint
      ? record.pending
      : {
          versionId: `voice-${Date.now()}-${randomUUID().slice(0, 8)}`,
          fingerprint: generationFingerprint,
          createdAt: new Date().toISOString(),
          tasks: {},
        }
  if (record.pending?.versionId !== pending.versionId) {
    record.pending = pending
    record.schemaVersion = 2
    await atomicWrite(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  }
  const versionId = safeId(pending.versionId, '声音版本 ID')
  const alignedCues: Array<{
    blockId: string
    cueId: string
    speakerId: string
    text: string
    expectedStartMs: number
    expectedEndMs: number
    observedStartMs: number
    observedEndMs: number
    clipPath: string
    warning?: string
  }> = []
  const nextCueStartById = new Map<string, number>()
  const allLines = arrangement.blocks.flatMap((block) => block.lines)
  for (let index = 0; index < allLines.length - 1; index++)
    nextCueStartById.set(allLines[index].cueId, allLines[index + 1].expectedStartMs)
  const blockAudioPaths: string[] = []
  let previewDurationMs = 0
  for (let blockIndex = 0; blockIndex < arrangement.blocks.length; blockIndex++) {
    const block = arrangement.blocks[blockIndex]
    if (abortSignal?.aborted) throw new Error('任务已停止')
    const prompt = prompts.get(block.blockId)
    if (!prompt) throw new Error(`${block.blockId} 缺少已保存连续对白导演稿`)
    if (block.references.length > 3) throw new Error(`${block.blockId} 超过三个角色参考音`)
    validateVideoTranslationDialoguePrompt(prompt, block)
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          targetLanguage: language,
          blockId: block.blockId,
          speakerIds: block.speakerIds,
          lines: block.lines,
          references: block.references.map(({ speakerId, voiceProfileId }) => ({
            speakerId,
            voiceProfileId,
          })),
          prompt,
        }),
      )
      .digest('hex')
    const checkpoint = pending.tasks[block.blockId]
    let blockAudioPath = ''
    let blockDurationMs = 0
    if (checkpoint?.fingerprint === fingerprint) {
      const existing = assertVideoTranslationAsset(runId, episodeId, checkpoint.path)
      if ((await fs.promises.stat(existing).catch(() => null))?.size) {
        blockAudioPath = existing
        blockDurationMs = Math.round((await mediaDuration(existing)) * 1000)
      }
    }
    if (!blockAudioPath) {
      reportProgress(`正在生成连续对白 ${blockIndex + 1}/${arrangement.blocks.length}`)
      const result = await generateSeedAudio({
        runId,
        episodeId,
        workflow: 'video-translation',
        targetLanguage: language,
        mode: 'dialogue-performance',
        durationMs: Math.max(
          1_000,
          block.lines.reduce((total, line) => total + line.expectedEndMs - line.expectedStartMs, 0),
        ),
        prompt,
        language: language === 'zh' ? 'zh' : 'en',
        references: block.references,
        outputName: `${versionId}-${block.blockId}`,
        abortSignal,
      })
      blockAudioPath = result.path
      blockDurationMs = Math.round(result.duration * 1000)
    }
    const blockRelativePath = relativeRunAsset(runId, blockAudioPath)
    blockAudioPaths.push(blockRelativePath)
    previewDurationMs += blockDurationMs
    if (!checkpoint || checkpoint.fingerprint !== fingerprint) {
      const latestRecord = await readRecord()
      latestRecord.pending = pending
      latestRecord.pending.tasks[block.blockId] = {
        fingerprint,
        path: blockRelativePath,
        durationMs: blockDurationMs,
      }
      await atomicWrite(recordPath, `${JSON.stringify(latestRecord, null, 2)}\n`)
    }
    const recognitionPath = path.join(
      base,
      '连续对白版本',
      versionId,
      '识别',
      `${block.blockId}-whisper.json`,
    )
    const cachedRecognition = await fs.promises
      .readFile(recognitionPath, 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    let recognition = cachedRecognition
    if (cachedRecognition?.fingerprint !== fingerprint) {
      reportProgress(`正在识别连续对白 ${blockIndex + 1}/${arrangement.blocks.length}`)
      recognition = { fingerprint, ...(await runFasterWhisper(blockAudioPath, abortSignal)) }
    }
    if (!Array.isArray(recognition.words) || !recognition.words.length)
      throw new Error(`${block.blockId} 没有识别到单词时间`)
    if (cachedRecognition?.fingerprint !== fingerprint)
      await atomicWrite(recognitionPath, `${JSON.stringify(recognition, null, 2)}\n`)
    const alignment = alignDialogueBlockWords(block.lines, recognition.words, blockDurationMs)
    reportProgress(`正在对齐并裁剪对白 ${blockIndex + 1}/${arrangement.blocks.length}`)
    const alignmentByCue = new Map(alignment.map((item) => [item.cueId, item]))
    for (let index = 0; index < block.lines.length; index++) {
      const line = block.lines[index]
      const observed = alignmentByCue.get(line.cueId)!
      safeId(line.cueId, 'Cue ID')
      const clip = path.join(
        getRunDir(runId),
        'episodes',
        episodeId,
        'video-translate',
        language,
        '连续对白片段',
        versionId,
        `${line.cueId}.wav`,
      )
      await fs.promises.mkdir(path.dirname(clip), { recursive: true })
      await executeFFmpeg(
        [
          '-ss',
          String(observed.observedStartMs / 1000),
          '-to',
          String(observed.observedEndMs / 1000),
          '-i',
          blockAudioPath,
          '-ar',
          '48000',
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          '-y',
          clip,
        ],
        { abortSignal },
      )
      const actualEndMs = line.expectedStartMs + observed.observedEndMs - observed.observedStartMs
      const nextStartMs = nextCueStartById.get(line.cueId)
      alignedCues.push({
        blockId: block.blockId,
        cueId: line.cueId,
        speakerId: line.speakerId,
        text: line.text,
        expectedStartMs: line.expectedStartMs,
        expectedEndMs: line.expectedEndMs,
        observedStartMs: observed.observedStartMs,
        observedEndMs: observed.observedEndMs,
        clipPath: relativeRunAsset(runId, clip),
        ...(nextStartMs != null && actualEndMs > nextStartMs + 1_000
          ? { warning: `目标人声超过下一句起点 ${actualEndMs - nextStartMs}ms` }
          : {}),
      })
    }
  }
  let previewPath = blockAudioPaths[0]
  if (blockAudioPaths.length > 1) {
    const preview = path.join(
      getRunDir(runId),
      'episodes',
      episodeId,
      'video-translate',
      language,
      '连续对白版本',
      versionId,
      '原始连续对白.wav',
    )
    const previewInputs = blockAudioPaths.map((value) =>
      assertVideoTranslationAsset(runId, episodeId, value),
    )
    await fs.promises.mkdir(path.dirname(preview), { recursive: true })
    await executeFFmpeg([
      ...previewInputs.flatMap((input) => ['-i', input]),
      '-filter_complex',
      `${previewInputs.map((_, index) => `[${index}:a]`).join('')}concat=n=${previewInputs.length}:v=0:a=1[out]`,
      '-map',
      '[out]',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      '-y',
      preview,
    ])
    previewPath = relativeRunAsset(runId, preview)
  }
  const target = path.join(
    getRunDir(runId),
    'episodes',
    episodeId,
    'video-translate',
    language,
    '连续对白版本',
    versionId,
    '对齐目标人声.wav',
  )
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const inputs = alignedCues.map((cue) =>
    assertVideoTranslationAsset(runId, episodeId, cue.clipPath),
  )
  const filters = inputs.map((_, index) => {
    const delay = alignedCues[index].expectedStartMs
    return `[${index}:a]aresample=48000,adelay=${delay}|${delay}[a${index}]`
  })
  filters.push(
    `${inputs.map((_, index) => `[a${index}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0,apad,atrim=0:${arrangement.durationMs / 1000}[out]`,
  )
  reportProgress('正在把对白贴回原片时间轴')
  await executeFFmpeg(
    [
      ...inputs.flatMap((input) => ['-i', input]),
      '-filter_complex',
      filters.join(';'),
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
    ],
    { abortSignal },
  )
  const targetVoicePath = relativeRunAsset(runId, target)
  await atomicWrite(
    path.join(base, '连续对白版本', versionId, '对齐.json'),
    `${JSON.stringify({ schemaVersion: 1, targetLanguage: language, cues: alignedCues }, null, 2)}\n`,
  )
  await atomicWrite(
    path.join(base, '连续对白版本', versionId, '时间轴.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        targetLanguage: language,
        targetVoicePath,
        durationMs: arrangement.durationMs,
        cues: alignedCues,
      },
      null,
      2,
    )}\n`,
  )
  const version: VideoTranslationVoiceVersion & { fingerprint: string } = {
    versionId,
    kind: 'continuous',
    createdAt: pending.createdAt,
    prompt: promptMarkdown.trim(),
    previewPath,
    targetVoicePath,
    blockAudioPaths,
    durationMs: previewDurationMs,
    model: 'seed-audio-1.0',
    fingerprint: generationFingerprint,
  }
  record = await readRecord()
  record.schemaVersion = 2
  record.versions = [
    ...(record.versions || []).filter((item) => item.versionId !== versionId),
    version,
  ]
  if (record.pending?.versionId === versionId) delete record.pending
  await atomicWrite(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  return version
}

async function videoTranslationIndexFiles(
  runId: string,
  episodeId: string,
  roles: TranslationRole[],
) {
  safeId(episodeId, '剧集 ID')
  const base = path.join(getRunDir(runId), 'wiki', '翻译')
  const episodeIndex = path.join(base, episodeId, 'index.md')
  const episodes = [
    ...new Set([
      ...(await fs.promises.readdir(base, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory() && !['角色', '声音'].includes(entry.name))
        .map((entry) => entry.name),
      episodeId,
    ]),
  ].sort()
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role.displayName]))
  const roleDir = path.join(base, '角色')
  for (const entry of await fs.promises.readdir(roleDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const id = entry.name.slice(0, -3)
    if (roleById.has(id)) continue
    const content = await fs.promises.readFile(path.join(roleDir, entry.name), 'utf8')
    roleById.set(id, content.match(/^#\s+(.+)$/m)?.[1]?.trim() || id)
  }
  return [
    {
      path: path.join(base, 'index.md'),
      content: `# 视频翻译\n\n## 翻译角色\n\n${[...roleById].map(([id, name]) => `- [[角色/${id}|${name}]]`).join('\n') || '- 暂无'}\n\n## 剧集\n\n${episodes.map((id) => `- [[${id}/index|${id}]]`).join('\n') || '- 暂无'}\n`,
    },
    {
      path: episodeIndex,
      content: `# ${episodeId} 视频翻译\n\n- [[01-整体分析与切片方案|整体分析与切片方案]]\n- [[02-FFmpeg切片|FFmpeg 切片]]\n- [[03-Gemini逐片台词|逐片台词]]\n- [[04-最终稿|扒片最终稿]]\n- [[来源上下文|来源上下文]]\n- [[过程记录|过程记录]]\n- [[角色台词确认|角色与字幕确认]]\n`,
    },
  ]
}

export async function writeVideoTranslationIndex(
  runId: string,
  episodeId: string,
  roles: TranslationRole[],
) {
  return serializeTranslationWrite(runId, async () => {
    const files = await videoTranslationIndexFiles(runId, episodeId, roles)
    await replaceFiles(files)
    return relativeRunAsset(runId, files[1].path)
  })
}

export async function deleteVideoTranslationRole(
  runId: string,
  episodeId: string,
  roleId: string,
  remainingRoles: TranslationRole[],
) {
  safeId(episodeId, '剧集 ID')
  safeId(roleId, '翻译角色 ID')
  if (remainingRoles.some((role) => role.translationRoleId === roleId))
    throw new Error('待删除角色仍在角色列表中')
  await removeSharedVideoTranslationRole(runId, roleId)
  const translationWiki = path.join(getRunDir(runId), 'wiki', '翻译')
  await Promise.all([
    fs.promises.rm(path.join(translationWiki, '角色', `${roleId}.md`), { force: true }),
    fs.promises.rm(path.join(translationWiki, '声音', `${roleId}.md`), { force: true }),
    fs.promises.rm(path.join(translationWiki, '声音', `${roleId}-音色提示词.md`), { force: true }),
  ])
  return writeVideoTranslationIndex(runId, episodeId, remainingRoles)
}
