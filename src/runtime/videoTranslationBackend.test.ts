import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-translation-backend-'))
let selectedFile = ''

mock.module('electron', {
  namedExports: {
    app: { getPath: () => root },
    dialog: { showOpenDialog: async () => ({ canceled: !selectedFile, filePaths: selectedFile ? [selectedFile] : [] }) },
    net: {},
  },
})
mock.module('music-metadata', {
  namedExports: {
    parseFile: async () => ({ format: { duration: 2, sampleRate: 48000, numberOfChannels: 2 } }),
    parseBuffer: async () => ({ format: { duration: 2 } }),
  },
})
mock.module('../../electron/seed-audio.ts', {
  namedExports: {
    generateSeedAudio: async () => ({ path: '' }),
    mixSeedAudioTracks: async () => '',
  },
})

const workspace = await import('../../electron/media-workspace.ts')
const translation = await import('../../electron/video-translation.ts')
const projectId = 'translation-backend'
const episodeId = 'episode-001'
const projectRoot = path.join(root, 'project')
await workspace.registerProjectRoot(projectId, projectRoot, false)

after(() => fs.rmSync(root, { recursive: true, force: true }))

test('upload cancellation changes nothing and upload preserves the original source', async () => {
  assert.equal(await translation.selectVideoTranslationSource(projectId, episodeId), null)
  assert.equal(fs.existsSync(path.join(projectRoot, 'episodes', episodeId, 'video-translate')), false)

  selectedFile = path.join(root, 'source.mp4')
  fs.writeFileSync(selectedFile, Buffer.from('original-video-bytes'))
  const result = await translation.selectVideoTranslationSource(projectId, episodeId)
  assert.ok(result)
  assert.equal(fs.readFileSync(selectedFile, 'utf8'), 'original-video-bytes')
  assert.equal(fs.readFileSync(path.join(projectRoot, result!.sourceVideoPath), 'utf8'), 'original-video-bytes')
  assert.equal(fs.readFileSync(path.join(projectRoot, result!.rawSnapshotPath), 'utf8'), 'original-video-bytes')
})

test('translation Wiki writes never rewrite creative Wiki files', async () => {
  const creative = path.join(projectRoot, 'wiki', '文稿', episodeId, '确认文稿.md')
  fs.mkdirSync(path.dirname(creative), { recursive: true })
  fs.writeFileSync(creative, '# 原创确认文稿\n\n不能改。\n')
  const before = fs.readFileSync(creative)
  const role = {
    translationRoleId: 'role-1', displayName: '角色一', aliases: [],
    sourceEpisodeIds: [episodeId], status: 'confirmed' as const,
  }
  await translation.writeConfirmedVideoTranslation(projectId, episodeId, 'zh', 'en', [{
    cueId: 'cue-1', startMs: 0, endMs: 1000, recognizedText: '你好', sourceText: '你好',
    translatedText: 'Hello', translationRoleId: role.translationRoleId, needsReview: false,
  }], [role])
  assert.deepEqual(fs.readFileSync(creative), before)
  assert.ok(fs.existsSync(path.join(projectRoot, 'wiki', '翻译', episodeId, '角色台词确认.json')))
})
