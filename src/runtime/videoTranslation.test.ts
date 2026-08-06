import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  availableVideoTranslationActions,
  createVideoTranslationState,
  invalidateVideoTranslation,
  planVideoTranslationSeed,
  splitTimedSubtitleText,
  validateConfirmedTranslation,
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

test('plans pure target-language Seed tasks with at most three references', () => {
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
    needsReview: false,
  }))
  const plan = planVideoTranslationSeed(
    'episode-001',
    4000,
    'English',
    cues,
    roles,
    roles.map((item) => ({
      speakerId: item.translationRoleId,
      voiceProfileId: item.voiceProfileId,
      referenceAudioPath: `/voice/${item.voiceProfileId}.wav`,
      apiSpeakerId: item.voiceProfileId,
    })),
  )
  assert.ok(plan.arrangement.tasks.every((task) => task.references.length <= 3))
  assert.ok(plan.arrangement.tasks.every((task) => !task.includeMusicAndEffects))
  assert.match(plan.promptMarkdown, /禁止音乐、环境声、动作音效/)
})

test('routes translation review through voice workbench before a role-free subtitle workbench', () => {
  const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const workspace = read('src/views/Home/components/VideoTranslationWorkspace.vue')
  const inspector = read('src/views/Home/components/VideoTranslationInspector.vue')
  const home = read('src/views/Home/index.vue')
  assert.match(home, /value="content-create"[\s\S]*value="video-translate"/)
  assert.match(home, /VideoTranslationWorkspace/)
  assert.match(home, /VideoTranslationInspector/)
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
  assert.doesNotMatch(workspace, /<v-btn/)
  assert.match(inspector, /!mediaStore\.runId/)
  assert.match(home, /请先新建或打开项目，再上传视频/)
  for (const action of [
    '上传视频',
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
})
