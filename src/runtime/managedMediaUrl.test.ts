import assert from 'node:assert/strict'
import test from 'node:test'
import { managedMediaUrl } from './managedMediaUrl.ts'

test('encodes managed media paths without exposing a file URL', () => {
  const value = managedMediaUrl('run-1', 'storyboards/一 张图.png')
  assert.match(value, /^short-video-media:\/\/asset\?/)
  assert.equal(new URL(value).searchParams.get('path'), 'storyboards/一 张图.png')
  assert.doesNotMatch(value, /^file:/)
})
