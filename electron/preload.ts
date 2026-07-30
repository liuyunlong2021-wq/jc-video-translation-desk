import { ipcRenderer, contextBridge } from 'electron'
import {
  QueryParams,
  InsertParams,
  UpdateParams,
  DeleteParams,
  BulkInsertOrUpdateParams,
} from './sqlite/types'
import { OpenExternalParams, StatEventParams } from './types'

// --------- 向界面渲染进程暴露某些API ---------

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args
    return ipcRenderer.once(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('i18n', {
  getLocalesPath: () => ipcRenderer.invoke('i18n-getLocalesPath'),
  getLanguage: () => ipcRenderer.invoke('i18n-getLanguage'),
  changeLanguage: (lng: string) => ipcRenderer.invoke('i18n-changeLanguage', lng),
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
    generateScript: (brief: import('./types').MediaScriptBrief) =>
      ipcRenderer.invoke('cloud-generate-script', brief),
    runSkill: (skillName: string, input: string, runId?: string) =>
      ipcRenderer.invoke('cloud-run-skill', skillName, input, runId),
    generateVoice: (runId: string, text: string, voicePrompt: string) =>
      ipcRenderer.invoke('cloud-generate-voice', runId, text, voicePrompt),
    generateStoryboard: (params: import('./types').GenerateStoryboardImageParams) =>
      ipcRenderer.invoke('cloud-generate-storyboard', params),
    generateVideo: (params: import('./types').GenerateSegmentVideoParams) =>
      ipcRenderer.invoke('cloud-generate-video', params),
    composeVideo: (params: import('./ffmpeg/types').ComposeGeneratedVideoParams) =>
      ipcRenderer.invoke('cloud-compose-video', params),
    resumePending: (runId: string) => ipcRenderer.invoke('cloud-resume-pending', runId),
    selectCoreReference: (runId: string) =>
      ipcRenderer.invoke('cloud-select-core-reference', runId),
    loadLatestState: () => ipcRenderer.invoke('cloud-load-latest-state'),
    saveState: (runId: string, value: string) =>
      ipcRenderer.invoke('cloud-save-state', runId, value),
    cancelRun: (runId: string) => ipcRenderer.invoke('cloud-cancel-run', runId),
    exportMedia: (runId: string, sourcePath: string) =>
      ipcRenderer.invoke('cloud-export-media', runId, sourcePath),
    showMedia: (runId: string, sourcePath: string) =>
      ipcRenderer.invoke('cloud-show-media', runId, sourcePath),
    resolveMedia: (runId: string, sourcePaths: string[]) =>
      ipcRenderer.invoke('cloud-resolve-media', runId, sourcePaths),
  },
})

contextBridge.exposeInMainWorld('sqlite', {
  query: (params: QueryParams) => ipcRenderer.invoke('sqlite-query', params),
  insert: (params: InsertParams) => ipcRenderer.invoke('sqlite-insert', params),
  update: (params: UpdateParams) => ipcRenderer.invoke('sqlite-update', params),
  delete: (params: DeleteParams) => ipcRenderer.invoke('sqlite-delete', params),
  bulkInsertOrUpdate: (params: BulkInsertOrUpdateParams) =>
    ipcRenderer.invoke('sqlite-bulk-insert-or-update', params),
})
