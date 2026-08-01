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
  assert.equal(state.shotPace, 'auto')
  assert.equal(state.resolvedPace, null)
  assert.equal(state.voiceEngine, 'cloud')
  assert.equal(state.workspaceView, 'script')
  assert.equal(state.mediaFilter, 'all')
  assert.equal(state.finalShotCount, 1)
  assert.deepEqual(state.segments[0].referenceAssetIds, [])
  assert.equal(state.segments[0].storyBeat, '历史镜头')
})

test('hides obsolete core references without deleting their source file', () => {
  const state = deserializeMediaTask(
    JSON.stringify({
      coreReference: { id: 'core-1' },
      workspaceView: 'storyboard',
      mediaFilter: 'videos',
      segments: [{ index: 1, script: '文稿', coreReferenceVisible: true }],
    }),
  )
  assert.equal(state.coreReference, null)
  assert.deepEqual(state.referenceAssets, [])
  assert.deepEqual(state.segments[0].referenceAssetIds, [])
  assert.equal(state.segments[0].coreReferenceVisible, false)
  assert.equal(state.workspaceView, 'storyboard')
  assert.equal(state.mediaFilter, 'videos')
})

test('migrates legacy style and invalid target duration', () => {
  const state = deserializeMediaTask(
    JSON.stringify({ styleId: 'live-action', targetDuration: 181 }),
  )
  assert.equal(state.styleId, 'cinematic-contrast')
  assert.equal(state.targetDuration, 15)
})

test('migrates legacy product assets to props', () => {
  const state = deserializeMediaTask(
    JSON.stringify({
      referenceAssets: [{ id: 'legacy-product', role: 'product', status: 'prompt-ready', prompt: '旧提示词' }],
    }),
  )
  assert.equal(state.referenceAssets[0].role, 'prop')
  assert.equal(state.referenceAssets[0].status, 'design-ready')
  assert.equal('prompt' in state.referenceAssets[0], false)
  assert.deepEqual(state.assetPlanCompletedRoles, [])
})

test('keeps completed asset planning only for complete design JSON', () => {
  const state = deserializeMediaTask(
    JSON.stringify({
      referenceAssets: [
        {
          role: 'prop',
          design: { project: { visualStyle: '电影感', aspectRatio: '9:16' } },
        },
      ],
      assetPlanCompletedRoles: ['character', 'scene', 'prop'],
    }),
  )
  assert.deepEqual(state.assetPlanCompletedRoles, ['character', 'scene', 'prop'])
})

test('does not erase completed asset skills when an older design lacks project fields', () => {
  const state = deserializeMediaTask(
    JSON.stringify({
      referenceAssets: [{ role: 'scene', design: { scene: { name: '书房' } } }],
      assetPlanCompletedRoles: ['character', 'scene', 'prop'],
    }),
  )
  assert.deepEqual(state.assetPlanCompletedRoles, ['character', 'scene', 'prop'])
})

test('restores a matching generated asset version after legacy state lost its selection', () => {
  const design = { scene: { name: '书房' }, project: { visualStyle: '电影光', aspectRatio: '9:16' } }
  const state = deserializeMediaTask(JSON.stringify({
    runId: 'run-1',
    styleId: 'cinematic-contrast',
    targetDuration: 15,
    shotPace: 'fast',
    voiceEngine: 'cloud',
    textModel: 'gpt-5.6-sol',
    videoModel: 'rh-grok-image-video',
    workflowStep: 'assets',
    workspaceView: 'assets',
    mediaFilter: 'all',
    referenceAssets: [{
      id: 'scene-1',
      role: 'scene',
      status: 'design-ready',
      design,
      versions: [{
        id: 'generated-1',
        source: 'generated',
        relativePath: 'assets/scene-1/generated.png',
        designFingerprint: JSON.stringify({ project: design.project, scene: design.scene }),
      }],
    }],
    segments: [],
  }))
  assert.equal(state.referenceAssets[0].activeVersionId, 'generated-1')
  assert.equal(state.referenceAssets[0].status, 'approved')
  assert.equal(state.videoModel, 'rh-grok-image-video')
})

test('defaults an unknown or missing project video model to Veo', () => {
  for (const videoModel of [undefined, 'unknown-model']) {
    const state = deserializeMediaTask(JSON.stringify({
      runId: 'run-video-model',
      styleId: 'cinematic-contrast',
      targetDuration: 15,
      shotPace: 'auto',
      voiceEngine: 'cloud',
      textModel: 'gemini-3.6-flash',
      videoModel,
      workflowStep: 'script',
      workspaceView: 'script',
      mediaFilter: 'all',
      referenceAssets: [],
      segments: [],
    }))
    assert.equal(state.videoModel, 'veo-3.1-generate-preview')
  }
})
