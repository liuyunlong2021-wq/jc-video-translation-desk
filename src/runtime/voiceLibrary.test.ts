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
const workspace = await import('../../electron/media-workspace.ts')
after(() => {
  fs.rmSync(userData, { recursive: true, force: true })
  fs.rmSync(source, { recursive: true, force: true })
})

test('voice scan is repeatable and keeps reviewed fields', async () => {
  fs.mkdirSync(path.join(source, '克隆参考音色'), { recursive: true })
  fs.writeFileSync(path.join(source, '克隆参考音色', '青年男声.mp3'), 'same audio')
  fs.writeFileSync(path.join(source, '克隆参考音色', 'duplicate.mp3'), 'same audio')
  const first = await voices.scanVoiceLibrary(source)
  assert.equal(first.sourceFileCount, 2)
  assert.equal(first.profileCount, 1)
  assert.equal(first.duplicateGroups.length, 1)
  const catalogPath = path.join(voices.getVoiceLibraryDir(), 'catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  catalog.profiles[0].tags = ['旁白']
  catalog.profiles[0].rights = 'commercial-cleared'
  catalog.profiles[0].quality = 'approved'
  fs.writeFileSync(catalogPath, JSON.stringify(catalog))
  await voices.scanVoiceLibrary(source)
  const reread = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).profiles[0]
  assert.deepEqual(reread.tags, ['旁白'])
  assert.equal(reread.rights, 'commercial-cleared')
  assert.equal((await voices.listVoiceProfiles()).length, 1)
  await voices.reviewVoiceProfile(reread.voiceProfileId, {
    displayName: '人工审核旁白',
    tags: ['旁白'],
    roleTags: ['旁白'],
    emotionTags: [],
    quality: 'approved',
    rights: 'unknown',
    cloneReady: true,
  })
  assert.equal((await voices.listVoiceProfiles()).length, 0)
  assert.equal(
    (await voices.listVoiceProfiles({ includeNonCommercial: true, roleTags: ['旁白'] })).length,
    1,
  )
})

test('keeps English profiles in a separate language group', async () => {
  fs.mkdirSync(path.join(source, '英语人物音色'), { recursive: true })
  fs.writeFileSync(path.join(source, '英语人物音色', 'speaker.wav'), 'english audio')
  await voices.scanVoiceLibrary(source)
  const profiles = await voices.listVoiceProfiles({
    includeNonCommercial: true,
    language: 'English',
    sourceGroup: '英语人物音色',
  })
  assert.equal(profiles.length, 1)
  assert.equal(profiles[0].language, 'English')
})

test('lists only confirmed IndexTTS2 packs and binds a confirmed drama character with backlinks', async () => {
  const catalogPath = path.join(voices.getVoiceLibraryDir(), 'catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  const profile = catalog.profiles.find((item: any) => item.quality === 'approved')
  profile.rights = 'commercial-cleared'
  profile.cloneReady = true
  fs.writeFileSync(catalogPath, JSON.stringify(catalog))

  const packDir = path.join(voices.getVoicePackDir(profile.voiceProfileId), 'zh', 'indextts-2')
  fs.mkdirSync(packDir, { recursive: true })
  fs.writeFileSync(path.join(packDir, 'source-reference.wav'), 'reference')
  fs.writeFileSync(path.join(packDir, 'neutral.wav'), 'neutral')
  fs.writeFileSync(
    path.join(packDir, 'manifest.json'),
    JSON.stringify({
      status: 'confirmed',
      model: { id: 'indextts-2' },
      source: {
        referenceRelativePath: `packs/${profile.voiceProfileId}/zh/indextts-2/source-reference.wav`,
      },
      emotions: { neutral: { audio: 'neutral.wav', status: 'generated', confirmed: true } },
    }),
  )
  assert.deepEqual(
    (await voices.listVoiceProfiles({ indexTtsReady: true })).map(
      (item: any) => item.voiceProfileId,
    ),
    [profile.voiceProfileId],
  )

  const projectId = 'drama-project'
  const root = path.join(userData, 'projects', projectId)
  await workspace.registerProjectRoot(projectId, root, false)
  const wiki = path.join(root, 'wiki')
  fs.mkdirSync(path.join(wiki, '项目'), { recursive: true })
  fs.mkdirSync(path.join(wiki, '资产', '角色'), { recursive: true })
  fs.writeFileSync(path.join(wiki, '项目', '制作路线.md'), '# 制作路线\n\n- 路线代码：`drama`\n')
  fs.writeFileSync(
    path.join(wiki, '项目', '项目总监.md'),
    '# 项目总监\n\n- [[资产/角色/character-1|角色一]]\n',
  )
  fs.writeFileSync(
    path.join(wiki, '资产', '角色', 'character-1.md'),
    '---\nentityId: character-1\n---\n\n# 角色一\n',
  )

  await voices.bindProjectVoice(projectId, 'character-1', profile.voiceProfileId)
  const voicePage = fs.readFileSync(path.join(wiki, '声音', '角色', 'character-1.md'), 'utf8')
  const characterPage = fs.readFileSync(path.join(wiki, '资产', '角色', 'character-1.md'), 'utf8')
  assert.match(voicePage, /voiceProfileId:/)
  assert.match(voicePage, /\[\[资产\/角色\/character-1\]\]/)
  assert.match(characterPage, /\[\[声音\/角色\/character-1\|角色声音\]\]/)

  fs.writeFileSync(
    path.join(wiki, '项目', '制作路线.md'),
    '# 制作路线\n\n- 路线代码：`narration-promo`\n',
  )
  await assert.rejects(
    voices.bindProjectVoice(projectId, 'character-1', profile.voiceProfileId),
    /剧情片/,
  )
})

test('registers and rebinds a Seed voice with an app-owned voiceProfileId', async () => {
  const projectId = 'seed-project'
  const episodeId = 'episode-001'
  const root = path.join(userData, 'projects', projectId)
  await workspace.registerProjectRoot(projectId, root, false)
  const wiki = path.join(root, 'wiki')
  const audio = path.join(root, 'episodes', episodeId, 'seed-audio', 'role.wav')
  fs.mkdirSync(path.dirname(audio), { recursive: true })
  fs.mkdirSync(path.join(wiki, '项目总监'), { recursive: true })
  fs.mkdirSync(path.join(wiki, '资产', '角色'), { recursive: true })
  fs.writeFileSync(audio, 'seed voice')
  fs.writeFileSync(
    path.join(wiki, '项目总监', `${episodeId}.md`),
    '# 项目总监\n\n- [[资产/角色/character-seed|角色]]\n',
  )
  fs.writeFileSync(
    path.join(wiki, '资产', '角色', 'character-seed.md'),
    '---\nentityId: "character-seed"\n---\n\n# 角色\n',
  )

  const registered = await voices.registerSeedVoiceProfile({
    projectId,
    episodeId,
    speakerId: 'character-seed',
    displayName: '角色 Seed 音色',
    sourceAudioPath: audio,
    voiceDesignPrompt: '青年男性，声线清晰克制。',
    language: 'zh',
  })
  assert.match(registered.voiceProfileId, /^voice-[a-f0-9]{16}$/)
  const profile = (
    await voices.listVoiceProfiles({ includeNonCommercial: true, sourceGroup: 'Seed Audio' })
  )[0]
  assert.equal(profile.engine, 'seed-audio')
  assert.equal(profile.voiceProfileId, registered.voiceProfileId)
  await voices.bindProjectSeedVoice(projectId, episodeId, 'character-seed', profile.voiceProfileId)
  const voicePath = path.join(wiki, '声音', '角色', 'character-seed.md')
  fs.writeFileSync(
    voicePath,
    fs
      .readFileSync(voicePath, 'utf8')
      .replace(
        `voiceProfileId: ${profile.voiceProfileId}`,
        `voiceProfileId: "${profile.voiceProfileId}"`,
      ),
  )
  const resolved = await voices.resolveProjectSeedReferences(projectId, ['character-seed'])
  assert.equal(resolved[0].voiceProfileId, profile.voiceProfileId)
  assert.match(fs.readFileSync(voicePath, 'utf8'), /engine: seed-audio/)
})

test('registers a translation reference voice without writing creative role bindings', async () => {
  const projectId = 'translation-voice-project'
  const episodeId = 'episode-001'
  const root = path.join(userData, 'projects', projectId)
  await workspace.registerProjectRoot(projectId, root, false)
  const audio = path.join(
    root,
    'episodes',
    episodeId,
    'video-translate',
    'en',
    'seed-audio',
    'role.mp3',
  )
  fs.mkdirSync(path.dirname(audio), { recursive: true })
  fs.writeFileSync(audio, 'translation seed voice')
  fs.mkdirSync(path.join(root, 'wiki', '翻译', '角色'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'wiki', '翻译', '角色', 'role-one.md'),
    '---\ntranslationRoleId: role-one\nstatus: confirmed\n---\n\n# Role One\n',
  )

  const registered = await voices.registerSeedVoiceProfile({
    projectId,
    episodeId,
    speakerId: 'role-one',
    displayName: 'Role One',
    sourceAudioPath: audio,
    voiceDesignPrompt: '',
    language: 'en',
    workflow: 'video-translation',
  })

  assert.match(registered.voiceProfileId, /^voice-[a-f0-9]{16}$/)
  assert.match(
    fs.readFileSync(path.join(root, 'wiki', '翻译', '声音', 'role-one.md'), 'utf8'),
    new RegExp(`voiceProfileId: ${registered.voiceProfileId}`),
  )
  assert.equal(fs.existsSync(path.join(root, 'wiki', '声音', '角色', 'role-one.md')), false)
})
