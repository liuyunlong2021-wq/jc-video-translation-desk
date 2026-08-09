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
  workflow?: 'creative' | 'video-translation'
  targetLanguage?: string
}

export interface AdoptInstrumentParams {
  runId: string
  episodeId: string
  vocalPath: string
  instrumentPath: string
  workflow?: 'creative' | 'video-translation'
  targetLanguage?: string
}

export interface MixBackgroundAudioParams extends AdoptInstrumentParams {
  voiceFile: string
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export interface ComposeVideoTranslationParams {
  runId: string
  episodeId: string
  sourceVideoPath: string
  mixedAudioPath: string
  targetLanguage: string
  finalScriptId: string
  scriptHash: string
  voiceVersionId: string
  dubDialogueTimestampHash: string
}
