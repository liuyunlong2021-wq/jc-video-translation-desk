import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  availableVideoTranslationActions,
  createVideoTranslationState,
  invalidateVideoTranslation,
  planVideoTranslationSeed,
  validateConfirmedTranslation,
  type TranslationRole,
} from './videoTranslation.ts'

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
  assert.ok(availableVideoTranslationActions(state, []).includes('generate-source-subtitles'))
  state.transcriptStatus = 'ready'
  state.speakerStatus = 'ready'
  state.translationStatus = 'ready'
  state.reviewStatus = 'ready'
  state.cues = [{
    cueId: 'cue-001', startMs: 0, endMs: 1000, recognizedText: '你好', sourceText: '你好',
    translatedText: 'Hello', translationRoleId: role.translationRoleId, needsReview: false,
  }]
  assert.ok(availableVideoTranslationActions(state, [role]).includes('arrange-doubao-voice'))
  assert.ok(!availableVideoTranslationActions(state, [{ ...role, voiceProfileId: undefined }]).includes('arrange-doubao-voice'))
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
    translationStatus: 'ready', reviewStatus: 'ready', arrangementStatus: 'ready', voiceStatus: 'ready',
    separationStatus: 'ready', mixStatus: 'ready', finalStatus: 'ready', instrumentPath: 'instrument.wav',
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

test('requires ordered confirmed cues and known translation roles', () => {
  const cue = {
    cueId: 'cue-001', startMs: 0, endMs: 1000, recognizedText: '你好', sourceText: '你好',
    translatedText: 'Hello', translationRoleId: role.translationRoleId, needsReview: false,
  }
  assert.equal(validateConfirmedTranslation([cue], [role]).length, 1)
  assert.throws(() => validateConfirmedTranslation([{ ...cue, translationRoleId: 'missing' }], [role]))
})

test('plans pure target-language Seed tasks with at most three references', () => {
  const roles = Array.from({ length: 4 }, (_, index): TranslationRole => ({
    ...role,
    translationRoleId: `role-${index + 1}`,
    voiceProfileId: `voice-${index + 1}`,
  }))
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
  const plan = planVideoTranslationSeed('episode-001', 4000, 'English', cues, roles,
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

test('keeps translation UI separate with six columns and eleven right-side actions', () => {
  const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const workspace = read('src/views/Home/components/VideoTranslationWorkspace.vue')
  const inspector = read('src/views/Home/components/VideoTranslationInspector.vue')
  const home = read('src/views/Home/index.vue')
  assert.match(home, /value="content-create"[\s\S]*value="video-translate"/)
  assert.match(home, /VideoTranslationWorkspace/)
  assert.match(home, /VideoTranslationInspector/)
  for (const column of ['时间轴', '视频片段预览', '说话角色', '原字幕', '译文字幕', '目标语言配音'])
    assert.match(workspace, new RegExp(column))
  assert.doesNotMatch(workspace, /<v-btn/)
  for (const action of [
    '上传视频', '生成原字幕', '识别说话角色', '翻译所有字幕', '确认角色与字幕',
    '生成豆包配音安排', '生成目标语言配音', '分离原人声和背景声', '去除原人声',
    '混回背景声和目标语言配音', '烧录字幕和配音',
  ]) assert.match(inspector, new RegExp(action))
})
