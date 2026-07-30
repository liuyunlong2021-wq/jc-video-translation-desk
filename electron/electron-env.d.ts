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
  ipcRenderer: Pick<import('electron').IpcRenderer, 'on' | 'once' | 'off' | 'send' | 'invoke'>
  i18n: {
    getLocalesPath: () => Promise<string>
    getLanguage: () => Promise<string>
    changeLanguage: (lng: string) => Promise<string>
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
      runSkill: (skillName: string, input: string, runId?: string) => Promise<any>
      generateVoice: (
        runId: string,
        text: string,
        voicePrompt: string,
      ) => Promise<{ path: string; duration: number }>
      generateStoryboard: (
        params: import('./types').GenerateStoryboardImageParams,
      ) => Promise<string>
      generateVideo: (params: import('./types').GenerateSegmentVideoParams) => Promise<string>
      composeVideo: (
        params: import('./ffmpeg/types').ComposeGeneratedVideoParams,
      ) => Promise<string>
      resumePending: (runId: string) => Promise<import('./types').ResumedCloudTask[]>
      selectCoreReference: (
        runId: string,
      ) => Promise<import('./types').CoreReferenceAsset | null>
      loadLatestState: () => Promise<string | null>
      saveState: (runId: string, value: string) => Promise<void>
      cancelRun: (runId: string) => Promise<number>
      exportMedia: (runId: string, sourcePath: string) => Promise<string | null>
      showMedia: (runId: string, sourcePath: string) => Promise<void>
      resolveMedia: (runId: string, sourcePaths: string[]) => Promise<string[]>
    }
  }
  sqlite: {
    query: (param: import('./sqlite/types').QueryParams) => Promise<any>
    insert: (param: import('./sqlite/types').InsertParams) => Promise<number>
    update: (param: import('./sqlite/types').UpdateParams) => Promise<number>
    delete: (param: import('./sqlite/types').DeleteParams) => Promise<void>
    bulkInsertOrUpdate: (param: import('./sqlite/types').BulkInsertOrUpdateParams) => Promise<void>
  }
}
