export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}

export interface ComposeGeneratedVideoParams {
  runId: string
  videoFiles: string[]
  playDurations: number[]
  voiceFile?: string
  audioMode: import('../types').AudioMode
  ratio: import('../types').VideoRatio
  subtitleCues?: SubtitleCue[]
}

export interface ComposePictureMasterParams {
  runId: string
  ratio: import('../types').VideoRatio
  timeline: {
    schemaVersion: 1
    shots: Array<{
      shotId: string
      sourceVideoPath: string
      sourceDurationMs: number
      trimStartMs: number
      trimEndMs: number
      outputStartMs: number
      outputEndMs: number
      needsReview: boolean
      dialogue?: Record<string, unknown>
    }>
  }
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}
