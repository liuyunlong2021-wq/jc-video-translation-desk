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

mock.module('electron', {
  namedExports: {
    app: { getPath: () => root },
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString('utf8'),
    },
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
const cloud = await import('../../electron/cloud.ts')
const trace = await import('../../electron/video-translation-trace.ts')
const translationAsr = await import('../../electron/video-translation-asr.ts')
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

test('FunASR SRT formatter preserves cue timestamps exactly', () => {
  assert.equal(
    translationAsr.funAsrCuesToSrt(
      [
        {
          cueId: 'cue-001',
          startMs: 610,
          endMs: 5_530,
          recognizedText: '原文',
        },
      ],
      () => '润色文字',
    ),
    '1\n00:00:00,610 --> 00:00:05,530\n润色文字\n',
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

test('archives an oversized upload without running FFmpeg before subtitle recognition', async () => {
  selectedFile = path.join(root, 'large-source.mp4')
  fs.writeFileSync(selectedFile, Buffer.alloc(21 * 1024 * 1024))
  const before = ffmpegCalls

  const result = await translation.selectVideoTranslationSource(projectId, episodeId)

  assert.ok(result)
  assert.equal(ffmpegCalls, before)
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate', 'analysis.mp4')),
    false,
  )
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
        performanceDirection: '平静问候',
        translationRoleId: role.translationRoleId,
        needsReview: false,
      },
    ],
    [role],
  )
  assert.deepEqual(fs.readFileSync(creative), before)
  const finalScriptPath = path.join(projectRoot, 'wiki', '翻译', episodeId, '最终时间戳剧本.md')
  assert.ok(fs.existsSync(finalScriptPath))
  assert.match(fs.readFileSync(finalScriptPath, 'utf8'), /finalScriptId: timestamp-script-/)
  assert.match(fs.readFileSync(finalScriptPath, 'utf8'), /scriptHash: [a-f0-9]{64}/)
  assert.match(fs.readFileSync(finalScriptPath, 'utf8'), /status: confirmed/)
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.json')),
    false,
  )
})

test('appends one trace event per distinct result and keeps Wiki links', async () => {
  const projectId = 'translation-trace-run'
  const traceRoot = path.join(root, projectId)
  await workspace.registerProjectRoot(projectId, traceRoot, false)
  const input = [{ label: '润色字幕', target: '润色字幕.srt', hash: 'abc' }]
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
  assert.match(content, /\[\[润色字幕\.srt\|润色字幕\]\]/)
  assert.match(content, /- plot：测试/)
})

test('translation confirmation restores every Wiki file after a partial replace failure', async () => {
  const markdownPath = path.join(projectRoot, 'wiki', '翻译', episodeId, '最终时间戳剧本.md')
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
            performanceDirection: '平静问候',
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

test('each global dubbing click creates a new raw version without Whisper alignment', async () => {
  const seedBefore = seedCalls
  const whisperBefore = whisperCalls
  const blockId = 'voice-block-001'
  const scriptHash = 'a'.repeat(64)
  await translation.writeVideoTranslationSeedPlan(
    projectId,
    episodeId,
    'en',
    {
      schemaVersion: 1,
      episodeId,
      targetLanguage: 'en',
      finalScriptId: 'timestamp-script-test',
      scriptHash,
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
    `## ${blockId}\n\n角色（自然问候）：“Hello”`,
  )

  const version = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.equal(seedCalls, seedBefore + 1)
  assert.equal(whisperCalls, whisperBefore)
  assert.match(version.previewPath, /全局配音版本\/voice-.*\/连续试听\.wav$/)
  assert.equal(version.finalScriptId, 'timestamp-script-test')
  assert.equal(version.scriptHash, scriptHash)
  assert.deepEqual(version.blocks?.[0].cueIds, ['cue-1'])
  const regenerated = await translation.generateVideoTranslationTargetVoice(
    projectId,
    episodeId,
    'en',
  )
  assert.notEqual(regenerated.versionId, version.versionId)
  assert.notEqual(regenerated.previewPath, version.previewPath)
  assert.equal(seedCalls, seedBefore + 2)
  assert.equal(whisperCalls, whisperBefore)
  assert.ok(fs.existsSync(path.join(projectRoot, version.previewPath)))
  assert.equal(
    (await translation.listVideoTranslationVoiceVersions(projectId, episodeId, 'en')).length,
    2,
  )
})

test('ignores legacy timeline and continuous audio versions', async () => {
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
  assert.deepEqual(versions, [])
})

test('raw dubbing versions keep block order and defer timing to the final workspace', async () => {
  seedDuration = 2
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
    {
      schemaVersion: 1,
      episodeId,
      targetLanguage: 'en',
      finalScriptId: 'timestamp-script-test',
      scriptHash: 'b'.repeat(64),
      durationMs: 2_000,
      blocks,
    },
    blocks.map((block) => `## ${block.blockId}\n\n角色（自然问候）：“Hello”`).join('\n\n'),
  )
  const version = await translation.generateVideoTranslationTargetVoice(projectId, episodeId, 'en')
  assert.deepEqual(
    version.blocks?.map((block) => block.cueIds),
    [['cue-1'], ['cue-2']],
  )
  assert.equal(
    fs.existsSync(
      path.join(
        projectRoot,
        'wiki',
        '翻译',
        episodeId,
        '声音',
        '全局配音版本',
        version.versionId,
        '对齐.json',
      ),
    ),
    false,
  )
  seedDuration = 1
})

test('grouped dubbing keeps successful groups and places complete audio without FunASR cutting', async () => {
  const groupedEpisode = 'episode-grouped'
  const role = {
    translationRoleId: 'role-1',
    displayName: '角色一',
    aliases: [],
    sourceEpisodeIds: [groupedEpisode],
    status: 'confirmed' as const,
  }
  const cues = [
    {
      cueId: 'cue-1',
      dubbingGroupId: 'group-1',
      startMs: 500,
      endMs: 1_000,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      performanceDirection: '自然问候',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
    {
      cueId: 'cue-2',
      dubbingGroupId: 'group-1',
      startMs: 1_000,
      endMs: 2_000,
      recognizedText: '欢迎',
      sourceText: '欢迎',
      translatedText: 'Welcome',
      performanceDirection: '热情欢迎',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
    {
      cueId: 'cue-3',
      startMs: 2_500,
      endMs: 3_500,
      recognizedText: '再见',
      sourceText: '再见',
      translatedText: 'Goodbye',
      performanceDirection: '平静告别',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const confirmed = await translation.writeConfirmedVideoTranslation(
    projectId,
    groupedEpisode,
    'zh',
    'en',
    cues,
    [role],
  )
  const reference = {
    speakerId: role.translationRoleId,
    referenceAudioPath: `episodes/${groupedEpisode}/video-translate/reference.wav`,
    voiceProfileId: 'voice-1',
    label: role.displayName,
  }
  const blocks = [
    {
      blockId: 'group-1',
      cueIds: ['cue-1', 'cue-2'],
      speakerIds: [role.translationRoleId],
      references: [reference],
      lines: cues.slice(0, 2).map((cue) => ({
        cueId: cue.cueId,
        speakerId: role.translationRoleId,
        text: cue.translatedText,
        performanceEvidence: cue.performanceDirection,
        expectedStartMs: cue.startMs,
        expectedEndMs: cue.endMs,
      })),
    },
    {
      blockId: 'single-cue-3',
      cueIds: ['cue-3'],
      speakerIds: [role.translationRoleId],
      references: [reference],
      lines: [
        {
          cueId: 'cue-3',
          speakerId: role.translationRoleId,
          text: 'Goodbye',
          performanceEvidence: '平静告别',
          expectedStartMs: 2_500,
          expectedEndMs: 3_500,
        },
      ],
    },
  ]
  const prompt = [
    '## group-1',
    '',
    '这是一段时长为2秒的配音表演艺术家在顶级录音棚内的配音片段。',
    '',
    '角色一是成熟男性，饰演者为@音频1。',
    '',
    '角色一（自然问候）：“Hello”',
    '角色一（热情欢迎）：“Welcome”',
    '',
    '## single-cue-3',
    '',
    '这是一段时长为1秒的配音表演艺术家在顶级录音棚内的配音片段。',
    '',
    '角色一是成熟男性，饰演者为@音频1。',
    '',
    '角色一（平静告别）：“Goodbye”',
  ].join('\n')
  await translation.writeVideoTranslationGroupedPlan(
    projectId,
    groupedEpisode,
    'en',
    {
      schemaVersion: 1,
      episodeId: groupedEpisode,
      targetLanguage: 'en',
      finalScriptId: confirmed.finalScriptId,
      scriptHash: confirmed.scriptHash,
      durationMs: 4_000,
      blocks,
    },
    prompt,
  )

  seedDuration = 2
  const seedBefore = seedCalls
  const version = await translation.generateVideoTranslationGroupedVoice(
    projectId,
    groupedEpisode,
    'en',
  )
  assert.equal(version.route, 'grouped')
  assert.equal(seedCalls, seedBefore + 2)
  assert.deepEqual(
    version.blocks?.map((block) => block.cueIds),
    [['cue-1', 'cue-2'], ['cue-3']],
  )
  assert.equal(version.blocks?.[0].overrunMs, 500)
  assert.ok(
    (await cloud.readPending(projectId))
      .filter((task) => task.kind === 'dubbing')
      .every((task) => task.status === 'success'),
  )

  const regenerated = await translation.generateVideoTranslationGroupedVoice(
    projectId,
    groupedEpisode,
    'en',
    ['group-1'],
  )
  assert.equal(seedCalls, seedBefore + 3)
  assert.equal(regenerated.blocks?.length, 2)

  const ffmpegBefore = ffmpegCalls
  const timestamped = await cloud.generateVideoTranslationDialogueTimestamps({
    runId: projectId,
    episodeId: groupedEpisode,
    targetLanguage: 'en',
    finalScriptId: confirmed.finalScriptId,
    scriptHash: confirmed.scriptHash,
    voiceVersionId: regenerated.versionId,
  })
  assert.equal(ffmpegCalls, ffmpegBefore + 1)
  assert.ok(fs.existsSync(path.join(projectRoot, timestamped.targetVoicePath)))
  assert.equal(
    fs.existsSync(
      path.join(
        projectRoot,
        'episodes',
        groupedEpisode,
        'video-translate',
        'en',
        '配音对白时间戳',
        regenerated.versionId,
        'cues',
      ),
    ),
    false,
  )
  seedDuration = 1
})
