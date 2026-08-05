export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}

export interface ComposeGeneratedVideoParams {
  runId: string
  episodeId: string
  videoFiles: string[]
  playDurations: number[]
  voiceFile?: string
  audioMode: import('../types').AudioMode
  ratio: import('../types').VideoRatio
  subtitleCues?: SubtitleCue[]
}

export interface ComposePictureMasterParams {
  runId: string
  episodeId: string
  ratio: import('../types').VideoRatio
  timeline: import('../../src/runtime/productionContract.ts').EditingTimeline
}

export interface SeparateSourceAudioParams {
  runId: string
  episodeId: string
  pictureMasterPath: string
}

export interface AdoptInstrumentParams {
  runId: string
  episodeId: string
  vocalPath: string
  instrumentPath: string
}

export interface MixBackgroundAudioParams extends AdoptInstrumentParams {
  voiceFile: string
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}
