import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-translation-backend-'))
let selectedFile = ''
let seedCalls = 0
let ffmpegCalls = 0

mock.module('electron', {
  namedExports: {
    app: { getPath: () => root },
    dialog: {
      showOpenDialog: async () => ({
        canceled: !selectedFile,
        filePaths: selectedFile ? [selectedFile] : [],
      }),
    },
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
    execFile: (
      command: string,
      args: string[],
      _options: unknown,
      callback: (error: null, result: { stdout: string }) => void,
    ) => {
      if (command.endsWith('ffmpeg')) {
        ffmpegCalls++
        fs.writeFileSync(args.at(-1)!, Buffer.alloc(1024 * 1024))
        callback(null, { stdout: '' })
        return
      }
      callback(null, {
        stdout: JSON.stringify({
          format: { duration: '2' },
          streams: [{ codec_type: 'video' }, { codec_type: 'audio' }],
        }),
      })
    },
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
      return { path: target, duration: 1 }
    },
    mixSeedAudioTracks: async (
      _runId: string,
      episode: string,
      _paths: string[],
      _duration: number,
      _workflow: string,
      language: string,
    ) => {
      const target = path.join(
        projectRoot,
        'episodes',
        episode,
        'video-translate',
        language,
        '目标人声.wav',
      )
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'mixed')
      return path.relative(projectRoot, target)
    },
  },
})
const workspace = await import('../../electron/media-workspace.ts')
const translation = await import('../../electron/video-translation.ts')
const trace = await import('../../electron/video-translation-trace.ts')
const translationInput = await import('../../electron/video-translation-input.ts')
const projectId = 'translation-backend'
const episodeId = 'episode-001'
const projectRoot = path.join(root, 'project')
await workspace.registerProjectRoot(projectId, projectRoot, false)

after(() => fs.rmSync(root, { recursive: true, force: true }))

test('upload cancellation changes nothing and upload preserves the original source', async () => {
  assert.equal(await translation.selectVideoTranslationSource(projectId, episodeId), null)
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate')),
    false,
  )

  selectedFile = path.join(root, 'source.mp4')
  fs.writeFileSync(selectedFile, Buffer.from('original-video-bytes'))
  const result = await translation.selectVideoTranslationSource(projectId, episodeId)
  assert.ok(result)
  assert.equal(fs.readFileSync(selectedFile, 'utf8'), 'original-video-bytes')
  assert.equal(
    fs.readFileSync(path.join(projectRoot, result!.sourceVideoPath), 'utf8'),
    'original-video-bytes',
  )
  assert.equal(
    fs.readFileSync(path.join(projectRoot, result!.rawSnapshotPath), 'utf8'),
    'original-video-bytes',
  )
})

test('stores uploaded translation reference audio inside the translation sandbox', async () => {
  selectedFile = path.join(root, 'reference.wav')
  fs.writeFileSync(selectedFile, 'reference-audio')
  const result = await workspace.selectSeedReferenceAudio(
    projectId,
    episodeId,
    'role-1',
    'video-translation',
  )
  assert.match(result!.path, /^episodes\/episode-001\/video-translate\/seed-audio\/uploads\//)
  assert.doesNotThrow(() =>
    workspace.assertVideoTranslationAsset(projectId, episodeId, result!.path),
  )
})

test('deletes a translation role from shared state and translation Wiki only', async () => {
  const role = {
    translationRoleId: 'role-delete',
    displayName: '误建角色',
    aliases: [],
    sourceEpisodeIds: [episodeId],
    status: 'confirmed' as const,
  }
  await workspace.saveMediaState(
    projectId,
    episodeId,
    JSON.stringify({ runId: projectId, episodeId, stage: 'draft', videoTranslationRoles: [role] }),
  )
  const translationWiki = path.join(projectRoot, 'wiki', '翻译')
  for (const file of [
    path.join(translationWiki, '角色', 'role-delete.md'),
    path.join(translationWiki, '声音', 'role-delete.md'),
    path.join(translationWiki, '声音', 'role-delete-音色提示词.md'),
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'temporary')
  }

  await translation.deleteVideoTranslationRole(projectId, episodeId, role.translationRoleId, [])

  const shared = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared-state.json'), 'utf8'))
  assert.deepEqual(shared.videoTranslationRoles, [])
  assert.equal(fs.existsSync(path.join(translationWiki, '角色', 'role-delete.md')), false)
  assert.equal(fs.existsSync(path.join(projectRoot, 'voice-library')), false)
})

test('accepts any extension when ffprobe confirms a real video stream', async () => {
  selectedFile = path.join(root, 'source.uncommon-container')
  fs.writeFileSync(selectedFile, Buffer.from('video-bytes'))
  const result = await translation.selectVideoTranslationSource(projectId, episodeId)
  assert.ok(result?.sourceVideoPath.endsWith('.uncommon-container'))
})

test('archives an oversized upload without running FFmpeg before the user clicks reverse', async () => {
  selectedFile = path.join(root, 'large-source.mp4')
  fs.writeFileSync(
    selectedFile,
    Buffer.alloc(translationInput.VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES + 1),
  )
  const before = ffmpegCalls

  const result = await translation.selectVideoTranslationSource(projectId, episodeId)

  assert.ok(result)
  assert.equal(ffmpegCalls, before)
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate', 'analysis.mp4')),
    false,
  )
})

test('keeps small model inputs unchanged and compresses only oversized sources', async () => {
  const videoDir = path.join(projectRoot, 'episodes', episodeId, 'video-translate')
  fs.mkdirSync(videoDir, { recursive: true })
  const small = path.join(videoDir, 'source.mp4')
  fs.writeFileSync(small, Buffer.alloc(1024 * 1024))
  const before = ffmpegCalls
  assert.equal(
    await translationInput.prepareVideoTranslationModelInput(projectId, episodeId, small, 2000),
    small,
  )
  assert.equal(ffmpegCalls, before)

  fs.truncateSync(small, translationInput.VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES + 1)
  const analysis = await translationInput.prepareVideoTranslationModelInput(
    projectId,
    episodeId,
    small,
    2000,
  )
  assert.equal(analysis, path.join(videoDir, 'analysis.mp4'))
  assert.equal(ffmpegCalls, before + 1)
  assert.equal(translationInput.VIDEO_TRANSLATION_MODEL_INPUT_TARGET_BYTES, 12 * 1024 * 1024)
  assert.equal(fs.statSync(analysis).size, 1024 * 1024)
  assert.equal(
    fs.statSync(small).size,
    translationInput.VIDEO_TRANSLATION_MODEL_INPUT_MAX_BYTES + 1,
  )
})

test('rebuilds FFmpeg review slices instead of reusing another uploaded video', async () => {
  const videoDir = path.join(projectRoot, 'episodes', episodeId, 'video-translate')
  const source = path.join(videoDir, 'source.mp4')
  fs.mkdirSync(videoDir, { recursive: true })
  fs.writeFileSync(source, Buffer.from('first-video'))
  const before = ffmpegCalls
  const plan = [{ startMs: 0, endMs: 2000 }]

  await translationInput.prepareVideoTranslationReviewSlices(projectId, episodeId, source, plan)
  fs.writeFileSync(source, Buffer.from('second-video'))
  await translationInput.prepareVideoTranslationReviewSlices(projectId, episodeId, source, plan)

  assert.equal(ffmpegCalls, before + 2)
})

test('translation Wiki writes never rewrite creative Wiki files', async () => {
  const creative = path.join(projectRoot, 'wiki', '文稿', episodeId, '确认文稿.md')
  fs.mkdirSync(path.dirname(creative), { recursive: true })
  fs.writeFileSync(creative, '# 原创确认文稿\n\n不能改。\n')
  const before = fs.readFileSync(creative)
  const role = {
    translationRoleId: 'role-1',
    displayName: '角色一',
    aliases: [],
    sourceEpisodeIds: [episodeId],
    status: 'confirmed' as const,
  }
  await translation.writeConfirmedVideoTranslation(
    projectId,
    episodeId,
    'zh',
    'en',
    [
      {
        cueId: 'cue-1',
        startMs: 0,
        endMs: 1000,
        recognizedText: '你好',
        sourceText: '你好',
        translatedText: 'Hello',
        translationRoleId: role.translationRoleId,
        needsReview: false,
      },
    ],
    [role],
  )
  assert.deepEqual(fs.readFileSync(creative), before)
  assert.ok(fs.existsSync(path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.md')))
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.json')),
    false,
  )
  const contextPath = await translation.writeVideoTranslationContext(projectId, episodeId, [
    {
      path: 'wiki/文稿/episode-001/确认文稿.md',
      hash: 'abc',
    },
  ])
  assert.equal(contextPath, 'wiki/翻译/episode-001/来源上下文.md')
  assert.match(
    fs.readFileSync(path.join(projectRoot, contextPath), 'utf8'),
    /确认文稿\.md.*sha256: abc/,
  )
})

test('appends one trace event per distinct result and keeps Wiki links', async () => {
  const projectId = 'translation-trace-run'
  const traceRoot = path.join(root, projectId)
  await workspace.registerProjectRoot(projectId, traceRoot, false)
  const input = [{ label: '扒片最终稿', target: '04-最终稿.md', hash: 'abc' }]
  await trace.appendVideoTranslationTrace(
    projectId,
    episodeId,
    '第一轮全片理解',
    'gemini-3.6-flash',
    input,
    { plot: '测试' },
  )
  await trace.appendVideoTranslationTrace(
    projectId,
    episodeId,
    '第一轮全片理解',
    'gemini-3.6-flash',
    input,
    { plot: '测试' },
  )
  const content = fs.readFileSync(
    path.join(traceRoot, 'wiki', '翻译', episodeId, '过程记录.md'),
    'utf8',
  )
  assert.equal(content.match(/<!-- event:/g)?.length, 1)
  assert.match(content, /\[\[04-最终稿\.md\|扒片最终稿\]\]/)
  assert.match(content, /- plot：测试/)
})

test('translation confirmation restores every Wiki file after a partial replace failure', async () => {
  const markdownPath = path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.md')
  const before = fs.readFileSync(markdownPath)
  const originalRename = fs.promises.rename
  let failed = false
  fs.promises.rename = (async (source: fs.PathLike, target: fs.PathLike) => {
    if (!failed && String(source).endsWith('.tmp') && String(target).endsWith('role-1.md')) {
      failed = true
      throw new Error('injected replace failure')
    }
    return originalRename(source, target)
  }) as typeof fs.promises.rename
  try {
    const role = {
      translationRoleId: 'role-1',
      displayName: '角色一',
      aliases: [],
      sourceEpisodeIds: [episodeId],
      status: 'confirmed' as const,
    }
    await assert.rejects(
      translation.writeConfirmedVideoTranslation(
        projectId,
        episodeId,
        'zh',
        'en',
        [
          {
            cueId: 'cue-1',
            startMs: 0,
            endMs: 1000,
            recognizedText: '你好',
            sourceText: '你好',
            translatedText: 'Changed',
            translationRoleId: role.translationRoleId,
            needsReview: false,
          },
        ],
        [role],
      ),
      /injected replace failure/,
    )
  } finally {
    fs.promises.rename = originalRename
  }
  assert.deepEqual(fs.readFileSync(markdownPath), before)
})

test('target voice generation reuses Seed task audio without Whisper', async () => {
  const taskId = 'video-translation-episode-001:full-track'
  await translation.writeVideoTranslationSeedPlan(
    projectId,
    episodeId,
    'en',
    {
      schemaVersion: 1,
      segmentId: 'video-translation-episode-001',
      speakerIds: ['role-1'],
      references: [],
      tasks: [
        {
          taskId,
          segmentId: 'video-translation-episode-001',
          mode: 'timeline-voice',
          startMs: 0,
          endMs: 1000,
          speakerIds: ['role-1'],
          references: [],
          lines: [{ speakerId: 'role-1', text: 'Hello', startMs: 0, endMs: 1000 }],
          includeMusicAndEffects: false,
        },
      ],
    },
    `## ${taskId}\n\nHello`,
  )

  const target = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(seedCalls, 1)
  assert.equal(target, path.join('episodes', episodeId, 'video-translate', 'en', '目标人声.wav'))
  await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(seedCalls, 1)
  const timeline = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, 'wiki', '翻译', episodeId, 'en', '目标人声时间轴.json'),
      'utf8',
    ),
  )
  assert.equal('whisperText' in timeline.tasks[0].cues[0], false)
})
