import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'
const { after, mock } = nodeTest as any
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-library-user-'))
const source = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-library-source-'))
mock.module('electron', { namedExports: { app: { getPath: () => userData }, dialog: {}, net: {} } })
const voices = await import('../../electron/voice-library.ts')
after(() => { fs.rmSync(userData, { recursive: true, force: true }); fs.rmSync(source, { recursive: true, force: true }) })

test('voice scan is repeatable and keeps reviewed fields', async () => {
  fs.mkdirSync(path.join(source, '克隆参考音色'), { recursive: true })
  fs.writeFileSync(path.join(source, '克隆参考音色', '青年男声.mp3'), 'same audio')
  fs.writeFileSync(path.join(source, '克隆参考音色', 'duplicate.mp3'), 'same audio')
  const first = await voices.scanVoiceLibrary(source)
  assert.equal(first.sourceFileCount, 2); assert.equal(first.profileCount, 1); assert.equal(first.duplicateGroups.length, 1)
  const catalogPath = path.join(voices.getVoiceLibraryDir(), 'catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  catalog.profiles[0].tags = ['旁白']; catalog.profiles[0].rights = 'commercial-cleared'; catalog.profiles[0].quality = 'approved'
  fs.writeFileSync(catalogPath, JSON.stringify(catalog))
  await voices.scanVoiceLibrary(source)
  const reread = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).profiles[0]
  assert.deepEqual(reread.tags, ['旁白']); assert.equal(reread.rights, 'commercial-cleared')
  assert.equal((await voices.listVoiceProfiles()).length, 1)
  await voices.reviewVoiceProfile(reread.voiceProfileId, {
    displayName: '人工审核旁白', tags: ['旁白'], roleTags: ['旁白'], emotionTags: [],
    quality: 'approved', rights: 'unknown', cloneReady: true,
  })
  assert.equal((await voices.listVoiceProfiles()).length, 0)
  assert.equal((await voices.listVoiceProfiles({ includeNonCommercial: true, roleTags: ['旁白'] })).length, 1)
})

test('keeps English profiles in a separate language group', async () => {
  fs.mkdirSync(path.join(source, '英语人物音色'), { recursive: true })
  fs.writeFileSync(path.join(source, '英语人物音色', 'speaker.wav'), 'english audio')
  await voices.scanVoiceLibrary(source)
  const profiles = await voices.listVoiceProfiles({ includeNonCommercial: true, language: 'English', sourceGroup: '英语人物音色' })
  assert.equal(profiles.length, 1); assert.equal(profiles[0].language, 'English')
})
