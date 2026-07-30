import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import { OpenExternalParams, StatEventParams } from './types'
import { composeGeneratedVideo } from './ffmpeg'
import { sendStatEvent } from './lib/stat'
import {
  API_KEYS_URL,
  cancelRun,
  generateScript,
  generateSegmentVideo,
  generateStoryboardImage,
  generateVoice,
  hasApiKey,
  resumePendingTasks,
  runSkill,
  saveApiKey,
  testApiKey,
  withRunAbort,
} from './cloud'
import {
  assertRunAsset,
  exportMedia,
  loadLatestMediaState,
  saveMediaState,
  selectCoreReference,
} from './media-workspace'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let windowMaximizedByApp = false

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
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
    if (params.url !== API_KEYS_URL) throw new Error('不允许打开该外部地址')
    return shell.openExternal(API_KEYS_URL)
  })

  ipcMain.handle('cloud-has-api-key', () => hasApiKey())
  ipcMain.handle('cloud-save-api-key', (_event, apiKey: string) => saveApiKey(apiKey))
  ipcMain.handle('cloud-test-api-key', () => testApiKey())
  ipcMain.handle('cloud-generate-script', (_event, brief) => generateScript(brief))
  ipcMain.handle('cloud-run-skill', (_event, skillName: string, input: string, runId?: string) =>
    runSkill(skillName, input, runId),
  )
  ipcMain.handle(
    'cloud-generate-voice',
    (_event, runId: string, text: string, voicePrompt: string) =>
      generateVoice(runId, text, voicePrompt),
  )
  ipcMain.handle('cloud-generate-storyboard', (_event, params) =>
    generateStoryboardImage(
      params.runId,
      params.index,
      params.prompt,
      params.ratio,
      params.referencePath,
    ),
  )
  ipcMain.handle('cloud-generate-video', (_event, params) =>
    generateSegmentVideo(
      params.runId,
      params.index,
      params.prompt,
      params.ratio,
      params.generationDuration,
      params.imagePath,
    ),
  )
  ipcMain.handle('cloud-compose-video', (_event, params) =>
    withRunAbort(params.runId, (signal) =>
      composeGeneratedVideo({ ...params, abortSignal: signal }),
    ),
  )
  ipcMain.handle('cloud-resume-pending', (_event, runId: string) => resumePendingTasks(runId))
  ipcMain.handle('cloud-select-core-reference', (_event, runId: string) =>
    selectCoreReference(runId),
  )
  ipcMain.handle('cloud-load-latest-state', () => loadLatestMediaState())
  ipcMain.handle('cloud-save-state', (_event, runId: string, value: string) =>
    saveMediaState(runId, value),
  )
  ipcMain.handle('cloud-cancel-run', (_event, runId: string) => cancelRun(runId))
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
