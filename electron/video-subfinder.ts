import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

const VIDEO_SUB_FINDER_EXE_NAMES = ['VideoSubFinderWXW.exe', 'VideoSubFinder.exe']
const SKIP_DIRS = new Set([
  '$Recycle.Bin',
  '.git',
  'node_modules',
  'System Volume Information',
  'Windows',
])

let cachedPath: string | null | undefined

function localRuntimeHome() {
  if (process.env.FUNASR_HOME) return path.resolve(process.env.FUNASR_HOME)
  return app.getPath('userData')
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean).map((item) => path.resolve(item)))]
}

async function exists(filePath: string) {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findInDirectory(root: string, maxDepth: number) {
  const pending = [{ dir: root, depth: 0 }]
  while (pending.length) {
    const current = pending.shift()!
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name)
      if (entry.isFile() && VIDEO_SUB_FINDER_EXE_NAMES.includes(entry.name)) return fullPath
      if (
        entry.isDirectory() &&
        current.depth < maxDepth &&
        !SKIP_DIRS.has(entry.name) &&
        !entry.name.startsWith('.')
      ) {
        pending.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }
  return null
}

function candidateFiles() {
  const roots = unique([
    path.join(localRuntimeHome(), 'runtime', 'videosubfinder'),
    path.join(process.cwd(), 'runtime', 'videosubfinder'),
    path.join(process.cwd(), 'dist-native', 'videosubfinder'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Desktop'),
  ])
  return roots.flatMap((root) => VIDEO_SUB_FINDER_EXE_NAMES.map((name) => path.join(root, name)))
}

function scanRoots() {
  const driveRoots =
    process.platform === 'win32'
      ? unique([
          path.parse(process.cwd()).root,
          path.parse(os.homedir()).root,
          'D:\\',
          'E:\\',
        ])
      : []
  return unique([
    process.env.LOCALAPPDATA || '',
    process.env.APPDATA || '',
    process.env.ProgramFiles || '',
    process.env['ProgramFiles(x86)'] || '',
    os.homedir(),
    ...driveRoots,
  ])
}

export function defaultVideoSubFinderRoot() {
  return path.join(localRuntimeHome(), 'runtime', 'videosubfinder')
}

export async function resolveVideoSubFinderPath() {
  if (cachedPath !== undefined) return cachedPath
  if (process.env.VIDEO_SUB_FINDER_PATH && (await exists(process.env.VIDEO_SUB_FINDER_PATH))) {
    cachedPath = path.resolve(process.env.VIDEO_SUB_FINDER_PATH)
    return cachedPath
  }
  for (const candidate of candidateFiles()) {
    if (await exists(candidate)) {
      cachedPath = candidate
      return cachedPath
    }
  }
  for (const root of scanRoots()) {
    const found = await findInDirectory(root, root.endsWith(':\\') ? 4 : 5)
    if (found) {
      cachedPath = found
      return cachedPath
    }
  }
  cachedPath = null
  return null
}

export function clearVideoSubFinderPathCache() {
  cachedPath = undefined
}
