import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-translation-backend-'))
let selectedFile = ''
let seedCalls = 0
let whisperSegments = [{ start: 0.1, end: 0.8, text: 'Hello' }]

mock.module('electron', {
  namedExports: {
    app: { getPath: () => root },
    dialog: { showOpenDialog: async () => ({ canceled: !selectedFile, filePaths: selectedFile ? [selectedFile] : [] }) },
    net: {},
  },
})
mock.module('music-metadata', {
  namedExports: {
    parseFile: async () => ({ format: { duration: 2, sampleRate: 48000, numberOfChannels: 2 } }),
    parseBuffer: async () => ({ format: { duration: 2 } }),
  },
})
mock.module('node:child_process', {
  namedExports: {
    execFile: (_command: string, _args: string[], _options: unknown, callback: (error: null, result: { stdout: string }) => void) =>
      callback(null, { stdout: JSON.stringify({ format: { duration: '2' }, streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] }) }),
  },
})
mock.module('../../electron/seed-audio.ts', {
  namedExports: {
    generateSeedAudio: async (params: any) => {
      seedCalls++
      const target = path.join(
        projectRoot,
        'episodes',
        params.episodeId,
        'video-translate',
        params.targetLanguage,
        'seed-audio',
        `${params.outputName}.wav`,
      )
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'seed-audio')
      return { path: target }
    },
    mixSeedAudioTracks: async (_runId: string, episode: string, _paths: string[], _duration: number, _workflow: string, language: string) => {
      const target = path.join(projectRoot, 'episodes', episode, 'video-translate', language, '目标人声.wav')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'mixed')
      return path.relative(projectRoot, target)
    },
  },
})
mock.module('../../electron/material-transcript.ts', {
  namedExports: {
    runFasterWhisper: async () => ({
      duration: Math.max(1, ...whisperSegments.map((segment) => segment.end)),
      segments: whisperSegments,
    }),
  },
})

const workspace = await import('../../electron/media-workspace.ts')
const translation = await import('../../electron/video-translation.ts')
const projectId = 'translation-backend'
const episodeId = 'episode-001'
const projectRoot = path.join(root, 'project')
await workspace.registerProjectRoot(projectId, projectRoot, false)

after(() => fs.rmSync(root, { recursive: true, force: true }))

test('upload cancellation changes nothing and upload preserves the original source', async () => {
  assert.equal(await translation.selectVideoTranslationSource(projectId, episodeId), null)
  assert.equal(fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate')), false)

  selectedFile = path.join(root, 'source.mp4')
  fs.writeFileSync(selectedFile, Buffer.from('original-video-bytes'))
  const result = await translation.selectVideoTranslationSource(projectId, episodeId)
  assert.ok(result)
  assert.equal(fs.readFileSync(selectedFile, 'utf8'), 'original-video-bytes')
  assert.equal(fs.readFileSync(path.join(projectRoot, result!.sourceVideoPath), 'utf8'), 'original-video-bytes')
  assert.equal(fs.readFileSync(path.join(projectRoot, result!.rawSnapshotPath), 'utf8'), 'original-video-bytes')
})

test('accepts any extension when ffprobe confirms a real video stream', async () => {
  selectedFile = path.join(root, 'source.uncommon-container')
  fs.writeFileSync(selectedFile, Buffer.from('video-bytes'))
  const result = await translation.selectVideoTranslationSource(projectId, episodeId)
  assert.ok(result?.sourceVideoPath.endsWith('.uncommon-container'))
})

test('translation Wiki writes never rewrite creative Wiki files', async () => {
  const creative = path.join(projectRoot, 'wiki', '文稿', episodeId, '确认文稿.md')
  fs.mkdirSync(path.dirname(creative), { recursive: true })
  fs.writeFileSync(creative, '# 原创确认文稿\n\n不能改。\n')
  const before = fs.readFileSync(creative)
  const role = {
    translationRoleId: 'role-1', displayName: '角色一', aliases: [],
    sourceEpisodeIds: [episodeId], status: 'confirmed' as const,
  }
  await translation.writeConfirmedVideoTranslation(projectId, episodeId, 'zh', 'en', [{
    cueId: 'cue-1', startMs: 0, endMs: 1000, recognizedText: '你好', sourceText: '你好',
    translatedText: 'Hello', translationRoleId: role.translationRoleId, needsReview: false,
  }], [role])
  assert.deepEqual(fs.readFileSync(creative), before)
  assert.ok(fs.existsSync(path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.json')))
})

test('translation confirmation restores every Wiki file after a partial replace failure', async () => {
  const jsonPath = path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.json')
  const before = fs.readFileSync(jsonPath)
  const originalRename = fs.promises.rename
  let failed = false
  fs.promises.rename = (async (source: fs.PathLike, target: fs.PathLike) => {
    if (!failed && String(source).endsWith('.tmp') && String(target).endsWith('角色台词确认.md')) {
      failed = true
      throw new Error('injected replace failure')
    }
    return originalRename(source, target)
  }) as typeof fs.promises.rename
  try {
    const role = {
      translationRoleId: 'role-1', displayName: '角色一', aliases: [],
      sourceEpisodeIds: [episodeId], status: 'confirmed' as const,
    }
    await assert.rejects(translation.writeConfirmedVideoTranslation(
      projectId, episodeId, 'zh', 'en', [{
        cueId: 'cue-1', startMs: 0, endMs: 1000, recognizedText: '你好', sourceText: '你好',
        translatedText: 'Changed', translationRoleId: role.translationRoleId, needsReview: false,
      }], [role]), /injected replace failure/)
  } finally {
    fs.promises.rename = originalRename
  }
  assert.deepEqual(fs.readFileSync(jsonPath), before)
})

test('failed Whisper alignment retains and reuses Seed task audio', async () => {
  const taskId = 'video-translation-episode-001:full-track'
  await translation.writeVideoTranslationSeedPlan(projectId, episodeId, 'en', {
    schemaVersion: 1,
    segmentId: 'video-translation-episode-001',
    speakerIds: ['role-1'],
    references: [],
    tasks: [{
      taskId,
      segmentId: 'video-translation-episode-001',
      mode: 'timeline-voice',
      startMs: 0,
      endMs: 1000,
      speakerIds: ['role-1'],
      references: [],
      lines: [{ speakerId: 'role-1', text: 'Hello', startMs: 0, endMs: 1000 }],
      includeMusicAndEffects: false,
    }],
  }, `## ${taskId}\n\nHello`)

  whisperSegments = [{ start: 0, end: 3, text: 'too long' }]
  await assert.rejects(
    translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en'),
    /超出时间窗/,
  )
  assert.equal(seedCalls, 1)
  assert.equal(fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate', 'en', '目标人声.wav')), false)

  whisperSegments = [{ start: 0.1, end: 0.8, text: 'Hello' }]
  const target = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(seedCalls, 1)
  assert.equal(target, path.join('episodes', episodeId, 'video-translate', 'en', '目标人声.wav'))
  const timeline = JSON.parse(fs.readFileSync(path.join(
    projectRoot, 'wiki', '翻译', episodeId, 'en', '目标人声时间轴.json',
  ), 'utf8'))
  assert.equal(timeline.tasks[0].cues[0].whisperText, 'Hello')
})
