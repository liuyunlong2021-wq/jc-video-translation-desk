import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
const {
  composeGeneratedVideo,
  composePictureMaster,
  composeVideoTranslation,
  mixBackgroundAudio,
  removeOriginalVocal,
  separateSourceAudio,
} = await import('../../electron/ffmpeg/index.ts')
const { ensureEpisodeDir, getRunAssetPath, registerProjectRoot, writeEditingTimeline } = await import('../../electron/media-workspace.ts')
const episodeId = 'episode-001'
const projectRoot = (projectId: string) => path.join(userData, 'projects', projectId)
for (const projectId of ['compose-run', 'audio-processing-run', 'picture-master-run', 'timeline-only-run', 'translation-compose-run', 'translation-audio-run'])
  await registerProjectRoot(projectId, projectRoot(projectId), false)

after(() => fs.rmSync(userData, { recursive: true, force: true }))

function ffmpeg(args: string[]) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
}

function wavDuration(file: string) {
  const wav = fs.readFileSync(file)
  let byteRate = 0
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const chunk = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (chunk === 'fmt ') byteRate = wav.readUInt32LE(offset + 16)
    if (chunk === 'data') return (size || wav.length - offset - 8) / byteRate
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV data chunk missing')
}

test('composes only the unified voice and matches its real duration', async () => {
  const runId = 'compose-run'
  await ensureEpisodeDir(runId, episodeId)
  const clip1 = getRunAssetPath(runId, episodeId, 'clip', 1)
  const clip2 = getRunAssetPath(runId, episodeId, 'clip', 2)
  const voice = getRunAssetPath(runId, episodeId, 'voice')

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
    episodeId,
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
    episodeId,
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
  assert.ok(fs.existsSync(path.join(projectRoot(runId), 'wiki', '成片', 'episode-001.md')))
  assert.ok(fs.existsSync(path.join(projectRoot(runId), 'wiki', '制作', 'episode-001.md')))
})

test('separates, adopts and mixes audio without deleting the vocal stem', async () => {
  const runId = 'audio-processing-run'
  await ensureEpisodeDir(runId, episodeId)
  const pictureMaster = getRunAssetPath(runId, episodeId, 'picture-master')
  ffmpeg([
    '-f', 'lavfi', '-i', 'color=black:s=320x180:d=0.4',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.4',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', pictureMaster,
  ])

  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-peiyin-'))
  const modelDir = path.join(fakeRoot, 'models', 'separation')
  const python = path.join(fakeRoot, 'python')
  fs.mkdirSync(modelDir, { recursive: true })
  fs.writeFileSync(path.join(modelDir, 'vocals.fp16.onnx'), 'test')
  fs.writeFileSync(path.join(modelDir, 'accompaniment.fp16.onnx'), 'test')
  fs.writeFileSync(
    python,
    '#!/usr/bin/env node\nconst fs=require("node:fs"); fs.copyFileSync(process.argv[4], process.argv[5]); fs.copyFileSync(process.argv[4], process.argv[6])\n',
    { mode: 0o755 },
  )
  process.env.FUNASR_HOME = fakeRoot
  process.env.PEIYIN_PYVIDEOTRANS_PYTHON = python
  const separated = await separateSourceAudio({ runId, episodeId, pictureMasterPath: pictureMaster }).finally(() => {
    delete process.env.FUNASR_HOME
    delete process.env.PEIYIN_PYVIDEOTRANS_PYTHON
    fs.rmSync(fakeRoot, { recursive: true, force: true })
  })

  assert.equal(separated.originalVocalRemoved, false)
  const adopted = await removeOriginalVocal({
    runId,
    episodeId,
    vocalPath: separated.vocalPath!,
    instrumentPath: separated.instrumentPath!,
  })
  assert.equal(adopted.originalVocalRemoved, true)
  assert.ok(fs.existsSync(path.join(projectRoot(runId), adopted.vocalPath!)))

  const voice = path.join(projectRoot(runId), 'wiki', '声音', 'episode-001', 'episode-voice-zh.wav')
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.4', '-c:a', 'pcm_s16le', '-y', voice])
  const mixed = await mixBackgroundAudio({
    runId,
    episodeId,
    vocalPath: adopted.vocalPath!,
    instrumentPath: adopted.instrumentPath!,
    voiceFile: voice,
  })
  assert.ok(mixed.mixedAudioPath)
  assert.ok(fs.existsSync(path.join(projectRoot(runId), mixed.mixedAudioPath!)))
  const record = JSON.parse(fs.readFileSync(path.join(projectRoot(runId), 'wiki', '声音', 'episode-001', '音频处理.json'), 'utf8'))
  assert.equal(record.mixedAudioPath, mixed.mixedAudioPath)
})

test('trims the picture master from the persisted editing timeline', async () => {
  const runId = 'picture-master-run'
  await ensureEpisodeDir(runId, episodeId)
  const clip = getRunAssetPath(runId, episodeId, 'clip', 1)
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
      sourceVideoPath: 'episodes/episode-001/clips/001.mp4',
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

  const output = await composePictureMaster({ runId, episodeId, ratio: '16:9', timeline })
  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', output], { encoding: 'utf8' }).stderr
  const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  assert.ok(match, probe)
  const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  assert.ok(Math.abs(duration - 0.5) <= 1 / 30, `unexpected duration: ${duration}`)
  const timelinePath = path.join(projectRoot(runId), 'wiki', '剪辑', 'episode-001', 'editing-timeline.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(timelinePath, 'utf8')), timeline)
})

test('persists editing timeline before FFmpeg creates a picture master', async () => {
  const runId = 'timeline-only-run'
  await ensureEpisodeDir(runId, episodeId)
  const clip = getRunAssetPath(runId, episodeId, 'clip', 1)
  fs.writeFileSync(clip, 'not rendered yet')
  const timeline = {
    schemaVersion: 2 as const,
    route: 'drama' as const,
    shots: [{
      shotId: 'shot-001', promptSegmentId: 'shot-001', sourceMediaId: 'media-shot-001',
      sourceVideoPath: 'episodes/episode-001/clips/001.mp4', sourceDurationMs: 1000,
      geminiStartMs: 0, geminiEndMs: 1000, adoptedStartMs: 0, adoptedEndMs: 1000,
      adoptedBy: 'gemini' as const, revision: 0, outputStartMs: 0, outputEndMs: 1000,
      observedContent: '完整动作', subtitleCueIds: [], speakerIds: [], confidence: 1, needsReview: false,
    }],
  }
  const relativePath = await writeEditingTimeline(runId, episodeId, timeline)
  assert.equal(relativePath, 'wiki/剪辑/episode-001/editing-timeline.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(projectRoot(runId), relativePath), 'utf8')), timeline)
  assert.equal(fs.existsSync(getRunAssetPath(runId, episodeId, 'picture-master')), false)
})

test('video translation audio and final output stay outside creative Wiki paths', async () => {
  const runId = 'translation-audio-run'
  const base = projectRoot(runId)
  const audioDir = path.join(base, 'wiki', '翻译', episodeId, 'en', '音频')
  fs.mkdirSync(audioDir, { recursive: true })
  const vocal = path.join(audioDir, 'vocal.wav')
  const instrument = path.join(audioDir, 'instrument.wav')
  const voice = path.join(base, 'episodes', episodeId, 'video-translate', 'en', '目标人声.wav')
  fs.mkdirSync(path.dirname(voice), { recursive: true })
  for (const [file, frequency, duration] of [
    [vocal, '220', '10'],
    [instrument, '330', '10'],
    [voice, '880', '5'],
  ])
    ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${duration}`, '-c:a', 'pcm_s16le', '-y', file])

  const adopted = await removeOriginalVocal({
    runId, episodeId, vocalPath: vocal, instrumentPath: instrument,
    workflow: 'video-translation', targetLanguage: 'en',
  })
  const mixed = await mixBackgroundAudio({
    runId, episodeId, vocalPath: adopted.vocalPath!, instrumentPath: adopted.instrumentPath!,
    voiceFile: voice, workflow: 'video-translation', targetLanguage: 'en',
  })
  assert.equal(mixed.mixedAudioPath, `wiki/翻译/${episodeId}/en/音频/mixed.wav`)
  const mixedDuration = wavDuration(path.join(base, mixed.mixedAudioPath!))
  assert.ok(mixedDuration >= 9.9, `mixed audio ended early: ${mixedDuration}`)
  assert.ok(fs.existsSync(path.join(base, 'wiki', '翻译', episodeId, 'en', '音频处理.json')))
  assert.equal(fs.existsSync(path.join(base, 'wiki', '声音')), false)
})

test('burns translation subtitles on the complete uploaded source without creative final artifacts', async () => {
  const runId = 'translation-compose-run'
  const base = projectRoot(runId)
  const source = path.join(base, 'episodes', episodeId, 'video-translate', 'source.mp4')
  const mixed = path.join(base, 'wiki', '翻译', episodeId, 'en', '音频', 'mixed.wav')
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.mkdirSync(path.dirname(mixed), { recursive: true })
  ffmpeg([
    '-f', 'lavfi', '-i', 'color=blue:s=320x180:d=0.4',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.4',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', source,
  ])
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.4', '-c:a', 'pcm_s16le', '-y', mixed])

  const canonical = {
    sourceFingerprint: 'f'.repeat(64),
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    cues: [
      {
        cueId: 'cue-001',
        translationRoleId: 'role-1',
        roleName: '林默',
        startMs: 0,
        endMs: 300,
        performanceDirection: '平静问候',
        sourceText: '你好',
        translatedText: 'Hello',
      },
    ],
  }
  const scriptHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  const finalScriptId = `timestamp-script-${scriptHash.slice(0, 16)}`
  const voiceVersionId = 'voice-test'
  const dubDialogueTimestampHash = 'd'.repeat(64)
  const translationWiki = path.join(base, 'wiki', '翻译', episodeId)
  fs.mkdirSync(path.join(translationWiki, '成片'), { recursive: true })
  fs.writeFileSync(
    path.join(translationWiki, '最终时间戳剧本.json'),
    JSON.stringify({ finalScriptId, scriptHash, ...canonical }),
  )
  fs.writeFileSync(
    path.join(translationWiki, '成片', '配音对白时间戳.json'),
    JSON.stringify({ finalScriptId, scriptHash, voiceVersionId, dubDialogueTimestampHash }),
  )

  const output = await composeVideoTranslation({
    runId,
    episodeId,
    sourceVideoPath: source,
    mixedAudioPath: mixed,
    targetLanguage: 'en',
    finalScriptId,
    scriptHash,
    voiceVersionId,
    dubDialogueTimestampHash,
  })
  assert.match(output, /^episodes\/episode-001\/video-translate\/en\/final/)
  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', path.join(base, output)], { encoding: 'utf8' }).stderr
  assert.match(probe, /320x180/)
  assert.ok(fs.existsSync(path.join(base, 'wiki', '翻译', episodeId, 'en', '成片.md')))
  assert.equal(fs.existsSync(path.join(base, 'wiki', '成片')), false)
  assert.equal(fs.existsSync(path.join(base, 'wiki', '制作')), false)
  assert.equal(fs.existsSync(path.join(base, 'wiki', '剪辑')), false)
})
