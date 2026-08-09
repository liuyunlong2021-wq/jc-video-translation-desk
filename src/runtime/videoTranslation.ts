import type { ArtifactStatus } from './productionContract.ts'
import type { SeedAudioReference } from './seedAudio.ts'

export type WorkspaceEntry = 'content-create' | 'video-translate'

export interface TranslationRole {
  translationRoleId: string
  displayName: string
  visualPersonId?: string
  aliases: string[]
  description?: string
  screenshotId?: string
  linkedCreativeRoleId?: string
  voiceProfileId?: string
  voiceIdentityText?: string
  voiceConfirmedAt?: string
  sourceEpisodeIds: string[]
  status: 'confirmed'
}

export interface VideoTranslationCue {
  cueId: string
  startMs: number
  endMs: number
  recognizedText: string
  sourceText: string
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

export interface VideoTranslationState {
  sourceVideoPath?: string
  sourceFingerprint?: string
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
  blocks?: Array<{
    voiceBlockId: string
    cueIds: string[]
    audioPath: string
    audioHash: string
    durationMs: number
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
  current.translatedText = ''
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

export type VideoTranslationAction =
  | 'upload-video'
  | 'upload-final-master'
  | 'reverse-video'
  | 'calibrate-subtitles'
  | 'calibrate-frames'
  | 'translate-all-subtitles'
  | 'open-voice-workspace'
  | 'arrange-doubao-voice'
  | 'generate-target-voice'
  | 'timestamp-target-dialogue'
  | 'separate-source-audio'
  | 'mix-background-audio'
  | 'burn-subtitles-and-voice'

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
  | 'target-voice'
  | 'separation'

export function createVideoTranslationState(): VideoTranslationState {
  return {
    sourceLanguage: 'auto',
    targetLanguage: 'en',
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
  block.references.forEach((reference, index) => {
    const label = reference.label?.split('·')[0]?.trim() || reference.speakerId
    if (
      !prompt
        .split('\n')
        .some((line) => line.includes(label) && line.includes(`饰演者为@音频${index + 1}`))
    )
      throw new Error(`${block.blockId} 缺少${label}的独立角色定义与参考音映射`)
  })
  if (/固定音色|固定声线|不能串音|声音身份|情绪变化不能改变|参考音只锁定/.test(prompt))
    throw new Error(`${block.blockId} 含有压制自然表演的角色约束`)
  if (
    /\[\s*\d+(?:\.\d+)?s?\s*:\s*\d+(?:\.\d+)?s?\s*\]|\b(?:low|medium|high)\b\s*(?:intensity|strength|level|强度|档位)|(?:intensity|strength|level|强度|档位)\s*(?:[:：为是]\s*)?\b(?:low|medium|high)\b|高中低强度/i.test(
      prompt,
    )
  )
    throw new Error(`${block.blockId} 不得包含时间戳或强度档位`)
  const dialogueLines = prompt
    .split('\n')
    .map((value) => value.trim())
    .map((value) => value.match(/^(.+?)[（(].+[）)]\s*[：:]\s*[“"](.+)[”"]$/))
    .filter((value): value is RegExpMatchArray => Boolean(value))
  if (dialogueLines.length !== block.lines.length)
    throw new Error(`${block.blockId} 未按顺序逐行保留全部确认台词`)
  block.lines.forEach((line, index) => {
    const label = block.references
      .find((item) => item.speakerId === line.speakerId)
      ?.label?.split('·')[0]
      ?.trim()
    const output = dialogueLines[index]
    if (output[2] !== line.text) throw new Error(`${block.blockId} 未按顺序逐字保留确认台词`)
    if (label && output[1].trim() !== label)
      throw new Error(`${block.blockId} 的台词缺少角色和自然表演说明：${line.cueId}`)
  })
}

function actionable(status: ArtifactStatus) {
  return status === 'idle' || status === 'failed' || status === 'stale'
}

function invalidate(status: ArtifactStatus): ArtifactStatus {
  if (status === 'ready') return 'stale'
  if (status === 'running' || status === 'failed') return 'idle'
  return status
}

export function availableVideoTranslationActions(
  state: VideoTranslationState,
  roles: TranslationRole[],
): VideoTranslationAction[] {
  const actions: VideoTranslationAction[] = ['upload-video']
  if (!state.sourceVideoPath) return actions
  actions.push('upload-final-master')
  if (!state.hasAudio) return actions
  actions.push('reverse-video')
  if (state.speakerStatus !== 'ready') return actions
  if (state.cues.length) actions.push('calibrate-frames', 'calibrate-subtitles')
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
      roleById.get(cue.translationRoleId)?.voiceProfileId &&
      roleById.get(cue.translationRoleId)?.voiceIdentityText &&
      roleById.get(cue.translationRoleId)?.voiceConfirmedAt,
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
    activeVersion.scriptHash === state.scriptHash &&
    !state.dubDialogueTimestampHash
  )
    actions.push('timestamp-target-dialogue')
  if (actionable(state.separationStatus)) actions.push('separate-source-audio')
  else if (
    state.separationStatus === 'ready' &&
    state.dubDialogueTimestampHash &&
    state.voiceStatus === 'ready' &&
    actionable(state.mixStatus)
  )
    actions.push('mix-background-audio')
  if (state.mixStatus === 'ready' && actionable(state.finalStatus))
    actions.push('burn-subtitles-and-voice')
  return actions
}

export function videoTranslationRoleBindingTargets(
  cues: VideoTranslationCue[],
  cueId: string,
  batchSameSpeaker: boolean,
  batchSameVisualPerson: boolean,
) {
  const selected = cues.find((cue) => cue.cueId === cueId)
  if (!selected) return []
  const speaker = batchSameSpeaker ? selected.speakerCluster?.trim() : undefined
  const visualPerson =
    batchSameVisualPerson && selected.visiblePersonIds?.length === 1
      ? selected.visiblePersonIds[0]
      : undefined
  return cues.filter(
    (cue) =>
      cue === selected ||
      (speaker && cue.speakerCluster?.trim() === speaker) ||
      (visualPerson &&
        cue.visiblePersonIds?.length === 1 &&
        cue.visiblePersonIds[0] === visualPerson),
  )
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
  }
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'timing',
      'language',
      'voice-binding',
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
      'voice-binding',
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
      'voice-binding',
      'voice-prompt',
      'target-voice',
    ].includes(change)
  ) {
    next.activeVoiceVersionId = undefined
    next.targetVoicePath = undefined
    next.dubDialogueTimestampPath = undefined
    next.dubDialogueTimestampHash = undefined
  }
  if (change !== 'separation') next.mixStatus = invalidate(next.mixStatus)
  if (change === 'target-voice' || change === 'separation')
    next.mixStatus = invalidate(next.mixStatus)
  next.finalStatus = invalidate(next.finalStatus)
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
  const blocks: VideoTranslationDialogueBlock[] = []
  let current: VideoTranslationDialogueBlock | undefined
  for (const cue of cues
    .slice()
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)) {
    const speakerId = cue.translationRoleId!
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
