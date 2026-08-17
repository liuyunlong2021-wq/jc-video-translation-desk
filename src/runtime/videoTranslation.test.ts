import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  availableVideoTranslationActions,
  createVideoTranslationState,
  groupVideoTranslationCueWithNext,
  insertVideoTranslationCueAt,
  invalidateVideoTranslation,
  mergeVideoTranslationCueWithNext,
  planVideoTranslationDialogueBlocks,
  planVideoTranslationGroupedDialogueBlocks,
  splitVideoTranslationCueAt,
  setVideoTranslationCueBoundary,
  ungroupVideoTranslationCue,
  videoTranslationDubbingGroups,
  videoTranslationRoleBindingTargets,
  validateConfirmedTranslation,
  validateVideoTranslationDialoguePrompt,
  type TranslationRole,
} from './videoTranslation.ts'

const role: TranslationRole = {
  translationRoleId: 'role-1',
  displayName: '林默',
  aliases: [],
  voiceProfileId: 'voice-1',
  voiceIdentityText: '青年男性，美式英语自然，声线清晰',
  voiceConfirmedAt: '2026-08-08T00:00:00.000Z',
  sourceEpisodeIds: ['episode-001'],
  status: 'confirmed',
}

test('opens only the translation action whose dependencies are ready', () => {
  const state = createVideoTranslationState()
  assert.deepEqual(availableVideoTranslationActions(state, []), ['upload-video'])
  state.sourceVideoPath = 'episodes/episode-001/video-translate/source.mp4'
  state.hasAudio = true
  assert.ok(availableVideoTranslationActions(state, []).includes('get-subtitles'))
  state.hasAudio = false
  assert.ok(availableVideoTranslationActions(state, []).includes('get-subtitles'))
  state.hasAudio = true
  state.speakerStatus = 'ready'
  assert.ok(availableVideoTranslationActions(state, []).includes('get-subtitles'))
  state.translationStatus = 'ready'
  state.reviewStatus = 'ready'
  state.cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 1000,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      performanceDirection: '自然地打招呼',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  assert.ok(availableVideoTranslationActions(state, [role]).includes('calibrate-subtitles'))
  assert.ok(availableVideoTranslationActions(state, [role]).includes('identify-visual-people'))
  assert.ok(availableVideoTranslationActions(state, [role]).includes('translate-all-subtitles'))
  state.translationStatus = 'idle'
  assert.ok(availableVideoTranslationActions(state, [role]).includes('translate-all-subtitles'))
  state.cues[0].sourceText = ''
  assert.ok(!availableVideoTranslationActions(state, [role]).includes('translate-all-subtitles'))
  state.cues[0].sourceText = '你好'
  state.calibrationApplied = true
  state.translationStatus = 'ready'
  assert.ok(availableVideoTranslationActions(state, [role]).includes('arrange-doubao-voice'))
  assert.ok(
    !availableVideoTranslationActions(state, [{ ...role, voiceProfileId: undefined }]).includes(
      'arrange-doubao-voice',
    ),
  )
  state.arrangementStatus = 'ready'
  state.voiceStatus = 'ready'
  state.finalScriptId = 'script-1'
  state.scriptHash = 'hash-1'
  state.activeVoiceVersionId = 'voice-version-1'
  state.voiceVersions = [
    {
      versionId: 'voice-version-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      previewPath: 'voice.wav',
      finalScriptId: state.finalScriptId,
      scriptHash: state.scriptHash,
      durationMs: 1000,
    },
  ]
  state.dubDialogueTimestampHash = 'existing-timestamp-hash'
  assert.ok(availableVideoTranslationActions(state, [role]).includes('timestamp-target-dialogue'))
  state.separationStatus = 'ready'
  state.originalVocalRemoved = true
  state.mixStatus = 'ready'
  assert.ok(availableVideoTranslationActions(state, [role]).includes('burn-subtitles-and-voice'))
})

test('allows regenerating the Seed prompt after target voice generation fails', () => {
  const state = createVideoTranslationState()
  Object.assign(state, {
    sourceVideoPath: 'episodes/episode-001/video-translate/source.mp4',
    hasAudio: true,
    speakerStatus: 'ready',
    translationStatus: 'ready',
    reviewStatus: 'ready',
    arrangementStatus: 'ready',
    voiceStatus: 'failed',
    cues: [
      {
        cueId: 'cue-001',
        startMs: 0,
        endMs: 1000,
        recognizedText: '你好',
        sourceText: '你好',
        translatedText: 'Hello',
        performanceDirection: '自然地打招呼',
        translationRoleId: role.translationRoleId,
        needsReview: false,
      },
    ],
  })
  assert.ok(availableVideoTranslationActions(state, [role]).includes('arrange-doubao-voice'))
})

test('invalidates only translation state and preserves source separation where possible', () => {
  const state = createVideoTranslationState()
  Object.assign(state, {
    translationStatus: 'ready',
    reviewStatus: 'ready',
    arrangementStatus: 'ready',
    voiceStatus: 'ready',
    separationStatus: 'ready',
    mixStatus: 'ready',
    finalStatus: 'ready',
    instrumentPath: 'instrument.wav',
  })
  const next = invalidateVideoTranslation(state, 'translation')
  assert.equal(next.reviewStatus, 'stale')
  assert.equal(next.arrangementStatus, 'stale')
  assert.equal(next.voiceStatus, 'stale')
  assert.equal(next.separationStatus, 'ready')
  assert.equal(next.instrumentPath, 'instrument.wav')
  assert.equal(next.finalStatus, 'stale')
  assert.equal(state.finalStatus, 'ready')

  const voicePromptChanged = invalidateVideoTranslation(state, 'voice-prompt')
  assert.equal(voicePromptChanged.arrangementStatus, 'stale')
  assert.equal(voicePromptChanged.voiceStatus, 'stale')
  assert.equal(voicePromptChanged.separationStatus, 'ready')
})

test('changing only the final master preserves subtitles and target voice', () => {
  const state = createVideoTranslationState()
  Object.assign(state, {
    finalMasterVideoPath: 'episodes/episode-001/video-translate/final-master.mp4',
    speakerStatus: 'ready',
    translationStatus: 'ready',
    reviewStatus: 'ready',
    arrangementStatus: 'ready',
    voiceStatus: 'ready',
    separationStatus: 'ready',
    mixStatus: 'ready',
    finalStatus: 'ready',
    targetVoicePath: 'voice.wav',
    vocalPath: 'vocal.wav',
    instrumentPath: 'instrument.wav',
    mixedPath: 'mixed.wav',
    finalVideoPath: 'final.mp4',
  })
  const next = invalidateVideoTranslation(state, 'final-master-video')
  assert.equal(next.reviewStatus, 'ready')
  assert.equal(next.voiceStatus, 'ready')
  assert.equal(next.targetVoicePath, 'voice.wav')
  assert.equal(next.separationStatus, 'stale')
  assert.equal(next.vocalPath, undefined)
  assert.equal(next.finalVideoPath, undefined)
})

test('invalidates translated text when the selected language changes', () => {
  const state = createVideoTranslationState()
  state.translationStatus = 'ready'
  state.reviewStatus = 'ready'
  state.cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 1000,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      performanceDirection: '自然地打招呼',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const next = invalidateVideoTranslation(state, 'language')
  assert.equal(next.translationStatus, 'stale')
  assert.equal(next.reviewStatus, 'stale')
  assert.equal(next.cues[0].translatedText, '')
})

test('clears stale translation when calibrated source dialogue changes', () => {
  const state = createVideoTranslationState()
  state.translationStatus = 'ready'
  state.cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 1000,
      recognizedText: '你好',
      sourceText: '你过来',
      translatedText: 'Hello there.',
      performanceDirection: '压低声音提醒',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const next = invalidateVideoTranslation(state, 'source-dialogue')
  assert.equal(next.translationStatus, 'stale')
  assert.equal(next.cues[0].translatedText, '')
})

test('keeps translated text for review when the role binding changes', () => {
  const state = createVideoTranslationState()
  state.translationStatus = 'ready'
  state.reviewStatus = 'ready'
  state.cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 1000,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      performanceDirection: '自然地打招呼',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const next = invalidateVideoTranslation(state, 'role-binding')
  assert.equal(next.translationStatus, 'stale')
  assert.equal(next.reviewStatus, 'stale')
  assert.equal(next.cues[0].translatedText, 'Hello')
})

test('merges both source and translated text without relocking translation', () => {
  const state = createVideoTranslationState()
  state.sourceVideoPath = 'episodes/episode-001/video-translate/source.mp4'
  state.hasAudio = true
  state.speakerStatus = 'ready'
  state.translationStatus = 'ready'
  state.cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 1000,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      translationRoleId: role.translationRoleId,
      performanceDirection: '问候',
      needsReview: false,
    },
    {
      cueId: 'cue-002',
      startMs: 1100,
      endMs: 2000,
      recognizedText: '再见',
      sourceText: '再见',
      translatedText: 'Goodbye',
      translationRoleId: role.translationRoleId,
      performanceDirection: '告别',
      needsReview: false,
    },
  ]
  state.seedArrangementPath = 'arrangement.json'
  state.seedPromptPath = 'prompt.md'
  state.seedPromptText = '旧全局提示词'
  state.cues = mergeVideoTranslationCueWithNext(state.cues, 'cue-001')
  const next = invalidateVideoTranslation(state, 'translation')
  assert.equal(next.cues[0].sourceText, '你好 再见')
  assert.equal(next.cues[0].translatedText, 'Hello Goodbye')
  assert.equal(next.translationStatus, 'ready')
  assert.equal(next.seedArrangementPath, undefined)
  assert.equal(next.seedPromptPath, undefined)
  assert.equal(next.seedPromptText, undefined)
  assert.ok(availableVideoTranslationActions(next, [role]).includes('open-voice-workspace'))
})

test('groups adjacent same-role subtitles without merging subtitle data', () => {
  const cues = [
    {
      cueId: 'cue-001',
      startMs: 0,
      endMs: 900,
      recognizedText: '一',
      sourceText: '一',
      translatedText: 'One',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
    {
      cueId: 'cue-002',
      startMs: 1000,
      endMs: 2000,
      recognizedText: '二',
      sourceText: '二',
      translatedText: 'Two',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const grouped = groupVideoTranslationCueWithNext(cues, 'cue-001', 'dubbing-group-1')
  assert.deepEqual(
    grouped.map((cue) => cue.dubbingGroupId),
    ['dubbing-group-1', 'dubbing-group-1'],
  )
  assert.deepEqual(
    grouped.map((cue) => [cue.startMs, cue.endMs, cue.translatedText]),
    [
      [0, 900, 'One'],
      [1000, 2000, 'Two'],
    ],
  )
  assert.deepEqual(videoTranslationDubbingGroups(grouped)[0], {
    groupId: 'dubbing-group-1',
    cueIds: ['cue-001', 'cue-002'],
    speakerId: role.translationRoleId,
    startMs: 0,
    endMs: 2000,
  })
  assert.deepEqual(
    ungroupVideoTranslationCue(grouped, 'cue-001').map((cue) => cue.dubbingGroupId),
    [undefined, undefined],
  )

  const extended = groupVideoTranslationCueWithNext(
    [
      ...grouped,
      {
        ...cues[1],
        cueId: 'cue-003',
        startMs: 2100,
        endMs: 3000,
      },
    ],
    'cue-002',
    'dubbing-group-2',
  )
  assert.deepEqual(
    extended.map((cue) => cue.dubbingGroupId),
    ['dubbing-group-2', 'dubbing-group-2', 'dubbing-group-2'],
  )
})

test('changing dubbing groups preserves the confirmed subtitle and global voice route', () => {
  const state = createVideoTranslationState()
  state.reviewStatus = 'ready'
  state.finalScriptId = 'timestamp-script-1'
  state.scriptHash = 'a'.repeat(64)
  state.seedPromptText = 'global prompt'
  state.arrangementStatus = 'ready'
  state.voiceStatus = 'ready'
  state.groupedVoicePrompts = { group: 'prompt' }
  state.voiceVersions = [
    {
      versionId: 'global-1',
      route: 'global',
      createdAt: '2026-08-10T00:00:00.000Z',
      previewPath: 'global.wav',
      durationMs: 1_000,
    },
  ]
  state.activeVoiceVersionId = 'global-1'

  const next = invalidateVideoTranslation(state, 'dubbing-group')
  assert.equal(next.reviewStatus, 'ready')
  assert.equal(next.finalScriptId, state.finalScriptId)
  assert.equal(next.scriptHash, state.scriptHash)
  assert.equal(next.seedPromptText, state.seedPromptText)
  assert.equal(next.arrangementStatus, 'ready')
  assert.equal(next.activeVoiceVersionId, 'global-1')
  assert.equal(next.groupedVoicePrompts, undefined)
})

test('derives strict three-part grouped prompts from the validated global prompt', () => {
  const cues = [
    {
      cueId: 'cue-001',
      dubbingGroupId: 'dubbing-group-1',
      startMs: 0,
      endMs: 900,
      recognizedText: '你好',
      sourceText: '你好',
      translatedText: 'Hello',
      performanceDirection: '旧方向',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
    {
      cueId: 'cue-002',
      dubbingGroupId: 'dubbing-group-1',
      startMs: 1000,
      endMs: 2400,
      recognizedText: '再见',
      sourceText: '再见',
      translatedText: 'Goodbye',
      performanceDirection: '旧方向',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const reference = {
    speakerId: role.translationRoleId,
    voiceProfileId: role.voiceProfileId,
    referenceAudioPath: '/tmp/reference.wav',
    label: role.displayName,
  }
  const global = planVideoTranslationDialogueBlocks(
    'episode-001',
    3000,
    'en',
    cues,
    [role],
    [reference],
    'script-1',
    'a'.repeat(64),
  ).arrangement
  const plan = planVideoTranslationGroupedDialogueBlocks(
    `# 全局配音提示词\n\n## voice-block-001\n\n这是一段一个专业的配音表演艺术家在顶级录音棚内的配音片段。\n\n林默是成熟男性，低沉清晰，饰演者为@音频1。\n\n林默（温和开口）：“Hello”\n林默（平静告别）：“Goodbye”`,
    global,
    cues,
    [role],
    [reference],
  )
  assert.equal(plan.arrangement.blocks.length, 1)
  assert.equal(
    plan.prompts['dubbing-group-1'],
    `这是一段时长为2秒的配音表演艺术家在顶级录音棚内的配音片段。\n\n林默是成熟男性，低沉清晰，饰演者为@音频1。\n\n林默（温和开口）：“Hello”\n林默（平静告别）：“Goodbye”`,
  )
})

test('binds one cue or one explicit speaker evidence group', () => {
  const cues = [
    { cueId: 'a', speakerCluster: 'speaker-1', visiblePersonIds: ['visual-person-1'] },
    { cueId: 'b', speakerCluster: 'speaker-1', visiblePersonIds: ['visual-person-2'] },
    { cueId: 'c', speakerCluster: 'speaker-2', visiblePersonIds: ['visual-person-1'] },
  ].map((cue, index) => ({
    ...cue,
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
    recognizedText: cue.cueId,
    sourceText: cue.cueId,
    translatedText: '',
    needsReview: true,
  }))
  const ids = (sameSpeaker: boolean, sameVisual: boolean) =>
    videoTranslationRoleBindingTargets(cues, 'a', sameSpeaker, sameVisual).map((cue) => cue.cueId)
  assert.deepEqual(ids(false, false), ['a'])
  assert.deepEqual(ids(true, false), ['a', 'b'])
  assert.deepEqual(ids(false, true), ['a', 'c'])
})

test('adds overlapping dialogue and adjusts subtitles from the video playhead', () => {
  const cues = [
    {
      cueId: 'cue-1',
      startMs: 1000,
      endMs: 2000,
      recognizedText: 'one',
      sourceText: 'one',
      translatedText: '',
      performanceDirection: '平静陈述',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
    {
      cueId: 'cue-2',
      startMs: 3000,
      endMs: 4000,
      recognizedText: 'two',
      sourceText: 'two',
      translatedText: '',
      performanceDirection: '平静陈述',
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const inserted = insertVideoTranslationCueAt(cues, 5000, 2500, 'manual-1')
  assert.equal(inserted.mode, 'insert')
  assert.deepEqual([inserted.cue.startMs, inserted.cue.endMs], [2500, 3000])
  const overlapping = insertVideoTranslationCueAt(cues, 5000, 1500, 'manual-2')
  assert.equal(overlapping.mode, 'insert')
  assert.deepEqual([overlapping.cue.startMs, overlapping.cue.endMs], [1500, 3500])
  assert.deepEqual([overlapping.cues[0].startMs, overlapping.cues[0].endMs], [1000, 2000])
  assert.equal(
    setVideoTranslationCueBoundary(cues, 'cue-2', 'start', 2500).find(
      (cue) => cue.cueId === 'cue-2',
    )?.startMs,
    2500,
  )
  assert.equal(
    setVideoTranslationCueBoundary(cues, 'cue-2', 'start', 1500).find(
      (cue) => cue.cueId === 'cue-2',
    )?.startMs,
    1500,
  )
  const split = splitVideoTranslationCueAt(cues, 'cue-2', 3500, 1, 'manual-split')
  assert.deepEqual(
    split.cues.slice(1).map((cue) => [cue.startMs, cue.endMs, cue.sourceText]),
    [
      [3000, 3500, 't'],
      [3500, 4000, 'wo'],
    ],
  )
})

test('requires ordered confirmed cues and known translation roles', () => {
  const cue = {
    cueId: 'cue-001',
    startMs: 0,
    endMs: 1000,
    recognizedText: '你好',
    sourceText: '你好',
    translatedText: 'Hello',
    performanceDirection: '自然地打招呼',
    translationRoleId: role.translationRoleId,
    needsReview: false,
  }
  assert.equal(validateConfirmedTranslation([cue], [role]).length, 1)
  assert.throws(() =>
    validateConfirmedTranslation([{ ...cue, translationRoleId: 'missing' }], [role]),
  )
})

test('deterministically splits continuous dialogue before a fourth reference', () => {
  const roles = Array.from(
    { length: 4 },
    (_, index): TranslationRole => ({
      ...role,
      translationRoleId: `role-${index + 1}`,
      voiceProfileId: `voice-${index + 1}`,
    }),
  )
  const cues = roles.map((item, index) => ({
    cueId: `cue-${index + 1}`,
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
    recognizedText: `原文${index + 1}`,
    sourceText: `原文${index + 1}`,
    translatedText: `line ${index + 1}`,
    performanceDirection: index === 0 ? '角色听到拒绝后压着怒意追问' : '自然承接上一句回应',
    translationRoleId: item.translationRoleId,
    needsReview: false,
  }))
  const plan = planVideoTranslationDialogueBlocks(
    'episode-001',
    4000,
    'English',
    cues,
    roles,
    roles.map((item) => ({
      speakerId: item.translationRoleId,
      voiceProfileId: item.voiceProfileId,
      referenceAudioPath: `/voice/${item.voiceProfileId}.wav`,
    })),
  )
  assert.deepEqual(
    plan.arrangement.blocks.map((block) => block.cueIds),
    [['cue-1', 'cue-2', 'cue-3'], ['cue-4']],
  )
  assert.ok(plan.arrangement.blocks.every((block) => block.references.length <= 3))
  assert.equal(
    plan.arrangement.blocks[0].lines[0].performanceEvidence,
    '角色听到拒绝后压着怒意追问',
  )
})

test('accepts canonical role names with optional voice traits before Seed generation', () => {
  const block = {
    blockId: 'dialogue-block-001',
    cueIds: ['cue-1'],
    speakerIds: ['role-1'],
    references: [
      {
        speakerId: 'role-1',
        referenceAudioPath: 'reference.wav',
        label: '林夏 · 青年女声、美式英语',
      },
    ],
    lines: [
      {
        cueId: 'cue-1',
        speakerId: 'role-1',
        text: 'I know what you did.',
        expectedStartMs: 0,
        expectedEndMs: 1_000,
      },
    ],
  }
  assert.doesNotThrow(() =>
    validateVideoTranslationDialoguePrompt(
      '林夏饰演者为@音频1。\n\n林夏（先压住愤怒，最后一个词明显加重）：“I know what you did.”',
      block,
    ),
  )
  assert.doesNotThrow(() =>
    validateVideoTranslationDialoguePrompt(
      '林夏是青年女性，medium-high pitch，声线清亮，饰演者为@音频1。\n\n林夏（先压住愤怒，最后一个词明显加重）：“I know what you did.”',
      block,
    ),
  )
  assert.throws(
    () =>
      validateVideoTranslationDialoguePrompt(
        '林夏饰演者为@音频1，全程保持固定音色，不能串音。\n\n林夏愤怒地说：“I know what you did.”',
        block,
      ),
    /压制自然表演/,
  )
})

test('uses voiceProfileId as the only reference voice identity', () => {
  const source = fs.readFileSync(new URL('../../src/views/Home/index.vue', import.meta.url), 'utf8')
  assert.match(
    source,
    /finalScript:[\s\S]*translatedText: cue\.translatedText[\s\S]*currentCueIds:[\s\S]*references/,
  )
  const skillInput = source.slice(
    source.indexOf('const skillInput = {'),
    source.indexOf("let prompt = ''", source.indexOf('const skillInput = {')),
  )
  assert.doesNotMatch(skillInput, /sourceText|finalScriptMarkdown/)
  const skill = fs.readFileSync(
    new URL('../../skills/jc-doubao-seed-audio/SKILL.md', import.meta.url),
    'utf8',
  )
  const studioSkill = fs.readFileSync(
    new URL('../../skills/jc-luyinpeng/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(skill, /`voiceProfileId` 是唯一声音 ID/)
  assert.match(skill, /参考音文件由产品在正式声音请求中直接传入/)
  assert.match(studioSkill, /专业的配音表演艺术家在顶级录音棚内的配音片段/)
  assert.match(studioSkill, /角色定义结束后再空一行/)
  assert.match(studioSkill, /正式译文必须逐字保留/)
  assert.match(studioSkill, /输入不包含源语言人工确认稿/)
  assert.match(studioSkill, /不输出时间戳、时长、`cueId`、角色 ID、声音 ID/)
  assert.match(studioSkill, /最终回复只能是可直接提交给 Seed Audio 的提示词正文/)
})

test('routes translation review through voice workbench before a role-free subtitle workbench', () => {
  const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const workspace = read('src/views/Home/components/VideoTranslationWorkspace.vue')
  const inspector = read('src/views/Home/components/VideoTranslationInspector.vue')
  const sidebar = read('src/views/Home/components/VideoTranslationSidebar.vue')
  const manage = read('src/views/Home/components/VideoManage.vue')
  const render = read('src/views/Home/components/VideoRender.vue')
  const home = read('src/views/Home/index.vue')
  assert.doesNotMatch(home, /value="content-create"/)
  assert.match(home, /VideoTranslationWorkspace/)
  assert.match(home, /VideoTranslationInspector/)
  assert.match(home, /jc-doubao-seed-audio/)
  assert.match(home, /generateTranslationSeedPrompt[\s\S]*runSkill\([\s\S]*'jc-luyinpeng'/)
  assert.match(home, /voiceDesignPrompt/)
  assert.match(
    home,
    /seedAudioRolePrompts\[reference\.speakerId\]\?\.trim\(\)[\s\S]*reference\.voiceDesignPrompt/,
  )
  assert.match(home, /isVideoTranslation\.value[\s\S]*saveTranslationSeedRolePrompt/)
  assert.match(
    home,
    /const confirmedRole = JSON\.parse\([\s\S]*bindVideoTranslationVoice\(mediaStore\.runId, confirmedRole\)[\s\S]*Object\.assign\(role, confirmedRole\)/,
  )
  assert.match(home, /上次输出未通过产品校验/)
  assert.match(inspector, /onVideoTranslationProgress/)
  assert.match(inspector, /v-progress-linear/)
  assert.match(
    home,
    /if \(!state\) mediaStore\.selectWorkspaceEntry\('video-translate'\)[\s\S]*flush: 'sync'/,
  )
  for (const column of ['时间轴', '视频片段预览', '说话角色', '人工确认稿', '字幕'])
    assert.match(workspace, new RegExp(column))
  assert.doesNotMatch(workspace, /表演/)
  assert.match(workspace, /v-if="showRoles" class="role-column"/)
  assert.match(workspace, /videoTranslationRoleBindingTargets/)
  assert.doesNotMatch(workspace, /FunASR 原文/)
  assert.match(workspace, /calibrationSuggestion/)
  assert.match(home, /:show-roles="!isTranslationSubtitleWorkspace"/)
  assert.match(home, /VideoTranslationSidebar[\s\S]*:show-roles="!isTranslationSubtitleWorkspace"/)
  for (const workspaceName of ['字幕工作台', '配音工作台', '成片工作台'])
    assert.match(home, new RegExp(workspaceName))
  assert.match(home, /@update:model-value="selectTranslationWorkspace"/)
  assert.doesNotMatch(home, /if \(!state\.targetVoicePath\) return/)
  assert.doesNotMatch(workspace, /<v-btn/)
  assert.match(inspector, /!mediaStore\.runId/)
  assert.match(home, /请先新建或打开项目，再上传视频/)
  for (const action of [
    '上传视频',
    '字幕来源',
    '导入 SRT',
    '上传有字幕视频',
    '上传无字幕视频',
    '获取字幕',
    '翻译所有字幕',
    '进入配音工作台',
    '分离原人声和背景声',
    '配音对白时间戳',
    '合成目标语言音轨',
    '烧录字幕和配音',
  ])
    assert.match(inspector, new RegExp(action))
  assert.doesNotMatch(inspector, /确认角色与字幕/)
  assert.match(home, /translation-mode/)
  assert.match(home, /openTranslationSubtitleWorkspace/)
  assert.match(home, /JSON\.parse\(JSON\.stringify\(state\.cues\)\)/)
  assert.doesNotMatch(inspector, /Whisper 生成时间轴|校准字幕与角色/)
  assert.doesNotMatch(inspector, /选择字幕行后设置角色声音|目标语言声音|voice-section/)
  assert.doesNotMatch(inspector, /上传无字幕成片母版[\s\S]*字幕来源/)
  assert.doesNotMatch(inspector, /画面识别人物[\s\S]*翻译所有字幕/)
  assert.match(home, /durationMs: state\.durationMs/)
  assert.match(home, /calibrateVideoTranslationSubtitles/)
  assert.match(home, /autoIdentifyVisualPeople\(state\)/)
  assert.match(home, /sourceText: speaker\.correctedText/)
  assert.match(home, /invalidateVideoTranslation\(state, 'source-dialogue'\)/)
  assert.match(inspector, /播放头字幕编辑/)
  assert.match(inspector, /在当前位置新增对白/)
  assert.match(inspector, /高级功能/)
  assert.match(inspector, /大模型语义校准/)
  assert.match(inspector, /应用校准建议/)
  assert.match(inspector, /撤销本次校准/)
  assert.match(inspector, /恢复识别原文/)
  assert.doesNotMatch(workspace, /相同声音/)
  assert.match(workspace, /相同画面人物/)
  assert.doesNotMatch(workspace, /batchSameSpeaker\.value/)
  assert.match(workspace, /batchSameVisualPerson\.value/)
  assert.match(workspace, /cue\.framePath/)
  assert.match(workspace, /cue\.visiblePersonIds/)
  assert.match(workspace, /声音识别：/)
  assert.match(workspace, /画面出现：/)
  assert.match(workspace, /frameCalibrationStatus === 'ready'/)
  assert.match(workspace, /新建角色：\$\{candidateName\}/)
  assert.doesNotMatch(workspace, /疑似说话：/)
  assert.doesNotMatch(inspector, /从当前位置拆分字幕/)
  assert.match(inspector, /`cue-\$\{crypto\.randomUUID\(\)\}`/)
  assert.match(sidebar, /mdi-delete-outline/)
  assert.match(sidebar, /修改角色名/)
  assert.match(home, /@delete-role="deleteTranslationRole"/)
  assert.match(home, /deleteVideoTranslationRole/)
  assert.match(home, /JSON\.parse\([\s\S]*videoTranslationRoles\.filter/)
  assert.match(manage, /translationRolePreview/)
  assert.match(manage, /label="当前参考音"/)
  assert.match(manage, /:items="voiceProfiles"/)
  assert.match(manage, />上传参考音<\/v-btn/)
  assert.match(manage, />按提示词生成参考音<\/v-btn/)
  assert.doesNotMatch(
    manage,
    /重新生成参考音|seed-voice-candidates|v-for="profile in voiceProfiles"/,
  )
  assert.match(render, />按提示词生成角色参考音<\/v-btn/)
  const roleActions = render.slice(
    render.indexOf("mediaStore.seedVoiceTab === 'roles'"),
    render.indexOf('<template v-else>', render.indexOf("mediaStore.seedVoiceTab === 'roles'")),
  )
  for (const label of ['生成角色提示词', '按提示词生成角色参考音', '进入成片工作台'])
    assert.match(roleActions, new RegExp(label))
  for (const label of ['全局配音', '全局配音提示词', '全局配音版本', '当前使用版本'])
    assert.match(manage, new RegExp(label))
  assert.match(manage, /activeTranslationVoiceVersion/)
  assert.match(home, /selectTranslationVoiceVersion/)
  assert.match(home, /version\.finalScriptId/)
  assert.match(manage, /const previewSecond = \(cue\.startMs \+ cue\.endMs\) \/ 2000/)
  assert.match(home, /approvedScript: approvedScript \|\| sample/)
  assert.match(home, /outputName: `voice-\$\{speakerId\}-\$\{Date\.now\(\)\}`/)
  assert.match(home, /speakerId,[\s\S]*'video-translation'/)
})

test('reference voice generation always creates from the prompt before binding', () => {
  const home = fs.readFileSync(new URL('../../src/views/Home/index.vue', import.meta.url), 'utf8')
  const start = home.indexOf('async function generateSeedReferenceCore')
  const end = home.indexOf('async function generateAllSeedReferences', start)
  const generation = home.slice(start, end)
  assert.match(generation, /generateSeedAudio\(\{[\s\S]*mode: 'voice-profile'/)
  assert.match(generation, /outputName: `voice-\$\{speakerId\}-\$\{Date\.now\(\)\}`/)
  assert.match(generation, /registerSeedReference\(speakerId, audio\.path\)/)
  assert.doesNotMatch(generation, /episodes\/.*voice-\$\{speakerId\}\.wav/)
  assert.doesNotMatch(generation, /references:/)
})

test('global dialogue prompt uses the existing AI revision box without clearing voice versions', () => {
  const read = (file: string) =>
    fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const render = read('src/views/Home/components/VideoRender.vue')
  const home = read('src/views/Home/index.vue')
  assert.match(render, /translationMode &&[\s\S]*seedVoiceTab === 'global'/)
  assert.match(render, /return \{ type: 'seed-global-prompt', id: 'seed-global-prompt' \}/)
  assert.match(render, /修改全局配音提示词/)
  assert.match(render, /AI 正在修改当前内容，请稍候/)
  assert.match(render, /修改失败：[\s\S]*AI 修改已完成，结果已更新/)
  assert.match(render, /Boolean\(mediaStore\.busyAction\) \|\| !revisionInstruction\.trim\(\)/)
  const translationRender = home.slice(
    home.indexOf('<VideoRender\n              translation-mode'),
    home.indexOf('/>', home.indexOf('<VideoRender\n              translation-mode')),
  )
  assert.match(translationRender, /@request-revision="requestRevision"/)
  const submit = render.slice(
    render.indexOf('function sendRevision()'),
    render.indexOf('type DubbingAction'),
  )
  assert.doesNotMatch(submit, /revisionInstruction\.value = ''/)
  assert.match(home, /confirmedTranslationCues:[\s\S]*referenceMappings:/)
  assert.match(
    home,
    /proposal\.targetType === 'seed-global-prompt'[\s\S]*saveTranslationSeedGlobalPrompt/,
  )
  const helper = home.slice(
    home.indexOf('async function saveTranslationSeedGlobalPrompt'),
    home.indexOf('async function generateTranslationSeedPrompt'),
  )
  assert.match(helper, /writeVideoTranslationSeedPlan/)
  assert.match(helper, /seedAudioGlobalPrompt = prompt/)
  assert.doesNotMatch(helper, /voiceVersions\s*=|activeVoiceVersionId\s*=|seedAudioTrackPath\s*=/)
})
