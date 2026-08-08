import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  alignDialogueBlockWords,
  availableVideoTranslationActions,
  createVideoTranslationState,
  findUncoveredSpeechIntervals,
  insertVideoTranslationCueAt,
  invalidateVideoTranslation,
  planVideoTranslationDialogueBlocks,
  splitTimedSubtitleText,
  setVideoTranslationCueBoundary,
  validateConfirmedTranslation,
  validateVideoTranslationDialoguePrompt,
  type TranslationRole,
} from './videoTranslation.ts'

test('splits final subtitle lines at punctuation and assigns contiguous timestamps', () => {
  const parts = splitTimedSubtitleText(
    '订婚宴上让我颜面扫地，抬不起头，那我也让你抬不起头！',
    34_100,
    40_800,
    'zh',
  )
  assert.deepEqual(
    parts.map((part) => part.text),
    ['订婚宴上让我颜面扫地，', '抬不起头，', '那我也让你抬不起头！'],
  )
  assert.equal(parts[0].startMs, 34_100)
  assert.equal(parts.at(-1)?.endMs, 40_800)
  assert.equal(
    parts.map((part) => part.text).join(''),
    '订婚宴上让我颜面扫地，抬不起头，那我也让你抬不起头！',
  )
  for (let index = 1; index < parts.length; index++)
    assert.equal(parts[index - 1].endMs, parts[index].startMs)
})

test('always starts a new cue after punctuation before applying the length limit', () => {
  assert.deepEqual(
    splitTimedSubtitleText('要不是我爸非让我嫁给你，你以为我稀罕你啊？', 29_700, 34_000, 'zh').map(
      (part) => part.text,
    ),
    ['要不是我爸非让我嫁给你，', '你以为我稀罕你啊？'],
  )
})

const role: TranslationRole = {
  translationRoleId: 'role-1',
  displayName: '林默',
  aliases: [],
  voiceProfileId: 'voice-1',
  sourceEpisodeIds: ['episode-001'],
  status: 'confirmed',
}

test('opens only the translation action whose dependencies are ready', () => {
  const state = createVideoTranslationState()
  assert.deepEqual(availableVideoTranslationActions(state, []), ['upload-video'])
  state.sourceVideoPath = 'episodes/episode-001/video-translate/source.mp4'
  state.hasAudio = true
  assert.ok(availableVideoTranslationActions(state, []).includes('reverse-video'))
  state.transcriptStatus = 'ready'
  state.speakerStatus = 'ready'
  assert.ok(availableVideoTranslationActions(state, []).includes('reverse-video'))
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
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  assert.ok(availableVideoTranslationActions(state, [role]).includes('arrange-doubao-voice'))
  assert.ok(
    !availableVideoTranslationActions(state, [{ ...role, voiceProfileId: undefined }]).includes(
      'arrange-doubao-voice',
    ),
  )
  state.arrangementStatus = 'ready'
  state.voiceStatus = 'ready'
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
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const next = invalidateVideoTranslation(state, 'source-dialogue')
  assert.equal(next.translationStatus, 'stale')
  assert.equal(next.cues[0].translatedText, '')
})

test('keeps translated text when only the role binding changes', () => {
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
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const next = invalidateVideoTranslation(state, 'role-binding')
  assert.equal(next.translationStatus, 'ready')
  assert.equal(next.reviewStatus, 'stale')
  assert.equal(next.cues[0].translatedText, 'Hello')
})

test('adds, splits, and adjusts subtitles from the video playhead without overlap', () => {
  const cues = [
    {
      cueId: 'cue-1',
      startMs: 1000,
      endMs: 2000,
      recognizedText: 'one',
      sourceText: 'one',
      translatedText: '',
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
      translationRoleId: role.translationRoleId,
      needsReview: false,
    },
  ]
  const inserted = insertVideoTranslationCueAt(cues, 5000, 2500, 'manual-1')
  assert.equal(inserted.mode, 'insert')
  assert.deepEqual([inserted.cue.startMs, inserted.cue.endMs], [2500, 3000])
  const split = insertVideoTranslationCueAt(cues, 5000, 1500, 'manual-2')
  assert.equal(split.mode, 'split')
  assert.deepEqual(
    split.cues.slice(0, 2).map((cue) => [cue.startMs, cue.endMs]),
    [
      [1000, 1500],
      [1500, 2000],
    ],
  )
  assert.equal(
    setVideoTranslationCueBoundary(cues, 'cue-2', 'start', 2500).find(
      (cue) => cue.cueId === 'cue-2',
    )?.startMs,
    2500,
  )
  assert.throws(() => setVideoTranslationCueBoundary(cues, 'cue-2', 'start', 1500), /上一条字幕/)
})

test('marks only speech portions not covered by Gemini subtitle cues', () => {
  assert.deepEqual(
    findUncoveredSpeechIntervals(
      [{ startMs: 1200, endMs: 1800 }],
      [{ startMs: 500, endMs: 2500, recognizedText: 'whisper candidate' }],
    ),
    [
      { startMs: 500, endMs: 1200, recognizedText: 'whisper candidate' },
      { startMs: 1800, endMs: 2500, recognizedText: 'whisper candidate' },
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
    translationRoleId: item.translationRoleId,
    evidence: index === 0 ? '角色听到拒绝后压着怒意追问' : undefined,
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
  assert.doesNotMatch(plan.promptMarkdown, /ms|时间窗/)
})

test('aligns confirmed lines to generated dialogue word timestamps in order', () => {
  const aligned = alignDialogueBlockWords(
    [
      {
        cueId: 'cue-1',
        speakerId: 'role-1',
        text: 'I trusted you.',
        expectedStartMs: 5_000,
        expectedEndMs: 6_000,
      },
      {
        cueId: 'cue-2',
        speakerId: 'role-2',
        text: "You don't understand.",
        expectedStartMs: 8_000,
        expectedEndMs: 9_000,
      },
    ],
    [
      { word: 'I', start: 0.2, end: 0.3 },
      { word: 'trusted', start: 0.31, end: 0.7 },
      { word: 'you', start: 0.71, end: 0.9 },
      { word: 'You', start: 1.2, end: 1.35 },
      { word: "don't", start: 1.36, end: 1.55 },
      { word: 'understand', start: 1.56, end: 2.0 },
    ],
    2_100,
  )
  assert.deepEqual(
    aligned.map((cue) => [cue.cueId, cue.observedStartMs, cue.observedEndMs]),
    [
      ['cue-1', 120, 1020],
      ['cue-2', 1120, 2100],
    ],
  )
})

test('fails alignment instead of inventing timing when a line has no matched words', () => {
  assert.throws(() =>
    alignDialogueBlockWords(
      [
        {
          cueId: 'cue-1',
          speakerId: 'role-1',
          text: 'Completely different',
          expectedStartMs: 0,
          expectedEndMs: 1_000,
        },
      ],
      [{ word: 'hello', start: 0, end: 0.4 }],
      500,
    ),
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
      '林夏饰演者为@音频1。\n\n林夏先压住愤怒，最后一个词明显加重：“I know what you did.”',
      block,
    ),
  )
  assert.doesNotThrow(() =>
    validateVideoTranslationDialoguePrompt(
      '林夏是青年女性，medium-high pitch，声线清亮，饰演者为@音频1。\n\n林夏先压住愤怒，最后一个词明显加重：“I know what you did.”',
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
    /无时间戳连续对白[\s\S]*正式英文台词逐字保留[\s\S]*不要输出绝对时间、目标总时长、cue ID/,
  )
  const skill = fs.readFileSync(
    new URL('../../skills/jc-doubao-seed-audio/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(skill, /`voiceProfileId` 是唯一声音 ID/)
  assert.match(skill, /参考音文件由产品在正式声音请求中直接传入/)
  assert.match(skill, /目标语言为英文时，正式英文台词必须逐字保留英文原文/)
  assert.match(
    skill,
    /无时间戳连续对白提示词[\s\S]*不写绝对时间、目标总时长、cue ID、low、medium、high/,
  )
})

test('routes translation review through voice workbench before a role-free subtitle workbench', () => {
  const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const workspace = read('src/views/Home/components/VideoTranslationWorkspace.vue')
  const inspector = read('src/views/Home/components/VideoTranslationInspector.vue')
  const sidebar = read('src/views/Home/components/VideoTranslationSidebar.vue')
  const manage = read('src/views/Home/components/VideoManage.vue')
  const render = read('src/views/Home/components/VideoRender.vue')
  const home = read('src/views/Home/index.vue')
  assert.match(home, /value="content-create"[\s\S]*value="video-translate"/)
  assert.match(home, /VideoTranslationWorkspace/)
  assert.match(home, /VideoTranslationInspector/)
  assert.match(home, /jc-doubao-seed-audio/)
  assert.match(home, /voiceDesignPrompt/)
  assert.match(
    home,
    /seedAudioRolePrompts\[reference\.speakerId\]\?\.trim\(\)[\s\S]*reference\.voiceDesignPrompt/,
  )
  assert.match(home, /isVideoTranslation\.value[\s\S]*saveTranslationSeedRolePrompt/)
  assert.match(home, /上次输出未通过产品校验/)
  assert.match(inspector, /onVideoTranslationProgress/)
  assert.match(inspector, /v-progress-linear/)
  assert.match(
    home,
    /translationEdition && !state[\s\S]*selectWorkspaceEntry\('video-translate'\)[\s\S]*flush: 'sync'/,
  )
  for (const column of ['时间轴', '视频片段预览', '说话角色', '原字幕', '译文字幕', '目标语言配音'])
    assert.match(workspace, new RegExp(column))
  assert.match(workspace, /v-if="showRoles" class="role-column"/)
  assert.match(workspace, /item\.proposedName\?\.trim\(\) === sameCandidate/)
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
    '上传识别视频',
    '上传无字幕成片母版',
    '扒片',
    '翻译所有字幕',
    '进入配音工作台',
    '分离原人声和背景声',
    '去除原人声',
    '混回背景声和目标语言配音',
    '烧录字幕和配音',
  ])
    assert.match(inspector, new RegExp(action))
  assert.doesNotMatch(inspector, /确认角色与字幕/)
  assert.match(home, /translation-mode/)
  assert.match(home, /openTranslationSubtitleWorkspace/)
  assert.match(home, /state\.cues\.map\(\(cue\) => \(\{ \.\.\.cue \}\)\)/)
  assert.doesNotMatch(inspector, /Whisper 生成时间轴|校准字幕与角色/)
  assert.doesNotMatch(inspector, /选择字幕行后设置角色声音|目标语言声音|voice-section/)
  assert.match(home, /roles: mediaStore\.videoTranslationRoles\.map/)
  assert.match(home, /sourceText: speaker\.correctedText/)
  assert.match(home, /invalidateVideoTranslation\(state, 'source-dialogue'\)/)
  assert.match(inspector, /播放头字幕编辑/)
  assert.match(inspector, /在当前位置新增字幕/)
  assert.match(inspector, /从当前位置拆分字幕/)
  assert.match(inspector, /manual-cue-/)
  assert.match(sidebar, /mdi-delete-outline/)
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
  assert.match(render, /v-if="!translationMode"[\s\S]*>按提示词生成角色参考音<\/v-btn/)
  for (const label of ['连续对白实验', '连续对白导演稿', '连续对白版本', '当前使用版本'])
    assert.match(manage, new RegExp(label))
  assert.match(manage, /activeTranslationVoiceVersion/)
  assert.match(home, /selectTranslationVoiceVersion/)
  assert.match(home, /version\.targetVoicePath/)
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
  const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
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
