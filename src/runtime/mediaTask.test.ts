import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useMediaTaskStore } from '../store/mediaTask.ts'

function populatedStore() {
  setActivePinia(createPinia())
  const store = useMediaTaskStore()
  store.approvedScript = '文稿'
  store.scriptHash = 'hash'
  store.voicePlan = { text: '文稿', voicePrompt: '声音' }
  store.voicePath = '/run/voice.mp3'
  store.voiceDuration = 12
  store.targetDuration = 15
  store.shotPace = 'fast'
  store.resolvedPace = 'fast'
  store.styleId = 'cinematic-contrast'
  store.coreReference = {
    id: 'core-1',
    label: '产品图',
    relativePath: 'inputs/core.png',
    mimeType: 'image/png',
    source: 'upload',
  }
  store.visualAnchor = '锚点'
  store.segments = [
    {
      index: 1,
      storyBeat: '展示结果',
      shotRole: 'hook',
      editTreatment: 'progression',
      playDuration: 12,
      generationDuration: 8,
      script: '文稿',
      coreReferenceVisible: true,
      referenceAssetIds: ['core-1'],
      shotSize: '近景',
      cameraAngle: '平视',
      cameraMovement: '推进',
      startState: '产品静止',
      actionProgression: '镜头推进',
      endState: '产品特写',
      storyboardImagePrompt: '图',
      videoPrompt: '无背景音乐',
      imagePath: '/run/storyboards/001.png',
      imageStatus: 'success',
      videoPath: '/run/clips/001.mp4',
      videoStatus: 'success',
    },
  ]
  store.finalPath = '/run/final.mp4'
  return store
}

test('invalidates only the downstream media required by each regeneration level', () => {
  let store = populatedStore()
  store.invalidateFrom('videos')
  assert.equal(store.finalPath, '')
  assert.equal(store.segments[0].videoPath, '/run/clips/001.mp4')

  store = populatedStore()
  store.invalidateFrom('images')
  assert.equal(store.segments[0].imagePath, '/run/storyboards/001.png')
  assert.equal(store.segments[0].videoPath, '')
  assert.equal(store.voicePath, '/run/voice.mp3')

  store = populatedStore()
  store.invalidateFrom('voice')
  assert.equal(store.segments.length, 0)
  assert.equal(store.voicePath, '/run/voice.mp3')

  store = populatedStore()
  store.invalidateFrom('script')
  assert.equal(store.voicePlan, null)
  assert.equal(store.voicePath, '')
  assert.equal(store.segments.length, 0)
  assert.equal(store.approvedScript, '文稿')
  assert.equal(store.scriptHash, 'hash')
})

test('requires all three asset skills before storyboard planning', () => {
  const store = populatedStore()
  assert.equal(store.assetPlanningComplete, false)
  store.assetPlanCompletedRoles = ['character', 'scene']
  assert.equal(store.assetPlanningComplete, false)
  store.assetPlanCompletedRoles.push('prop')
  assert.equal(store.assetPlanningComplete, true)
})

test('recognizes complete legacy asset designs when role markers were not saved', () => {
  const store = populatedStore()
  store.referenceAssets = [{
    id: 'scene-1',
    role: 'scene',
    label: '书房',
    description: '场景',
    identityTraits: [],
    styleRequirements: [],
    required: true,
    status: 'approved',
    design: { project: { visualStyle: '电影感', aspectRatio: '9:16' }, scene: { name: '书房' } },
    versions: [{ id: 'generated-1', source: 'generated', relativePath: 'assets/scene.png', createdAt: '' }],
  }]
  assert.deepEqual(store.assetPlanCompletedRoles, [])
  assert.equal(store.assetPlanningComplete, true)
})

test('adopting an asset version invalidates only referencing shots', () => {
  const store = populatedStore()
  store.referenceAssets = [
    {
      id: 'core-1',
      role: 'prop',
      label: '产品',
      description: '产品',
      identityTraits: [],
      styleRequirements: [],
      required: true,
      status: 'approved',
      design: { project: { visualStyle: '电影感', aspectRatio: '9:16' } },
      versions: [
        { id: 'v1', source: 'upload', relativePath: 'assets/v1.png', createdAt: '' },
        { id: 'v2', source: 'generated', relativePath: 'assets/v2.png', createdAt: '' },
      ],
      activeVersionId: 'v1',
    },
  ]
  store.adoptAssetVersion('core-1', 'v2')
  assert.equal(store.segments[0].imagePath, '')
  assert.equal(store.segments[0].videoPath, '')
  assert.equal(store.referenceAssets[0].status, 'approved')
})

test('uploaded images remain references until an AI version is approved', () => {
  const store = populatedStore()
  store.referenceAssets = [
    {
      id: 'character-1',
      role: 'character',
      label: '编剧小人',
      description: '角色',
      identityTraits: [],
      styleRequirements: [],
      required: true,
      status: 'approved',
      design: { project: { visualStyle: '粘土风格', aspectRatio: '9:16' } },
      versions: [{ id: 'upload-1', source: 'upload', relativePath: 'inputs/ref.png', createdAt: '' }],
      activeVersionId: 'upload-1',
    },
  ]
  assert.equal(store.allRequiredAssetsApproved, false)
  store.adoptAssetVersion('character-1', 'upload-1')
  assert.equal(store.referenceAssets[0].status, 'approved')
  assert.equal(store.allRequiredAssetsApproved, false)
})

test('treats an existing generated asset as ready even if legacy selection state drifted', () => {
  const store = populatedStore()
  store.referenceAssets = [{
    id: 'scene-1',
    role: 'scene',
    label: '书房',
    description: '场景',
    identityTraits: [],
    styleRequirements: [],
    required: true,
    status: 'design-ready',
    versions: [{ id: 'generated-1', source: 'generated', relativePath: 'assets/scene.png', createdAt: '' }],
  }]
  assert.equal(store.allRequiredAssetsApproved, true)
  assert.equal(store.currentGeneratedAssetVersion('scene-1')?.id, 'generated-1')
})

test('removes only reference versions and keeps generated asset versions', () => {
  const store = populatedStore()
  store.referenceAssets = [
    {
      id: 'prop-1',
      role: 'prop',
      label: '手机',
      description: '道具',
      identityTraits: [],
      styleRequirements: [],
      required: true,
      status: 'ready',
      design: { project: { visualStyle: '电影感', aspectRatio: '9:16' } },
      versions: [
        { id: 'search-1', source: 'search', relativePath: 'assets/search.jpg', sourcePageUrl: 'https://jp.pinterest.com/pin/12345/', createdAt: '' },
        { id: 'generated-1', source: 'generated', relativePath: 'assets/generated.png', createdAt: '' },
      ],
      activeVersionId: 'generated-1',
      pendingVersionId: 'search-1',
    },
  ]
  store.removeAssetReferenceVersion('prop-1', 'search-1')
  assert.deepEqual(store.referenceAssets[0].versions.map((item) => item.id), ['generated-1'])
  assert.equal(store.referenceAssets[0].activeVersionId, 'generated-1')
  assert.equal(store.referenceAssets[0].pendingVersionId, undefined)
  assert.equal(store.referenceAssets[0].status, 'ready')
  assert.equal(store.referenceAssets[0].referenceRevision, 1)
  assert.deepEqual(store.referenceAssets[0].rejectedReferencePinIds, ['12345'])
  store.removeAssetReferenceVersion('prop-1', 'generated-1')
  assert.equal(store.referenceAssets[0].versions.length, 1)
})

test('archives the current run before a new script invalidates it', () => {
  const store = populatedStore()
  store.runId = 'old-run'
  store.archiveCurrent()
  store.invalidateFrom('script')
  assert.equal(store.history.length, 1)
  assert.equal(store.history[0].runId, 'old-run')
  assert.equal(store.history[0].finalPath, '/run/final.mp4')
})

test('resets to a blank project without losing archived runs or session settings', () => {
  const store = populatedStore()
  store.runId = 'old-run'
  store.request = '旧项目诉求'
  store.voiceEngine = 'local'
  store.apiConfigured = true
  store.archiveCurrent()
  store.reset()
  assert.equal(store.runId, '')
  assert.equal(store.request, '')
  assert.equal(store.script, '')
  assert.equal(store.segments.length, 0)
  assert.equal(store.coreReference, null)
  assert.equal(store.history[0].runId, 'old-run')
  assert.equal(store.voiceEngine, 'local')
  assert.equal(store.apiConfigured, true)
})

test('style and core reference changes invalidate images but preserve script and voice', () => {
  let store = populatedStore()
  store.invalidateFrom('images')
  assert.equal(store.voicePath, '/run/voice.mp3')
  assert.equal(store.segments[0].imagePath, '/run/storyboards/001.png')
  assert.equal(store.segments[0].videoPath, '')

  store = populatedStore()
  store.invalidateVisuals()
  assert.equal(store.voicePath, '/run/voice.mp3')
  assert.equal(store.segments.length, 0)
  assert.equal(store.coreReference?.relativePath, 'inputs/core.png')
})

test('shot pace changes invalidate only the visual chain', () => {
  const store = populatedStore()
  store.shotPace = 'slow'
  store.invalidateVisuals()
  assert.equal(store.voicePath, '/run/voice.mp3')
  assert.equal(store.resolvedPace, null)
  assert.equal(store.segments.length, 0)
})

test('editing voice and shot prompts invalidates only their dependent media', () => {
  let store = populatedStore()
  store.setVoicePrompt('新声音')
  assert.equal(store.voicePlan?.voicePrompt, '新声音')
  assert.equal(store.voicePath, '')
  assert.equal(store.segments.length, 0)
  assert.equal(store.stage, 'voice-plan-ready')

  store = populatedStore()
  store.setSegmentPrompt(1, 'storyboardImagePrompt', '新画面')
  assert.equal(store.segments[0].storyboardImagePrompt, '新画面')
  assert.equal(store.segments[0].imagePath, '')
  assert.equal(store.segments[0].videoPath, '')
  assert.equal(store.finalPath, '')

  store = populatedStore()
  store.setSegmentPrompt(1, 'videoPrompt', '新动态')
  assert.equal(store.segments[0].imagePath, '/run/storyboards/001.png')
  assert.equal(store.segments[0].videoPath, '')
  assert.equal(store.finalPath, '')

  store = populatedStore()
  store.setVisualAnchor('新锚点')
  assert.equal(store.visualAnchor, '新锚点')
  assert.equal(store.segments[0].imagePath, '')
  assert.equal(store.segments[0].videoPath, '')
})

test('workspace selection is exclusive and one-shot invalidation preserves other shots', () => {
  const store = populatedStore()
  store.segments.push({ ...store.segments[0], index: 2, script: '第二镜' })
  store.selectShot(1)
  assert.equal(store.workspaceView, 'storyboard')
  assert.equal(store.selectedShotIndex, 1)
  assert.equal(store.selectedAssetId, undefined)
  store.selectAsset('video-2')
  assert.equal(store.workspaceView, 'assets')
  assert.equal(store.selectedShotIndex, undefined)
  store.invalidateShot(1, 'video')
  assert.equal(store.segments[0].videoPath, '')
  assert.equal(store.segments[0].imagePath, '/run/storyboards/001.png')
  assert.equal(store.segments[1].videoPath, '/run/clips/001.mp4')
})
