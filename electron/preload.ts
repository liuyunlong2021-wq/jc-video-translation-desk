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
      textModel?: import('./types').TextModel,
    ) => ipcRenderer.invoke('cloud-run-wiki-skill', skillName, input, projectId, textModel),
    generateVoice: (
      runId: string,
      text: string,
      voicePrompt: string,
      engine: import('./types').VoiceEngine,
    ) => ipcRenderer.invoke('cloud-generate-voice', runId, text, voicePrompt, engine),
    localVoiceStatus: () => ipcRenderer.invoke('local-voice-status'),
    generateStoryboard: (params: import('./types').GenerateStoryboardImageParams) =>
      ipcRenderer.invoke('cloud-generate-storyboard', params),
    generateAsset: (params: import('./types').GenerateAssetImageParams) =>
      ipcRenderer.invoke('cloud-generate-asset', params),
    generateVideo: (params: import('./types').GenerateSegmentVideoParams) =>
      ipcRenderer.invoke('cloud-generate-video', params),
    composeVideo: (params: import('./ffmpeg/types').ComposeGeneratedVideoParams) =>
      ipcRenderer.invoke('cloud-compose-video', params),
    resumePending: (runId: string) => ipcRenderer.invoke('cloud-resume-pending', runId),
    selectCoreReference: (runId: string) =>
      ipcRenderer.invoke('cloud-select-core-reference', runId),
    selectAssetImage: (runId: string, assetId: string) =>
      ipcRenderer.invoke('project-select-asset-image', runId, assetId),
    searchAssetImage: (runId: string, assetId: string, searchQuery: string, rejectedPinIds?: string[]) =>
      ipcRenderer.invoke('project-search-asset-image', runId, assetId, searchQuery, rejectedPinIds),
    loadLatestState: () => ipcRenderer.invoke('cloud-load-latest-state'),
    scanVoiceLibrary: (sourceRoot: string) => ipcRenderer.invoke('voice-library-scan', sourceRoot),
    voiceLibraryPath: () => ipcRenderer.invoke('voice-library-path'),
    listVoiceProfiles: (query?: Record<string, unknown>) => ipcRenderer.invoke('voice-library-list', query),
    reviewVoiceProfile: (voiceProfileId: string, patch: import('./voice-library').VoiceProfile) =>
      ipcRenderer.invoke('voice-library-review', voiceProfileId, patch),
    standardizeVoiceProfile: (voiceProfileId: string) => ipcRenderer.invoke('voice-library-standardize', voiceProfileId),
    bindProjectVoice: (projectId: string, speakerId: string, voiceProfileId: string, taskId?: string) =>
      ipcRenderer.invoke('project-bind-voice', projectId, speakerId, voiceProfileId, taskId),
    createProject: (projectId: string, state: string) =>
      ipcRenderer.invoke('project-create', projectId, state),
    listProjects: () => ipcRenderer.invoke('project-list'),
    loadProject: (projectId: string) => ipcRenderer.invoke('project-load', projectId),
    getLastOpenedProject: () => ipcRenderer.invoke('project-last-opened'),
    setLastOpenedProject: (projectId: string) =>
      ipcRenderer.invoke('project-set-last-opened', projectId),
    renameProject: (projectId: string, name: string) =>
      ipcRenderer.invoke('project-rename', projectId, name),
    showProject: (projectId: string) => ipcRenderer.invoke('project-show', projectId),
    saveRawSubmission: (projectId: string, content: string) =>
      ipcRenderer.invoke('project-save-raw', projectId, content),
    importMarkdown: (projectId: string) => ipcRenderer.invoke('project-import-markdown', projectId),
    listMarkdown: (projectId: string) => ipcRenderer.invoke('project-markdown-list', projectId),
    readMarkdown: (projectId: string, relativePath: string) =>
      ipcRenderer.invoke('project-markdown-read', projectId, relativePath),
    beginStoryboardUpdate: (projectId: string) =>
      ipcRenderer.invoke('project-storyboard-begin', projectId),
    commitStoryboardUpdate: (projectId: string, transactionId: string, writtenPaths: string[]) =>
      ipcRenderer.invoke('project-storyboard-commit', projectId, transactionId, writtenPaths),
    rollbackStoryboardUpdate: (projectId: string, transactionId: string) =>
      ipcRenderer.invoke('project-storyboard-rollback', projectId, transactionId),
    writeMarkdown: (
      projectId: string,
      relativePath: string,
      content: string,
      revision?: string,
    ) => ipcRenderer.invoke('project-markdown-write', projectId, relativePath, content, revision),
    saveState: (runId: string, value: string) =>
      ipcRenderer.invoke('cloud-save-state', runId, value),
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
