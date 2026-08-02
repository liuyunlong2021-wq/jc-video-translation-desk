import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEditingTimeline, timelineSubtitleCues } from './editingTimeline.ts'

test('builds a continuous timeline and keeps uncertain shots whole', () => {
  const timeline = buildEditingTimeline([
    {
      shotId: 'shot-001', sourceVideoPath: 'clips/001.mp4', sourceDurationMs: 6000,
      trimStartMs: 1000, trimEndMs: 5000, needsReview: false,
      dialogue: { speakerId: 'role-1', text: '你好', emotion: 'neutral', sourceStartMs: 2000, sourceEndMs: 3500, outputStartMs: 0, outputEndMs: 0 },
    },
    { shotId: 'shot-002', sourceVideoPath: 'clips/002.mp4', sourceDurationMs: 4000, trimStartMs: 3000, trimEndMs: 2000, needsReview: false },
  ])
  assert.deepEqual(timeline.shots.map((shot) => [shot.trimStartMs, shot.trimEndMs, shot.outputStartMs, shot.outputEndMs]), [[1000, 5000, 0, 4000], [0, 4000, 4000, 8000]])
  assert.deepEqual(timelineSubtitleCues(timeline), [{ start: 1, end: 2.5, text: '你好' }])
})
