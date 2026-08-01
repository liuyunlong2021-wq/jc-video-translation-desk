import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import test, * as nodeTest from 'node:test'
import { parseBuffer } from 'music-metadata'

const { after, mock } = nodeTest as any
const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static') as string
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-factory-ffmpeg-'))

mock.module('electron', {
  namedExports: {
    app: { getPath: () => userData },
    net: {},
    dialog: {},
  },
})
;(globalThis as any).require = require
process.env.VITE_DEV_SERVER_URL = 'test'
const { composeGeneratedVideo } = await import('../../electron/ffmpeg/index.ts')
const { ensureRunDir, getRunAssetPath } = await import('../../electron/media-workspace.ts')

after(() => fs.rmSync(userData, { recursive: true, force: true }))

function ffmpeg(args: string[]) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
}

test('composes only the unified voice and matches its real duration', async () => {
  const runId = 'compose-run'
  await ensureRunDir(runId)
  const clip1 = getRunAssetPath(runId, 'clip', 1)
  const clip2 = getRunAssetPath(runId, 'clip', 2)
  const voice = getRunAssetPath(runId, 'voice')

  for (const [file, color, frequency] of [
    [clip1, 'red', '220'],
    [clip2, 'blue', '330'],
  ]) {
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=${color}:s=320x180:d=0.3`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=0.3`,
      '-shortest',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-y',
      file,
    ])
  }
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=0.6',
    '-c:a',
    'libmp3lame',
    '-y',
    voice,
  ])

  const output = await composeGeneratedVideo({
    runId,
    videoFiles: [clip1, clip2],
    playDurations: [0.3, 0.3],
    voiceFile: voice,
    ratio: '1:1',
  })
  const voiceDuration = (await parseBuffer(await fs.promises.readFile(voice))).format.duration!
  const outputDuration = (await parseBuffer(await fs.promises.readFile(output))).format.duration!
  assert.ok(Math.abs(outputDuration - voiceDuration) <= 1 / 30)

  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', output], { encoding: 'utf8' }).stderr
  assert.equal((probe.match(/Stream #0:\d+.*Video:/g) || []).length, 1)
  assert.equal((probe.match(/Stream #0:\d+.*Audio:/g) || []).length, 1)

  const pcm = spawnSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    output,
    '-map',
    '0:a:0',
    '-f',
    's16le',
    '-ac',
    '1',
    '-ar',
    '8000',
    'pipe:1',
  ]).stdout
  let crossings = 0
  for (let offset = 2; offset < pcm.length; offset += 2) {
    if (pcm.readInt16LE(offset - 2) <= 0 && pcm.readInt16LE(offset) > 0) crossings++
  }
  const frequency = crossings / (pcm.length / 2 / 8000)
  assert.ok(frequency > 820 && frequency < 920, `unexpected audio frequency: ${frequency}`)
})
