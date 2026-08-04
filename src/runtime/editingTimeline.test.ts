import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptEditingPoint, buildEditingTimeline, episodeVoiceTasks, timelineSubtitleCues, validateEditingTimeline } from './editingTimeline.ts'

test('builds a continuous timeline and keeps uncertain shots whole', () => {
  const timeline = buildEditingTimeline([
    {
      shotId: 'shot-001', sourceVideoPath: 'clips/001.mp4', sourceDurationMs: 6000,
      trimStartMs: 1000, trimEndMs: 5000, needsReview: false,
      dialogue: { speakerId: 'role-1', text: '你好', emotion: 'neutral', sourceStartMs: 2000, sourceEndMs: 3500, outputStartMs: 0, outputEndMs: 0 },
    },
    { shotId: 'shot-002', sourceVideoPath: 'clips/002.mp4', sourceDurationMs: 4000, trimStartMs: 3000, trimEndMs: 2000, needsReview: false },
  ])
  assert.deepEqual(timeline.shots.map((shot) => [shot.adoptedStartMs, shot.adoptedEndMs, shot.outputStartMs, shot.outputEndMs]), [[1000, 5000, 0, 4000], [0, 4000, 4000, 8000]])
  assert.equal(timeline.schemaVersion, 2)
  assert.deepEqual(timeline.shots.map((shot) => [shot.geminiStartMs, shot.geminiEndMs, shot.adoptedStartMs, shot.adoptedEndMs]), [[1000, 5000, 1000, 5000], [0, 4000, 0, 4000]])
  assert.deepEqual(timelineSubtitleCues(timeline), [{ start: 1, end: 2.5, text: '你好' }])
})

test('keeps Gemini points while adopting a user trim and rebuilding output time', () => {
  const timeline = buildEditingTimeline([
    { shotId: 'shot-001', sourceVideoPath: '1.mp4', sourceDurationMs: 6000, trimStartMs: 1000, trimEndMs: 5000, needsReview: false },
    { shotId: 'shot-002', sourceVideoPath: '2.mp4', sourceDurationMs: 4000, trimStartMs: 0, trimEndMs: 4000, needsReview: false },
  ])
  const adopted = adoptEditingPoint(timeline, 'shot-001', 1500, 4500)
  assert.deepEqual(
    adopted.shots.map((shot) => [shot.geminiStartMs, shot.geminiEndMs, shot.adoptedStartMs, shot.adoptedEndMs, shot.outputStartMs, shot.outputEndMs, shot.adoptedBy, shot.revision]),
    [[1000, 5000, 1500, 4500, 0, 3000, 'user', 1], [0, 4000, 0, 4000, 3000, 7000, 'gemini', 0]],
  )
})

test('rejects non-finite timeline values', () => {
  const timeline = buildEditingTimeline([
    { shotId: 'shot-001', sourceVideoPath: '1.mp4', sourceDurationMs: 6000, trimStartMs: 0, trimEndMs: 4000, needsReview: false },
  ])
  assert.throws(() => validateEditingTimeline({
    ...timeline,
    shots: [{ ...timeline.shots[0], geminiStartMs: Number.NaN }],
  }), /Gemini/)
})

test('places voiceover by director budget and onscreen dialogue by Gemini evidence', () => {
  const timeline = buildEditingTimeline([
    { shotId: 'shot-001', sourceVideoPath: '1.mp4', sourceDurationMs: 4000, trimStartMs: 0, trimEndMs: 4000, needsReview: false },
    { shotId: 'shot-002', sourceVideoPath: '2.mp4', sourceDurationMs: 4000, trimStartMs: 0, trimEndMs: 4000, needsReview: false, dialogue: { speakerId: 'role-1', text: '你好', emotion: 'happy', sourceStartMs: 1000, sourceEndMs: 2500, outputStartMs: 0, outputEndMs: 0 } },
  ])
  const tasks = episodeVoiceTasks(timeline, [
    { index: 1, soundType: 'voiceover', speakerId: 'narrator-1', dialogueText: '旁白', dialogueDuration: 2 },
    { index: 2, soundType: 'onscreen', speakerId: 'role-1', dialogueText: '你好' },
  ])
  assert.deepEqual(tasks.map((task) => [task.startMs, task.endMs]), [[0, 2000], [5000, 6500]])
})
