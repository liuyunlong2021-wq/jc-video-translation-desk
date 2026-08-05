import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { dialog } from 'electron'
import { parseFile } from 'music-metadata'
import {
  assertEpisodeAsset,
  ensureEpisodeDir,
  getRunDir,
  relativeRunAsset,
} from './media-workspace.ts'
import type {
  TranslationRole,
  VideoTranslationCue,
} from '../src/runtime/videoTranslation.ts'
import { validateConfirmedTranslation } from '../src/runtime/videoTranslation.ts'
import type { SeedAudioArrangement } from '../src/runtime/seedAudio.ts'
import { generateSeedAudio, mixSeedAudioTracks } from './seed-audio.ts'
import type { VideoTranslationUploadResult } from './types.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])

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
  const metadata = await parseFile(source, { duration: true })
  const durationMs = Math.round(Number(metadata.format.duration) * 1000)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('无法读取视频时长')
  const hasAudio = Boolean(metadata.format.sampleRate && metadata.format.numberOfChannels)
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
  for (const role of roles) {
    safeId(role.translationRoleId, '翻译角色 ID')
    if (!role.displayName.trim() || /[\r\n]/.test(role.displayName)) throw new Error('翻译角色名称无效')
  }
  validateConfirmedTranslation(cues, roles)
  const root = getRunDir(runId)
  const base = path.join(root, 'wiki', '翻译')
  const jsonPath = path.join(base, episodeId, '角色台词确认.json')
  const markdownPath = path.join(base, episodeId, '角色台词确认.md')
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  await Promise.all([
    atomicWrite(jsonPath, `${JSON.stringify({ schemaVersion: 1, sourceLanguage, targetLanguage, cues }, null, 2)}\n`),
    atomicWrite(markdownPath, `# 角色与字幕确认\n\n${cues.map((cue) => `- ${cue.startMs}-${cue.endMs}ms · ${roleById.get(cue.translationRoleId!)!.displayName}\n  - 原文：${cue.sourceText}\n  - 译文：${cue.translatedText}`).join('\n')}\n`),
    ...roles.map((role) => atomicWrite(path.join(base, '角色', `${role.translationRoleId}.md`), roleMarkdown(role))),
  ])
  await writeVideoTranslationIndex(runId, episodeId, roles)
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
) {
  safeId(episodeId, '剧集 ID')
  const language = safeLanguage(targetLanguage)
  const base = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, language)
  const arrangement = JSON.parse(
    await fs.promises.readFile(path.join(base, '豆包配音安排.json'), 'utf8'),
  ) as SeedAudioArrangement
  const prompts = taskPrompts(await fs.promises.readFile(path.join(base, '豆包语音稿.md'), 'utf8'))
  if (!arrangement?.tasks?.length) throw new Error('豆包配音安排无效')
  const generated: string[] = []
  for (const task of arrangement.tasks) {
    const prompt = prompts.get(task.taskId)
    if (!prompt) throw new Error(`${task.taskId} 缺少已保存豆包语音稿`)
    if (task.includeMusicAndEffects || task.references.length > 3)
      throw new Error(`${task.taskId} 不是纯人声翻译任务`)
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
    })
    generated.push(result.path)
  }
  const durationMs = Math.max(...arrangement.tasks.map((task) => task.endMs))
  return mixSeedAudioTracks(
    runId,
    episodeId,
    generated,
    durationMs,
    'video-translation',
    language,
  )
}

export async function writeVideoTranslationIndex(
  runId: string,
  episodeId: string,
  roles: TranslationRole[],
) {
  safeId(episodeId, '剧集 ID')
  const base = path.join(getRunDir(runId), 'wiki', '翻译')
  const episodeIndex = path.join(base, episodeId, 'index.md')
  const episodes = (await fs.promises.readdir(base, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && !['角色', '声音'].includes(entry.name))
    .map((entry) => entry.name)
    .sort()
  await Promise.all([
    atomicWrite(path.join(base, 'index.md'), `# 视频翻译\n\n## 翻译角色\n\n${roles.map((role) => `- [[角色/${role.translationRoleId}|${role.displayName}]]`).join('\n') || '- 暂无'}\n\n## 剧集\n\n${episodes.map((id) => `- [[${id}/index|${id}]]`).join('\n') || '- 暂无'}\n`),
    atomicWrite(episodeIndex, `# ${episodeId} 视频翻译\n\n- [[source.srt|源字幕]]\n- [[来源上下文.json|来源上下文]]\n- [[角色台词确认|角色与字幕确认]]\n`),
  ])
  return relativeRunAsset(runId, episodeIndex)
}

export function assertVideoTranslationAsset(runId: string, episodeId: string, filePath: string) {
  const resolved = assertEpisodeAsset(runId, episodeId, filePath)
  const relative = relativeRunAsset(runId, resolved)
  if (
    !relative.startsWith(`episodes/${episodeId}/video-translate/`) &&
    !relative.startsWith(`wiki/翻译/${episodeId}/`)
  ) throw new Error('素材不属于当前视频翻译工作流')
  return resolved
}
