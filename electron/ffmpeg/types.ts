export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}

export interface ComposeGeneratedVideoParams {
  runId: string
  videoFiles: string[]
  playDurations: number[]
  voiceFile: string
  ratio: import('../types').VideoRatio
  subtitleCues?: SubtitleCue[]
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}
