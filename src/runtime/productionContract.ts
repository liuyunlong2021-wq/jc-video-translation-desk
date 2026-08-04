export type ProductionRoute = 'narration-promo' | 'drama'
export type ArtifactStatus = 'idle' | 'running' | 'ready' | 'failed' | 'stale'
export type OutputLanguage = 'zh' | 'en'
export type AdoptedBy = 'gemini' | 'user'
export type AudioMode = 'keep-original' | 'replace-preserve-ambience' | 'replace-all'

export interface MaterialTranscriptCue {
  cueId: string
  mediaId: string
  startMs: number
  endMs: number
  recognizedText: string
}

export interface MaterialTranscript {
  schemaVersion: 1
  mediaId: string
  sourceMediaPath: string
  durationMs: number
  cues: MaterialTranscriptCue[]
}

export interface EditingTimelineDialogue {
  speakerId: string
  text: string
  emotion: string
  sourceStartMs?: number
  sourceEndMs?: number
  outputStartMs: number
  outputEndMs: number
}

export interface EditingTimelineShot {
  shotId: string
  promptSegmentId: string
  sourceMediaId: string
  sourceVideoPath: string
  sourceDurationMs: number
  geminiStartMs: number
  geminiEndMs: number
  adoptedStartMs: number
  adoptedEndMs: number
  adoptedBy: AdoptedBy
  revision: number
  outputStartMs: number
  outputEndMs: number
  observedContent: string
  subtitleCueIds: string[]
  speakerIds: string[]
  confidence: number
  needsReview: boolean
  dialogue?: EditingTimelineDialogue
}

export interface EditingTimeline {
  schemaVersion: 2
  route: ProductionRoute
  shots: EditingTimelineShot[]
}

export interface DialogueAsset {
  dialogueId: string
  editPointId: string
  speakerId: string
  text: string
  emotion: string
  sourceMediaId: string
  targetStartMs: number
  targetEndMs: number
  audioPath: string
  actualDurationMs: number
  status: ArtifactStatus
}

export interface AudioProcessingRecord {
  schemaVersion: 1
  audioMode: AudioMode
  vocalPath?: string
  instrumentPath?: string
  mixedAudioPath?: string
  status: ArtifactStatus
}

export interface PostProductionState {
  route: ProductionRoute
  materialSrt: ArtifactStatus
  editingTimeline: ArtifactStatus
  chineseVoice: ArtifactStatus
  englishSubtitles: ArtifactStatus
  englishVoice: ArtifactStatus
  sourceSeparation: ArtifactStatus
  originalVocalRemoved: boolean
  finalMix: ArtifactStatus
  finalVideo: ArtifactStatus
  outputLanguage: OutputLanguage
  audioMode: AudioMode
}

export type PostProductionAction =
  | 'generate-srt'
  | 'generate-editing-timeline'
  | 'reselect-edit-point'
  | 'generate-chinese-voice'
  | 'translate-subtitles'
  | 'generate-english-voice'
  | 'separate-source-audio'
  | 'remove-original-vocal'
  | 'mix-background-audio'
  | 'burn-voice-and-subtitles'

export type PostProductionChange = 'source-video' | 'edit-point' | 'chinese-text' | 'output-language'

export const PRODUCTION_ARTIFACT_PATHS = {
  materialTranscript: 'wiki/转录/episode-001/<mediaId>-whisper.json',
  materialSrt: 'wiki/字幕/素材/<mediaId>-whisper.srt',
  editingTimeline: 'wiki/剪辑/episode-001/editing-timeline.json',
  dialogueAssets: 'wiki/声音/episode-001/对白资产.json',
  audioProcessing: 'wiki/声音/episode-001/音频处理.json',
  chineseSubtitles: 'wiki/字幕/episode-001-zh.srt',
  englishSubtitles: 'wiki/字幕/episode-001-en.srt',
  finalVideo: 'wiki/成片/episode-001.md',
  episodeIndex: 'wiki/制作/episode-001.md',
} as const

export function validateMaterialTranscript(transcript: MaterialTranscript) {
  if (
    transcript?.schemaVersion !== 1 ||
    !transcript.mediaId?.trim() ||
    !transcript.sourceMediaPath?.trim() ||
    !Number.isFinite(transcript.durationMs) ||
    transcript.durationMs <= 0 ||
    !Array.isArray(transcript.cues)
  )
    throw new Error('素材转录无效')

  let endMs = 0
  const cueIds = new Set<string>()
  for (const cue of transcript.cues) {
    if (
      !cue.cueId?.trim() ||
      cueIds.has(cue.cueId) ||
      cue.mediaId !== transcript.mediaId ||
      !cue.recognizedText?.trim() ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.startMs >= cue.endMs ||
      cue.endMs > transcript.durationMs
    )
      throw new Error('素材转录 cue 无效')
    if (cue.startMs < endMs) throw new Error('素材转录 cue 时间重叠')
    cueIds.add(cue.cueId)
    endMs = cue.endMs
  }
  return transcript
}

export function createPostProductionState(
  route: ProductionRoute,
  options: {
    narrationReady?: boolean
    audioMode?: AudioMode
    outputLanguage?: OutputLanguage
  } = {},
): PostProductionState {
  return {
    route,
    materialSrt: 'idle',
    editingTimeline: 'idle',
    chineseVoice: route === 'narration-promo' && options.narrationReady ? 'ready' : 'idle',
    englishSubtitles: 'idle',
    englishVoice: 'idle',
    sourceSeparation: 'idle',
    originalVocalRemoved: false,
    finalMix: 'idle',
    finalVideo: 'idle',
    outputLanguage: options.outputLanguage || 'zh',
    audioMode: options.audioMode || 'replace-all',
  }
}

function actionable(status: ArtifactStatus) {
  return status === 'idle' || status === 'failed' || status === 'stale'
}

export function availablePostProductionActions(state: PostProductionState): PostProductionAction[] {
  if (actionable(state.materialSrt)) return ['generate-srt']
  if (state.materialSrt !== 'ready') return []
  if (actionable(state.editingTimeline)) return ['generate-editing-timeline']
  if (state.editingTimeline !== 'ready') return []

  const actions: PostProductionAction[] = ['reselect-edit-point']
  const replacingVoice = state.audioMode !== 'keep-original'
  if (state.route === 'drama' && replacingVoice && actionable(state.chineseVoice))
    actions.push('generate-chinese-voice')
  if (actionable(state.englishSubtitles)) actions.push('translate-subtitles')
  if (
    replacingVoice &&
    state.englishSubtitles === 'ready' &&
    actionable(state.englishVoice)
  )
    actions.push('generate-english-voice')

  const selectedVoiceReady = state.outputLanguage === 'zh'
    ? state.chineseVoice === 'ready'
    : state.englishVoice === 'ready'
  if (state.audioMode === 'replace-preserve-ambience') {
    if (actionable(state.sourceSeparation)) actions.push('separate-source-audio')
    else if (state.sourceSeparation === 'ready' && !state.originalVocalRemoved)
      actions.push('remove-original-vocal')
    else if (state.originalVocalRemoved && selectedVoiceReady && actionable(state.finalMix))
      actions.push('mix-background-audio')
  }

  const subtitlesReady = state.outputLanguage === 'zh' || state.englishSubtitles === 'ready'
  const audioReady = state.audioMode === 'keep-original'
    || (state.audioMode === 'replace-all' && selectedVoiceReady)
    || (state.audioMode === 'replace-preserve-ambience' && state.finalMix === 'ready')
  if (subtitlesReady && audioReady && actionable(state.finalVideo))
    actions.push('burn-voice-and-subtitles')
  return actions
}

function invalidateStatus(status: ArtifactStatus) {
  if (status === 'ready') return 'stale' as const
  if (status === 'running' || status === 'failed') return 'idle' as const
  return status
}

export function invalidatePostProduction(
  state: PostProductionState,
  change: PostProductionChange,
): PostProductionState {
  const next = { ...state }
  if (change === 'source-video') {
    next.materialSrt = invalidateStatus(next.materialSrt)
    next.editingTimeline = invalidateStatus(next.editingTimeline)
    if (next.route === 'drama') {
      next.chineseVoice = invalidateStatus(next.chineseVoice)
      next.englishVoice = invalidateStatus(next.englishVoice)
    }
    next.sourceSeparation = invalidateStatus(next.sourceSeparation)
    next.originalVocalRemoved = false
    next.finalMix = invalidateStatus(next.finalMix)
  } else if (change === 'edit-point') {
    if (next.route === 'drama') {
      next.chineseVoice = invalidateStatus(next.chineseVoice)
      next.englishVoice = invalidateStatus(next.englishVoice)
    }
    next.sourceSeparation = invalidateStatus(next.sourceSeparation)
    next.originalVocalRemoved = false
    next.finalMix = invalidateStatus(next.finalMix)
  } else if (change === 'chinese-text') {
    next.chineseVoice = invalidateStatus(next.chineseVoice)
    next.englishSubtitles = invalidateStatus(next.englishSubtitles)
    next.englishVoice = invalidateStatus(next.englishVoice)
    next.finalMix = invalidateStatus(next.finalMix)
  }
  next.finalVideo = invalidateStatus(next.finalVideo)
  return next
}
