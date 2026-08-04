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
const { composeGeneratedVideo, composePictureMaster } = await import('../../electron/ffmpeg/index.ts')
const { ensureRunDir, getRunAssetPath, writeEditingTimeline } = await import('../../electron/media-workspace.ts')

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
    audioMode: 'replace-all',
    ratio: '1:1',
  })
  const voiceDuration = (await parseBuffer(await fs.promises.readFile(voice))).format.duration!
  const outputDuration = (await parseBuffer(await fs.promises.readFile(output))).format.duration!
  assert.ok(Math.abs(outputDuration - voiceDuration) <= 1 / 30)

  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', output], { encoding: 'utf8' }).stderr
  assert.equal((probe.match(/Stream #0:\d+.*Video:/g) || []).length, 1)
  assert.equal((probe.match(/Stream #0:\d+.*Audio:/g) || []).length, 1)

  const subtitled = await composeGeneratedVideo({
    runId,
    videoFiles: [clip1, clip2],
    playDurations: [0.3, 0.3],
    voiceFile: voice,
    audioMode: 'replace-all',
    ratio: '1:1',
    subtitleCues: [{ start: 0, end: 0.3, text: '对白' }],
  })
  assert.ok(fs.existsSync(subtitled))

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

test('trims the picture master from the persisted editing timeline', async () => {
  const runId = 'picture-master-run'
  await ensureRunDir(runId)
  const clip = getRunAssetPath(runId, 'clip', 1)
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=30:duration=1',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-y',
    clip,
  ])
  const timeline = {
    schemaVersion: 2 as const,
    route: 'drama' as const,
    shots: [{
      shotId: 'shot-001',
      promptSegmentId: 'shot-001',
      sourceMediaId: 'shot-001',
      sourceVideoPath: 'clips/001.mp4',
      sourceDurationMs: 1_000,
      geminiStartMs: 0,
      geminiEndMs: 1_000,
      adoptedStartMs: 300,
      adoptedEndMs: 800,
      adoptedBy: 'gemini' as const,
      revision: 0,
      outputStartMs: 0,
      outputEndMs: 500,
      observedContent: '',
      subtitleCueIds: [],
      speakerIds: [],
      confidence: 1,
      needsReview: false,
    }],
  }

  const output = await composePictureMaster({ runId, ratio: '16:9', timeline })
  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', output], { encoding: 'utf8' }).stderr
  const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  assert.ok(match, probe)
  const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  assert.ok(Math.abs(duration - 0.5) <= 1 / 30, `unexpected duration: ${duration}`)
  const timelinePath = path.join(
    userData,
    'media-runs',
    runId,
    'wiki',
    '剪辑',
    'episode-001',
    'editing-timeline.json',
  )
  assert.deepEqual(JSON.parse(fs.readFileSync(timelinePath, 'utf8')), timeline)
})

test('persists editing timeline before FFmpeg creates a picture master', async () => {
  const runId = 'timeline-only-run'
  await ensureRunDir(runId)
  const clip = getRunAssetPath(runId, 'clip', 1)
  fs.writeFileSync(clip, 'not rendered yet')
  const timeline = {
    schemaVersion: 2 as const,
    route: 'drama' as const,
    shots: [{
      shotId: 'shot-001', promptSegmentId: 'shot-001', sourceMediaId: 'media-shot-001',
      sourceVideoPath: 'clips/001.mp4', sourceDurationMs: 1000,
      geminiStartMs: 0, geminiEndMs: 1000, adoptedStartMs: 0, adoptedEndMs: 1000,
      adoptedBy: 'gemini' as const, revision: 0, outputStartMs: 0, outputEndMs: 1000,
      observedContent: '完整动作', subtitleCueIds: [], speakerIds: [], confidence: 1, needsReview: false,
    }],
  }
  const relativePath = await writeEditingTimeline(runId, timeline)
  assert.equal(relativePath, 'wiki/剪辑/episode-001/editing-timeline.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'media-runs', runId, relativePath), 'utf8')), timeline)
  assert.equal(fs.existsSync(getRunAssetPath(runId, 'picture-master')), false)
})
