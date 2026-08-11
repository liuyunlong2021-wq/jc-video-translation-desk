const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const https = require('node:https')
const { execFileSync } = require('node:child_process')

const Arch = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
}

function copyNativeFileSync(sourceDir, targetDir) {
  const sourcePath = path.join(__dirname, `../../native/${sourceDir}`)
  const targetPath = path.join(__dirname, `../../dist-native/${targetDir}`)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Native binary not found at: ${sourcePath}`)
  }
  if (!fs.existsSync(path.join(__dirname, `../../dist-native`))) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  }
  fs.copyFileSync(sourcePath, targetPath)
}

const UV_VERSION = '0.12.3'
const UV_TARGETS = {
  x64: 'uv-x86_64-pc-windows-msvc.zip',
  arm64: 'uv-aarch64-pc-windows-msvc.zip',
  ia32: 'uv-i686-pc-windows-msvc.zip',
}

function downloadOnce(url, destination) {
  return new Promise((resolve, reject) => {
    const temporary = `${destination}.tmp`
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'jc-video-translation-desk-build',
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume()
          downloadOnce(response.headers.location, destination).then(resolve, reject)
          return
        }
        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error(`Download failed ${response.statusCode}: ${url}`))
          return
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        const file = fs.createWriteStream(temporary)
        response.pipe(file)
        file.once('finish', () =>
          file.close((error) => {
            if (error) {
              fs.rmSync(temporary, { force: true })
              reject(error)
              return
            }
            try {
              fs.renameSync(temporary, destination)
              resolve()
            } catch (renameError) {
              fs.rmSync(temporary, { force: true })
              reject(renameError)
            }
          }),
        )
        file.once('error', (error) => {
          fs.rmSync(temporary, { force: true })
          reject(error)
        })
      },
    )
    request.once('error', (error) => {
      fs.rmSync(temporary, { force: true })
      reject(error)
    })
  })
}

async function download(url, destination, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await downloadOnce(url, destination)
      return
    } catch (error) {
      fs.rmSync(`${destination}.tmp`, { force: true })
      if (attempt === attempts) throw error
      console.log(`[beforePack] Download retry ${attempt}/${attempts}: ${url}`)
    }
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function runVersion(command, expectedPattern) {
  try {
    return expectedPattern.test(execFileSync(command, ['--version'], { encoding: 'utf8' }))
  } catch {
    return false
  }
}

function verifyStaticBinary(packageName, executableName) {
  const value = require(packageName)
  const binaryPath = typeof value === 'string' ? value : value.path
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    throw new Error(`${executableName} not found from ${packageName}: ${binaryPath || 'empty path'}`)
  }
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK)
  } catch (error) {
    if (process.platform !== 'win32') throw error
  }
  console.log(`[beforePack] ${executableName} found at ${binaryPath}`)
}

async function prepareWindowsUv(arch) {
  const asset = UV_TARGETS[arch]
  if (!asset) throw new Error(`Unsupported Windows uv arch: ${arch}`)
  const targetDir = path.join(__dirname, '../../dist-native/runtime-tools/uv', arch)
  const uvPath = path.join(targetDir, 'uv.exe')
  const legacyUvPath = path.join(__dirname, '../../dist-native/runtime-tools/uv/uv.exe')
  if (fs.existsSync(uvPath) && runVersion(uvPath, new RegExp(`uv ${UV_VERSION}`))) {
    fs.rmSync(legacyUvPath, { force: true })
    return
  }
  fs.rmSync(uvPath, { force: true })
  if (fs.existsSync(legacyUvPath) && runVersion(legacyUvPath, new RegExp(`uv ${UV_VERSION}`))) {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(legacyUvPath, uvPath)
    fs.rmSync(legacyUvPath, { force: true })
    console.log(`[beforePack] uv migrated to ${uvPath}`)
    return
  }
  fs.rmSync(legacyUvPath, { force: true })

  const cacheDir = path.join(__dirname, '../.cache/runtime-tools')
  const archive = path.join(cacheDir, asset)
  const shaFile = `${archive}.sha256`
  const baseUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`
  if (!fs.existsSync(archive) || !fs.existsSync(shaFile)) {
    console.log(`[beforePack] Downloading uv ${UV_VERSION} for Windows ${arch}...`)
    await download(`${baseUrl}/${asset}`, archive)
    await download(`${baseUrl}/${asset}.sha256`, shaFile)
  }
  const expected = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0]
  const actual = sha256(archive)
  if (expected !== actual) throw new Error(`uv sha256 mismatch: expected ${expected}, got ${actual}`)

  const extractDir = path.join(cacheDir, `uv-${arch}`)
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'ByPass',
    '-Command',
    `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
  ])
  const extracted = findFile(extractDir, 'uv.exe')
  if (!extracted) throw new Error('uv.exe not found after extracting uv archive')
  fs.mkdirSync(targetDir, { recursive: true })
  fs.copyFileSync(extracted, uvPath)
  if (!runVersion(uvPath, new RegExp(`uv ${UV_VERSION}`)))
    throw new Error(`uv ${UV_VERSION} verification failed at ${uvPath}`)
  console.log(`[beforePack] uv copied to ${uvPath}`)
}

function findFile(root, fileName) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name)
    if (entry.isFile() && entry.name === fileName) return entryPath
    if (entry.isDirectory()) {
      const nested = findFile(entryPath, fileName)
      if (nested) return nested
    }
  }
  return null
}

module.exports = function beforePack(context) {
  // console.log('[beforePack] context:', context)

  const platform = context.packager.platform.nodeName
  const arch = Arch[context.arch]
  verifyStaticBinary('ffmpeg-static', 'FFmpeg')
  verifyStaticBinary('ffprobe-static', 'ffprobe')

  // better-sqlite3
  copyNativeFileSync(
    `better-sqlite3/better-sqlite3-v9.6.0-electron-v110-${platform}-${arch}.node`,
    `better-sqlite3.node`,
  )
  fs.mkdirSync(path.join(__dirname, '../../dist-native/runtime-tools'), { recursive: true })
  if (platform === 'win32') return prepareWindowsUv(arch)
}
