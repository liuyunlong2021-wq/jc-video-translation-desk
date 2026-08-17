import { ipcRenderer, contextBridge } from 'electron'
import { OpenExternalParams, StatEventParams } from './types'

// --------- 向界面渲染进程暴露某些API ---------

contextBridge.exposeInMainWorld('i18n', {
  getLocalesPath: () => ipcRenderer.invoke('i18n-getLocalesPath'),
  getLanguage: () => ipcRenderer.invoke('i18n-getLanguage'),
  changeLanguage: (lng: string) => ipcRenderer.invoke('i18n-changeLanguage', lng),
  onLanguageChanged: (listener: (lng: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, lng: string) => listener(lng)
    ipcRenderer.on('i18n-changeLanguage', handler)
    return () => ipcRenderer.off('i18n-changeLanguage', handler)
  },
})

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isWinMaxed: () => ipcRenderer.invoke('is-win-maxed'),
  winMin: () => ipcRenderer.send('win-min'),
  winMax: () => ipcRenderer.send('win-max'),
  winClose: () => ipcRenderer.send('win-close'),
  toggleWindowMaximize: () => ipcRenderer.send('toggle-window-maximize'),
  prepareWindowDrag: () => ipcRenderer.invoke('prepare-window-drag'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  setWindowPosition: (x: number, y: number) => ipcRenderer.send('set-window-position', x, y),
  setZoomFactor: (factor: number) => ipcRenderer.send('set-zoom-factor', factor),
  openExternal: (params: OpenExternalParams) => ipcRenderer.invoke('open-external', params),
  statTrack: (params: StatEventParams) => ipcRenderer.invoke('stat-track', params),
  cloud: {
    hasApiKey: () => ipcRenderer.invoke('cloud-has-api-key'),
    saveApiKey: (apiKey: string) => ipcRenderer.invoke('cloud-save-api-key', apiKey),
    testApiKey: () => ipcRenderer.invoke('cloud-test-api-key'),
    funAsrInstallStatus: () => ipcRenderer.invoke('funasr-install-status'),
    installFunAsr: () => ipcRenderer.invoke('funasr-install'),
    onFunAsrInstallProgress: (listener: (message: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message)
      ipcRenderer.on('funasr-install-progress', handler)
      return () => ipcRenderer.off('funasr-install-progress', handler)
    },
    generateSeedAudio: (params: import('./seed-audio').GenerateSeedAudioParams) =>
      ipcRenderer.invoke('seed-audio-generate', params),
    writeSeedAudioArrangement: (
      runId: string,
      episodeId: string,
      arrangement: import('../src/runtime/seedAudio').SeedAudioArrangement,
    ) => ipcRenderer.invoke('seed-audio-write-arrangement', runId, episodeId, arrangement),
    mixSeedAudioTracks: (runId: string, episodeId: string, paths: string[], durationMs: number) =>
      ipcRenderer.invoke('seed-audio-mix-tracks', runId, episodeId, paths, durationMs),
    writeSeedDialogueTimeline: (
      runId: string,
      episodeId: string,
      lines: import('../src/runtime/seedAudio').SeedAudioLine[],
      transcript: import('../src/runtime/productionContract').MaterialTranscript,
    ) => ipcRenderer.invoke('seed-audio-write-timeline', runId, episodeId, lines, transcript),
    generateScript: (brief: import('./types').MediaScriptBrief) =>
      ipcRenderer.invoke('cloud-generate-script', brief),
    runSkill: (
      skillName: string,
      input: string,
      runId?: string,
      textModel?: import('./types').TextModel,
    ) => ipcRenderer.invoke('cloud-run-skill', skillName, input, runId, textModel),
    runWikiSkill: (
      skillName: string,
      input: string,
      projectId: string,
      episodeId: string,
      textModel?: import('./types').TextModel,
    ) =>
      ipcRenderer.invoke('cloud-run-wiki-skill', skillName, input, projectId, episodeId, textModel),
    generateVoice: (
      runId: string,
      episodeId: string,
      text: string,
      voicePrompt: string,
      engine: import('./types').VoiceEngine,
    ) => ipcRenderer.invoke('cloud-generate-voice', runId, episodeId, text, voicePrompt, engine),
    localVoiceStatus: () => ipcRenderer.invoke('local-voice-status'),
    indexTtsStatus: () => ipcRenderer.invoke('index-tts-status'),
    indexTtsStart: () => ipcRenderer.invoke('index-tts-start'),
    indexTtsStop: () => ipcRenderer.invoke('index-tts-stop'),
    generateEpisodeVoice: (params: import('./types').GenerateEpisodeVoiceParams) =>
      ipcRenderer.invoke('index-tts-generate-episode', params),
    generateStoryboard: (params: import('./types').GenerateStoryboardImageParams) =>
      ipcRenderer.invoke('cloud-generate-storyboard', params),
    generateAsset: (params: import('./types').GenerateAssetImageParams) =>
      ipcRenderer.invoke('cloud-generate-asset', params),
    generateVideo: (params: import('./types').GenerateSegmentVideoParams) =>
      ipcRenderer.invoke('cloud-generate-video', params),
    generateMaterialTranscript: (params: import('./types').GenerateMaterialTranscriptParams) =>
      ipcRenderer.invoke('material-generate-srt', params),
    analyzeMaterialVideo: (params: import('./types').AnalyzeMaterialVideoParams) =>
      ipcRenderer.invoke('material-analyze-video', params),
    writeEditingTimeline: (
      runId: string,
      episodeId: string,
      timeline: import('../src/runtime/productionContract').EditingTimeline,
    ) => ipcRenderer.invoke('material-write-editing-timeline', runId, episodeId, timeline),
    writeEpisodeSubtitles: (
      runId: string,
      episodeId: string,
      language: 'zh' | 'en',
      cues: import('./types').EpisodeSubtitleCue[],
    ) => ipcRenderer.invoke('material-write-episode-subtitles', runId, episodeId, language, cues),
    translateSubtitles: (params: import('./types').TranslateSubtitlesParams) =>
      ipcRenderer.invoke('cloud-translate-subtitles', params),
    selectSeedReferenceAudio: (
      runId: string,
      episodeId: string,
      speakerId: string,
      workflow?: 'content-create' | 'video-translation',
    ) => ipcRenderer.invoke('media-select-seed-reference', runId, episodeId, speakerId, workflow),
    selectVideoTranslationSource: (runId: string, episodeId: string) =>
      ipcRenderer.invoke('video-translation-select-source', runId, episodeId),
    selectVideoTranslationScriptDocument: (runId: string, episodeId: string) =>
      ipcRenderer.invoke('video-translation-select-script-document', runId, episodeId),
    selectVideoTranslationFinalMaster: (
      runId: string,
      episodeId: string,
      sourceVideoPath: string,
    ) =>
      ipcRenderer.invoke(
        'video-translation-select-final-master',
        runId,
        episodeId,
        sourceVideoPath,
      ),
    importVideoTranslationSrt: (runId: string, episodeId: string, durationMs: number) =>
      ipcRenderer.invoke('video-translation-import-srt', runId, episodeId, durationMs),
    identifyVideoTranslationSpeakers: (
      params: import('./types').IdentifyVideoTranslationSpeakersParams,
    ) => ipcRenderer.invoke('video-translation-identify-speakers', params),
    ocrVideoTranslationSubtitles: (
      params: import('./types').IdentifyVideoTranslationSpeakersParams,
    ) => ipcRenderer.invoke('video-translation-ocr-subtitles', params),
    calibrateVideoTranslationSubtitles: (
      params: import('./types').CalibrateVideoTranslationSubtitlesParams,
    ) => ipcRenderer.invoke('video-translation-calibrate-subtitles', params),
    extractVideoTranslationScriptCharacters: (
      params: import('./types').ExtractVideoTranslationScriptCharactersParams,
    ) => ipcRenderer.invoke('video-translation-extract-script-characters', params),
    calibrateVideoTranslationFrames: (
      params: import('./types').CalibrateVideoTranslationFramesParams,
    ) => ipcRenderer.invoke('video-translation-calibrate-frames', params),
    onVideoTranslationProgress: (
      listener: (progress: import('./types').VideoTranslationProgressEvent) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: import('./types').VideoTranslationProgressEvent,
      ) => listener(progress)
      ipcRenderer.on('video-translation-progress', handler)
      return () => ipcRenderer.off('video-translation-progress', handler)
    },
    translateVideoSubtitles: (params: import('./types').TranslateVideoSubtitlesParams) =>
      ipcRenderer.invoke('video-translation-translate', params),
    confirmVideoTranslation: (
      runId: string,
      episodeId: string,
      sourceFingerprint: string,
      sourceLanguage: string,
      targetLanguage: string,
      cues: import('../src/runtime/videoTranslation').VideoTranslationCue[],
      roles: import('../src/runtime/videoTranslation').TranslationRole[],
      durationMs: number,
    ) =>
      ipcRenderer.invoke(
        'video-translation-confirm',
        runId,
        episodeId,
        sourceFingerprint,
        sourceLanguage,
        targetLanguage,
        cues,
        roles,
        durationMs,
      ),
    bindVideoTranslationVoice: (
      runId: string,
      role: import('../src/runtime/videoTranslation').TranslationRole,
    ) => ipcRenderer.invoke('video-translation-bind-voice', runId, role),
    deleteVideoTranslationRole: (
      runId: string,
      episodeId: string,
      roleId: string,
      remainingRoles: import('../src/runtime/videoTranslation').TranslationRole[],
    ) =>
      ipcRenderer.invoke('video-translation-delete-role', runId, episodeId, roleId, remainingRoles),
    writeVideoTranslationSeedPlan: (
      runId: string,
      episodeId: string,
      targetLanguage: string,
      arrangement: import('../src/runtime/videoTranslation').VideoTranslationDialogueArrangement,
      promptMarkdown: string,
    ) =>
      ipcRenderer.invoke(
        'video-translation-write-seed-plan',
        runId,
        episodeId,
        targetLanguage,
        arrangement,
        promptMarkdown,
      ),
    writeVideoTranslationGroupedPlan: (
      runId: string,
      episodeId: string,
      targetLanguage: string,
      arrangement: import('../src/runtime/videoTranslation').VideoTranslationDialogueArrangement,
      promptMarkdown: string,
    ) =>
      ipcRenderer.invoke(
        'video-translation-write-grouped-plan',
        runId,
        episodeId,
        targetLanguage,
        arrangement,
        promptMarkdown,
      ),
    generateVideoTranslationTargetVoice: (
      runId: string,
      episodeId: string,
      targetLanguage: string,
    ) => ipcRenderer.invoke('video-translation-generate-voice', runId, episodeId, targetLanguage),
    generateVideoTranslationGroupedVoice: (
      runId: string,
      episodeId: string,
      targetLanguage: string,
      regenerateBlockIds: string[] = [],
    ) =>
      ipcRenderer.invoke(
        'video-translation-generate-grouped-voice',
        runId,
        episodeId,
        targetLanguage,
        regenerateBlockIds,
      ),
    listVideoTranslationVoiceVersions: (runId: string, episodeId: string, targetLanguage: string) =>
      ipcRenderer.invoke('video-translation-list-voice-versions', runId, episodeId, targetLanguage),
    generateVideoTranslationDialogueTimestamps: (
      params: import('./types').GenerateVideoTranslationDialogueTimestampsParams,
    ) => ipcRenderer.invoke('video-translation-timestamp-dialogue', params),
    composeVideoTranslation: (params: import('./ffmpeg/types').ComposeVideoTranslationParams) =>
      ipcRenderer.invoke('video-translation-compose', params),
    composePictureMaster: (params: import('./ffmpeg/types').ComposePictureMasterParams) =>
      ipcRenderer.invoke('cloud-compose-picture-master', params),
    separateSourceAudio: (params: import('./ffmpeg/types').SeparateSourceAudioParams) =>
      ipcRenderer.invoke('audio-separate-source', params),
    removeOriginalVocal: (params: import('./ffmpeg/types').AdoptInstrumentParams) =>
      ipcRenderer.invoke('audio-remove-original-vocal', params),
    mixBackgroundAudio: (params: import('./ffmpeg/types').MixBackgroundAudioParams) =>
      ipcRenderer.invoke('audio-mix-background', params),
    composeVideo: (params: import('./ffmpeg/types').ComposeGeneratedVideoParams) =>
      ipcRenderer.invoke('cloud-compose-video', params),
    resumePending: (runId: string) => ipcRenderer.invoke('cloud-resume-pending', runId),
    selectCoreReference: (runId: string) =>
      ipcRenderer.invoke('cloud-select-core-reference', runId),
    selectAssetImage: (runId: string, assetId: string) =>
      ipcRenderer.invoke('project-select-asset-image', runId, assetId),
    searchAssetImage: (
      runId: string,
      assetId: string,
      searchQuery: string,
      rejectedPinIds?: string[],
    ) =>
      ipcRenderer.invoke('project-search-asset-image', runId, assetId, searchQuery, rejectedPinIds),
    loadLatestState: () => ipcRenderer.invoke('cloud-load-latest-state'),
    scanVoiceLibrary: (sourceRoot: string) => ipcRenderer.invoke('voice-library-scan', sourceRoot),
    voiceLibraryPath: () => ipcRenderer.invoke('voice-library-path'),
    openVoicePack: (voiceProfileId: string) =>
      ipcRenderer.invoke('voice-library-open-pack', voiceProfileId),
    listVoiceProfiles: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('voice-library-list', query),
    previewVoiceProfile: (voiceProfileId: string) =>
      ipcRenderer.invoke('voice-library-preview', voiceProfileId),
    reviewVoiceProfile: (voiceProfileId: string, patch: import('./voice-library').VoiceProfile) =>
      ipcRenderer.invoke('voice-library-review', voiceProfileId, patch),
    standardizeVoiceProfile: (voiceProfileId: string) =>
      ipcRenderer.invoke('voice-library-standardize', voiceProfileId),
    registerSeedVoiceProfile: (params: import('./voice-library').RegisterSeedVoiceProfileParams) =>
      ipcRenderer.invoke('voice-library-register-seed', params),
    bindProjectSeedVoice: (
      projectId: string,
      episodeId: string,
      speakerId: string,
      voiceProfileId: string,
    ) =>
      ipcRenderer.invoke(
        'project-bind-seed-voice',
        projectId,
        episodeId,
        speakerId,
        voiceProfileId,
      ),
    resolveProjectSeedReferences: (projectId: string, speakerIds: string[]) =>
      ipcRenderer.invoke('voice-library-resolve-seed', projectId, speakerIds),
    resolveSeedVoiceProfiles: (bindings: Array<{ speakerId: string; voiceProfileId: string }>) =>
      ipcRenderer.invoke('voice-library-resolve-profiles', bindings),
    bindProjectVoice: (
      projectId: string,
      speakerId: string,
      voiceProfileId: string,
      taskId?: string,
    ) => ipcRenderer.invoke('project-bind-voice', projectId, speakerId, voiceProfileId, taskId),
    createProject: (projectId: string, state: string) =>
      ipcRenderer.invoke('project-create', projectId, state),
    openProjectDirectory: () => ipcRenderer.invoke('project-open-directory'),
    listProjects: () => ipcRenderer.invoke('project-list'),
    loadProject: (projectId: string, episodeId: string) =>
      ipcRenderer.invoke('project-load', projectId, episodeId),
    getLastOpenedProject: () => ipcRenderer.invoke('project-last-opened'),
    setLastOpenedProject: (projectId: string) =>
      ipcRenderer.invoke('project-set-last-opened', projectId),
    renameProject: (projectId: string, name: string) =>
      ipcRenderer.invoke('project-rename', projectId, name),
    createEpisode: (projectId: string, value: string) =>
      ipcRenderer.invoke('project-create-episode', projectId, value),
    showProject: (projectId: string) => ipcRenderer.invoke('project-show', projectId),
    saveRawSubmission: (projectId: string, content: string) =>
      ipcRenderer.invoke('project-save-raw', projectId, content),
    importMarkdown: (projectId: string) => ipcRenderer.invoke('project-import-markdown', projectId),
    listMarkdown: (projectId: string) => ipcRenderer.invoke('project-markdown-list', projectId),
    readMarkdown: (projectId: string, relativePath: string) =>
      ipcRenderer.invoke('project-markdown-read', projectId, relativePath),
    beginStoryboardUpdate: (projectId: string, episodeId: string) =>
      ipcRenderer.invoke('project-storyboard-begin', projectId, episodeId),
    commitStoryboardUpdate: (
      projectId: string,
      episodeId: string,
      transactionId: string,
      writtenPaths: string[],
    ) =>
      ipcRenderer.invoke(
        'project-storyboard-commit',
        projectId,
        episodeId,
        transactionId,
        writtenPaths,
      ),
    rollbackStoryboardUpdate: (projectId: string, episodeId: string, transactionId: string) =>
      ipcRenderer.invoke('project-storyboard-rollback', projectId, episodeId, transactionId),
    writeMarkdown: (projectId: string, relativePath: string, content: string, revision?: string) =>
      ipcRenderer.invoke('project-markdown-write', projectId, relativePath, content, revision),
    saveState: (runId: string, episodeId: string, value: string) =>
      ipcRenderer.invoke('cloud-save-state', runId, episodeId, value),
    cancelRun: (runId: string) => ipcRenderer.invoke('cloud-cancel-run', runId),
    listTasks: (runId: string) => ipcRenderer.invoke('cloud-list-tasks', runId),
    resumeTask: (runId: string, taskId: string) =>
      ipcRenderer.invoke('cloud-resume-task', runId, taskId),
    stopTask: (runId: string, taskId: string) =>
      ipcRenderer.invoke('cloud-stop-task', runId, taskId),
    abandonTask: (runId: string, taskId: string) =>
      ipcRenderer.invoke('cloud-abandon-task', runId, taskId),
    exportMedia: (runId: string, sourcePath: string) =>
      ipcRenderer.invoke('cloud-export-media', runId, sourcePath),
    showMedia: (runId: string, sourcePath: string) =>
      ipcRenderer.invoke('cloud-show-media', runId, sourcePath),
    resolveMedia: (runId: string, sourcePaths: string[]) =>
      ipcRenderer.invoke('cloud-resolve-media', runId, sourcePaths),
  },
})
