export interface OpenExternalParams {
  url: string
}

export type VideoRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '21:9'
export type TargetDuration = 10 | 15 | 30
export type VisualStyleId = 'live-action' | 'illustration' | '3d' | 'clay'

export interface MediaScriptBrief {
  request: string
  verifiedFacts?: string
  targetDuration: TargetDuration
  ratio: '9:16' | '16:9'
  styleId: VisualStyleId
  hasCoreReference: boolean
}

export interface CoreReferenceAsset {
  id: string
  label: string
  relativePath: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  source: 'upload'
}

export interface GenerateStoryboardImageParams {
  runId: string
  index: number
  prompt: string
  ratio: VideoRatio
  referencePath?: string
}

export interface GenerateSegmentVideoParams extends GenerateStoryboardImageParams {
  generationDuration: 4 | 6 | 8
  imagePath: string
}

export type CloudTaskKind = 'voice' | 'storyboard' | 'video'

export interface PendingCloudTask {
  id: string
  kind: CloudTaskKind
  index: number
  taskId?: string
  pollRoute?: string
  resultUrl?: string
  outputPath: string
  createdAt: string
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
