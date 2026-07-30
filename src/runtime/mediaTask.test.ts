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
  store.styleId = 'live-action'
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
      playDuration: 12,
      generationDuration: 8,
      script: '文稿',
      coreReferenceVisible: true,
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

test('archives the current run before a new script invalidates it', () => {
  const store = populatedStore()
  store.runId = 'old-run'
  store.archiveCurrent()
  store.invalidateFrom('script')
  assert.equal(store.history.length, 1)
  assert.equal(store.history[0].runId, 'old-run')
  assert.equal(store.history[0].finalPath, '/run/final.mp4')
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
