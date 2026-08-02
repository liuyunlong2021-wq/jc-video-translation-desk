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
        textModel?: import('./types').TextModel,
      ) => Promise<{ text: string; writtenPaths: string[] }>
      generateVoice: (
        runId: string,
        text: string,
        voicePrompt: string,
        engine: import('./types').VoiceEngine,
      ) => Promise<{ path: string; duration: number }>
      localVoiceStatus: () => Promise<import('./types').LocalVoiceStatus>
      generateStoryboard: (
        params: import('./types').GenerateStoryboardImageParams,
      ) => Promise<string>
      generateAsset: (params: import('./types').GenerateAssetImageParams) => Promise<string>
      generateVideo: (params: import('./types').GenerateSegmentVideoParams) => Promise<string>
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
      listVoiceProfiles: (query?: Record<string, unknown>) => Promise<import('./voice-library').VoiceProfile[]>
      reviewVoiceProfile: (
        voiceProfileId: string,
        patch: import('./voice-library').VoiceProfile,
      ) => Promise<import('./voice-library').VoiceProfile>
      standardizeVoiceProfile: (voiceProfileId: string) => Promise<string>
      bindProjectVoice: (
        projectId: string,
        speakerId: string,
        voiceProfileId: string,
        taskId?: string,
      ) => Promise<{ voicePath: string; libraryPath: string }>
      createProject: (
        projectId: string,
        state: string,
      ) => Promise<import('./types').ProjectManifest>
      listProjects: () => Promise<import('./types').ProjectManifest[]>
      loadProject: (projectId: string) => Promise<string>
      getLastOpenedProject: () => Promise<string | null>
      setLastOpenedProject: (projectId: string) => Promise<void>
      renameProject: (projectId: string, name: string) => Promise<import('./types').ProjectManifest>
      showProject: (projectId: string) => Promise<string>
      saveRawSubmission: (projectId: string, content: string) => Promise<string>
      importMarkdown: (projectId: string) => Promise<import('./types').ImportedMarkdown | null>
      listMarkdown: (projectId: string) => Promise<string[]>
      readMarkdown: (
        projectId: string,
        relativePath: string,
      ) => Promise<import('./types').ProjectMarkdownDocument>
      beginStoryboardUpdate: (projectId: string) => Promise<string>
      commitStoryboardUpdate: (
        projectId: string,
        transactionId: string,
        writtenPaths: string[],
      ) => Promise<string[]>
      rollbackStoryboardUpdate: (projectId: string, transactionId: string) => Promise<void>
      writeMarkdown: (
        projectId: string,
        relativePath: string,
        content: string,
        revision?: string,
      ) => Promise<import('./types').ProjectMarkdownDocument>
      saveState: (runId: string, value: string) => Promise<void>
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
