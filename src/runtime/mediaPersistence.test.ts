import assert from 'node:assert/strict'
import test from 'node:test'
import { deserializeMediaTask, serializeMediaTask } from './mediaPersistence.ts'

test('persists managed media as paths relative to its run', () => {
  const runId = 'run-1'
  const persisted = JSON.parse(
    serializeMediaTask({
      runId,
      coreReference: {
        id: 'core-1',
        label: '产品图',
        relativePath: `/Users/test/App/media-runs/${runId}/inputs/core.png`,
        mimeType: 'image/png',
        source: 'upload',
      },
      voicePath: `/Users/test/App/media-runs/${runId}/voice(1).mp3`,
      finalPath: `C:\\App\\media-runs\\${runId}\\final.mp4`,
      segments: [
        {
          imagePath: `/Users/test/App/media-runs/${runId}/storyboards/001.png`,
          videoPath: `/Users/test/App/media-runs/${runId}/clips/001.mp4`,
        },
      ],
      history: [
        {
          runId: 'old-run',
          voicePath: '/Users/test/App/media-runs/old-run/voice.mp3',
          finalPath: '/Users/test/App/media-runs/old-run/final.mp4',
          segments: [],
        },
      ],
    }),
  )
  assert.equal(persisted.voicePath, 'voice(1).mp3')
  assert.equal(persisted.finalPath, 'final.mp4')
  assert.equal(persisted.coreReference.relativePath, 'inputs/core.png')
  assert.equal(persisted.segments[0].imagePath, 'storyboards/001.png')
  assert.equal(persisted.segments[0].videoPath, 'clips/001.mp4')
  assert.equal(persisted.history[0].voicePath, 'voice.mp3')
  assert.equal(persisted.history[0].finalPath, 'final.mp4')
})

test('migrates legacy segment durations without losing generated media', () => {
  const state = deserializeMediaTask(
    JSON.stringify({
      runId: 'legacy-run',
      segments: [{ duration: 7.5, imagePath: 'storyboards/001.png', videoPath: 'clips/001.mp4' }],
    }),
  )
  assert.equal(state.segments[0].playDuration, 7.5)
  assert.equal(state.segments[0].generationDuration, 8)
  assert.equal(state.segments[0].imagePath, 'storyboards/001.png')
  assert.equal('duration' in state.segments[0], false)
})
