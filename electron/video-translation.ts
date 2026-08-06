import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dialog } from 'electron'
import {
  assertVideoTranslationAsset,
  ensureEpisodeDir,
  getRunDir,
  relativeRunAsset,
} from './media-workspace.ts'
import type {
  TranslationRole,
  VideoTranslationCue,
} from '../src/runtime/videoTranslation.ts'
import {
  validateConfirmedTranslation,
  validateVideoTranslationVoiceAlignment,
} from '../src/runtime/videoTranslation.ts'
import { normalizeWhisperOutput } from '../src/runtime/materialTranscript.ts'
import type { SeedAudioArrangement } from '../src/runtime/seedAudio.ts'
import { generateSeedAudio, mixSeedAudioTracks } from './seed-audio.ts'
import { runFasterWhisper } from './material-transcript.ts'
import type { VideoTranslationUploadResult } from './types.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])
const runFile = promisify(execFile)
const translationWrites = new Map<string, Promise<unknown>>()

async function probeVideo(filePath: string) {
  const { stdout } = await runFile(
    process.env.FFPROBE_PATH || 'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', filePath],
    { maxBuffer: 1024 * 1024 },
  )
  const value = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{ codec_type?: string }>
  }
  const durationMs = Math.round(Number(value.format?.duration) * 1000)
  const streams = value.streams || []
  const hasVideo = streams.some((stream) => stream.codec_type === 'video')
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio')
  if (!hasVideo || !Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error('上传文件不是可读取的视频')
  return { durationMs, hasAudio }
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
  await fs.promises.copyFile(source, temporary)
  await fs.promises.rename(temporary, target)
}

async function replaceFiles(files: Array<{ path: string; content: string }>) {
  const backups = await Promise.all(files.map((file) =>
    fs.promises.readFile(file.path).catch((error: any) =>
      error?.code === 'ENOENT' ? null : Promise.reject(error),
    ),
  ))
  const temporary = files.map((file) => `${file.path}.${randomUUID()}.tmp`)
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
      : atomicWrite(file.path, backups[index]!)))
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
    filters: [{ name: 'Video', extensions: [...VIDEO_EXTENSIONS].map((item) => item.slice(1)) }],
  })
  const source = selected.filePaths[0]
  if (selected.canceled || !source) return null
  const extension = path.extname(source).toLowerCase()
  if (!VIDEO_EXTENSIONS.has(extension)) throw new Error('请选择支持的视频文件')
  const stat = await fs.promises.stat(source)
  if (!stat.isFile() || !stat.size) throw new Error('视频文件不可读')
  const sourceFingerprint = await fileHash(source)
  const { durationMs, hasAudio } = await probeVideo(source)
  const episodeDir = await ensureEpisodeDir(runId, episodeId)
  const rawSnapshot = path.join(
    getRunDir(runId), '.raw', '视频翻译', episodeId,
    `${sourceFingerprint.slice(0, 12)}${extension}`,
  )
  const controlled = path.join(episodeDir, 'video-translate', `source${extension}`)
  if (!(await fs.promises.stat(rawSnapshot).catch(() => null))) await atomicCopy(source, rawSnapshot)
  await atomicCopy(source, controlled)
  return {
    sourceVideoPath: relativeRunAsset(runId, controlled),
    rawSnapshotPath: relativeRunAsset(runId, rawSnapshot),
    sourceFingerprint,
    durationMs,
    hasAudio,
  }
}

export async function writeVideoTranslationContext(
  runId: string,
  episodeId: string,
  contextPaths: Array<{ path: string; hash: string }>,
) {
  safeId(episodeId, '剧集 ID')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '来源上下文.json')
  await atomicWrite(target, `${JSON.stringify({ schemaVersion: 1, contextPaths }, null, 2)}\n`)
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
    if (!role.displayName.trim() || /[\r\n]/.test(role.displayName)) throw new Error('翻译角色名称无效')
  }
  validateConfirmedTranslation(cues, roles)
  const root = getRunDir(runId)
  const base = path.join(root, 'wiki', '翻译')
  const jsonPath = path.join(base, episodeId, '角色台词确认.json')
  const markdownPath = path.join(base, episodeId, '角色台词确认.md')
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  await serializeTranslationWrite(runId, async () => {
    const indexFiles = await videoTranslationIndexFiles(runId, episodeId, roles)
    await replaceFiles([
      { path: jsonPath, content: `${JSON.stringify({ schemaVersion: 1, sourceLanguage, targetLanguage, cues }, null, 2)}\n` },
      { path: markdownPath, content: `# 角色与字幕确认\n\n${cues.map((cue) => `- ${cue.startMs}-${cue.endMs}ms · ${roleById.get(cue.translationRoleId!)!.displayName}\n  - 原文：${cue.sourceText}\n  - 译文：${cue.translatedText}`).join('\n')}\n` },
      ...roles.map((role) => ({
        path: path.join(base, '角色', `${role.translationRoleId}.md`),
        content: roleMarkdown(role),
      })),
      ...indexFiles,
    ])
  })
  return relativeRunAsset(runId, jsonPath)
}

export async function writeTranslationVoiceBinding(
  runId: string,
  role: TranslationRole,
) {
  safeId(role.translationRoleId, '翻译角色 ID')
  if (!role.voiceProfileId) throw new Error('翻译角色尚未选择声音')
  safeId(role.voiceProfileId, '声音档案 ID')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', '声音', `${role.translationRoleId}.md`)
  await atomicWrite(target, `---\ntranslationRoleId: ${role.translationRoleId}\nvoiceProfileId: ${role.voiceProfileId}\nstatus: confirmed\n---\n\n# ${role.displayName}的翻译声音\n\n- 声音档案：[[声音库/音色/${role.voiceProfileId}]]\n`)
  return relativeRunAsset(runId, target)
}

export async function writeVideoTranslationSeedPlan(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  arrangement: SeedAudioArrangement,
  promptMarkdown: string,
) {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  if (!arrangement?.tasks?.length || arrangement.tasks.some((task) =>
    task.includeMusicAndEffects || task.references.length > 3 || !task.lines.length,
  )) throw new Error('视频翻译豆包配音安排无效')
  if (!promptMarkdown.trim() || Buffer.byteLength(promptMarkdown, 'utf8') > 2 * 1024 * 1024)
    throw new Error('豆包语音稿无效')
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const arrangementPath = path.join(base, '豆包配音安排.json')
  const promptPath = path.join(base, '豆包语音稿.md')
  await Promise.all([
    atomicWrite(arrangementPath, `${JSON.stringify(arrangement, null, 2)}\n`),
    atomicWrite(promptPath, `${promptMarkdown.trim()}\n`),
  ])
  return {
    arrangementPath: relativeRunAsset(runId, arrangementPath),
    promptPath: relativeRunAsset(runId, promptPath),
  }
}

function taskPrompts(markdown: string) {
  return new Map(markdown.split(/^##\s+/m).slice(1).flatMap((section) => {
    const newline = section.indexOf('\n')
    return newline < 0 ? [] : [[section.slice(0, newline).trim(), section.slice(newline + 1).trim()]]
  }))
}

export async function generateVideoTranslationTargetVoice(
  runId: string,
  episodeId: string,
  targetLanguage: string,
  abortSignal?: AbortSignal,
) {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const arrangement = JSON.parse(
    await fs.promises.readFile(path.join(base, '豆包配音安排.json'), 'utf8'),
  ) as SeedAudioArrangement
  const prompts = taskPrompts(await fs.promises.readFile(path.join(base, '豆包语音稿.md'), 'utf8'))
  if (!arrangement?.tasks?.length) throw new Error('豆包配音安排无效')
  const recordPath = path.join(base, '声音生成记录.json')
  const readRecord = () => fs.promises.readFile(recordPath, 'utf8')
    .then((value) => JSON.parse(value))
    .catch(() => ({ schemaVersion: 1, generations: [] })) as {
      schemaVersion?: number
      generations?: unknown[]
      tasks?: Record<string, { fingerprint: string; path: string }>
    }
  const record = await readRecord()
  const generated: string[] = []
  const timelines: Array<{
    taskId: string
    audioPath: string
    durationMs: number
    cues: ReturnType<typeof validateVideoTranslationVoiceAlignment>
  }> = []
  record.tasks ||= {}
  for (const task of arrangement.tasks) {
    if (abortSignal?.aborted) throw new Error('任务已停止')
    const prompt = prompts.get(task.taskId)
    if (!prompt) throw new Error(`${task.taskId} 缺少已保存豆包语音稿`)
    if (task.includeMusicAndEffects || task.references.length > 3)
      throw new Error(`${task.taskId} 不是纯人声翻译任务`)
    const fingerprint = createHash('sha256').update(JSON.stringify({
      targetLanguage: language,
      taskId: task.taskId,
      startMs: task.startMs,
      endMs: task.endMs,
      speakerIds: task.speakerIds,
      lines: task.lines,
      references: task.references.map(({ speakerId, voiceProfileId, apiSpeakerId }) => ({ speakerId, voiceProfileId, apiSpeakerId })),
      prompt,
    })).digest('hex')
    const checkpoint = record.tasks[task.taskId]
    let taskAudioPath = ''
    if (checkpoint?.fingerprint === fingerprint) {
      const existing = assertVideoTranslationAsset(runId, episodeId, checkpoint.path)
      if ((await fs.promises.stat(existing).catch(() => null))?.size) taskAudioPath = existing
    }
    if (!taskAudioPath) {
      const result = await generateSeedAudio({
        runId,
        episodeId,
        workflow: 'video-translation',
        targetLanguage: language,
        mode: 'timeline-voice',
        durationMs: task.endMs - task.startMs,
        prompt,
        language: language === 'zh' ? 'zh' : 'en',
        references: task.references,
        outputName: task.taskId,
        abortSignal,
      })
      taskAudioPath = result.path
    }
    const taskRelativePath = relativeRunAsset(runId, taskAudioPath)
    if (!checkpoint || checkpoint.fingerprint !== fingerprint) {
      const latestRecord = await readRecord()
      latestRecord.tasks ||= {}
      latestRecord.tasks[task.taskId] = {
        fingerprint,
        path: taskRelativePath,
      }
      await atomicWrite(recordPath, `${JSON.stringify(latestRecord, null, 2)}\n`)
    }
    const transcript = normalizeWhisperOutput(
      task.taskId,
      taskRelativePath,
      await runFasterWhisper(taskAudioPath, abortSignal),
    )
    const cues = validateVideoTranslationVoiceAlignment(
      task.lines.map((line, index) => ({
        cueId: `${task.taskId}-line-${String(index + 1).padStart(3, '0')}`,
        text: line.text,
        startMs: line.startMs as number,
        endMs: line.endMs as number,
      })),
      transcript.cues,
      task.startMs,
    )
    timelines.push({
      taskId: task.taskId,
      audioPath: taskRelativePath,
      durationMs: transcript.durationMs,
      cues,
    })
    generated.push(taskAudioPath)
  }
  const durationMs = Math.max(...arrangement.tasks.map((task) => task.endMs))
  const targetVoicePath = await mixSeedAudioTracks(
    runId,
    episodeId,
    generated,
    durationMs,
    'video-translation',
    language,
    abortSignal,
  )
  await atomicWrite(
    path.join(base, '目标人声时间轴.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      targetLanguage: language,
      targetVoicePath,
      tasks: timelines,
    }, null, 2)}\n`,
  )
  return targetVoicePath
}

async function videoTranslationIndexFiles(
  runId: string,
  episodeId: string,
  roles: TranslationRole[],
) {
  safeId(episodeId, '剧集 ID')
  const base = path.join(getRunDir(runId), 'wiki', '翻译')
  const episodeIndex = path.join(base, episodeId, 'index.md')
  const episodes = [...new Set([
    ...(await fs.promises.readdir(base, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && !['角色', '声音'].includes(entry.name))
    .map((entry) => entry.name),
    episodeId,
  ])].sort()
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
    { path: path.join(base, 'index.md'), content: `# 视频翻译\n\n## 翻译角色\n\n${[...roleById].map(([id, name]) => `- [[角色/${id}|${name}]]`).join('\n') || '- 暂无'}\n\n## 剧集\n\n${episodes.map((id) => `- [[${id}/index|${id}]]`).join('\n') || '- 暂无'}\n` },
    { path: episodeIndex, content: `# ${episodeId} 视频翻译\n\n- [[source.srt|源字幕]]\n- [[来源上下文.json|来源上下文]]\n- [[角色台词确认|角色与字幕确认]]\n` },
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
