import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alignSeedDialogue,
  buildSeedAudioRequest,
  detectScriptLanguage,
  planSeedAudioArrangement,
  seedAudioErrorMessage,
  seedLinesFromScript,
} from './seedAudio.ts'

test('detects the confirmed script language for Seed reference voices', () => {
  assert.equal(detectScriptLanguage('陈小满：妈，我回来了。'), 'zh')
  assert.equal(detectScriptLanguage('Emily: Mom, I am home.\nShe closes the door.'), 'en')
})

test('builds the official Seed Audio payload and preserves reference order', () => {
  const payload = buildSeedAudioRequest({
    mode: 'full-track',
    language: 'zh',
    durationMs: 12000,
    prompt: '角色A饰演者为@音频1，严格朗读确认台词。',
    references: [{ speaker: 'ref-a' }, { speaker: 'ref-b' }],
  })
  assert.equal(payload.model, 'seed-audio-1.0')
  assert.equal(payload.audio_config.sample_rate, 48000)
  assert.deepEqual(payload.references, [{ speaker: 'ref-a' }, { speaker: 'ref-b' }])
  assert.equal('duration' in payload, false)
})

test('rejects more than three references and references on a base voice', () => {
  assert.throws(
    () =>
      buildSeedAudioRequest({
        mode: 'full-track',
        language: 'zh',
        durationMs: 1000,
        prompt: '内容',
        references: [{ speaker: 'a' }, { speaker: 'b' }, { speaker: 'c' }, { speaker: 'd' }],
      }),
    /最多支持 3 个参考音/,
  )
  assert.throws(
    () =>
      buildSeedAudioRequest({
        mode: 'voice-profile',
        language: 'zh',
        durationMs: 1000,
        prompt: '内容',
        references: [{ speaker: 'a' }],
      }),
    /基准音不能携带参考音/,
  )
})

test('surfaces the Seed Audio server error body', () => {
  assert.equal(
    seedAudioErrorMessage(400, { error: { message: 'invalid reference speaker' } }),
    'Seed Audio 请求失败 (400)：invalid reference speaker',
  )
})

test('splits a four-person segment without dropping the fourth speaker', () => {
  const arrangement = planSeedAudioArrangement({
    segmentId: 'scene-001',
    startMs: 0,
    endMs: 12000,
    references: ['a', 'b', 'c', 'd'].map((speakerId) => ({
      speakerId,
      referenceAudioPath: `voices/${speakerId}.wav`,
    })),
    lines: ['a', 'b', 'c', 'd'].map((speakerId, index) => ({
      speakerId,
      text: `台词${index + 1}`,
      startMs: index * 2000,
      endMs: index * 2000 + 1500,
    })),
  })
  assert.deepEqual(
    arrangement.tasks.map((task) => task.mode),
    ['full-track', 'timeline-voice'],
  )
  assert.deepEqual(arrangement.tasks[0]?.speakerIds, ['a', 'b', 'c'])
  assert.deepEqual(arrangement.tasks[1]?.speakerIds, ['d'])
  assert.equal(arrangement.tasks[1]?.includeMusicAndEffects, false)
})

test('splits every overflow task into at most three references', () => {
  const speakers = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const arrangement = planSeedAudioArrangement({
    segmentId: 'scene-many',
    startMs: 0,
    endMs: 20000,
    references: speakers.map((speakerId) => ({
      speakerId,
      referenceAudioPath: `${speakerId}.wav`,
    })),
    lines: speakers.map((speakerId) => ({ speakerId, text: speakerId })),
  })
  assert.deepEqual(
    arrangement.tasks.map((task) => task.speakerIds),
    [['a', 'b', 'c'], ['d', 'e', 'f'], ['g']],
  )
})

test('resolves confirmed character names and keeps Whisper as timing evidence', () => {
  const lines = seedLinesFromScript('陈大发：你来了。\n旁白：门慢慢打开。', [
    { id: 'character-chen', label: '陈大发' },
  ])
  assert.deepEqual(lines, [
    { speakerId: 'character-chen', text: '你来了。' },
    { speakerId: undefined, text: '门慢慢打开。' },
  ])
  const aligned = alignSeedDialogue(lines, [{ cueId: 'w1', startMs: 300, endMs: 2300 }])
  assert.equal(aligned[0].startMs, 300)
  assert.equal(aligned.at(-1)?.endMs, 2300)
  assert.equal(aligned[0].text, '你来了。')
})
