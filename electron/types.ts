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
  | 'eastern-xianxia-cg'
  | 'realistic-fantasy-cg'
  | 'handmade-clay'
export type ShotPace = 'auto' | 'slow' | 'medium' | 'fast'
export type ResolvedShotPace = Exclude<ShotPace, 'auto'>
export type VoiceEngine = 'cloud' | 'local'
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
  description: string
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
  generationDuration: 4 | 6 | 8
  imagePath: string
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
