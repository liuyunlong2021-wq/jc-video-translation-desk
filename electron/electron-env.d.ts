/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * 已构建的目录结构
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// 在渲染器进程中使用，在 `preload.ts` 中暴露方法
interface Window {
  i18n: {
    getLocalesPath: () => Promise<string>
    getLanguage: () => Promise<string>
    changeLanguage: (lng: string) => Promise<string>
    onLanguageChanged: (listener: (lng: string) => void) => () => void
  }
  electron: {
    platform: NodeJS.Platform
    isWinMaxed: () => Promise<boolean>
    winMin: () => void
    winMax: () => void
    winClose: () => void
    toggleWindowMaximize: () => void
    prepareWindowDrag: () => Promise<{
      bounds: import('electron').Rectangle
      wasMaximized: boolean
    } | null>
    getWindowBounds: () => Promise<import('electron').Rectangle | undefined>
    setWindowPosition: (x: number, y: number) => void
    setZoomFactor: (factor: number) => void
    openExternal: (params: import('./types').OpenExternalParams) => void
    statTrack: (params: import('./types').StatEventParams) => Promise<void>
    cloud: {
      hasApiKey: () => Promise<boolean>
      saveApiKey: (apiKey: string) => Promise<boolean>
      testApiKey: () => Promise<boolean>
      funAsrInstallStatus: () => Promise<{
        state: 'ready' | 'missing' | 'installing' | 'failed'
        message: string
      }>
      installFunAsr: () => Promise<{
        state: 'ready' | 'missing' | 'installing' | 'failed'
        message: string
      }>
      onFunAsrInstallProgress: (listener: (message: string) => void) => () => void
      generateSeedAudio: (
        params: import('./seed-audio').GenerateSeedAudioParams,
      ) => Promise<{ path: string; duration: number; model: string; responseDuration?: number }>
      writeSeedAudioArrangement: (
        runId: string,
        episodeId: string,
        arrangement: import('../src/runtime/seedAudio').SeedAudioArrangement,
      ) => Promise<string>
      mixSeedAudioTracks: (
        runId: string,
        episodeId: string,
        paths: string[],
        durationMs: number,
      ) => Promise<string>
      writeSeedDialogueTimeline: (
        runId: string,
        episodeId: string,
        lines: import('../src/runtime/seedAudio').SeedAudioLine[],
        transcript: import('../src/runtime/productionContract').MaterialTranscript,
      ) => Promise<{ timelinePath: string; srtPath: string }>
      generateScript: (brief: import('./types').MediaScriptBrief) => Promise<string>
      runSkill: (
        skillName: string,
        input: string,
        runId?: string,
        textModel?: import('./types').TextModel,
      ) => Promise<any>
      runWikiSkill: (
        skillName: string,
        input: string,
        projectId: string,
        episodeId: string,
        textModel?: import('./types').TextModel,
      ) => Promise<{ text: string; writtenPaths: string[] }>
      generateVoice: (
        runId: string,
        episodeId: string,
        text: string,
        voicePrompt: string,
        engine: import('./types').VoiceEngine,
      ) => Promise<{ path: string; duration: number }>
      localVoiceStatus: () => Promise<import('./types').LocalVoiceStatus>
      indexTtsStatus: () => Promise<import('./types').IndexTtsServiceStatus>
      indexTtsStart: () => Promise<import('./types').IndexTtsServiceStatus>
      indexTtsStop: () => Promise<import('./types').IndexTtsServiceStatus>
      generateEpisodeVoice: (params: import('./types').GenerateEpisodeVoiceParams) => Promise<{
        path: string
        duration: number
        clips: Array<{ shotId: string; path: string; duration: number }>
      }>
      generateStoryboard: (
        params: import('./types').GenerateStoryboardImageParams,
      ) => Promise<string>
      generateAsset: (params: import('./types').GenerateAssetImageParams) => Promise<string>
      generateVideo: (params: import('./types').GenerateSegmentVideoParams) => Promise<string>
      generateMaterialTranscript: (
        params: import('./types').GenerateMaterialTranscriptParams,
      ) => Promise<import('./types').MaterialTranscriptResult>
      analyzeMaterialVideo: (
        params: import('./types').AnalyzeMaterialVideoParams,
      ) => Promise<import('./types').MaterialVideoAnalysisResult>
      writeEditingTimeline: (
        runId: string,
        episodeId: string,
        timeline: import('../src/runtime/productionContract').EditingTimeline,
      ) => Promise<string>
      writeEpisodeSubtitles: (
        runId: string,
        episodeId: string,
        language: 'zh' | 'en',
        cues: import('./types').EpisodeSubtitleCue[],
      ) => Promise<string>
      translateSubtitles: (
        params: import('./types').TranslateSubtitlesParams,
      ) => Promise<Array<{ shotId: string; text: string }>>
      selectSeedReferenceAudio: (
        runId: string,
        episodeId: string,
        speakerId: string,
        workflow?: 'content-create' | 'video-translation',
      ) => Promise<{ path: string; displayName: string } | null>
      selectVideoTranslationSource: (
        runId: string,
        episodeId: string,
      ) => Promise<import('./types').VideoTranslationUploadResult | null>
      selectVideoTranslationScriptDocument: (
        runId: string,
        episodeId: string,
      ) => Promise<import('./types').VideoTranslationScriptDocumentResult | null>
      selectVideoTranslationFinalMaster: (
        runId: string,
        episodeId: string,
        sourceVideoPath: string,
      ) => Promise<import('./types').VideoTranslationMasterUploadResult | null>
      importVideoTranslationSrt: (
        runId: string,
        episodeId: string,
        durationMs: number,
      ) => Promise<{
        srtPath: string
        jsonPath: string
        cues: Array<{ cueId: string; startMs: number; endMs: number; text: string }>
      } | null>
      identifyVideoTranslationSpeakers: (
        params: import('./types').IdentifyVideoTranslationSpeakersParams,
      ) => Promise<{
        speakers: import('./types').VideoTranslationSpeakerDraft[]
      }>
      ocrVideoTranslationSubtitles: (
        params: import('./types').IdentifyVideoTranslationSpeakersParams,
      ) => Promise<{
        speakers: import('./types').VideoTranslationSpeakerDraft[]
      }>
      calibrateVideoTranslationSubtitles: (
        params: import('./types').CalibrateVideoTranslationSubtitlesParams,
      ) => Promise<{ subtitles: Array<{ cueId: string; text: string }> }>
      extractVideoTranslationScriptCharacters: (
        params: import('./types').ExtractVideoTranslationScriptCharactersParams,
      ) => Promise<import('./types').ExtractVideoTranslationScriptCharactersResult>
      calibrateVideoTranslationFrames: (
        params: import('./types').CalibrateVideoTranslationFramesParams,
      ) => Promise<{
        persons: Array<{ visualPersonId: string; features: string }>
        subtitles: Array<{
          cueId: string
          text: string
          framePath?: string
          visiblePersonIds?: string[]
        }>
      }>
      onVideoTranslationProgress: (
        listener: (progress: import('./types').VideoTranslationProgressEvent) => void,
      ) => () => void
      translateVideoSubtitles: (
        params: import('./types').TranslateVideoSubtitlesParams,
      ) => Promise<{
        subtitles: Array<{ cueId: string; text: string }>
      }>
      generateVideoTranslationStudioPrompt: (
        params: import('./types').GenerateVideoTranslationStudioPromptParams,
      ) => Promise<{ text_prompt: string }>
      confirmVideoTranslation: (
        runId: string,
        episodeId: string,
        sourceFingerprint: string,
        sourceLanguage: string,
        targetLanguage: string,
        cues: import('../src/runtime/videoTranslation').VideoTranslationCue[],
        roles: import('../src/runtime/videoTranslation').TranslationRole[],
        durationMs: number,
      ) => Promise<{ path: string; finalScriptId: string; scriptHash: string; markdown: string }>
      bindVideoTranslationVoice: (
        runId: string,
        role: import('../src/runtime/videoTranslation').TranslationRole,
      ) => Promise<string>
      deleteVideoTranslationRole: (
        runId: string,
        episodeId: string,
        roleId: string,
        remainingRoles: import('../src/runtime/videoTranslation').TranslationRole[],
      ) => Promise<string>
      writeVideoTranslationSeedPlan: (
        runId: string,
        episodeId: string,
        targetLanguage: string,
        arrangement: import('../src/runtime/videoTranslation').VideoTranslationDialogueArrangement,
        promptMarkdown: string,
      ) => Promise<{ arrangementPath: string; promptPath: string }>
      writeVideoTranslationGroupedPlan: (
        runId: string,
        episodeId: string,
        targetLanguage: string,
        arrangement: import('../src/runtime/videoTranslation').VideoTranslationDialogueArrangement,
        promptMarkdown: string,
      ) => Promise<{ arrangementPath: string; promptPath: string }>
      generateVideoTranslationTargetVoice: (
        runId: string,
        episodeId: string,
        targetLanguage: string,
      ) => Promise<import('../src/runtime/videoTranslation').VideoTranslationVoiceVersion>
      generateVideoTranslationGroupedVoice: (
        runId: string,
        episodeId: string,
        targetLanguage: string,
        regenerateBlockIds?: string[],
      ) => Promise<import('../src/runtime/videoTranslation').VideoTranslationVoiceVersion>
      listVideoTranslationVoiceVersions: (
        runId: string,
        episodeId: string,
        targetLanguage: string,
      ) => Promise<import('../src/runtime/videoTranslation').VideoTranslationVoiceVersion[]>
      generateVideoTranslationDialogueTimestamps: (
        params: import('./types').GenerateVideoTranslationDialogueTimestampsParams,
      ) => Promise<{ path: string; hash: string; targetVoicePath: string }>
      composeVideoTranslation: (
        params: import('./ffmpeg/types').ComposeVideoTranslationParams,
      ) => Promise<string>
      composePictureMaster: (
        params: import('./ffmpeg/types').ComposePictureMasterParams,
      ) => Promise<string>
      separateSourceAudio: (
        params: import('./ffmpeg/types').SeparateSourceAudioParams,
      ) => Promise<import('../src/runtime/productionContract').AudioProcessingRecord>
      removeOriginalVocal: (
        params: import('./ffmpeg/types').AdoptInstrumentParams,
      ) => Promise<import('../src/runtime/productionContract').AudioProcessingRecord>
      mixBackgroundAudio: (
        params: import('./ffmpeg/types').MixBackgroundAudioParams,
      ) => Promise<import('../src/runtime/productionContract').AudioProcessingRecord>
      composeVideo: (
        params: import('./ffmpeg/types').ComposeGeneratedVideoParams,
      ) => Promise<string>
      resumePending: (runId: string) => Promise<import('./types').ResumedCloudTask[]>
      selectCoreReference: (runId: string) => Promise<import('./types').CoreReferenceAsset | null>
      selectAssetImage: (
        runId: string,
        assetId: string,
      ) => Promise<import('./types').AssetVersion | null>
      searchAssetImage: (
        runId: string,
        assetId: string,
        searchQuery: string,
        rejectedPinIds?: string[],
      ) => Promise<import('./types').AssetVersion>
      loadLatestState: () => Promise<string | null>
      scanVoiceLibrary: (sourceRoot: string) => Promise<{
        sourceFileCount: number
        profileCount: number
        duplicateGroups: string[][]
        generatedAt: string
      }>
      voiceLibraryPath: () => Promise<string>
      openVoicePack: (voiceProfileId: string) => Promise<string>
      listVoiceProfiles: (
        query?: Record<string, unknown>,
      ) => Promise<import('./voice-library').VoiceProfile[]>
      previewVoiceProfile: (voiceProfileId: string) => Promise<string>
      reviewVoiceProfile: (
        voiceProfileId: string,
        patch: import('./voice-library').VoiceProfile,
      ) => Promise<import('./voice-library').VoiceProfile>
      standardizeVoiceProfile: (voiceProfileId: string) => Promise<string>
      registerSeedVoiceProfile: (
        params: import('./voice-library').RegisterSeedVoiceProfileParams,
      ) => ReturnType<typeof import('./voice-library').registerSeedVoiceProfile>
      bindProjectSeedVoice: (
        projectId: string,
        episodeId: string,
        speakerId: string,
        voiceProfileId: string,
      ) => ReturnType<typeof import('./voice-library').bindProjectSeedVoice>
      resolveProjectSeedReferences: (
        projectId: string,
        speakerIds: string[],
      ) => ReturnType<typeof import('./voice-library').resolveProjectSeedReferences>
      resolveSeedVoiceProfiles: (
        bindings: Array<{ speakerId: string; voiceProfileId: string }>,
      ) => ReturnType<typeof import('./voice-library').resolveSeedVoiceProfiles>
      bindProjectVoice: (
        projectId: string,
        speakerId: string,
        voiceProfileId: string,
        taskId?: string,
      ) => Promise<{ voicePath: string; libraryPath: string }>
      createProject: (
        projectId: string,
        state: string,
      ) => Promise<import('./types').ProjectManifest | null>
      openProjectDirectory: () => Promise<import('./types').ProjectManifest | null>
      listProjects: () => Promise<import('./types').ProjectManifest[]>
      loadProject: (projectId: string, episodeId: string) => Promise<string>
      getLastOpenedProject: () => Promise<string | null>
      setLastOpenedProject: (projectId: string) => Promise<void>
      renameProject: (projectId: string, name: string) => Promise<import('./types').ProjectManifest>
      createEpisode: (
        projectId: string,
        value: string,
      ) => Promise<import('./types').ProjectManifest>
      showProject: (projectId: string) => Promise<string>
      saveRawSubmission: (projectId: string, content: string) => Promise<string>
      importMarkdown: (projectId: string) => Promise<import('./types').ImportedMarkdown | null>
      listMarkdown: (projectId: string) => Promise<string[]>
      readMarkdown: (
        projectId: string,
        relativePath: string,
      ) => Promise<import('./types').ProjectMarkdownDocument>
      beginStoryboardUpdate: (projectId: string, episodeId: string) => Promise<string>
      commitStoryboardUpdate: (
        projectId: string,
        episodeId: string,
        transactionId: string,
        writtenPaths: string[],
      ) => Promise<string[]>
      rollbackStoryboardUpdate: (
        projectId: string,
        episodeId: string,
        transactionId: string,
      ) => Promise<void>
      writeMarkdown: (
        projectId: string,
        relativePath: string,
        content: string,
        revision?: string,
      ) => Promise<import('./types').ProjectMarkdownDocument>
      saveState: (runId: string, episodeId: string, value: string) => Promise<void>
      cancelRun: (runId: string) => Promise<number>
      listTasks: (runId: string) => Promise<import('./types').PendingCloudTask[]>
      resumeTask: (runId: string, taskId: string) => Promise<string>
      stopTask: (runId: string, taskId: string) => Promise<boolean>
      abandonTask: (runId: string, taskId: string) => Promise<void>
      exportMedia: (runId: string, sourcePath: string) => Promise<string | null>
      showMedia: (runId: string, sourcePath: string) => Promise<void>
      resolveMedia: (runId: string, sourcePaths: string[]) => Promise<string[]>
    }
  }
}
