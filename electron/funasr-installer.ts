import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import axios from 'axios'

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
const SEPARATION_MODELS = {
  vocals: 'vocals.fp16.onnx',
  accompaniment: 'accompaniment.fp16.onnx',
} as const
const SEPARATION_MODEL_URL =
  'https://www.modelscope.cn/models/himyworld/videotrans/resolve/master/onnx/'

let installing: Promise<FunAsrInstallStatus> | null = null

function dataRoot() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  return app.getPath('userData')
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

function separationModelsInstalled() {
  return Object.values(SEPARATION_MODELS).every((name) =>
    fs.existsSync(path.join(separationModelRoot(), name)),
  )
}

function separationModelRoot() {
  return path.join(dataRoot(), 'models', 'separation')
}

async function downloadFile(
  url: string,
  destination: string,
  reportProgress: (message: string) => void,
) {
  const response = await axios.get<NodeJS.ReadableStream>(url, { responseType: 'stream' })
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp`
  const file = fs.createWriteStream(temporary)
  let bytes = 0
  for await (const chunk of response.data as AsyncIterable<Buffer>) {
    file.write(chunk)
    bytes += chunk.byteLength
    if (bytes % (4 * 1024 * 1024) < chunk.byteLength)
      reportProgress(`已下载 ${Math.round(bytes / 1024 / 1024)} MB：${path.basename(destination)}`)
  }
  await new Promise<void>((resolve, reject) => {
    file.once('error', reject)
    file.end(resolve)
  })
  await fs.promises.rename(temporary, destination)
}

function sendProgress(reportProgress: (message: string) => void, data: Buffer) {
  for (const line of data.toString().split(/\r?\n/)) if (line.trim()) reportProgress(line.trim())
}

function run(command: string, args: string[], reportProgress: (message: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
    })
    child.stdout.on('data', (data) => sendProgress(reportProgress, data))
    child.stderr.on('data', (data) => sendProgress(reportProgress, data))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(command)} 安装失败（退出码 ${code}）`)),
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
    if (
      (candidate === 'uv' || candidate === 'uv.exe' || fs.existsSync(candidate)) &&
      (await canRun(candidate))
    )
      return candidate
  reportProgress('正在安装本地运行环境…')
  if (process.platform === 'win32')
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'ByPass',
        '-Command',
        'irm https://astral.sh/uv/install.ps1 | iex',
      ],
      reportProgress,
    )
  else
    await run('/bin/sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], reportProgress)
  const installed = candidates.find(
    (candidate) => candidate !== 'uv' && candidate !== 'uv.exe' && fs.existsSync(candidate),
  )
  if (!installed) throw new Error('本地运行环境安装后仍未找到 uv，请检查网络和系统权限')
  return installed
}

export async function getFunAsrInstallStatus(): Promise<FunAsrInstallStatus> {
  if (installing) return { state: 'installing', message: '正在安装本地音频引擎…' }
  if (fs.existsSync(pythonPath()) && modelsInstalled() && separationModelsInstalled())
    return { state: 'ready', message: '本地字幕与人声分离引擎已就绪' }
  return { state: 'missing', message: '首次使用需下载本地字幕、人声分离引擎和模型（约 2 GB）' }
}

export async function installFunAsr(reportProgress: (message: string) => void) {
  if (installing) return installing
  installing = (async () => {
    try {
      if (fs.existsSync(pythonPath()) && modelsInstalled() && separationModelsInstalled())
        return { state: 'ready' as const, message: '本地字幕与人声分离引擎已就绪' }
      const root = dataRoot()
      const venv = path.dirname(path.dirname(pythonPath()))
      const uv = await findUv(reportProgress)
      reportProgress('正在准备 Python 3.10 环境…')
      if (!fs.existsSync(pythonPath()))
        await run(uv, ['venv', '--python', '3.10', venv], reportProgress)
      reportProgress('正在安装字幕与人声分离依赖…')
      await run(
        uv,
        [
          'pip',
          'install',
          '--python',
          pythonPath(),
          'torch',
          'torchaudio',
          'funasr==1.4.1',
          'sherpa-onnx==1.13.4',
          'soundfile==0.13.1',
        ],
        reportProgress,
      )
      reportProgress('正在下载字幕识别模型，请保持网络连接…')
      await run(
        pythonPath(),
        [runtimePath(), 'download', '--model-root', modelRoot()],
        reportProgress,
      )
      reportProgress('正在验证本地字幕引擎…')
      await run(pythonPath(), [runtimePath(), 'probe', '--model-root', modelRoot()], reportProgress)
      reportProgress('正在下载人声分离模型，请保持网络连接…')
      for (const name of Object.values(SEPARATION_MODELS)) {
        const destination = path.join(separationModelRoot(), name)
        if (!fs.existsSync(destination))
          await downloadFile(`${SEPARATION_MODEL_URL}${name}`, destination, reportProgress)
      }
      return { state: 'ready' as const, message: `本地字幕与人声分离引擎已就绪：${root}` }
    } catch (error) {
      return {
        state: 'failed' as const,
        message: error instanceof Error ? error.message : String(error),
      }
    } finally {
      installing = null
    }
  })()
  return installing
}
