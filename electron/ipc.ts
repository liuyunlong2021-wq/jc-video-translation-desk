import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { isDev } from './lib/is-dev'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import { OpenExternalParams, StatEventParams } from './types'
import { composeGeneratedVideo, composePictureMaster } from './ffmpeg'
import { sendStatEvent } from './lib/stat'
import {
  cancelRun,
  generateAssetImage,
  generateScript,
  generateSegmentVideo,
  generateStoryboardImage,
  generateVoice as generateCloudVoice,
  hasApiKey,
  listCloudTasks,
  resumeCloudTask,
  resumePendingTasks,
  runSkill,
  runReferenceSearchSkill,
  runWikiSkill,
  saveApiKey,
  testApiKey,
  stopCloudTask,
  abandonCloudTask,
  analyzeMaterialVideo,
  withRunAbort,
} from './cloud'
import { cancelLocalVoice, generateLocalVoice, getLocalVoiceStatus } from './local-tts'
import {
  cancelIndexTts,
  generateEpisodeVoice,
  getIndexTtsStatus,
  startIndexTtsService,
  stopIndexTtsService,
} from './index-tts'
import {
  assertRunAsset,
  beginStoryboardMarkdownUpdate,
  commitStoryboardMarkdownUpdate,
  createProject,
  exportMedia,
  getLastOpenedProject,
  getRunDir,
  importMarkdown,
  listProjectMarkdown,
  listProjects,
  loadProjectState,
  loadLatestMediaState,
  renameProject,
  readProjectMarkdown,
  rollbackStoryboardMarkdownUpdate,
  saveRawSubmission,
  saveMediaState,
  selectAssetImage,
  selectCoreReference,
  setLastOpenedProject,
  writeProjectMarkdown,
  writeEditingTimeline,
} from './media-workspace'
import { bindProjectVoice, getVoiceLibraryDir, getVoicePackDir, listVoiceProfiles, reviewVoiceProfile, scanVoiceLibrary, standardizeVoiceProfile } from './voice-library'
import { generateMaterialTranscript } from './material-transcript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let windowMaximizedByApp = false

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = isDev ? process.env['VITE_DEV_SERVER_URL'] : undefined
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

export default function initIPC() {
  // sqlite 查询
  ipcMain.handle('sqlite-query', (_event, params) => sqQuery(params))
  // sqlite 插入
  ipcMain.handle('sqlite-insert', (_event, params) => sqInsert(params))
  // sqlite 更新
  ipcMain.handle('sqlite-update', (_event, params) => sqUpdate(params))
  // sqlite 删除
  ipcMain.handle('sqlite-delete', (_event, params) => sqDelete(params))
  // sqlite 批量插入或更新
  ipcMain.handle('sqlite-bulk-insert-or-update', (_event, params) => sqBulkInsertOrUpdate(params))

  // 是否最大化
  ipcMain.handle('is-win-maxed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return Boolean(win?.isMaximized() || windowMaximizedByApp)
  })
  //最小化
  ipcMain.on('win-min', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  //最大化
  ipcMain.on('win-max', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized() || windowMaximizedByApp) {
      win?.restore()
      windowMaximizedByApp = false
    } else {
      win?.maximize()
      windowMaximizedByApp = true
    }
  })
  // 切换最大化/还原
  ipcMain.on('toggle-window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (win.isMaximized() || windowMaximizedByApp) {
      win.restore()
      windowMaximizedByApp = false
    } else {
      win.maximize()
      windowMaximizedByApp = true
    }
  })
  // 拖拽前准备窗口状态：最大化时先还原，再返回还原后的窗口尺寸
  ipcMain.handle('prepare-window-drag', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const wasMaximized = win.isMaximized() || windowMaximizedByApp
    if (wasMaximized) {
      win.restore()
      windowMaximizedByApp = false
    }

    return {
      bounds: win.getBounds(),
      wasMaximized,
    }
  })
  // 获取窗口位置和大小
  ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.getBounds()
  })
  // 设置窗口位置
  ipcMain.on('set-window-position', (event, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setPosition(Math.round(x), Math.round(y))
  })
  //关闭程序
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 设置缩放倍率
  ipcMain.on('set-zoom-factor', (event, factor: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.webContents.setZoomFactor(factor)
  })

  // 打开外部链接
  ipcMain.handle('open-external', (_event, params: OpenExternalParams) => {
    const url = new URL(String(params?.url || ''))
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
      throw new Error('不允许打开该外部地址')
    return shell.openExternal(url.toString())
  })

  ipcMain.handle('cloud-has-api-key', () => hasApiKey())
  ipcMain.handle('cloud-save-api-key', (_event, apiKey: string) => saveApiKey(apiKey))
  ipcMain.handle('cloud-test-api-key', () => testApiKey())
  ipcMain.handle('cloud-generate-script', (_event, brief) => generateScript(brief))
  ipcMain.handle(
    'cloud-run-skill',
    (_event, skillName: string, input: string, runId?: string, textModel?: import('./types').TextModel) =>
      runSkill(skillName, input, runId, textModel),
  )
  ipcMain.handle(
    'cloud-run-wiki-skill',
    (_event, skillName: string, input: string, projectId: string, textModel?: import('./types').TextModel) =>
      runWikiSkill(skillName, input, projectId, textModel),
  )
  ipcMain.handle(
    'cloud-generate-voice',
    (_event, runId: string, text: string, voicePrompt: string, engine: 'cloud' | 'local') =>
      engine === 'local'
        ? generateLocalVoice(runId, text, voicePrompt)
        : generateCloudVoice(runId, text, voicePrompt),
  )
  ipcMain.handle('local-voice-status', () => getLocalVoiceStatus())
  ipcMain.handle('index-tts-status', () => getIndexTtsStatus())
  ipcMain.handle('index-tts-start', () => startIndexTtsService())
  ipcMain.handle('index-tts-stop', () => stopIndexTtsService())
  ipcMain.handle('index-tts-generate-episode', (_event, params) => generateEpisodeVoice(params))
  ipcMain.handle('cloud-generate-storyboard', (_event, params) =>
    generateStoryboardImage(
      params.runId,
      params.index,
      params.prompt,
      params.ratio,
      params.referencePaths?.length ? params.referencePaths : params.referencePath,
    ),
  )
  ipcMain.handle('cloud-generate-asset', (_event, params) =>
    generateAssetImage(
      params.runId,
      params.assetId,
      params.role,
      params.design,
      params.referencePaths?.length ? params.referencePaths : params.referencePath,
      params.assetLabel,
    ),
  )
  ipcMain.handle('cloud-generate-video', (_event, params) =>
    generateSegmentVideo(
      params.runId,
      params.index,
      params.model,
      params.prompt,
      params.ratio,
      params.generationDuration,
      params.imagePath,
      params.imagePaths,
    ),
  )
  ipcMain.handle('material-generate-srt', (_event, params) => generateMaterialTranscript(params))
  ipcMain.handle('material-analyze-video', (_event, params) => analyzeMaterialVideo(params))
  ipcMain.handle('material-write-editing-timeline', (_event, runId: string, timeline) => writeEditingTimeline(runId, timeline))
  ipcMain.handle('cloud-compose-picture-master', (_event, params) =>
    withRunAbort(params.runId, (signal) =>
      composePictureMaster({ ...params, abortSignal: signal }),
    ),
  )
  ipcMain.handle('cloud-compose-video', (_event, params) =>
    withRunAbort(params.runId, (signal) =>
      composeGeneratedVideo({ ...params, abortSignal: signal }),
    ),
  )
  ipcMain.handle('cloud-resume-pending', (_event, runId: string) => resumePendingTasks(runId))
  ipcMain.handle('cloud-list-tasks', (_event, runId: string) => listCloudTasks(runId))
  ipcMain.handle('cloud-resume-task', (_event, runId: string, taskId: string) =>
    resumeCloudTask(runId, taskId),
  )
  ipcMain.handle('cloud-stop-task', (_event, runId: string, taskId: string) =>
    stopCloudTask(runId, taskId),
  )
  ipcMain.handle('cloud-abandon-task', (_event, runId: string, taskId: string) =>
    abandonCloudTask(runId, taskId),
  )
  ipcMain.handle('cloud-select-core-reference', (_event, runId: string) =>
    selectCoreReference(runId),
  )
  ipcMain.handle('project-select-asset-image', (_event, runId: string, assetId: string) =>
    selectAssetImage(runId, assetId),
  )
  ipcMain.handle(
    'project-search-asset-image',
    (_event, runId: string, assetId: string, searchQuery: string, rejectedPinIds?: string[]) =>
      runReferenceSearchSkill(runId, assetId, searchQuery, rejectedPinIds),
  )
  ipcMain.handle('cloud-load-latest-state', () => loadLatestMediaState())
  ipcMain.handle('voice-library-scan', (_event, sourceRoot: string) => scanVoiceLibrary(sourceRoot))
  ipcMain.handle('voice-library-path', () => getVoiceLibraryDir())
  ipcMain.handle('voice-library-open-pack', (_event, voiceProfileId: string) => shell.openPath(getVoicePackDir(voiceProfileId)))
  ipcMain.handle('voice-library-list', (_event, query) => listVoiceProfiles(query))
  ipcMain.handle('voice-library-review', (_event, voiceProfileId, patch) => reviewVoiceProfile(voiceProfileId, patch))
  ipcMain.handle('voice-library-standardize', (_event, voiceProfileId: string) => standardizeVoiceProfile(voiceProfileId))
  ipcMain.handle(
    'project-bind-voice',
    (_event, projectId: string, speakerId: string, voiceProfileId: string, taskId?: string) =>
      bindProjectVoice(projectId, speakerId, voiceProfileId, taskId),
  )
  ipcMain.handle('project-create', (_event, projectId: string, state: string) =>
    createProject(projectId, state),
  )
  ipcMain.handle('project-list', () => listProjects())
  ipcMain.handle('project-load', (_event, projectId: string) => loadProjectState(projectId))
  ipcMain.handle('project-last-opened', () => getLastOpenedProject())
  ipcMain.handle('project-set-last-opened', (_event, projectId: string) =>
    setLastOpenedProject(projectId),
  )
  ipcMain.handle('project-rename', (_event, projectId: string, name: string) =>
    renameProject(projectId, name),
  )
  ipcMain.handle('project-show', (_event, projectId: string) =>
    shell.openPath(getRunDir(projectId)),
  )
  ipcMain.handle('project-save-raw', (_event, projectId: string, content: string) =>
    saveRawSubmission(projectId, content),
  )
  ipcMain.handle('project-import-markdown', (_event, projectId: string) =>
    importMarkdown(projectId),
  )
  ipcMain.handle('project-markdown-list', (_event, projectId: string) =>
    listProjectMarkdown(projectId),
  )
  ipcMain.handle('project-markdown-read', (_event, projectId: string, relativePath: string) =>
    readProjectMarkdown(projectId, relativePath),
  )
  ipcMain.handle('project-storyboard-begin', (_event, projectId: string) =>
    beginStoryboardMarkdownUpdate(projectId),
  )
  ipcMain.handle(
    'project-storyboard-commit',
    (_event, projectId: string, transactionId: string, writtenPaths: string[]) =>
      commitStoryboardMarkdownUpdate(projectId, transactionId, writtenPaths),
  )
  ipcMain.handle(
    'project-storyboard-rollback',
    (_event, projectId: string, transactionId: string) =>
      rollbackStoryboardMarkdownUpdate(projectId, transactionId),
  )
  ipcMain.handle(
    'project-markdown-write',
    (_event, projectId: string, relativePath: string, content: string, revision?: string) =>
      writeProjectMarkdown(projectId, relativePath, content, revision),
  )
  ipcMain.handle('cloud-save-state', (_event, runId: string, value: string) =>
    saveMediaState(runId, value),
  )
  ipcMain.handle(
    'cloud-cancel-run',
    async (_event, runId: string) => (await cancelRun(runId)) + cancelLocalVoice(runId) + cancelIndexTts(runId),
  )
  ipcMain.handle('cloud-export-media', (_event, runId: string, sourcePath: string) =>
    exportMedia(assertRunAsset(runId, sourcePath)),
  )
  ipcMain.handle('cloud-show-media', (_event, runId: string, sourcePath: string) =>
    shell.showItemInFolder(assertRunAsset(runId, sourcePath)),
  )
  ipcMain.handle('cloud-resolve-media', (_event, runId: string, sourcePaths: string[]) =>
    sourcePaths.map((sourcePath) => assertRunAsset(runId, sourcePath)),
  )

  // 统计事件上报
  ipcMain.handle('stat-track', (_event, params: StatEventParams) => sendStatEvent(params))
}
