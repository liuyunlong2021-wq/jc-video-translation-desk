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
}
