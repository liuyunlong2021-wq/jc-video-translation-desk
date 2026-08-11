import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'index-tts-service-'))
const runtime = path.join(root, 'runtime')
const model = path.join(root, 'model')
const webui = path.join(runtime, 'webui.mjs')
const cli = path.join(runtime, 'indextts2.mjs')
const port = 17860 + Math.floor(Math.random() * 1000)
fs.mkdirSync(runtime, { recursive: true })
fs.mkdirSync(model, { recursive: true })
for (const name of ['config.yaml', 'gpt.pth', 's2mel.pth']) fs.writeFileSync(path.join(model, name), name)
fs.writeFileSync(webui, `
  import http from 'node:http'
  const port = Number(process.argv[process.argv.indexOf('--port') + 1])
  const server = http.createServer((request, response) => {
    response.statusCode = request.url === '/config' ? 200 : 404
    response.end('{}')
  })
  server.listen(port, '127.0.0.1')
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
`)
fs.writeFileSync(cli, `
  import fs from 'node:fs'
  import path from 'node:path'
  const args = process.argv.slice(2)
  if (args[0] === 'batch') {
    const batch = args[args.indexOf('--batch-file') + 1]
    const output = args[args.indexOf('--output-dir') + 1]
    const prefix = args[args.indexOf('--output-prefix') + 1]
    fs.mkdirSync(output, { recursive: true })
    fs.readFileSync(batch, 'utf8').trim().split('\\n').forEach((_, index) =>
      fs.writeFileSync(path.join(output, prefix + '-' + String(index + 1).padStart(4, '0') + '.wav'), 'wav'))
  }
`)
fs.chmodSync(cli, 0o755)
fs.mkdirSync(path.join(root, 'zh', 'indextts-2'), { recursive: true })
fs.writeFileSync(path.join(root, 'reference.wav'), 'reference')
fs.writeFileSync(path.join(root, 'zh', 'indextts-2', 'neutral.wav'), 'neutral')
fs.writeFileSync(path.join(root, 'zh', 'indextts-2', 'manifest.json'), JSON.stringify({
  status: 'confirmed', model: { id: 'indextts-2' },
  source: { referenceRelativePath: 'reference.wav' },
  emotions: { neutral: { audio: 'neutral.wav' } },
}))
fs.mkdirSync(path.join(root, 'wiki', '声音', '角色'), { recursive: true })
fs.writeFileSync(path.join(root, 'wiki', '声音', '角色', 'role-1.md'), 'voiceProfileId: pack-1\n')
process.env.INDEXTTS2_RUNTIME = runtime
process.env.INDEXTTS2_MODEL = model
process.env.INDEXTTS2_PYTHON = process.execPath
process.env.INDEXTTS2_WEBUI = webui
process.env.INDEXTTS2_URL = `http://127.0.0.1:${port}`
process.env.INDEXTTS2_CLI = cli

mock.module('electron', { namedExports: { app: { getPath: (name: string) => name === 'home' ? root : root } } })
mock.module('../../electron/ffmpeg/index.ts', { namedExports: { executeFFmpeg: async () => undefined } })
mock.module('../../electron/media-workspace.ts', { namedExports: {
  ensureEpisodeDir: async () => root,
  ensureRunDir: async () => root,
  getEpisodeDir: () => path.join(root, 'episodes', 'episode-001'),
  getRunDir: () => root,
  mediaDuration: async () => 1,
  relativeRunAsset: (_runId: string, value: string) => path.relative(root, value).replace(/\\/g, '/'),
} })
mock.module('../../electron/voice-library.ts', { namedExports: { getVoiceLibraryDir: () => root, getVoicePackDir: () => root } })

const service = await import('../../electron/index-tts.ts')
after(async () => {
  await service.stopIndexTtsService()
  fs.rmSync(root, { recursive: true, force: true })
})

test('detects, starts, de-duplicates, and stops the managed IndexTTS2 service', async () => {
  const detected = await service.getIndexTtsStatus()
  assert.equal(detected.state, 'stopped')
  assert.equal(detected.available, true)
  assert.equal(detected.modelPath, model)

  const started = await service.startIndexTtsService()
  assert.equal(started.state, 'running')
  assert.ok(started.pid)
  const repeated = await service.startIndexTtsService()
  assert.equal(repeated.pid, started.pid)

  const stopped = await service.stopIndexTtsService()
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.pid, undefined)
})

test('returns one persisted dialogue clip per IndexTTS2 task', async () => {
  const result = await service.generateEpisodeVoice({
    runId: 'voice-run',
    episodeId: 'episode-001',
    language: 'zh',
    tasks: [{ shotId: 'shot-001', speakerId: 'role-1', text: '你好', emotion: 'neutral', startMs: 0, endMs: 2000 }],
  })
  assert.equal(result.path, 'wiki/声音/episode-001/episode-voice-zh.wav')
  assert.deepEqual(result.clips, [{ shotId: 'shot-001', path: 'wiki/声音/episode-001/clips-zh/shot-0001.wav', duration: 1 }])
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'wiki', '声音', 'episode-001', '对白资产.json'), 'utf8'))
  assert.equal(assets.assets[0].language, 'zh')
  assert.equal(assets.assets[0].audioPath, result.clips[0].path)
})
