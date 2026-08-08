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
let whisperCalls = 0
let seedDuration = 1
let whisperWordEnd = 0.8

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
      const probePath = args.at(-1) || ''
      callback(null, {
        stdout: JSON.stringify({
          format: { duration: '2' },
          streams: [
            {
              codec_type: 'video',
              width: probePath.includes('mismatch') ? 1280 : 1920,
              height: 1080,
              avg_frame_rate: '25/1',
            },
            { codec_type: 'audio' },
          ],
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
        '连续对白块',
        `${params.outputName}.wav`,
      )
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'seed-audio')
      return { path: target, duration: seedDuration }
    },
  },
})
mock.module('../../electron/material-transcript.ts', {
  namedExports: {
    runFasterWhisper: async () => {
      whisperCalls++
      return {
        duration: 1,
        segments: [{ start: 0.1, end: 0.8, text: 'Hello' }],
        words: [{ word: 'Hello', start: 0.1, end: whisperWordEnd }],
      }
    },
  },
})
mock.module('../../electron/ffmpeg/index.ts', {
  namedExports: {
    executeFFmpeg: async (args: string[]) => {
      ffmpegCalls++
      const target = args.at(-1)!
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'ffmpeg-audio')
      return { stdout: '', stderr: '', progress: 100 }
    },
    separateAudioStems: async (_source: string, vocal: string, instrument: string) => {
      fs.mkdirSync(path.dirname(vocal), { recursive: true })
      fs.writeFileSync(vocal, 'vocal')
      fs.writeFileSync(instrument, 'instrument')
    },
  },
})
const workspace = await import('../../electron/media-workspace.ts')
const translation = await import('../../electron/video-translation.ts')
const trace = await import('../../electron/video-translation-trace.ts')
const translationInput = await import('../../electron/video-translation-input.ts')
const translationSpeech = await import('../../electron/video-translation-speech.ts')
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

test('archives a matching clean final master and rejects a different edit', async () => {
  const sourcePath = 'episodes/episode-001/video-translate/source.mp4'
  selectedFile = path.join(root, 'clean-master.mp4')
  fs.writeFileSync(selectedFile, 'clean-video')
  const result = await translation.selectVideoTranslationFinalMaster(
    projectId,
    episodeId,
    sourcePath,
  )
  assert.match(result!.finalMasterVideoPath, /video-translate\/final-master\.mp4$/)
  const saved = fs.readFileSync(path.join(projectRoot, result!.finalMasterVideoPath), 'utf8')
  assert.equal(saved, 'clean-video')

  selectedFile = path.join(root, 'mismatch-master.mp4')
  fs.writeFileSync(selectedFile, 'different-video')
  await assert.rejects(
    translation.selectVideoTranslationFinalMaster(projectId, episodeId, sourcePath),
    /不是同一剪辑/,
  )
  assert.equal(fs.readFileSync(path.join(projectRoot, result!.finalMasterVideoPath), 'utf8'), saved)
})

test('separates source speech once and reuses Whisper evidence for the same video', async () => {
  const controlledSource = path.join(
    projectRoot,
    'episodes',
    episodeId,
    'video-translate',
    'source.mp4',
  )
  fs.mkdirSync(path.dirname(controlledSource), { recursive: true })
  fs.writeFileSync(controlledSource, 'source-video')
  const before = whisperCalls
  const first = await translationSpeech.prepareVideoTranslationSpeechEvidence(
    projectId,
    episodeId,
    'episodes/episode-001/video-translate/source.mp4',
  )
  const second = await translationSpeech.prepareVideoTranslationSpeechEvidence(
    projectId,
    episodeId,
    'episodes/episode-001/video-translate/source.mp4',
  )
  assert.equal(whisperCalls, before + 1)
  assert.equal(second.transcriptPath, first.transcriptPath)
  assert.ok(fs.existsSync(path.join(projectRoot, first.srtPath)))
  assert.ok(fs.existsSync(path.join(projectRoot, first.evidencePath)))
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

test('continuous dialogue generation reuses Seed and Whisper checkpoints', async () => {
  const seedBefore = seedCalls
  const whisperBefore = whisperCalls
  const blockId = 'dialogue-block-001'
  await translation.writeVideoTranslationSeedPlan(
    projectId,
    episodeId,
    'en',
    {
      schemaVersion: 1,
      episodeId,
      targetLanguage: 'en',
      durationMs: 2_000,
      blocks: [
        {
          blockId,
          cueIds: ['cue-1'],
          speakerIds: ['role-1'],
          references: [],
          lines: [
            {
              cueId: 'cue-1',
              speakerId: 'role-1',
              text: 'Hello',
              expectedStartMs: 500,
              expectedEndMs: 1_500,
            },
          ],
        },
      ],
    },
    `## ${blockId}\n\nHello`,
  )

  const version = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(seedCalls, seedBefore + 1)
  assert.equal(whisperCalls, whisperBefore + 1)
  assert.match(version.previewPath, /连续对白块\/voice-.*-dialogue-block-001\.wav$/)
  assert.match(version.targetVoicePath, /连续对白版本\/voice-.*\/对齐目标人声\.wav$/)
  const reused = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(reused.versionId, version.versionId)
  assert.equal(seedCalls, seedBefore + 1)
  assert.equal(whisperCalls, whisperBefore + 1)
  const timeline = JSON.parse(
    fs.readFileSync(
      path.join(
        projectRoot,
        'wiki',
        '翻译',
        episodeId,
        'en',
        '连续对白版本',
        version.versionId,
        '时间轴.json',
      ),
      'utf8',
    ),
  )
  assert.equal(timeline.cues[0].cueId, 'cue-1')
  assert.equal(timeline.cues[0].observedStartMs, 20)
  assert.equal(timeline.cues[0].observedEndMs, 920)
  const regenerated = await translation.generateVideoTranslationTargetVoice(
    projectId,
    episodeId,
    'en',
    { forceNewVersion: true },
  )
  assert.notEqual(regenerated.versionId, version.versionId)
  assert.notEqual(regenerated.previewPath, version.previewPath)
  assert.equal(seedCalls, seedBefore + 2)
  assert.ok(fs.existsSync(path.join(projectRoot, version.previewPath)))
  assert.equal(
    (await translation.listVideoTranslationVoiceVersions(projectId, episodeId, 'en')).length,
    2,
  )
})

test('loads legacy timeline and continuous audio as selectable versions', async () => {
  const legacyEpisode = 'episode-legacy'
  const wiki = path.join(projectRoot, 'wiki', '翻译', legacyEpisode, 'en')
  const media = path.join(projectRoot, 'episodes', legacyEpisode, 'video-translate', 'en')
  fs.mkdirSync(path.join(media, '连续对白块'), { recursive: true })
  fs.mkdirSync(path.join(media, 'seed-audio'), { recursive: true })
  fs.mkdirSync(wiki, { recursive: true })
  const timelinePreview = path.join(media, 'seed-audio', 'timeline.wav')
  const timelineTarget = path.join(media, '目标人声.wav')
  const continuousPreview = path.join(media, '连续对白块', 'dialogue-block-001.wav')
  const continuousTarget = path.join(media, '连续对白目标人声.wav')
  for (const file of [timelinePreview, timelineTarget, continuousPreview, continuousTarget])
    fs.writeFileSync(file, 'audio')
  fs.writeFileSync(
    path.join(wiki, '声音生成记录.json'),
    JSON.stringify({
      generations: [
        {
          wavPath: path.relative(projectRoot, timelinePreview),
          duration: 88,
          createdAt: '2026-08-07T05:00:00.000Z',
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(wiki, '目标人声时间轴.json'),
    JSON.stringify({ targetVoicePath: path.relative(projectRoot, timelineTarget) }),
  )
  fs.writeFileSync(
    path.join(wiki, '连续对白生成记录.json'),
    JSON.stringify({
      generations: [
        {
          wavPath: path.relative(projectRoot, continuousPreview),
          duration: 48,
          createdAt: '2026-08-07T07:00:00.000Z',
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(wiki, '连续对白时间轴.json'),
    JSON.stringify({ targetVoicePath: path.relative(projectRoot, continuousTarget) }),
  )
  const versions = await translation.listVideoTranslationVoiceVersions(
    projectId,
    legacyEpisode,
    'en',
  )
  assert.deepEqual(
    versions.map((version) => [version.kind, version.durationMs]),
    [
      ['timeline', 88_000],
      ['continuous', 48_000],
    ],
  )
})

test('records an overrun warning across dialogue blocks', async () => {
  seedDuration = 2
  whisperWordEnd = 1.8
  const blocks = [
    {
      blockId: 'dialogue-block-001',
      cueIds: ['cue-1'],
      speakerIds: ['role-1'],
      references: [],
      lines: [
        {
          cueId: 'cue-1',
          speakerId: 'role-1',
          text: 'Hello',
          expectedStartMs: 0,
          expectedEndMs: 100,
        },
      ],
    },
    {
      blockId: 'dialogue-block-002',
      cueIds: ['cue-2'],
      speakerIds: ['role-1'],
      references: [],
      lines: [
        {
          cueId: 'cue-2',
          speakerId: 'role-1',
          text: 'Hello',
          expectedStartMs: 800,
          expectedEndMs: 900,
        },
      ],
    },
  ]
  await translation.writeVideoTranslationSeedPlan(
    projectId,
    episodeId,
    'en',
    { schemaVersion: 1, episodeId, targetLanguage: 'en', durationMs: 2_000, blocks },
    blocks.map((block) => `## ${block.blockId}\n\nHello`).join('\n\n'),
  )
  const version = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  const alignment = JSON.parse(
    fs.readFileSync(
      path.join(
        projectRoot,
        'wiki',
        '翻译',
        episodeId,
        'en',
        '连续对白版本',
        version.versionId,
        '对齐.json',
      ),
      'utf8',
    ),
  )
  assert.match(alignment.cues[0].warning, /超过下一句起点/)
  seedDuration = 1
  whisperWordEnd = 0.8
})
