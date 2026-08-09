const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '../..')
const funasrSource = path.join(projectRoot, 'third_party', 'FunASR')
const runtimeScript = path.join(projectRoot, 'runtime', 'funasr', 'runtime.py')
const pinnedCommit = '680b1b3f10d35c9fc388230800a3c8b0570271b0'

function dataRoot() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'jc-video-translation-desk')
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'jc-video-translation-desk')
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'jc-video-translation-desk')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`)
}

function pythonPath(venv) {
  return process.platform === 'win32'
    ? path.join(venv, 'Scripts', 'python.exe')
    : path.join(venv, 'bin', 'python')
}

function ensureSource() {
  if (!fs.existsSync(path.join(funasrSource, '.git')))
    run('git', ['clone', '--depth', '1', 'https://github.com/modelscope/FunASR.git', funasrSource])
  const head = spawnSync('git', ['-C', funasrSource, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (head.status !== 0) throw new Error('Cannot read the FunASR checkout')
  if (head.stdout.trim() !== pinnedCommit) {
    run('git', ['-C', funasrSource, 'fetch', '--depth', '1', 'origin', pinnedCommit])
    run('git', ['-C', funasrSource, 'checkout', '--detach', pinnedCommit])
  }
}

function main() {
  const root = dataRoot()
  const venv = path.join(root, 'runtime', 'funasr-venv')
  const configuredPython = process.env.FUNASR_PYTHON?.trim()
  const python = configuredPython ? path.resolve(configuredPython) : pythonPath(venv)
  const modelRoot = path.join(root, 'models', 'funasr')
  const probeAudio = path.join(funasrSource, 'runtime', 'funasr_api', 'asr_example.wav')
  const probeOnly = process.argv.includes('--probe-only')

  ensureSource()
  if (!probeOnly) {
    if (!configuredPython && !fs.existsSync(python)) run('uv', ['venv', '--python', '3.10', venv])
    run('uv', ['pip', 'install', '--python', python, 'torch', 'torchaudio'])
    run('uv', ['pip', 'install', '--python', python, funasrSource])
    run(python, [runtimeScript, 'download', '--model-root', modelRoot])
  }
  if (!fs.existsSync(python)) throw new Error('FunASR environment is missing; run pnpm setup:funasr')
  run(python, [path.join(projectRoot, 'runtime', 'funasr', 'test_runtime.py')])
  run(python, [runtimeScript, 'transcribe', '--model-root', modelRoot, '--audio', probeAudio], {
    env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
  })
  console.log(`FunASR is ready: ${root}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
