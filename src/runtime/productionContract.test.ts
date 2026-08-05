import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRODUCTION_ARTIFACT_PATHS,
  availablePostProductionActions,
  createPostProductionState,
  invalidatePostProduction,
  validateMaterialTranscript,
} from './productionContract.ts'

test('validates ordered material transcript cues and allows an empty SRT', () => {
  const empty = validateMaterialTranscript({
    schemaVersion: 1,
    mediaId: 'clip-001',
    sourceMediaPath: 'clips/001.mp4',
    durationMs: 6000,
    cues: [],
  })
  assert.equal(empty.cues.length, 0)

  assert.throws(() => validateMaterialTranscript({
    ...empty,
    cues: [
      { cueId: 'cue-1', mediaId: 'clip-001', startMs: 1000, endMs: 3000, recognizedText: '第一句' },
      { cueId: 'cue-2', mediaId: 'clip-001', startMs: 2500, endMs: 4000, recognizedText: '第二句' },
    ],
  }), /重叠/)
  assert.throws(() => validateMaterialTranscript({
    ...empty,
    cues: [{ cueId: '', mediaId: 'clip-001', startMs: 0, endMs: 7000, recognizedText: '' }],
  }), /无效/)
})

test('opens only actions whose artifacts are ready', () => {
  const initial = createPostProductionState('drama', { audioMode: 'replace-preserve-ambience' })
  assert.equal(initial.audioProductionRoute, 'post-dub')
  assert.deepEqual(availablePostProductionActions(initial), ['generate-srt'])

  const withSrt = { ...initial, materialSrt: 'ready' as const }
  assert.deepEqual(availablePostProductionActions(withSrt), ['generate-editing-timeline'])

  const withTimeline = { ...withSrt, editingTimeline: 'ready' as const }
  assert.deepEqual(availablePostProductionActions(withTimeline), [
    'reselect-edit-point',
    'generate-chinese-voice',
    'translate-subtitles',
    'separate-source-audio',
  ])

  const separated = { ...withTimeline, sourceSeparation: 'ready' as const }
  assert.ok(availablePostProductionActions(separated).includes('remove-original-vocal'))
  const mixed = {
    ...separated,
    chineseVoice: 'ready' as const,
    originalVocalRemoved: true,
    finalMix: 'ready' as const,
  }
  assert.ok(availablePostProductionActions(mixed).includes('burn-voice-and-subtitles'))
})

test('uses route and audio mode to avoid unnecessary work', () => {
  const promo = createPostProductionState('narration-promo', {
    narrationReady: true,
    audioMode: 'keep-original',
  })
  const ready = { ...promo, materialSrt: 'ready' as const, editingTimeline: 'ready' as const }
  const actions = availablePostProductionActions(ready)
  assert.ok(actions.includes('burn-voice-and-subtitles'))
  assert.ok(!actions.includes('generate-chinese-voice'))
  assert.ok(!actions.includes('separate-source-audio'))

  const english = {
    ...ready,
    outputLanguage: 'en' as const,
    englishSubtitles: 'ready' as const,
  }
  assert.ok(availablePostProductionActions(english).includes('burn-voice-and-subtitles'))
})

test('invalidates only downstream artifacts for each input change', () => {
  const ready = {
    ...createPostProductionState('drama'),
    materialSrt: 'ready' as const,
    editingTimeline: 'ready' as const,
    chineseVoice: 'ready' as const,
    englishSubtitles: 'ready' as const,
    englishVoice: 'ready' as const,
    sourceSeparation: 'ready' as const,
    originalVocalRemoved: true,
    finalMix: 'ready' as const,
    finalVideo: 'ready' as const,
  }
  const editPoint = invalidatePostProduction(ready, 'edit-point')
  assert.equal(editPoint.materialSrt, 'ready')
  assert.equal(editPoint.editingTimeline, 'ready')
  assert.equal(editPoint.chineseVoice, 'stale')
  assert.equal(editPoint.finalVideo, 'stale')

  const chineseText = invalidatePostProduction(ready, 'chinese-text')
  assert.equal(chineseText.materialSrt, 'ready')
  assert.equal(chineseText.editingTimeline, 'ready')
  assert.equal(chineseText.englishSubtitles, 'stale')
  assert.equal(chineseText.sourceSeparation, 'ready')
  assert.equal(chineseText.finalMix, 'stale')

  const language = invalidatePostProduction(ready, 'output-language')
  assert.equal(language.chineseVoice, 'ready')
  assert.equal(language.finalVideo, 'stale')

  const promo = {
    ...ready,
    route: 'narration-promo' as const,
  }
  assert.equal(invalidatePostProduction(promo, 'source-video').chineseVoice, 'ready')
  assert.equal(invalidatePostProduction(promo, 'edit-point').englishVoice, 'ready')
})

test('publishes stable Wiki artifact paths', () => {
  assert.equal(PRODUCTION_ARTIFACT_PATHS.editingTimeline, 'wiki/剪辑/<episodeId>/editing-timeline.json')
  assert.equal(PRODUCTION_ARTIFACT_PATHS.episodeIndex, 'wiki/制作/<episodeId>.md')
})
