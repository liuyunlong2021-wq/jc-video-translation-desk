import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'

export type FunAsrInstallStatus = {
  state: 'ready' | 'missing' | 'installing' | 'failed'
  message: string
}

const MODEL_DIRS = [
  'iic--SenseVoiceSmall/snapshots/master',
  'iic--speech_fsmn_vad_zh-cn-16k-common-pytorch/snapshots/master',
  'iic--punc_ct-transformer_cn-en-common-vocab471067-large/snapshots/master',
  'iic--speech_campplus_sv_zh-cn_16k-common/snapshots/master',
]

let installing: Promise<FunAsrInstallStatus> | null = null

function dataRoot() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'jc-video-translation-desk')
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'jc-video-translation-desk')
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'jc-video-translation-desk',
  )
}

function pythonPath() {
  return path.join(
    dataRoot(),
    'runtime',
    'funasr-venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
}

function runtimePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'funasr', 'runtime.py')
    : path.join(process.cwd(), 'runtime', 'funasr', 'runtime.py')
}

function modelRoot() {
  return path.join(dataRoot(), 'models', 'funasr')
}

function modelsInstalled() {
  return MODEL_DIRS.every((relative) => fs.existsSync(path.join(modelRoot(), relative)))
}

function sendProgress(reportProgress: (message: string) => void, data: Buffer) {
  for (const line of data.toString().split(/\r?\n/)) if (line.trim()) reportProgress(line.trim())
}

function run(command: string, args: string[], reportProgress: (message: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } })
    child.stdout.on('data', (data) => sendProgress(reportProgress, data))
    child.stderr.on('data', (data) => sendProgress(reportProgress, data))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} 安装失败（退出码 ${code}）`)),
    )
  })
}

function canRun(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}

async function findUv(reportProgress: (message: string) => void) {
  const names = process.platform === 'win32' ? ['uv.exe', 'uv'] : ['uv']
  const candidates = [
    ...names,
    path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv'),
    path.join(os.homedir(), '.local', 'bin', 'uv.exe'),
    path.join(os.homedir(), '.local', 'bin', 'uv'),
    path.join(process.env.LOCALAPPDATA || '', 'uv', 'uv.exe'),
  ].filter(Boolean)
  for (const candidate of candidates)
    if ((candidate === 'uv' || candidate === 'uv.exe' || fs.existsSync(candidate)) && (await canRun(candidate)))
      return candidate
  reportProgress('正在安装本地运行环境…')
  if (process.platform === 'win32')
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'ByPass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'], reportProgress)
  else await run('/bin/sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], reportProgress)
  const installed = candidates.find(
    (candidate) => candidate !== 'uv' && candidate !== 'uv.exe' && fs.existsSync(candidate),
  )
  if (!installed) throw new Error('本地运行环境安装后仍未找到 uv，请检查网络和系统权限')
  return installed
}

export async function getFunAsrInstallStatus(): Promise<FunAsrInstallStatus> {
  if (installing) return { state: 'installing', message: '正在安装本地字幕引擎…' }
  if (fs.existsSync(pythonPath()) && modelsInstalled())
    return { state: 'ready', message: '本地字幕引擎已就绪' }
  return { state: 'missing', message: '首次使用需下载本地字幕引擎和模型（约 2 GB）' }
}

export async function installFunAsr(reportProgress: (message: string) => void) {
  if (installing) return installing
  installing = (async () => {
    try {
      if (fs.existsSync(pythonPath()) && modelsInstalled())
        return { state: 'ready' as const, message: '本地字幕引擎已就绪' }
      const root = dataRoot()
      const venv = path.dirname(path.dirname(pythonPath()))
      const uv = await findUv(reportProgress)
      reportProgress('正在准备 Python 3.10 环境…')
      if (!fs.existsSync(pythonPath())) await run(uv, ['venv', '--python', '3.10', venv], reportProgress)
      reportProgress('正在安装 FunASR 和语音识别依赖…')
      await run(uv, ['pip', 'install', '--python', pythonPath(), 'torch', 'torchaudio', 'funasr==1.4.1'], reportProgress)
      reportProgress('正在下载字幕识别模型，请保持网络连接…')
      await run(pythonPath(), [runtimePath(), 'download', '--model-root', modelRoot()], reportProgress)
      reportProgress('正在验证本地字幕引擎…')
      await run(pythonPath(), [runtimePath(), 'probe', '--model-root', modelRoot()], reportProgress)
      return { state: 'ready' as const, message: `本地字幕引擎已就绪：${root}` }
    } catch (error) {
      return { state: 'failed' as const, message: error instanceof Error ? error.message : String(error) }
    } finally {
      installing = null
    }
  })()
  return installing
}
