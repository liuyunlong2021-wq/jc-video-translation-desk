import type { ArtifactStatus } from './productionContract.ts'
import {
  planSeedAudioArrangement,
  type SeedAudioArrangement,
  type SeedAudioReference,
} from './seedAudio.ts'

export type WorkspaceEntry = 'content-create' | 'video-translate'

export interface TranslationRole {
  translationRoleId: string
  displayName: string
  aliases: string[]
  description?: string
  linkedCreativeRoleId?: string
  voiceProfileId?: string
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
  translationRoleId?: string
  proposedName?: string
  confidence?: number
  evidence?: string
  needsReview: boolean
  voicePath?: string
}

export interface VideoTranslationState {
  sourceVideoPath?: string
  sourceFingerprint?: string
  sourceLanguage: string
  targetLanguage: string
  durationMs: number
  hasAudio: boolean
  sourceTranscriptPath?: string
  sourceSrtPath?: string
  contextPath?: string
  confirmedDialoguePath?: string
  seedArrangementPath?: string
  seedPromptPath?: string
  seedPromptText?: string
  targetVoicePath?: string
  vocalPath?: string
  instrumentPath?: string
  mixedPath?: string
  finalVideoPath?: string
  cues: VideoTranslationCue[]
  transcriptStatus: ArtifactStatus
  speakerStatus: ArtifactStatus
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

export interface VideoTranslationSeedPlan {
  arrangement: SeedAudioArrangement
  promptMarkdown: string
}

export interface VideoTranslationVoiceLine {
  cueId?: string
  text: string
  startMs: number
  endMs: number
}

export interface VideoTranslationWhisperCue {
  startMs: number
  endMs: number
  recognizedText: string
}

export interface VideoTranslationVoiceAlignment {
  cueId: string
  text: string
  expectedStartMs: number
  expectedEndMs: number
  observedStartMs: number
  observedEndMs: number
  whisperText: string
}

export function validateVideoTranslationVoiceAlignment(
  lines: VideoTranslationVoiceLine[],
  whisperCues: VideoTranslationWhisperCue[],
  taskStartMs = 0,
  toleranceMs = 750,
): VideoTranslationVoiceAlignment[] {
  if (!lines.length) throw new Error('翻译配音任务没有已确认台词')
  if (!whisperCues.length) throw new Error('翻译配音没有识别到目标语言人声')
  if (!Number.isFinite(taskStartMs) || !Number.isFinite(toleranceMs) || toleranceMs < 0)
    throw new Error('翻译配音时间校验参数无效')
  let cursor = 0
  const aligned: VideoTranslationVoiceAlignment[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const expectedStartMs = line.startMs - taskStartMs
    const expectedEndMs = line.endMs - taskStartMs
    if (!Number.isFinite(expectedStartMs) || !Number.isFinite(expectedEndMs) || expectedEndMs <= expectedStartMs)
      throw new Error(`第 ${index + 1} 条翻译台词时间无效`)
    const matches: VideoTranslationWhisperCue[] = []
    const remainingLines = lines.length - index - 1
    while (cursor < whisperCues.length) {
      const cue = whisperCues[cursor]
      if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.endMs <= cue.startMs)
        throw new Error('翻译配音 Whisper 时间轴无效')
      const midpoint = (cue.startMs + cue.endMs) / 2
      if (midpoint < expectedStartMs - toleranceMs)
        throw new Error(`第 ${index + 1} 条翻译台词缺少对应人声`)
      if (midpoint > expectedEndMs + toleranceMs) break
      matches.push(cue)
      cursor++
      if (whisperCues.length - cursor <= remainingLines) break
    }
    if (!matches.length) throw new Error(`第 ${index + 1} 条翻译台词缺少对应人声`)
    const observedStartMs = Math.min(...matches.map((cue) => cue.startMs))
    const observedEndMs = Math.max(...matches.map((cue) => cue.endMs))
    if (
      observedStartMs < expectedStartMs - toleranceMs ||
      observedEndMs > expectedEndMs + toleranceMs
    ) throw new Error(`第 ${index + 1} 条翻译台词超出时间窗`)
    aligned.push({
      cueId: line.cueId || `translation-line-${String(index + 1).padStart(3, '0')}`,
      text: line.text.trim(),
      expectedStartMs: line.startMs,
      expectedEndMs: line.endMs,
      observedStartMs: observedStartMs + taskStartMs,
      observedEndMs: observedEndMs + taskStartMs,
      whisperText: matches.map((cue) => cue.recognizedText.trim()).filter(Boolean).join(' '),
    })
  }
  if (cursor !== whisperCues.length) throw new Error('翻译配音包含确认台词之外的人声')
  return aligned
}

export type VideoTranslationAction =
  | 'upload-video'
  | 'generate-source-subtitles'
  | 'identify-speakers'
  | 'translate-all-subtitles'
  | 'confirm-speakers-and-subtitles'
  | 'arrange-doubao-voice'
  | 'generate-target-voice'
  | 'separate-source-audio'
  | 'remove-original-vocal'
  | 'mix-background-audio'
  | 'burn-subtitles-and-voice'

export type VideoTranslationChange =
  | 'source-video'
  | 'source-dialogue'
  | 'translation'
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
    transcriptStatus: 'idle',
    speakerStatus: 'idle',
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
  if (!state.sourceVideoPath || !state.hasAudio) return actions
  if (actionable(state.transcriptStatus)) return [...actions, 'generate-source-subtitles']
  if (state.transcriptStatus !== 'ready') return actions
  if (actionable(state.speakerStatus)) actions.push('identify-speakers')
  if (actionable(state.translationStatus)) actions.push('translate-all-subtitles')
  if (
    state.speakerStatus === 'ready' &&
    state.translationStatus === 'ready' &&
    actionable(state.reviewStatus)
  ) actions.push('confirm-speakers-and-subtitles')
  if (state.reviewStatus !== 'ready') return actions
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const dialogueReady = state.cues.every((cue) =>
    cue.sourceText.trim() && cue.translatedText.trim() && cue.translationRoleId && roleById.get(cue.translationRoleId)?.voiceProfileId,
  )
  if (dialogueReady && actionable(state.arrangementStatus)) actions.push('arrange-doubao-voice')
  if (state.arrangementStatus === 'ready' && actionable(state.voiceStatus))
    actions.push('generate-target-voice')
  if (actionable(state.separationStatus)) actions.push('separate-source-audio')
  else if (state.separationStatus === 'ready' && !state.originalVocalRemoved)
    actions.push('remove-original-vocal')
  else if (state.originalVocalRemoved && state.voiceStatus === 'ready' && actionable(state.mixStatus))
    actions.push('mix-background-audio')
  if (state.mixStatus === 'ready' && actionable(state.finalStatus))
    actions.push('burn-subtitles-and-voice')
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
  if (change === 'source-dialogue') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
  } else if (change === 'translation') {
    next.reviewStatus = invalidate(next.reviewStatus)
  } else if (change === 'language') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => { cue.translatedText = '' })
  }
  if (['source-dialogue', 'translation', 'language', 'voice-binding'].includes(change))
    next.arrangementStatus = invalidate(next.arrangementStatus)
  if (['source-dialogue', 'translation', 'language', 'voice-binding', 'voice-prompt'].includes(change))
    next.voiceStatus = invalidate(next.voiceStatus)
  if (change !== 'separation') next.mixStatus = invalidate(next.mixStatus)
  if (change === 'target-voice' || change === 'separation') next.mixStatus = invalidate(next.mixStatus)
  next.finalStatus = invalidate(next.finalStatus)
  return next
}

export function validateConfirmedTranslation(
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
) {
  if (!cues.length) throw new Error('没有可确认的字幕')
  const roleIds = new Set(roles.map((role) => role.translationRoleId))
  let previousEnd = 0
  const cueIds = new Set<string>()
  for (const cue of cues) {
    if (
      !cue.cueId?.trim() || cueIds.has(cue.cueId) ||
      !Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) ||
      cue.startMs < previousEnd || cue.endMs <= cue.startMs ||
      !cue.sourceText?.trim() || !cue.translatedText?.trim() ||
      !cue.translationRoleId || !roleIds.has(cue.translationRoleId)
    ) throw new Error('角色与字幕确认内容无效')
    cueIds.add(cue.cueId)
    previousEnd = cue.endMs
  }
  return cues
}

export function planVideoTranslationSeed(
  episodeId: string,
  durationMs: number,
  targetLanguage: string,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  references: SeedAudioReference[],
): VideoTranslationSeedPlan {
  validateConfirmedTranslation(cues, roles)
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const arrangement = planSeedAudioArrangement({
    segmentId: `video-translation-${episodeId}`,
    startMs: 0,
    endMs: durationMs,
    lines: cues.map((cue) => ({
      speakerId: cue.translationRoleId,
      text: cue.translatedText.trim(),
      startMs: cue.startMs,
      endMs: cue.endMs,
    })),
    references,
  })
  arrangement.tasks = arrangement.tasks.map((task) => ({
    ...task,
    mode: 'timeline-voice',
    includeMusicAndEffects: false,
  }))
  const promptMarkdown = [
    '# 豆包语音稿',
    '',
    ...arrangement.tasks.flatMap((task) => [
      `## ${task.taskId}`,
      '',
      `只生成${targetLanguage}的干净对白人声。禁止音乐、环境声、动作音效、旁白补写和额外台词。严格按毫秒时间窗留白，不改写台词。`,
      ...task.lines.map((line) =>
        `- ${line.startMs}-${line.endMs}ms | ${roleById.get(line.speakerId!)?.displayName || line.speakerId}: ${line.text}`,
      ),
      '',
    ]),
  ].join('\n').trim()
  return { arrangement, promptMarkdown }
}
