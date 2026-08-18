import type { ArtifactStatus } from './productionContract.ts'
import type { SeedAudioReference } from './seedAudio.ts'

export type WorkspaceEntry = 'content-create' | 'video-translate'

export interface TranslationRole {
  translationRoleId: string
  displayName: string
  visualPersonId?: string
  scriptCharacterId?: string
  aliases: string[]
  description?: string
  screenshotId?: string
  linkedCreativeRoleId?: string
  voiceProfileId?: string
  voiceLanguage?: string
  voiceIdentityText?: string
  voiceConfirmedAt?: string
  sourceEpisodeIds: string[]
  status: 'confirmed'
}

export interface ScriptCharacter {
  scriptCharacterId: string
  displayName: string
  aliases: string[]
  description: string
  evidence: string
  sourcePath: string
  order: number
  status: 'draft' | 'confirmed'
}

export interface ScriptCharacterDraft {
  displayName: string
  aliases?: string[]
  description?: string
  evidence?: string
}

export interface VideoTranslationCue {
  cueId: string
  dubbingGroupId?: string
  startMs: number
  endMs: number
  recognizedText: string
  sourceText: string
  subtitleSourceKind?: 'imported-srt' | 'video-ocr' | 'audio-asr'
  subtitleSourcePath?: string
  subtitleConfidence?: number
  translatedText: string
  performanceDirection?: string
  translationRoleId?: string
  proposedName?: string
  confidence?: number
  evidence?: string
  ocrText?: string
  needsReview: boolean
  voicePath?: string
  suspectedMissing?: boolean
  speakerCluster?: string
  emotion?: string
  audioEvent?: string
  frameSuggestion?: string
  framePath?: string
  visiblePersonIds?: string[]
  frameCalibrationBackupText?: string
  calibrationSuggestion?: string
  calibrationBackupText?: string
}

export interface VideoTranslationSeedRolePromptInput {
  role: TranslationRole
  cues: VideoTranslationCue[]
  language: string
  fallbackLine?: string
}

export interface VideoTranslationState {
  sourceVideoPath?: string
  sourceFingerprint?: string
  subtitleSourceMode: 'import-srt' | 'subtitled-video' | 'plain-video'
  finalMasterVideoPath?: string
  finalMasterFingerprint?: string
  sourceLanguage: string
  targetLanguage: string
  durationMs: number
  hasAudio: boolean
  finalScriptId?: string
  scriptHash?: string
  finalScriptMarkdown?: string
  seedArrangementPath?: string
  seedPromptPath?: string
  seedPromptText?: string
  seedPromptGeneratedBySkill?: boolean
  groupedVoicePrompts?: Record<string, string>
  voiceVersions: VideoTranslationVoiceVersion[]
  activeVoiceVersionId?: string
  targetVoicePath?: string
  dubDialogueTimestampPath?: string
  dubDialogueTimestampHash?: string
  vocalPath?: string
  instrumentPath?: string
  mixedPath?: string
  finalVideoPath?: string
  cues: VideoTranslationCue[]
  speakerStatus: ArtifactStatus
  frameCalibrationStatus: ArtifactStatus
  calibrationStatus: ArtifactStatus
  calibrationApplied: boolean
  translationStatus: ArtifactStatus
  reviewStatus: ArtifactStatus
  arrangementStatus: ArtifactStatus
  voiceStatus: ArtifactStatus
  separationStatus: ArtifactStatus
  mixStatus: ArtifactStatus
  finalStatus: ArtifactStatus
  originalVocalRemoved: boolean
  error?: string
}

export interface VideoTranslationVoiceVersion {
  versionId: string
  createdAt: string
  previewPath: string
  finalScriptId?: string
  scriptHash?: string
  route?: 'global' | 'grouped'
  blocks?: Array<{
    voiceBlockId: string
    cueIds: string[]
    audioPath: string
    audioHash: string
    durationMs: number
    overrunMs?: number
    prompt: string
    references: Array<{
      translationRoleId: string
      voiceProfileId: string
      referenceIndex: number
    }>
  }>
  durationMs: number
  model?: string
}

export interface VideoTranslationDialogueLine {
  cueId: string
  speakerId: string
  text: string
  performanceEvidence?: string
  expectedStartMs: number
  expectedEndMs: number
}

export interface VideoTranslationDialogueBlock {
  blockId: string
  cueIds: string[]
  speakerIds: string[]
  references: SeedAudioReference[]
  lines: VideoTranslationDialogueLine[]
}

export interface VideoTranslationDialogueArrangement {
  schemaVersion: 1
  episodeId: string
  targetLanguage: string
  finalScriptId?: string
  scriptHash?: string
  durationMs: number
  blocks: VideoTranslationDialogueBlock[]
}

export interface VideoTranslationDialoguePlan {
  arrangement: VideoTranslationDialogueArrangement
}

export interface VideoTranslationDubbingGroup {
  groupId: string
  cueIds: string[]
  speakerId: string
  startMs: number
  endMs: number
}

export interface VideoTranslationGroupedPlan extends VideoTranslationDialoguePlan {
  prompts: Record<string, string>
  promptMarkdown: string
}

export function insertVideoTranslationCueAt(
  cues: VideoTranslationCue[],
  durationMs: number,
  playheadMs: number,
  cueId: string,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const at = Math.max(0, Math.min(durationMs, Math.round(playheadMs)))
  const previous = sorted.filter((cue) => cue.startMs <= at).at(-1)
  const next = sorted.find((cue) => cue.startMs > at)
  const overlapsExisting = sorted.some((cue) => cue.startMs < at && at < cue.endMs)
  const endMs = Math.min(durationMs, overlapsExisting ? at + 2000 : (next?.startMs ?? at + 2000))
  if (endMs <= at) throw new Error('当前位置已到视频结尾')
  const neighbor = previous
  const created: VideoTranslationCue = {
    cueId,
    startMs: at,
    endMs,
    recognizedText: '',
    sourceText: '',
    translatedText: '',
    performanceDirection: '',
    translationRoleId: neighbor?.translationRoleId,
    proposedName: neighbor?.proposedName,
    confidence: 0,
    evidence: '人工在播放头新增',
    needsReview: true,
  }
  sorted.push(created)
  return {
    cues: sorted.sort((a, b) => a.startMs - b.startMs),
    cue: created,
    mode: 'insert' as const,
  }
}

export function setVideoTranslationCueBoundary(
  cues: VideoTranslationCue[],
  cueId: string,
  boundary: 'start' | 'end',
  playheadMs: number,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const index = sorted.findIndex((cue) => cue.cueId === cueId)
  if (index < 0) throw new Error('请先选择字幕行')
  const cue = sorted[index]
  const at = Math.round(playheadMs)
  if (boundary === 'start') {
    if (at < 0 || at >= cue.endMs) throw new Error('开始时间必须位于视频内且早于结束时间')
    cue.startMs = at
  } else {
    if (at <= cue.startMs || at > Number.MAX_SAFE_INTEGER)
      throw new Error('结束时间必须晚于开始时间')
    cue.endMs = at
  }
  return sorted
}

export function mergeVideoTranslationCueWithNext(cues: VideoTranslationCue[], cueId: string) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const index = sorted.findIndex((cue) => cue.cueId === cueId)
  const current = sorted[index]
  const next = sorted[index + 1]
  if (!current || !next) throw new Error('所选对白没有下一条可合并对白')
  if (!current.translationRoleId || current.translationRoleId !== next.translationRoleId)
    throw new Error('只有已确认且角色相同的相邻对白可以合并')
  current.endMs = Math.max(current.endMs, next.endMs)
  current.performanceDirection = [current.performanceDirection, next.performanceDirection]
    .filter(Boolean)
    .join('；')
  current.sourceText = [current.sourceText, next.sourceText].filter(Boolean).join(' ')
  current.translatedText = [current.translatedText, next.translatedText].filter(Boolean).join(' ')
  current.needsReview = true
  sorted.splice(index + 1, 1)
  return sorted
}

export function splitVideoTranslationCueAt(
  cues: VideoTranslationCue[],
  cueId: string,
  playheadMs: number,
  textOffset: number,
  newCueId: string,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const index = sorted.findIndex((cue) => cue.cueId === cueId)
  const cue = sorted[index]
  if (!cue) throw new Error('请先选择字幕行')
  const at = Math.round(playheadMs)
  if (at <= cue.startMs || at >= cue.endMs) throw new Error('播放头必须位于所选字幕内部')
  const left = cue.sourceText.slice(0, textOffset).trim()
  const right = cue.sourceText.slice(textOffset).trim()
  if (!left || !right) throw new Error('请把文字光标放在需要拆分的两个字之间')
  const splitRecognizedText = cue.sourceText === cue.recognizedText
  const next: VideoTranslationCue = {
    ...cue,
    cueId: newCueId,
    startMs: at,
    recognizedText: splitRecognizedText ? right : '',
    sourceText: right,
    translatedText: '',
    calibrationSuggestion: undefined,
    calibrationBackupText: undefined,
    evidence: '人工在播放头拆分',
    needsReview: true,
  }
  cue.endMs = at
  cue.recognizedText = splitRecognizedText ? left : cue.recognizedText
  cue.sourceText = left
  cue.translatedText = ''
  cue.calibrationSuggestion = undefined
  cue.calibrationBackupText = undefined
  cue.needsReview = true
  sorted.splice(index + 1, 0, next)
  return { cues: sorted, cue: next }
}

export function deleteVideoTranslationCue(cues: VideoTranslationCue[], cueId: string) {
  if (!cues.some((cue) => cue.cueId === cueId)) throw new Error('没有找到所选对白')
  return cues.filter((cue) => cue.cueId !== cueId).map((cue) => ({ ...cue }))
}

export function videoTranslationDubbingGroups(cues: VideoTranslationCue[]) {
  const groups: VideoTranslationDubbingGroup[] = []
  const closed = new Set<string>()
  for (const cue of cues
    .slice()
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)) {
    if (!cue.translationRoleId) throw new Error(`${cue.cueId} 尚未确认角色`)
    const groupId = cue.dubbingGroupId?.trim() || `single-${cue.cueId}`
    const current = groups.at(-1)
    if (current?.groupId === groupId) {
      if (current.speakerId !== cue.translationRoleId) throw new Error('同一配音组只能包含一个角色')
      current.cueIds.push(cue.cueId)
      current.endMs = cue.endMs
      continue
    }
    if (closed.has(groupId)) throw new Error('同一配音组的字幕必须连续')
    if (current) closed.add(current.groupId)
    groups.push({
      groupId,
      cueIds: [cue.cueId],
      speakerId: cue.translationRoleId,
      startMs: cue.startMs,
      endMs: cue.endMs,
    })
  }
  return groups
}

export function groupVideoTranslationCueWithNext(
  cues: VideoTranslationCue[],
  cueId: string,
  newGroupId: string,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const index = sorted.findIndex((cue) => cue.cueId === cueId)
  const current = sorted[index]
  const next = sorted[index + 1]
  if (!current || !next) throw new Error('所选字幕没有下一条可组成配音组')
  if (!current.translationRoleId || current.translationRoleId !== next.translationRoleId)
    throw new Error('只有角色相同的相邻字幕可以组成配音组')
  const currentGroupId = current.dubbingGroupId?.trim()
  const nextGroupId = next.dubbingGroupId?.trim()
  if (currentGroupId && currentGroupId === nextGroupId) return sorted
  const groupId = newGroupId
  if (!/^[A-Za-z0-9_-]+$/.test(groupId)) throw new Error('配音组 ID 无效')
  const mergedIds = new Set([currentGroupId, nextGroupId].filter(Boolean))
  for (const cue of sorted)
    if (
      cue === current ||
      cue === next ||
      (cue.dubbingGroupId && mergedIds.has(cue.dubbingGroupId))
    )
      cue.dubbingGroupId = groupId
  videoTranslationDubbingGroups(sorted)
  return sorted
}

function normalizeCharacterName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = String(value || '').trim()
    const key = normalizeCharacterName(trimmed)
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function slugCharacterId(value: string, index: number) {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `script-${ascii || String(index + 1).padStart(3, '0')}`
}

function compactText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function normalizeScriptCharacterDraft(draft: ScriptCharacterDraft) {
  const rawName = String(draft?.displayName || '').replace(/\s+/g, ' ').trim()
  if (!rawName) throw new Error('剧本角色名称不能为空')
  const separatorIndex = rawName.search(/[：:，,。；;\n]/)
  const hasShortHead = separatorIndex > 0 && separatorIndex <= 12
  const displayName = hasShortHead ? rawName.slice(0, separatorIndex).trim() : rawName
  const nameRemainder = hasShortHead ? rawName.slice(separatorIndex + 1).trim() : ''
  const description = compactText([nameRemainder, draft.description].filter(Boolean).join('；'), 80)
  const evidence = compactText(String(draft.evidence || ''), 120)
  return { displayName: compactText(displayName, 18), description, evidence }
}

export function mergeScriptCharacters(
  existing: ScriptCharacter[],
  drafts: ScriptCharacterDraft[],
  sourcePath: string,
) {
  const byName = new Map<string, ScriptCharacter>()
  const result = existing.map((character) => ({
    ...character,
    aliases: [...character.aliases],
  }))
  const byId = new Map(result.map((character) => [character.scriptCharacterId, character]))
  result.forEach((character) => {
    byName.set(normalizeCharacterName(character.displayName), character)
    character.aliases.forEach((alias) => byName.set(normalizeCharacterName(alias), character))
  })
  for (const draft of drafts) {
    const normalized = normalizeScriptCharacterDraft(draft)
    const displayName = normalized.displayName
    const aliases = uniqueNonEmpty(draft.aliases || []).filter(
      (alias) => normalizeCharacterName(alias) !== normalizeCharacterName(displayName),
    )
    const key = normalizeCharacterName(displayName)
    const matched = byName.get(key)
    if (matched) {
      matched.aliases = uniqueNonEmpty([...matched.aliases, ...aliases])
      matched.aliases.forEach((alias) => byName.set(normalizeCharacterName(alias), matched))
      if (!matched.description && normalized.description) matched.description = normalized.description
      if (!matched.evidence && normalized.evidence) matched.evidence = normalized.evidence
      continue
    }
    let id = slugCharacterId(displayName, result.length)
    let suffix = 2
    while (byId.has(id)) id = `${slugCharacterId(displayName, result.length)}-${suffix++}`
    const character: ScriptCharacter = {
      scriptCharacterId: id,
      displayName,
      aliases,
      description: normalized.description,
      evidence: normalized.evidence,
      sourcePath,
      order: result.length,
      status: 'confirmed',
    }
    result.push(character)
    byId.set(id, character)
    byName.set(key, character)
    aliases.forEach((alias) => byName.set(normalizeCharacterName(alias), character))
  }
  return result.map((character, order) => ({ ...character, order }))
}

export function scriptCharacterOptions(characters: ScriptCharacter[]) {
  return [...characters].sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName))
}

export function matchScriptCharacterForRole(
  role: TranslationRole,
  characters: ScriptCharacter[],
  cues: VideoTranslationCue[] = [],
) {
  const haystack = [
    role.displayName,
    ...role.aliases,
    role.description || '',
    ...cues
      .filter((cue) => cue.translationRoleId === role.translationRoleId)
      .flatMap((cue) => [cue.sourceText, cue.recognizedText, cue.proposedName || '']),
  ]
    .join('\n')
    .toLowerCase()
  const matches = characters.filter((character) =>
    [character.displayName, ...character.aliases]
      .map(normalizeCharacterName)
      .filter(Boolean)
      .some((name) => haystack.replace(/\s+/g, '').includes(name)),
  )
  return matches.length === 1 ? matches[0] : undefined
}

export function bindTranslationRoleToScriptCharacter(
  role: TranslationRole,
  character: ScriptCharacter,
) {
  return {
    ...role,
    scriptCharacterId: character.scriptCharacterId,
    displayName: character.displayName,
    aliases: uniqueNonEmpty([...role.aliases, ...character.aliases]),
    description: character.description || role.description,
  }
}

function languageVoiceLabel(language: string) {
  const code = language.trim().toLowerCase()
  if (code === 'en') return '美式英语'
  if (code === 'vi') return '越南'
  if (code === 'th') return '泰国'
  if (code === 'id') return '印尼'
  if (code === 'ms') return '马来西亚'
  if (code === 'zh') return '中文'
  return code || '目标语言'
}

function seedRoleContext(role: TranslationRole, cues: VideoTranslationCue[]) {
  return [
    role.displayName,
    role.description || '',
    ...(role.aliases || []),
    ...cues.flatMap((cue) => [
      cue.sourceText,
      cue.translatedText,
      cue.recognizedText,
      cue.evidence || '',
      cue.performanceDirection || '',
    ]),
  ]
    .filter(Boolean)
    .join('\n')
}

function seedRoleIdentity(role: TranslationRole, context: string) {
  if (/酒吧|夜店|俱乐部|club|bar/i.test(context) && /服务员|侍者|waiter|server/i.test(context))
    return '酒吧服务员'
  if (/服务员|侍者|waiter|server/i.test(context)) return '服务员'
  const description = (role.description || '').split(/[，,。；;：:\n]/)[0]?.trim()
  if (description && description.length <= 12) return description
  const alias = role.aliases.find((item) => item.trim() && !/^画面人物/.test(item.trim()))
  if (alias) return alias.trim()
  return role.displayName
}

function seedRoleAgeGender(context: string, identity: string) {
  if (/女性|女声|女人|女孩|女儿|女主|妈妈|母亲|姐姐|妹妹|小姐|女士|female|woman|girl|mother|sister/i.test(context))
    return '成年女性'
  if (/中年男性|中年男|父亲|爸爸|叔叔|老板|先生|middle-aged man/i.test(context))
    return '中年男性'
  if (/男性|男声|男人|男孩|男主|哥哥|弟弟|年轻男人|male|man|boy|father|brother/i.test(context))
    return /服务员|侍者/.test(identity) ? '中年男性' : '成年男性'
  if (/服务员|侍者/.test(identity)) return '中年男性'
  return '成年角色'
}

function seedRoleVoiceTraits(ageGender: string, identity: string) {
  if (/男性/.test(ageGender) && /服务员|侍者/.test(identity))
    return '浑厚，略微沙哑，响亮，谦逊'
  if (/男性/.test(ageGender)) return '浑厚，略微沙哑，稳重，自然'
  if (/女性/.test(ageGender)) return '清亮，柔和，自然，坚定'
  return '自然，清晰，稳定，贴合角色身份'
}

function seedRoleExampleLine(cues: VideoTranslationCue[], fallbackLine = '') {
  const line = cues
    .map((cue) => cue.translatedText.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sample = line || fallbackLine.trim()
  if (sample.length <= 220) return sample
  return `${sample.slice(0, 220).trim()}。`
}

export function buildVideoTranslationSeedRolePrompt(input: VideoTranslationSeedRolePromptInput) {
  const cues = input.cues.filter(
    (cue) => cue.translationRoleId === input.role.translationRoleId && cue.translatedText.trim(),
  )
  const context = seedRoleContext(input.role, cues)
  const identity = seedRoleIdentity(input.role, context)
  const ageGender = seedRoleAgeGender(context, identity)
  const traits = seedRoleVoiceTraits(ageGender, identity)
  const exampleLine = seedRoleExampleLine(cues, input.fallbackLine)
  return `${identity} 是${languageVoiceLabel(input.language)}${ageGender}，${traits}。\n使用中性、稳定、自然的语气说：${exampleLine}`
}

export function autoGroupVideoTranslationCues(
  cues: VideoTranslationCue[],
  groupIdFactory: () => string,
) {
  const sorted = cues.map((cue) => ({ ...cue, dubbingGroupId: undefined })).sort((a, b) => {
    return a.startMs - b.startMs || a.endMs - b.endMs
  })
  let currentRoleId = ''
  let currentGroup: VideoTranslationCue[] = []
  for (const cue of sorted) {
    if (!cue.translationRoleId || cue.translationRoleId !== currentRoleId) {
      if (currentGroup.length > 1) {
        const groupId = groupIdFactory()
        if (!/^[A-Za-z0-9_-]+$/.test(groupId)) throw new Error('配音组 ID 无效')
        currentGroup.forEach((item) => (item.dubbingGroupId = groupId))
      }
      currentRoleId = cue.translationRoleId || ''
      currentGroup = cue.translationRoleId ? [cue] : []
      continue
    }
    currentGroup.push(cue)
  }
  if (currentGroup.length > 1) {
    const groupId = groupIdFactory()
    if (!/^[A-Za-z0-9_-]+$/.test(groupId)) throw new Error('配音组 ID 无效')
    currentGroup.forEach((item) => (item.dubbingGroupId = groupId))
  }
  videoTranslationDubbingGroups(sorted)
  return sorted
}

export function ungroupVideoTranslationCue(
  cues: VideoTranslationCue[],
  cueId: string,
  remainingGroupId?: string,
) {
  const next = cues.map((cue) => ({ ...cue }))
  const selected = next.find((cue) => cue.cueId === cueId)
  if (!selected?.dubbingGroupId) throw new Error('所选字幕尚未加入配音组')
  const groupId = selected.dubbingGroupId
  selected.dubbingGroupId = undefined
  const remaining = next.filter((cue) => cue.dubbingGroupId === groupId)
  if (remaining.length === 1) remaining[0].dubbingGroupId = undefined
  else if (remainingGroupId) remaining.forEach((cue) => (cue.dubbingGroupId = remainingGroupId))
  return next.sort((a, b) => a.startMs - b.startMs)
}

export type VideoTranslationAction =
  | 'upload-video'
  | 'upload-final-master'
  | 'get-subtitles'
  | 'auto-group-dubbing'
  | 'calibrate-subtitles'
  | 'identify-visual-people'
  | 'translate-all-subtitles'
  | 'open-voice-workspace'
  | 'arrange-doubao-voice'
  | 'generate-target-voice'
  | 'generate-grouped-voice'
  | 'timestamp-target-dialogue'
  | 'separate-source-audio'
  | 'mix-background-audio'
  | 'burn-subtitles-and-voice'
  | 'generate-final-video'

export type VideoTranslationChange =
  | 'source-video'
  | 'final-master-video'
  | 'source-dialogue'
  | 'timing'
  | 'translation'
  | 'role-binding'
  | 'language'
  | 'voice-binding'
  | 'voice-prompt'
  | 'dubbing-group'
  | 'target-voice'
  | 'separation'

export function createVideoTranslationState(): VideoTranslationState {
  return {
    sourceLanguage: 'auto',
    targetLanguage: 'en',
    subtitleSourceMode: 'plain-video',
    durationMs: 0,
    hasAudio: false,
    cues: [],
    voiceVersions: [],
    speakerStatus: 'idle',
    frameCalibrationStatus: 'idle',
    calibrationStatus: 'idle',
    calibrationApplied: false,
    translationStatus: 'idle',
    reviewStatus: 'idle',
    arrangementStatus: 'idle',
    voiceStatus: 'idle',
    separationStatus: 'idle',
    mixStatus: 'idle',
    finalStatus: 'idle',
    originalVocalRemoved: false,
  }
}

export function validateVideoTranslationDialoguePrompt(
  prompt: string,
  block: VideoTranslationDialogueBlock,
) {
  parseVideoTranslationDialoguePrompt(prompt, block)
}

export function parseVideoTranslationDialoguePrompt(
  prompt: string,
  block: VideoTranslationDialogueBlock,
) {
  if (/固定音色|固定声线|不能串音|声音身份|情绪变化不能改变|参考音只锁定/.test(prompt))
    throw new Error(`${block.blockId} 含有压制自然表演的角色约束`)
  if (
    /\[\s*\d+(?:\.\d+)?s?\s*:\s*\d+(?:\.\d+)?s?\s*\]|\b(?:low|medium|high)\b\s*(?:intensity|strength|level|强度|档位)|(?:intensity|strength|level|强度|档位)\s*(?:[:：为是]\s*)?\b(?:low|medium|high)\b|高中低强度/i.test(
      prompt,
    )
  )
    throw new Error(`${block.blockId} 不得包含时间戳或强度档位`)
  const identities: Record<string, string> = {}
  block.references.forEach((reference, index) => {
    const label = reference.label?.split('·')[0]?.trim() || reference.speakerId
    const definition = prompt
      .split('\n')
      .map((line) => line.trim())
      .map(
        (line) =>
          line.match(/^(.+?)是(.+?)，饰演者为@音频(\d+)[。.]?$/) ||
          line.match(/^(.+?)饰演者为@音频(\d+)[。.]?$/),
      )
      .find(
        (match) =>
          match?.[1].trim() === label &&
          Number(match.length === 4 ? match[3] : match[2]) === index + 1,
      )
    if (!definition) throw new Error(`${block.blockId} 缺少${label}的独立角色定义与参考音映射`)
    identities[reference.speakerId] = definition.length === 4 ? definition[2].trim() : ''
  })
  const dialogueLines = prompt
    .split('\n')
    .map((value) => value.trim())
    .map((value) => value.match(/^(.+?)[（(](.+)[）)]\s*[：:]\s*[“"](.+)[”"]$/))
    .filter((value): value is RegExpMatchArray => Boolean(value))
  if (dialogueLines.length !== block.lines.length)
    throw new Error(`${block.blockId} 未按顺序逐行保留全部确认台词`)
  block.lines.forEach((line, index) => {
    const label = block.references
      .find((item) => item.speakerId === line.speakerId)
      ?.label?.split('·')[0]
      ?.trim()
    const output = dialogueLines[index]
    if (output[3] !== line.text) throw new Error(`${block.blockId} 未按顺序逐字保留确认台词`)
    if (label && output[1].trim() !== label)
      throw new Error(`${block.blockId} 的台词缺少角色和自然表演说明：${line.cueId}`)
  })
  return {
    identities,
    lines: block.lines.map((line, index) => ({
      cueId: line.cueId,
      performanceDirection: dialogueLines[index][2].trim(),
      text: dialogueLines[index][3],
    })),
  }
}

function normalizeVideoTranslationDialogueText(value: string) {
  return value.replace(/\s+/g, '').replace(/[“”"']/g, '').trim()
}

export function validateVideoTranslationGroupedPrompt(
  prompt: string,
  block: VideoTranslationDialogueBlock,
) {
  if (block.references.length !== 1 || block.speakerIds.length !== 1)
    throw new Error(`${block.blockId} 必须只包含一个角色参考音`)
  const durationMs = Math.max(
    0,
    block.lines.at(-1)!.expectedEndMs - block.lines[0].expectedStartMs,
  )
  const durationSeconds = (durationMs / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  const lines = prompt
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  const firstLine = lines[0] || ''
  if (!new RegExp(`^这是一段\\s*${durationSeconds}\\s*秒的专业的配音表演艺术家在顶级录音棚内的配音片段，饰演者为@音频1[。.]$`).test(firstLine))
    throw new Error(`${block.blockId} 首句缺少${durationSeconds}秒时长`)
  if (lines.some((line, index) => index > 0 && /^.+?是.+?饰演者为@音频\d+[。.]?$/.test(line)))
    throw new Error(`${block.blockId} 分组稿不得包含角色声音定义`)
  if (prompt.includes('画面人物') || prompt.includes('所有画面人物'))
    throw new Error(`${block.blockId} 分组稿不得包含画面人物介绍`)
  const dialogueTexts = [...prompt.matchAll(/[“"]([^”"]+)[”"]/g)].map((match) => match[1])
  if (!dialogueTexts.length) throw new Error(`${block.blockId} 未按顺序逐字保留全部确认台词`)
  let cursor = 0
  for (const text of dialogueTexts) {
    let merged = ''
    let end = cursor
    while (end < block.lines.length) {
      merged += block.lines[end].text
      if (normalizeVideoTranslationDialogueText(merged) === normalizeVideoTranslationDialogueText(text))
        break
      end += 1
    }
    if (end >= block.lines.length)
      throw new Error(`${block.blockId} 未按顺序逐字保留全部确认台词`)
    cursor = end + 1
  }
  if (cursor !== block.lines.length)
    throw new Error(`${block.blockId} 未按顺序逐字保留全部确认台词`)
  return {
    identities: {},
    lines: dialogueTexts.map((text) => ({ label: '', performance: '', text })),
  }
}

export function compactVideoTranslationVoiceIdentity(identity: string) {
  return identity
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^使用/.test(line))
    ?.replace(/[。.]$/, '')
    .trim()
}

function promptSections(markdown: string) {
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

export function planVideoTranslationGroupedDialogueBlocks(
  globalPromptMarkdown: string,
  globalArrangement: VideoTranslationDialogueArrangement,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  references: SeedAudioReference[],
  overrides: Record<string, string> = {},
): VideoTranslationGroupedPlan {
  validateConfirmedTranslation(cues, roles, globalArrangement.durationMs)
  const sections = promptSections(globalPromptMarkdown)
  const performanceByCue = new Map<string, string>()
  const identityByCue = new Map<string, string>()
  for (const block of globalArrangement.blocks) {
    const prompt = sections.get(block.blockId)
    if (!prompt) throw new Error(`${block.blockId} 缺少全局配音提示词`)
    const parsed = parseVideoTranslationDialoguePrompt(prompt, block)
    for (const line of parsed.lines) {
      performanceByCue.set(line.cueId, line.performanceDirection)
      const sourceLine = block.lines.find((item) => item.cueId === line.cueId)!
      identityByCue.set(line.cueId, parsed.identities[sourceLine.speakerId] || '')
    }
  }
  const cueById = new Map(cues.map((cue) => [cue.cueId, cue]))
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const referenceBySpeaker = new Map(
    references.map((reference) => [reference.speakerId, reference]),
  )
  const prompts: Record<string, string> = {}
  const blocks = videoTranslationDubbingGroups(cues).map((group) => {
    const role = roleById.get(group.speakerId)
    const reference = referenceBySpeaker.get(group.speakerId)
    if (
      !role ||
      !role.voiceProfileId ||
      !videoTranslationRoleVoiceLanguageMatches(role, globalArrangement.targetLanguage) ||
      !role.voiceConfirmedAt ||
      !reference?.referenceAudioPath?.trim()
    )
      throw new Error(`${group.speakerId} 缺少已确认角色声音`)
    const lines = group.cueIds.map((cueId) => {
      const cue = cueById.get(cueId)!
      return {
        cueId,
        speakerId: group.speakerId,
        text: cue.translatedText.trim(),
        performanceEvidence: performanceByCue.get(cueId) || cue.performanceDirection?.trim() || '自然表达',
        expectedStartMs: cue.startMs,
        expectedEndMs: cue.endMs,
      }
    })
    const block: VideoTranslationDialogueBlock = {
      blockId: group.groupId,
      cueIds: [...group.cueIds],
      speakerIds: [group.speakerId],
      references: [{ ...reference, label: role.displayName }],
      lines,
    }
    const durationMs = Math.max(0, lines.at(-1)!.expectedEndMs - lines[0].expectedStartMs)
    const durationSeconds = (durationMs / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    const segments = lines.map((line, index) => {
      const connector =
        lines.length === 1
          ? ''
          : index === 0
            ? '先是'
            : index === lines.length - 1
              ? '最后'
              : index === 1
                ? '随后'
                : '接着'
      return `${connector}${line.performanceEvidence}：“${line.text}”`
    })
    const generated = [
      `这是一段${durationSeconds}秒的专业的配音表演艺术家在顶级录音棚内的配音片段，饰演者为@音频1。`,
      '',
      `${segments.join(' ')} 整段一气呵成，不逐句重新起音。`,
    ].join('\n')
    const prompt = overrides[group.groupId]?.trim() || generated
    validateVideoTranslationGroupedPrompt(prompt, block)
    prompts[group.groupId] = prompt
    return block
  })
  return {
    arrangement: { ...globalArrangement, blocks },
    prompts,
    promptMarkdown: [
      '# 分组克隆提示词',
      '',
      ...blocks.map((block) => `## ${block.blockId}\n\n${prompts[block.blockId]}`),
    ]
      .join('\n\n')
      .trim(),
  }
}

function actionable(status: ArtifactStatus) {
  return status === 'idle' || status === 'failed' || status === 'stale'
}

function invalidate(status: ArtifactStatus): ArtifactStatus {
  if (status === 'ready') return 'stale'
  if (status === 'running' || status === 'failed') return 'idle'
  return status
}

function hasCompleteGroupedVoiceVersion(state: VideoTranslationState) {
  const cueIds = new Set(state.cues.map((cue) => cue.cueId))
  if (!cueIds.size) return false
  return state.voiceVersions.some((version) => {
    if (version.route !== 'grouped' || !version.blocks?.length) return false
    const versionCueIds = new Set(version.blocks.flatMap((block) => block.cueIds))
    return versionCueIds.size === cueIds.size && [...cueIds].every((cueId) => versionCueIds.has(cueId))
  })
}

export function videoTranslationRoleVoiceLanguageMatches(
  role: TranslationRole | undefined,
  language: string,
) {
  const voiceLanguage = role?.voiceLanguage || (language === 'en' ? 'en' : '')
  return Boolean(role && voiceLanguage === language)
}

export function videoTranslationRoleVoiceReady(role: TranslationRole | undefined, language: string) {
  return Boolean(
    role?.voiceProfileId &&
      videoTranslationRoleVoiceLanguageMatches(role, language) &&
      role.voiceIdentityText?.trim() &&
      role.voiceConfirmedAt,
  )
}

export function availableVideoTranslationActions(
  state: VideoTranslationState,
  roles: TranslationRole[],
): VideoTranslationAction[] {
  const actions: VideoTranslationAction[] = ['upload-video']
  if (!state.sourceVideoPath) return actions
  actions.push('upload-final-master')
  actions.push('get-subtitles')
  if (!state.hasAudio && state.speakerStatus !== 'ready') return actions
  if (state.speakerStatus !== 'ready') return actions
  if (state.cues.length) actions.push('identify-visual-people', 'calibrate-subtitles')
  if (state.cues.length > 1 && state.cues.every((cue) => cue.translationRoleId))
    actions.push('auto-group-dubbing')
  if (
    state.speakerStatus === 'ready' &&
    state.cues.length > 0 &&
    state.cues.every((cue) => cue.sourceText.trim())
  )
    actions.push('translate-all-subtitles')
  if (
    state.speakerStatus === 'ready' &&
    state.translationStatus === 'ready' &&
    state.reviewStatus !== 'running'
  )
    actions.push('open-voice-workspace')
  if (state.reviewStatus !== 'ready') return actions
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const dialogueReady = state.cues.every(
    (cue) =>
      cue.sourceText.trim() &&
      cue.translatedText.trim() &&
      cue.translationRoleId &&
      videoTranslationRoleVoiceReady(roleById.get(cue.translationRoleId), state.targetLanguage),
  )
  if (dialogueReady && (actionable(state.arrangementStatus) || state.voiceStatus === 'failed'))
    actions.push('arrange-doubao-voice')
  if (state.arrangementStatus === 'ready' && actionable(state.voiceStatus))
    actions.push('generate-target-voice')
  const activeVersion = state.voiceVersions.find(
    (version) => version.versionId === state.activeVoiceVersionId,
  )
  if (
    activeVersion &&
    activeVersion.finalScriptId === state.finalScriptId &&
    activeVersion.scriptHash === state.scriptHash
  )
    actions.push('timestamp-target-dialogue')
  if (actionable(state.separationStatus)) actions.push('separate-source-audio')
  else if (
    state.separationStatus === 'ready' &&
    (state.targetVoicePath || hasCompleteGroupedVoiceVersion(state))
  )
    actions.push('mix-background-audio')
  if (state.mixStatus === 'ready') actions.push('burn-subtitles-and-voice')
  if (
    state.sourceVideoPath &&
    state.finalMasterVideoPath &&
    (state.targetVoicePath || hasCompleteGroupedVoiceVersion(state))
  )
    actions.push('generate-final-video')
  return actions
}

export function invalidateVideoTranslation(
  state: VideoTranslationState,
  change: VideoTranslationChange,
): VideoTranslationState {
  const next = { ...state, cues: state.cues.map((cue) => ({ ...cue })) }
  if (change === 'source-video') {
    const fresh = createVideoTranslationState()
    fresh.sourceLanguage = state.sourceLanguage
    fresh.targetLanguage = state.targetLanguage
    return fresh
  }
  if (change === 'final-master-video') {
    next.separationStatus = invalidate(next.separationStatus)
    next.mixStatus = invalidate(next.mixStatus)
    next.finalStatus = invalidate(next.finalStatus)
    next.vocalPath = undefined
    next.instrumentPath = undefined
    next.mixedPath = undefined
    next.finalVideoPath = undefined
    next.originalVocalRemoved = false
    return next
  }
  if (change === 'dubbing-group') {
    next.groupedVoicePrompts = undefined
    const active = next.voiceVersions.find(
      (version) => version.versionId === next.activeVoiceVersionId,
    )
    if (active?.route === 'grouped') {
      next.activeVoiceVersionId = undefined
      next.targetVoicePath = undefined
      next.dubDialogueTimestampPath = undefined
      next.dubDialogueTimestampHash = undefined
      next.voiceStatus = invalidate(next.voiceStatus)
      next.mixStatus = invalidate(next.mixStatus)
      next.finalStatus = invalidate(next.finalStatus)
    }
    return next
  }
  if (change === 'source-dialogue') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => {
      cue.translatedText = ''
    })
  } else if (change === 'translation') {
    next.reviewStatus = invalidate(next.reviewStatus)
  } else if (change === 'role-binding') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => {
      cue.dubbingGroupId = undefined
    })
  } else if (change === 'timing') {
    next.reviewStatus = invalidate(next.reviewStatus)
    next.frameCalibrationStatus = invalidate(next.frameCalibrationStatus)
    next.cues.forEach((cue) => {
      cue.frameSuggestion = undefined
      cue.framePath = undefined
      cue.visiblePersonIds = undefined
      cue.frameCalibrationBackupText = undefined
    })
  } else if (change === 'language') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => {
      cue.translatedText = ''
    })
  }
  if (['source-dialogue', 'translation', 'role-binding', 'timing', 'language'].includes(change)) {
    next.finalScriptId = undefined
    next.scriptHash = undefined
    next.finalScriptMarkdown = undefined
    next.seedArrangementPath = undefined
    next.seedPromptPath = undefined
    next.seedPromptText = undefined
    next.seedPromptGeneratedBySkill = undefined
  }
  if (change === 'voice-binding') {
    next.seedArrangementPath = undefined
    next.seedPromptPath = undefined
    next.seedPromptText = undefined
    next.seedPromptGeneratedBySkill = undefined
    next.groupedVoicePrompts = undefined
  }
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'timing',
      'language',
      'voice-prompt',
    ].includes(change)
  )
    next.arrangementStatus = invalidate(next.arrangementStatus)
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'timing',
      'language',
      'voice-prompt',
    ].includes(change)
  )
    next.voiceStatus = invalidate(next.voiceStatus)
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'timing',
      'language',
      'voice-prompt',
      'target-voice',
    ].includes(change)
  ) {
    next.activeVoiceVersionId = undefined
    next.targetVoicePath = undefined
    next.dubDialogueTimestampPath = undefined
    next.dubDialogueTimestampHash = undefined
  }
  if (
    [
      'source-dialogue',
      'role-binding',
      'timing',
      'language',
      'voice-prompt',
    ].includes(change)
  )
    next.groupedVoicePrompts = undefined
  if (change !== 'separation' && change !== 'voice-binding')
    next.mixStatus = invalidate(next.mixStatus)
  if (change === 'target-voice' || change === 'separation')
    next.mixStatus = invalidate(next.mixStatus)
  if (change !== 'voice-binding') next.finalStatus = invalidate(next.finalStatus)
  return next
}

export function validateConfirmedTranslation(
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  durationMs = Number.POSITIVE_INFINITY,
) {
  if (!cues.length) throw new Error('没有可确认的字幕')
  const roleIds = new Set(roles.map((role) => role.translationRoleId))
  const cueIds = new Set<string>()
  for (const cue of cues) {
    if (
      !cue.cueId?.trim() ||
      cueIds.has(cue.cueId) ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs <= cue.startMs ||
      cue.endMs > durationMs ||
      !cue.sourceText?.trim() ||
      !cue.translatedText?.trim() ||
      !cue.translationRoleId ||
      !roleIds.has(cue.translationRoleId)
    )
      throw new Error('角色与字幕确认内容无效')
    cueIds.add(cue.cueId)
  }
  return cues
}

export function planVideoTranslationDialogueBlocks(
  episodeId: string,
  durationMs: number,
  targetLanguage: string,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  references: SeedAudioReference[],
  finalScriptId = '',
  scriptHash = '',
): VideoTranslationDialoguePlan {
  validateConfirmedTranslation(cues, roles, durationMs)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('原片时长无效')
  const referenceBySpeaker = new Map(references.map((item) => [item.speakerId, item]))
  const roleBySpeaker = new Map(roles.map((role) => [role.translationRoleId, role]))
  const blocks: VideoTranslationDialogueBlock[] = []
  let current: VideoTranslationDialogueBlock | undefined
  for (const cue of cues
    .slice()
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)) {
    const speakerId = cue.translationRoleId!
    if (!videoTranslationRoleVoiceReady(roleBySpeaker.get(speakerId), targetLanguage))
      throw new Error(`${speakerId} 缺少当前目标语言的已确认角色声音`)
    const reference = referenceBySpeaker.get(speakerId)
    if (!reference?.referenceAudioPath?.trim()) throw new Error(`${speakerId} 缺少绑定参考音`)
    if (current && !current.speakerIds.includes(speakerId) && current.speakerIds.length === 3)
      current = undefined
    if (!current) {
      current = {
        blockId: `voice-block-${String(blocks.length + 1).padStart(3, '0')}`,
        cueIds: [],
        speakerIds: [],
        references: [],
        lines: [],
      }
      blocks.push(current)
    }
    if (!current.speakerIds.includes(speakerId)) {
      current.speakerIds.push(speakerId)
      current.references.push(reference)
    }
    current.cueIds.push(cue.cueId)
    current.lines.push({
      cueId: cue.cueId,
      speakerId,
      text: cue.translatedText.trim(),
      performanceEvidence: cue.performanceDirection?.trim() || '',
      expectedStartMs: cue.startMs,
      expectedEndMs: cue.endMs,
    })
  }
  const arrangement: VideoTranslationDialogueArrangement = {
    schemaVersion: 1,
    episodeId,
    targetLanguage,
    finalScriptId,
    scriptHash,
    durationMs,
    blocks,
  }
  return { arrangement }
}
