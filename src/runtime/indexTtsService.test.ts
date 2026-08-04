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
process.env.INDEXTTS2_RUNTIME = runtime
process.env.INDEXTTS2_MODEL = model
process.env.INDEXTTS2_PYTHON = process.execPath
process.env.INDEXTTS2_WEBUI = webui
process.env.INDEXTTS2_URL = `http://127.0.0.1:${port}`

mock.module('electron', { namedExports: { app: { getPath: (name: string) => name === 'home' ? root : root } } })
mock.module('../../electron/ffmpeg/index.ts', { namedExports: { executeFFmpeg: async () => undefined } })
mock.module('../../electron/media-workspace.ts', { namedExports: { getRunDir: () => root, mediaDuration: async () => 1 } })
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
