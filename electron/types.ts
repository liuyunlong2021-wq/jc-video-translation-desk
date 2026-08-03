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
export type VoiceSource = 'design' | 'clone'
export type AudioMode = 'keep-original' | 'replace-preserve-ambience' | 'replace-all'
export type VideoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.0-generate-001'
  | 'rh-grok-image-video'
export type TextModel =
  | 'gemini-3.6-flash'
  | 'claude-fable-5'
  | 'claude-opus-5'
  | 'gpt-5.6-sol'
  | 'deepseek-v4-pro'

export interface ProjectManifest {
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  stage: string
  coverRelativePath?: string
  wikiVersion: 1
  wikiPending?: boolean
}

export interface ImportedMarkdown {
  content: string
  originalName: string
  originalPath: string
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

export interface GenerateEpisodeVoiceParams {
  runId: string
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

export interface AnalyzeShotVideoParams {
  runId: string
  videoPath: string
  shot: {
    shotId: string
    script: string
    soundType?: 'onscreen' | 'voiceover' | 'none'
    speakerId?: string
    dialogueText?: string
    dialogueEmotion?: string
    startState: string
    actionProgression: string
    endState: string
    videoPrompt: string
  }
}

export interface ShotVideoAnalysisResult {
  shotId: string
  sourceVideoPath: string
  sourceDurationMs: number
  trimStartMs: number
  trimEndMs: number
  needsReview: boolean
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

export type CloudTaskKind = 'voice' | 'asset' | 'storyboard' | 'video'
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
