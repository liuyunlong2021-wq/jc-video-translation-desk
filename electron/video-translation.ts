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
  validateConfirmedTranslation,
  validateVideoTranslationDialoguePrompt,
  validateVideoTranslationGroupedPrompt,
} from '../src/runtime/videoTranslation.ts'
import { generateSeedAudio } from './seed-audio.ts'
import { executeFFmpeg } from './ffmpeg/index.ts'
import type {
  PendingCloudTask,
  VideoTranslationMasterUploadResult,
  VideoTranslationUploadResult,
} from './types.ts'
import { appendVideoTranslationTrace } from './video-translation-trace.ts'
import { putPending, readPending, updateTask, withTaskAbort } from './cloud.ts'

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

function roleMarkdown(role: TranslationRole) {
  return `---\ntranslationRoleId: ${role.translationRoleId}\nstatus: confirmed${role.screenshotId ? `\nscreenshotId: ${role.screenshotId}` : ''}${role.linkedCreativeRoleId ? `\nlinkedCreativeRoleId: ${role.linkedCreativeRoleId}` : ''}\n---\n\n# ${role.displayName}\n\n- 别名：${role.aliases.join('、') || '无'}\n- 来源剧集：${role.sourceEpisodeIds.join('、')}${role.description ? `\n- 角色说明：${role.description}` : ''}\n`
}

export async function writeConfirmedVideoTranslation(
  runId: string,
  episodeId: string,
  sourceLanguage: string,
  targetLanguage: string,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  sourceFingerprint = createHash('sha256').update(`legacy:${runId}:${episodeId}`).digest('hex'),
  durationMs = Number.POSITIVE_INFINITY,
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
  validateConfirmedTranslation(cues, roles, durationMs)
  if (!/^[a-f0-9]{64}$/i.test(sourceFingerprint)) throw new Error('识别视频指纹无效')
  const root = getRunDir(runId)
  const base = path.join(root, 'wiki', '翻译')
  const markdownPath = path.join(base, episodeId, '最终时间戳剧本.md')
  const contractPath = path.join(base, episodeId, '最终时间戳剧本.json')
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const sortedCues = cues.slice().sort((left, right) => left.startMs - right.startMs)
  const canonical = {
    sourceFingerprint,
    sourceLanguage,
    targetLanguage,
    cues: sortedCues.map((cue) => ({
      cueId: cue.cueId,
      dubbingGroupId: cue.dubbingGroupId,
      translationRoleId: cue.translationRoleId,
      roleName: roleById.get(cue.translationRoleId!)!.displayName,
      startMs: cue.startMs,
      endMs: cue.endMs,
      performanceDirection: cue.performanceDirection || '',
      sourceText: cue.sourceText,
      translatedText: cue.translatedText,
    })),
  }
  const scriptHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  const finalScriptId = `timestamp-script-${scriptHash.slice(0, 16)}`
  const speakingRoleIds = [...new Set(sortedCues.map((cue) => cue.translationRoleId!))]
  const markdown = `---
finalScriptId: ${finalScriptId}
scriptHash: ${scriptHash}
sourceFingerprint: ${sourceFingerprint}
sourceLanguage: ${sourceLanguage}
targetLanguage: ${targetLanguage}
status: confirmed
---

# 最终时间戳剧本

## 角色
${speakingRoleIds
  .map((roleId) => {
    const role = roleById.get(roleId)!
    return `- ${role.displayName}｜角色 ID：${roleId}${role.screenshotId ? `｜截图 ID：${role.screenshotId}` : ''}`
  })
  .join('\n')}

${sortedCues
  .map((cue) => {
    const role = roleById.get(cue.translationRoleId!)!
    return `## ${cue.cueId}
- 说话人：${role.displayName}
- 说话人 ID：${cue.translationRoleId}
- 配音组：${cue.dubbingGroupId || '单句'}
- 时间：${cue.startMs}-${cue.endMs}ms
${cue.performanceDirection ? `- 音频情绪：${cue.performanceDirection}\n` : ''}

### 原文
${cue.sourceText}

### 译文
${cue.translatedText}`
  })
  .join('\n\n')}
`
  await serializeTranslationWrite(runId, async () => {
    const indexFiles = await videoTranslationIndexFiles(runId, episodeId, roles)
    await replaceFiles([
      {
        path: markdownPath,
        content: markdown,
      },
      {
        path: contractPath,
        content: `${JSON.stringify({ finalScriptId, scriptHash, ...canonical }, null, 2)}\n`,
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
      { label: '润色字幕', target: '润色字幕.srt' },
      { label: '最终时间戳剧本', target: '最终时间戳剧本.md' },
    ],
    { sourceLanguage, targetLanguage, cues },
  )
  return {
    path: relativeRunAsset(runId, markdownPath),
    finalScriptId,
    scriptHash,
    markdown,
  }
}

export async function writeTranslationVoiceBinding(runId: string, role: TranslationRole) {
  safeId(role.translationRoleId, '翻译角色 ID')
  if (!role.voiceProfileId) throw new Error('翻译角色尚未选择声音')
  if (!role.voiceIdentityText?.trim()) throw new Error('角色声音身份不能为空')
  if (!role.voiceConfirmedAt) throw new Error('角色声音尚未人工确认')
  safeId(role.voiceProfileId, '声音档案 ID')
  const { resolveSeedVoiceProfiles } = await import('./voice-library.ts')
  const [reference] = await resolveSeedVoiceProfiles([
    { speakerId: role.translationRoleId, voiceProfileId: role.voiceProfileId },
  ])
  const stat = await fs.promises.stat(reference.referenceAudioPath).catch(() => null)
  if (!stat?.isFile() || !stat.size) throw new Error('角色参考音文件不可用')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', '声音', `${role.translationRoleId}.md`)
  await atomicWrite(
    target,
    `---\ntranslationRoleId: ${role.translationRoleId}\nvoiceProfileId: ${role.voiceProfileId}\nconfirmedAt: ${role.voiceConfirmedAt}\nstatus: confirmed\n---\n\n# ${role.displayName}的角色声音\n\n${role.voiceIdentityText.trim()}\n\n- 声音档案：[[声音库/音色/${role.voiceProfileId}]]\n`,
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
  safeLanguage(targetLanguage)
  if (
    !arrangement?.blocks?.length ||
    arrangement.blocks.some(
      (block) =>
        block.references.length > 3 ||
        !block.lines.length ||
        block.lines.some((line) => !line.cueId || !line.speakerId || !line.text.trim()),
    )
  )
    throw new Error('视频翻译全局配音安排无效')
  if (!promptMarkdown.trim() || Buffer.byteLength(promptMarkdown, 'utf8') > 2 * 1024 * 1024)
    throw new Error('豆包语音稿无效')
  if (
    !arrangement.finalScriptId ||
    !arrangement.scriptHash ||
    !/^[a-f0-9]{64}$/i.test(arrangement.scriptHash)
  )
    throw new Error('全局配音安排没有绑定最终时间戳剧本')
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '声音')
  const arrangementPath = path.join(base, '全局配音安排.json')
  const promptPath = path.join(base, '全局配音提示词.md')
  await Promise.all([
    atomicWrite(arrangementPath, `${JSON.stringify(arrangement, null, 2)}\n`),
    atomicWrite(promptPath, `${promptMarkdown.trim()}\n`),
  ])
  return {
    arrangementPath: relativeRunAsset(runId, arrangementPath),
    promptPath: relativeRunAsset(runId, promptPath),
  }
}

export async function writeVideoTranslationGroupedPlan(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  arrangement: VideoTranslationDialogueArrangement,
  promptMarkdown: string,
) {
  safeId(episodeId, '剧集 ID')
  safeLanguage(targetLanguage)
  if (
    !arrangement?.blocks?.length ||
    arrangement.blocks.some(
      (block) =>
        block.references.length !== 1 ||
        block.speakerIds.length !== 1 ||
        !block.lines.length ||
        block.lines.some((line) => !line.cueId || !line.speakerId || !line.text.trim()),
    )
  )
    throw new Error('视频翻译分组克隆安排无效')
  if (
    !arrangement.finalScriptId ||
    !arrangement.scriptHash ||
    !/^[a-f0-9]{64}$/i.test(arrangement.scriptHash)
  )
    throw new Error('分组克隆安排没有绑定最终时间戳剧本')
  const prompts = blockPrompts(promptMarkdown)
  for (const block of arrangement.blocks) {
    const prompt = prompts.get(block.blockId)
    if (!prompt) throw new Error(`${block.blockId} 缺少分组克隆提示词`)
    validateVideoTranslationGroupedPrompt(prompt, block)
  }
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '声音')
  const arrangementPath = path.join(base, '分组克隆安排.json')
  const promptPath = path.join(base, '分组克隆提示词.md')
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

async function saveVideoTranslationVoiceVersion(
  runId: string,
  wikiBase: string,
  version: VideoTranslationVoiceVersion,
) {
  await serializeTranslationWrite(runId, async () => {
    const versionDir = path.join(wikiBase, '全局配音版本')
    const indexPath = path.join(versionDir, 'index.json')
    const existing = await fs.promises
      .readFile(indexPath, 'utf8')
      .then((value) => JSON.parse(value).versions as VideoTranslationVoiceVersion[])
      .catch(() => [])
    await Promise.all([
      atomicWrite(
        path.join(versionDir, version.versionId, 'manifest.json'),
        `${JSON.stringify(version, null, 2)}\n`,
      ),
      atomicWrite(
        indexPath,
        `${JSON.stringify(
          {
            versions: [
              ...existing.map((item) => ({
                versionId: item.versionId,
                createdAt: item.createdAt,
                durationMs: item.durationMs,
                route: item.route,
              })),
              {
                versionId: version.versionId,
                createdAt: version.createdAt,
                durationMs: version.durationMs,
                route: version.route,
              },
            ],
          },
          null,
          2,
        )}\n`,
      ),
    ])
  })
}

export async function listVideoTranslationVoiceVersions(
  runId: string,
  episodeId: string,
  targetLanguage: string,
): Promise<VideoTranslationVoiceVersion[]> {
  safeId(episodeId, '剧集 ID')
  safeLanguage(targetLanguage)
  const indexPath = path.join(
    getRunDir(runId),
    'wiki',
    '翻译',
    episodeId,
    '声音',
    '全局配音版本',
    'index.json',
  )
  const entries = await fs.promises
    .readFile(indexPath, 'utf8')
    .then((value) => JSON.parse(value).versions as VideoTranslationVoiceVersion[])
    .catch(() => [])
  const available: VideoTranslationVoiceVersion[] = []
  for (const entry of entries) {
    if (!entry?.versionId) continue
    const version = await fs.promises
      .readFile(path.join(path.dirname(indexPath), entry.versionId, 'manifest.json'), 'utf8')
      .then((value) => JSON.parse(value) as VideoTranslationVoiceVersion)
      .catch(() => null)
    if (!version?.versionId || !version.previewPath || !version.blocks?.length) continue
    const paths = [version.previewPath, ...version.blocks.map((block) => block.audioPath)]
    const files = await Promise.all(
      paths.map((value) =>
        fs.promises.stat(assertVideoTranslationAsset(runId, episodeId, value)).catch(() => null),
      ),
    )
    const hashes = await Promise.all(
      version.blocks.map((block) =>
        fileHash(assertVideoTranslationAsset(runId, episodeId, block.audioPath)),
      ),
    )
    if (
      files.every((file) => file?.size) &&
      version.blocks.every((block, index) => block.audioHash === hashes[index])
    )
      available.push(version)
  }
  return available.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function generateVideoTranslationTargetVoice(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  abortSignal?: AbortSignal,
  reportProgress: (message: string) => void = () => {},
): Promise<VideoTranslationVoiceVersion> {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const wikiBase = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '声音')
  const arrangement = JSON.parse(
    await fs.promises.readFile(path.join(wikiBase, '全局配音安排.json'), 'utf8'),
  ) as VideoTranslationDialogueArrangement
  const promptMarkdown = await fs.promises.readFile(
    path.join(wikiBase, '全局配音提示词.md'),
    'utf8',
  )
  if (
    !arrangement.finalScriptId ||
    !arrangement.scriptHash ||
    !/^[a-f0-9]{64}$/i.test(arrangement.scriptHash)
  )
    throw new Error('全局配音安排没有绑定有效最终剧本')
  const prompts = blockPrompts(promptMarkdown)
  const versionId = `voice-${Date.now()}-${randomUUID().slice(0, 8)}`
  const mediaBase = path.join(
    getRunDir(runId),
    'episodes',
    episodeId,
    'video-translate',
    language,
    '全局配音版本',
    versionId,
  )
  await fs.promises.mkdir(mediaBase, { recursive: true })
  const blocks: NonNullable<VideoTranslationVoiceVersion['blocks']> = []
  for (let index = 0; index < arrangement.blocks.length; index++) {
    const block = arrangement.blocks[index]
    const prompt = prompts.get(block.blockId)
    if (!prompt) throw new Error(`${block.blockId} 缺少最终提示词`)
    if (block.references.some((reference) => !reference.voiceProfileId))
      throw new Error(`${block.blockId} 缺少已确认 voiceProfileId`)
    validateVideoTranslationDialoguePrompt(prompt, block)
    reportProgress(`正在生成全局配音 ${index + 1}/${arrangement.blocks.length}`)
    const generated = await generateSeedAudio({
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
    const target = path.join(mediaBase, `${block.blockId}.wav`)
    await atomicCopy(assertVideoTranslationAsset(runId, episodeId, generated.path), target)
    const durationMs = Math.round((await mediaDuration(target)) * 1000)
    blocks.push({
      voiceBlockId: block.blockId,
      cueIds: [...block.cueIds],
      audioPath: relativeRunAsset(runId, target),
      audioHash: await fileHash(target),
      durationMs,
      prompt,
      references: block.references.map((reference, referenceIndex) => ({
        translationRoleId: reference.speakerId,
        voiceProfileId: reference.voiceProfileId!,
        referenceIndex: referenceIndex + 1,
      })),
    })
  }
  const preview = path.join(mediaBase, '连续试听.wav')
  if (blocks.length === 1) {
    await atomicCopy(assertVideoTranslationAsset(runId, episodeId, blocks[0].audioPath), preview)
  } else {
    const inputs = blocks.map((block) =>
      assertVideoTranslationAsset(runId, episodeId, block.audioPath),
    )
    await executeFFmpeg(
      [
        ...inputs.flatMap((input) => ['-i', input]),
        '-filter_complex',
        `${inputs.map((_, index) => `[${index}:a]`).join('')}concat=n=${inputs.length}:v=0:a=1[out]`,
        '-map',
        '[out]',
        '-c:a',
        'pcm_s16le',
        '-y',
        preview,
      ],
      { abortSignal },
    )
  }
  const version: VideoTranslationVoiceVersion = {
    versionId,
    createdAt: new Date().toISOString(),
    previewPath: relativeRunAsset(runId, preview),
    finalScriptId: arrangement.finalScriptId,
    scriptHash: arrangement.scriptHash,
    route: 'global',
    blocks,
    durationMs: blocks.reduce((total, block) => total + block.durationMs, 0),
    model: 'seed-audio-1.0',
  }
  await saveVideoTranslationVoiceVersion(runId, wikiBase, version)
  return version
}

export async function generateVideoTranslationGroupedVoice(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  regenerateBlockIds: string[] = [],
  reportProgress: (message: string) => void = () => {},
  abortSignal?: AbortSignal,
): Promise<VideoTranslationVoiceVersion> {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const wikiBase = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '声音')
  const arrangement = JSON.parse(
    await fs.promises.readFile(path.join(wikiBase, '分组克隆安排.json'), 'utf8'),
  ) as VideoTranslationDialogueArrangement
  const promptMarkdown = await fs.promises.readFile(
    path.join(wikiBase, '分组克隆提示词.md'),
    'utf8',
  )
  if (
    !arrangement.finalScriptId ||
    !arrangement.scriptHash ||
    !/^[a-f0-9]{64}$/i.test(arrangement.scriptHash)
  )
    throw new Error('分组克隆安排没有绑定有效最终剧本')
  const prompts = blockPrompts(promptMarkdown)
  const force = new Set(regenerateBlockIds)
  for (const blockId of force) safeId(blockId, '配音组 ID')
  if (
    force.size &&
    [...force].some((blockId) => !arrangement.blocks.some((block) => block.blockId === blockId))
  )
    throw new Error('要重新生成的配音组不存在')
  const draftBase = path.join(
    getRunDir(runId),
    'episodes',
    episodeId,
    'video-translate',
    language,
    '分组克隆草稿',
    arrangement.scriptHash,
  )
  await fs.promises.mkdir(draftBase, { recursive: true })
  const taskId = (blockId: string) =>
    `${episodeId}:dubbing:${arrangement.scriptHash!.slice(0, 12)}:${blockId}`
  const existingById = new Map((await readPending(runId)).map((task) => [task.id, task]))
  const pending = arrangement.blocks.filter((block) => {
    if (force.size) return force.has(block.blockId)
    const task = existingById.get(taskId(block.blockId))
    return (
      task?.status !== 'success' || !fs.existsSync(path.join(draftBase, `${block.blockId}.wav`))
    )
  })
  for (const block of pending) {
    safeId(block.blockId, '配音组 ID')
    const index = arrangement.blocks.indexOf(block)
    const now = new Date().toISOString()
    const target = path.join(draftBase, `${block.blockId}.wav`)
    const label = block.references[0]?.label?.split('·')[0]?.trim() || block.speakerIds[0]
    const task: PendingCloudTask = {
      id: taskId(block.blockId),
      kind: 'dubbing',
      index: index + 1,
      targetId: block.blockId,
      targetLabel: `分组 ${String(index + 1).padStart(2, '0')} · ${label}`,
      status: 'queued',
      outputPath: relativeRunAsset(runId, target),
      createdAt: now,
      updatedAt: now,
    }
    await putPending(runId, task)
  }
  const failures: string[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (cursor < pending.length) {
        if (abortSignal?.aborted) return
        const block = pending[cursor++]
        const id = taskId(block.blockId)
        const prompt = prompts.get(block.blockId)
        const target = path.join(draftBase, `${block.blockId}.wav`)
        try {
          if (!prompt) throw new Error(`${block.blockId} 缺少分组克隆提示词`)
          if (block.references.some((reference) => !reference.voiceProfileId))
            throw new Error(`${block.blockId} 缺少已确认 voiceProfileId`)
          validateVideoTranslationGroupedPrompt(prompt, block)
          await withTaskAbort(
            runId,
            id,
            async (signal) => {
              await updateTask(runId, id, (task) => ({
                ...task,
                status: 'generating',
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                error: undefined,
              }))
              reportProgress(
                `正在生成分组克隆 ${arrangement.blocks.indexOf(block) + 1}/${arrangement.blocks.length}`,
              )
              const generated = await generateSeedAudio({
                runId,
                episodeId,
                workflow: 'video-translation',
                targetLanguage: language,
                mode: 'dialogue-performance',
                durationMs: Math.max(
                  1_000,
                  block.lines.at(-1)!.expectedEndMs - block.lines[0].expectedStartMs,
                ),
                prompt,
                language: language === 'zh' ? 'zh' : 'en',
                references: block.references,
                outputName: `grouped-${arrangement.scriptHash!.slice(0, 12)}-${block.blockId}`,
                abortSignal: signal,
              })
              await atomicCopy(
                assertVideoTranslationAsset(runId, episodeId, generated.path),
                target,
              )
              await updateTask(runId, id, (task) => ({
                ...task,
                status: 'success',
                outputPath: relativeRunAsset(runId, target),
                updatedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                error: undefined,
              }))
            },
            abortSignal,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${block.blockId}：${message}`)
          const task = (await readPending(runId)).find((item) => item.id === id)
          if (task?.status !== 'stopped')
            await updateTask(runId, id, (current) => ({
              ...current,
              status: abortSignal?.aborted ? 'stopped' : 'failed',
              updatedAt: new Date().toISOString(),
              error: abortSignal?.aborted ? '已停止' : message,
            }))
        }
      }
    }),
  )
  if (abortSignal?.aborted) throw new Error('任务已停止')
  if (failures.length) throw new Error(`有 ${failures.length} 个配音组生成失败`)
  const currentTasks = new Map((await readPending(runId)).map((task) => [task.id, task]))
  if (
    arrangement.blocks.some(
      (block) =>
        currentTasks.get(taskId(block.blockId))?.status !== 'success' ||
        !fs.existsSync(path.join(draftBase, `${block.blockId}.wav`)),
    )
  )
    throw new Error('仍有配音组尚未生成完成')
  const versionId = `grouped-${Date.now()}-${randomUUID().slice(0, 8)}`
  const mediaBase = path.join(
    getRunDir(runId),
    'episodes',
    episodeId,
    'video-translate',
    language,
    '全局配音版本',
    versionId,
  )
  await fs.promises.mkdir(mediaBase, { recursive: true })
  const blocks: NonNullable<VideoTranslationVoiceVersion['blocks']> = []
  for (const block of arrangement.blocks) {
    const source = path.join(draftBase, `${block.blockId}.wav`)
    const target = path.join(mediaBase, `${block.blockId}.wav`)
    await atomicCopy(source, target)
    const durationMs = Math.round((await mediaDuration(target)) * 1000)
    const targetDurationMs = block.lines.at(-1)!.expectedEndMs - block.lines[0].expectedStartMs
    blocks.push({
      voiceBlockId: block.blockId,
      cueIds: [...block.cueIds],
      audioPath: relativeRunAsset(runId, target),
      audioHash: await fileHash(target),
      durationMs,
      overrunMs: Math.max(0, durationMs - targetDurationMs),
      prompt: prompts.get(block.blockId)!,
      references: block.references.map((reference) => ({
        translationRoleId: reference.speakerId,
        voiceProfileId: reference.voiceProfileId!,
        referenceIndex: 1,
      })),
    })
  }
  const preview = path.join(mediaBase, '时间轴试听.wav')
  const inputs = blocks.map((block) =>
    assertVideoTranslationAsset(runId, episodeId, block.audioPath),
  )
  await executeFFmpeg([
    ...inputs.flatMap((input) => ['-i', input]),
    '-filter_complex',
    `${inputs
      .map(
        (_, index) =>
          `[${index}:a]adelay=${arrangement.blocks[index].lines[0].expectedStartMs}|${arrangement.blocks[index].lines[0].expectedStartMs}[a${index}]`,
      )
      .join(
        ';',
      )};${inputs.map((_, index) => `[a${index}]`).join('')}amix=inputs=${inputs.length}:duration=longest:dropout_transition=0:normalize=0[out]`,
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
  const version: VideoTranslationVoiceVersion = {
    versionId,
    createdAt: new Date().toISOString(),
    previewPath: relativeRunAsset(runId, preview),
    finalScriptId: arrangement.finalScriptId,
    scriptHash: arrangement.scriptHash,
    route: 'grouped',
    blocks,
    durationMs: Math.round((await mediaDuration(preview)) * 1000),
    model: 'seed-audio-1.0',
  }
  await saveVideoTranslationVoiceVersion(runId, wikiBase, version)
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
      content: `# ${episodeId} 视频翻译\n\n- [[原始转写|原始 FunASR 转写]]\n- [[润色字幕|锁定时间戳的润色字幕]]\n- [[最终时间戳剧本|人工确认的最终时间戳剧本]]\n- [[声音/全局配音提示词|全局配音提示词]]\n- [[成片/配音对白时间戳|配音对白时间戳]]\n- [[过程记录|过程记录]]\n`,
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
