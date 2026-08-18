export interface OpenExternalParams {
  url: string
}

export type VideoRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '21:9'
export type TargetDuration = number
export type VisualStyleId =
  | 'cinematic-contrast'
  | 'commercial-bright'
  | 'natural-documentary'
  | 'ink-wash'
  | 'cel-cinematic'
  | 'gongbi-color'
  | 'shonen-action-cel'
  | 'monochrome-shonen-manga'
  | 'modern-anime-key-visual'
  | 'hand-painted-watercolor-animation'
  | 'dunhuang-mural-animation'
  | 'paper-cut-shadow-animation'
  | 'chinese-puppet-stop-motion'
  | 'origami-animation'
  | 'comic-minimalism'
  | 'ink-paper-cut-animation'
  | 'anime-open-world-3d'
  | 'dark-chinese-mythology-cg'
  | 'xianxia-cultivation-animation'
  | 'victorian-mysticism'
  | 'creature-collection-animation'
  | 'cozy-pixel-farm'
  | 'pixel-underwater-adventure'
  | 'korean-webtoon-color'
  | 'korean-webtoon-cinematic'
  | 'korean-webtoon-romance'
  | 'korean-webtoon-action'
  | 'korean-webtoon-dark'
  | 'eastern-xianxia-cg'
  | 'realistic-fantasy-cg'
  | 'handmade-clay'
export type ShotPace = 'auto' | 'slow' | 'medium' | 'fast'
export type ResolvedShotPace = Exclude<ShotPace, 'auto'>
export type VoiceEngine = 'cloud' | 'local'
export type LocalVoiceEngine = 'qwen3-tts' | 'indextts2'
export type VoiceServiceState =
  | 'unchecked'
  | 'unavailable'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'failed'
export type VoiceSource = 'design' | 'clone'
export type { AudioProductionRoute } from '../src/runtime/productionContract.ts'
import type { ProductionRoute } from '../src/runtime/productionContract.ts'
export type {
  AudioMode,
  OutputLanguage,
  ProductionRoute,
} from '../src/runtime/productionContract.ts'
export type VideoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.0-generate-001'
  | 'rh-grok-image-video'
  | 'rh-seedance2'
export type TextModel =
  | 'gemini-3.6-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.1-pro-preview'
  | 'doubao-seed-evolving'
  | 'claude-fable-5'
  | 'claude-opus-5'
  | 'claude-sonnet-5'
  | 'gpt-5.6-sol'
  | 'grok-4.5'
  | 'deepseek-v4-pro'

export interface EpisodeManifest {
  episodeId: string
  episodeNumber: number
  title: string
  stage: string
  createdAt: string
  updatedAt: string
}

export interface ProjectManifest {
  schemaVersion: 1
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  episodes: EpisodeManifest[]
  lastOpenedEpisodeId: string
  coverRelativePath?: string
  wikiVersion: 2
  wikiPending?: boolean
}

export interface ImportedMarkdown {
  content: string
  originalName: string
  snapshotRelativePath: string
  importedAt: string
  contentHash: string
}

export interface ProjectMarkdownDocument {
  path: string
  content: string
  revision: string
}

export interface LocalVoiceStatus {
  available: boolean
  reason: 'ready' | 'platform' | 'runtime' | 'model'
  runtimePath?: string
  modelPath?: string
}

export interface IndexTtsServiceStatus {
  engine: 'indextts2'
  state: VoiceServiceState
  available: boolean
  runtimePath?: string
  modelPath?: string
  pid?: number
  startedAt?: string
  error?: string
}

export interface GenerateEpisodeVoiceParams {
  runId: string
  episodeId: string
  language?: 'zh' | 'en'
  tasks: Array<{
    shotId: string
    speakerId: string
    text: string
    emotion: string
    startMs: number
    endMs: number
  }>
}

export interface MediaScriptBrief {
  request: string
  verifiedFacts?: string
  targetDuration: TargetDuration
  ratio: '9:16' | '16:9'
  styleId: VisualStyleId
  hasCoreReference: boolean
  textModel: TextModel
}

export interface CoreReferenceAsset {
  id: string
  label: string
  relativePath: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  source: 'upload'
}

export type AssetRole = 'character' | 'scene' | 'prop'

export interface ProjectDirectorAssetDraft {
  role: AssetRole
  label: string
  aliases: string[]
  description: string
  storyFunction: string
  identityTraits: string[]
  required: boolean
  evidence: string
}

export interface ProjectDirectorDraft {
  productionRoute: ProductionRoute
  routeReason: string
  project: {
    title: string
    format: string
    genre: string
    countryRegion: string
    era: string
    medium: string
    aspectRatio: VideoRatio
    visualStyle: string
  }
  direction: {
    director: string
    referenceWork: string
    rationale: string
    visualAnchor: string
    colorLanguage: string
    cameraLanguage: string
  }
  assets: ProjectDirectorAssetDraft[]
  completeness: {
    narrativeSubjectRequired: boolean
    noCharacterReason: string
    warnings: string[]
  }
}

export interface ProjectDirectorPlan extends Omit<ProjectDirectorDraft, 'assets'> {
  assets: Array<ProjectDirectorAssetDraft & { id: string }>
}

export type AssetStatus =
  | 'planned'
  | 'design-ready'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'approved'

export interface AssetVersion {
  id: string
  source: 'upload' | 'search' | 'generated'
  relativePath: string
  designFingerprint?: string
  referenceRevision?: number
  derivedFromVersionId?: string
  sourceUrl?: string
  sourcePageUrl?: string
  searchQuery?: string
  generatedBySkill?: string
  createdAt: string
}

export interface ReferenceAsset {
  id: string
  planKey?: string
  role: AssetRole
  label: string
  aliases?: string[]
  description: string
  storyFunction?: string
  evidence?: string
  identityTraits: string[]
  styleRequirements: string[]
  required: boolean
  status: AssetStatus
  design?: Record<string, unknown>
  searchQuery?: string
  versions: AssetVersion[]
  referenceRevision?: number
  activeVersionId?: string
  pendingVersionId?: string
  generatedBySkill?: string
  sourceDocument?: string
  rejectedReferencePinIds?: string[]
}

export interface GenerateStoryboardImageParams {
  runId: string
  episodeId: string
  index: number
  prompt: string
  ratio: VideoRatio
  referencePath?: string
  referencePaths?: string[]
}

export interface GenerateAssetImageParams {
  runId: string
  assetId: string
  assetLabel?: string
  role: AssetRole
  design: Record<string, unknown>
  referencePath?: string
  referencePaths?: string[]
}

export interface GenerateSegmentVideoParams extends GenerateStoryboardImageParams {
  model: VideoModel
  generationDuration: number
  imagePath: string
  imagePaths?: string[]
}

export interface GenerateMaterialTranscriptParams {
  runId: string
  episodeId: string
  mediaId: string
  videoPath: string
}

export interface MaterialTranscriptResult {
  transcript: import('../src/runtime/productionContract').MaterialTranscript
  transcriptJsonPath: string
  transcriptSrtPath: string
}

export interface AnalyzeMaterialVideoParams {
  runId: string
  episodeId: string
  mediaId: string
  videoPath: string
  transcriptJsonPath: string
  transcriptSrtPath: string
  approvedScript: string
  shots: Array<{
    shotId: string
    script: string
    soundType: 'onscreen' | 'voiceover' | 'none'
    speakerId?: string
    dialogueText?: string
    dialogueEmotion?: string
    startState: string
    actionProgression: string
    endState: string
    videoPrompt: string
  }>
}

export interface ShotVideoAnalysisResult {
  shotId: string
  promptSegmentId: string
  sourceMediaId: string
  sourceVideoPath: string
  sourceDurationMs: number
  trimStartMs: number
  trimEndMs: number
  observedContent: string
  subtitleCueIds: string[]
  speakerIds: string[]
  confidence: number
  needsReview: boolean
  adoptedStartMs?: number
  adoptedEndMs?: number
  adoptedBy?: 'gemini' | 'user'
  revision?: number
  dialogue?: {
    speakerId: string
    text: string
    emotion: string
    sourceStartMs?: number
    sourceEndMs?: number
    outputStartMs: number
    outputEndMs: number
  }
}

export interface TranslateSubtitlesParams {
  runId: string
  textModel: TextModel
  subtitles: Array<{ shotId: string; text: string }>
}

export interface TranslateVideoSubtitlesParams {
  runId: string
  episodeId: string
  textModel: TextModel
  sourceLanguage: string
  targetLanguage: string
  subtitles: Array<{
    cueId: string
    startMs: number
    endMs: number
    translationRoleId?: string
    roleName?: string
    performanceDirection?: string
    text: string
  }>
}

export interface GenerateVideoTranslationStudioPromptParams {
  runId: string
  episodeId: string
  textModel: TextModel
  finalScript: {
    finalScriptId: string
    scriptHash: string
    targetLanguage: string
    cues: Array<{
      cueId: string
      translationRoleId?: string
      roleName?: string
      startMs: number
      endMs: number
      performanceDirection?: string
      translatedText: string
    }>
  }
  currentCueIds: string[]
  references: Array<{
    translationRoleId: string
    roleName: string
    voiceProfileId?: string
    voiceIdentityText: string
    referenceIndex: number
  }>
  correction?: string
}

export interface IdentifyVideoTranslationSpeakersParams {
  runId: string
  episodeId: string
  videoPath: string
  durationMs: number
}

export interface CalibrateVideoTranslationFramesParams {
  runId: string
  episodeId: string
  videoPath: string
  textModel: TextModel
  cues: Array<{
    cueId: string
    startMs: number
    endMs: number
    text: string
  }>
}

export interface CalibrateVideoTranslationSubtitlesParams {
  runId: string
  episodeId: string
  textModel: TextModel
  cues: Array<{
    cueId: string
    text: string
    frameSuggestion?: string
    speakerCluster?: string
    emotion?: string
  }>
}

export interface VideoTranslationProgressEvent {
  runId: string
  episodeId: string
  message: string
}

export interface VideoTranslationSpeakerDraft {
  cueId: string
  startMs: number
  endMs: number
  recognizedText: string
  correctedText: string
  performanceDirection: string
  proposedRoleId?: string
  proposedName: string
  confidence: number
  evidence: string
  ocrText: string
  needsReview: boolean
  suspectedMissing?: boolean
  speakerCluster?: string
  emotion?: string
  audioEvent?: string
}

export interface VideoTranslationContextSource {
  path: string
  hash: string
  content: string
}

export interface VideoTranslationUploadResult {
  sourceVideoPath: string
  rawSnapshotPath: string
  sourceFingerprint: string
  durationMs: number
  hasAudio: boolean
}

export interface VideoTranslationScriptDocumentResult {
  path: string
  originalName: string
  content: string
  contentHash: string
}

export interface ExtractVideoTranslationScriptCharactersParams {
  runId: string
  episodeId: string
  originalName: string
  content: string
  textModel: TextModel
}

export interface ExtractVideoTranslationScriptCharactersResult {
  characters: Array<{
    displayName: string
    aliases?: string[]
    description?: string
    evidence?: string
  }>
}

export interface GenerateVideoTranslationDialogueTimestampsParams {
  runId: string
  episodeId: string
  targetLanguage: string
  finalScriptId: string
  scriptHash: string
  voiceVersionId: string
}

export interface VideoTranslationMasterUploadResult {
  finalMasterVideoPath: string
  finalMasterFingerprint: string
  durationMs: number
  hasAudio: boolean
}

export interface EpisodeSubtitleCue {
  shotId: string
  startMs: number
  endMs: number
  text: string
}

export interface MaterialVideoAnalysisResult {
  mediaId: string
  analyses: ShotVideoAnalysisResult[]
}

export type CloudTaskKind =
  | 'voice'
  | 'dubbing'
  | 'asset'
  | 'storyboard'
  | 'video'
  | 'frame-calibration'
export type CloudTaskStatus =
  | 'queued'
  | 'generating'
  | 'downloading'
  | 'success'
  | 'failed'
  | 'stopped'

export interface PendingCloudTask {
  id: string
  kind: CloudTaskKind
  index: number
  targetId?: string
  targetLabel?: string
  model?: VideoModel
  status?: CloudTaskStatus
  resumeFrom?: 'generating' | 'downloading'
  taskId?: string
  pollRoute?: string
  resultUrl?: string
  outputPath: string
  outputHash?: string
  outputBytes?: number
  createdAt: string
  startedAt?: string
  updatedAt?: string
  finishedAt?: string
  error?: string
}

export interface ResumedCloudTask {
  id: string
  kind: CloudTaskKind
  index: number
  status: 'success' | 'failed'
  path?: string
  duration?: number
  error?: string
}

export interface SelectFolderParams {
  title?: string
  defaultPath?: string
}

export interface ListFilesFromFolderParams {
  folderPath: string
}

export interface ListFilesFromFolderRecord {
  name: string
  path: string
}

export interface StatEventParams {
  title: string
  screen?: string
  language?: string
  url?: string
  userAgent?: string
}
