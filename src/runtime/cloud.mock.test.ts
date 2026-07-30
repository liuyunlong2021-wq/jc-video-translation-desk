import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-factory-cloud-'))
let postCount = 0
let downloadCount = 0
let downloadMode: 'success' | 'fail-once' | 'abort' | 'unsafe-redirect' = 'fail-once'
const requests: any[] = []
const downloads: any[] = []
const chatOutputs: string[] = []
let encryptionAvailable = true
let selectedFile = ''

class MockAxiosError extends Error {}

const axios = {
  isCancel: (error: any) => error?.code === 'ERR_CANCELED',
  async request(options: any) {
    requests.push(options)
    if (options.url.endsWith('/v1/models')) return { data: { data: [] } }
    postCount++
    if (options.url.endsWith('/v1/images/generations')) {
      return { data: { data: [{ url: 'https://media.example/storyboard.png' }] } }
    }
    if (options.url.endsWith('/v1/audio/speech')) {
      return { data: { url: 'https://media.example/voice.mp3' } }
    }
    if (options.url.endsWith('/v1/videos')) {
      return { data: { url: 'https://media.example/video.mp4' } }
    }
    if (options.url.endsWith('/v1/chat/completions')) {
      return { data: { choices: [{ message: { content: chatOutputs.shift() } }] } }
    }
    throw new Error(`unexpected request: ${options.url}`)
  },
  async get(url: string, options: any) {
    downloads.push({ url, headers: options.headers })
    downloadCount++
    if (downloadMode === 'unsafe-redirect') {
      options.beforeRedirect({ protocol: 'http:', hostname: 'media.example' })
    }
    if (downloadMode === 'fail-once' && downloadCount === 1) throw new Error('download failed')
    if (downloadMode === 'abort') {
      if (options.signal.aborted) {
        throw Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' })
      }
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' }))
        })
      })
    }
    return { data: new Uint8Array([1, 2, 3]).buffer }
  },
  async postForm(url: string, data: any, options: any) {
    requests.push({ method: 'POST', url, data, headers: options.headers })
    postCount++
    if (url.endsWith('/v1/images/edits')) {
      return { data: { data: [{ url: 'https://media.example/storyboard-edit.png' }] } }
    }
    if (url.endsWith('/v1/videos')) {
      return { data: { url: 'https://api.jiucaihezi.studio/v1/videos/task_test/content' } }
    }
    throw new Error(`unexpected form request: ${url}`)
  },
}

mock.module('axios', {
  defaultExport: axios,
  namedExports: { AxiosError: MockAxiosError },
})
mock.module('electron', {
  namedExports: {
    app: { getPath: () => userData },
    dialog: {
      showOpenDialog: async () => ({ canceled: !selectedFile, filePaths: selectedFile ? [selectedFile] : [] }),
    },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
    },
  },
})
mock.module('music-metadata', {
  namedExports: { parseBuffer: async () => ({ format: { duration: 12 } }) },
})

process.env.APP_ROOT = process.cwd()
const cloud = await import('../../electron/cloud.ts')
const workspace = await import('../../electron/media-workspace.ts')

after(() => fs.rmSync(userData, { recursive: true, force: true }))

test('retries a failed download without resubmitting the paid image task', async () => {
  await cloud.saveApiKey('test-key')
  const runId = 'retry-run'
  await assert.rejects(cloud.generateStoryboardImage(runId, 1, 'prompt', '9:16'), /download failed/)

  const pendingPath = path.join(userData, 'media-runs', runId, 'run.json')
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')).pending[0]
  assert.equal(pending.outputPath, 'storyboards/001.png')
  assert.equal(pending.resultUrl, 'https://media.example/storyboard.png')
  assert.doesNotMatch(fs.readFileSync(pendingPath, 'utf8'), /test-key/)

  const output = await cloud.generateStoryboardImage(runId, 1, 'prompt', '9:16')
  assert.equal(postCount, 1)
  assert.equal(requests[0].url, 'https://api.jiucaihezi.studio/v1/images/generations')
  assert.equal(requests[0].data.model, 'gpt-image-2')
  assert.equal(requests[0].data.size, '1152x2048')
  assert.equal(downloadCount, 2)
  assert.equal(fs.readFileSync(output).byteLength, 3)
  assert.deepEqual(JSON.parse(fs.readFileSync(pendingPath, 'utf8')).pending, [])
})

test('uses an in-memory API key when secure storage is unavailable', async () => {
  encryptionAvailable = true
  assert.equal(await cloud.saveApiKey('old-key'), true)
  assert.doesNotMatch(
    fs.readFileSync(path.join(userData, 'jiucai-api-key.bin'), 'utf8'),
    /^old-key$/,
  )
  encryptionAvailable = false

  assert.equal(await cloud.saveApiKey('session-key'), false)
  assert.equal(await cloud.hasApiKey(), true)
  assert.equal(fs.existsSync(path.join(userData, 'jiucai-api-key.bin')), false)
  assert.equal(await cloud.testApiKey(), true)
  assert.equal(requests.at(-1).headers.Authorization, 'Bearer session-key')

  await cloud.saveApiKey('')
  assert.equal(await cloud.hasApiKey(), false)
  encryptionAvailable = true
  await cloud.saveApiKey('test-key')
})

test('recovers the latest workflow state from its media run', async () => {
  await workspace.saveMediaState('older-run', JSON.stringify({ runId: 'older-run', stage: 'voice-ready' }))
  await workspace.saveMediaState('latest-run', JSON.stringify({ runId: 'latest-run', stage: 'storyboards-ready' }))
  const recovered = JSON.parse((await workspace.loadLatestMediaState())!)
  assert.equal(recovered.runId, 'latest-run')
  assert.equal(recovered.stage, 'storyboards-ready')
})

test('rejects a media redirect that downgrades from HTTPS', async () => {
  downloadMode = 'unsafe-redirect'
  await assert.rejects(
    workspace.downloadMedia(
      'https://media.example/file.mp4',
      path.join(userData, 'unsafe-download.mp4'),
    ),
    /不安全/,
  )
  assert.equal(fs.existsSync(path.join(userData, 'unsafe-download.mp4')), false)
})

test('resumes persisted work and cancellation stops local download recovery', async () => {
  downloadMode = 'fail-once'
  downloadCount = 0
  const runId = 'resume-run'
  await assert.rejects(cloud.generateStoryboardImage(runId, 1, 'prompt', '9:16'))
  const [resumed] = await cloud.resumePendingTasks(runId)
  assert.equal(resumed.status, 'success')
  assert.equal(postCount, 2)

  downloadMode = 'abort'
  const cancelRunId = 'cancel-run'
  const running = cloud.generateStoryboardImage(cancelRunId, 1, 'prompt', '9:16')
  while (postCount < 3) await new Promise((resolve) => setTimeout(resolve, 0))
  await cloud.cancelRun(cancelRunId)
  await assert.rejects(running, /cancel/)
  const runState = JSON.parse(
    fs.readFileSync(path.join(userData, 'media-runs', cancelRunId, 'run.json'), 'utf8'),
  )
  assert.deepEqual(runState.pending, [])
})

test('submits the fixed voice and Veo contracts through controlled run assets', async () => {
  downloadMode = 'success'
  const runId = 'media-contract-run'
  const voice = await cloud.generateVoice(
    runId,
    '文稿',
    '【人设】讲解者。【音色特征】清晰。【风格】自然。【情感】亲和。【节奏】平稳。',
  )
  assert.equal(voice.duration, 12)
  const voiceRequest = requests.find((request) => request.url.endsWith('/v1/audio/speech'))
  assert.equal(voiceRequest.data.model, 'rh-aiapp-voice-design')
  assert.deepEqual(
    voiceRequest.data.nodeInfoList.map((node: any) => node.nodeId),
    ['14', '15'],
  )
  assert.equal('language' in voiceRequest.data, false)

  const imagePath = await cloud.generateStoryboardImage(runId, 1, 'prompt', '9:16')
  await cloud.generateSegmentVideo(runId, 1, '无背景音乐', '9:16', 8, imagePath)
  assert.equal(requests.some((request) => request.url.includes('/api/creations/uploads')), false)
  const videoRequest = requests.find((request) => request.url.endsWith('/v1/videos'))
  assert.equal(videoRequest.data.model, 'veo-3.1-generate-preview')
  assert.equal(videoRequest.data.prompt, '无背景音乐')
  assert.equal(videoRequest.data.seconds, '8')
  assert.equal(videoRequest.data.size, '720x1280')
  assert.equal(videoRequest.data.resolution, '720p')
  assert.equal(videoRequest.data.aspectRatio, '9:16')
  assert.equal(typeof videoRequest.data.input_reference.pipe, 'function')
  const videoDownload = downloads.find((download) => download.url.includes('/v1/videos/task_test/content'))
  assert.equal(videoDownload.headers.Authorization, 'Bearer test-key')
  assert.throws(() => workspace.assertRunAsset(runId, '../outside.mp4'), /素材不属于当前任务/)
  await assert.rejects(
    cloud.generateSegmentVideo(runId, 2, '无背景音乐', '9:16', 7, imagePath),
    /4、6 或 8/,
  )
})

test('uses Gemini for scripts and retries one malformed Skill JSON response', async () => {
  chatOutputs.push('{"text":"正文"}', 'not-json', '{"text":"文稿","voicePrompt":"提示"}')
  assert.equal(
    await cloud.generateScript({
      request: '诉求',
      targetDuration: 15,
      ratio: '9:16',
      styleId: 'live-action',
      hasCoreReference: false,
    }),
    '正文',
  )
  const scriptRequest = requests.find((request) => request.url.endsWith('/v1/chat/completions'))
  assert.equal(scriptRequest.data.model, 'gemini-3.6-flash')

  const result = await cloud.runSkill('jc-voice-design', '{"text":"文稿"}', 'skill-run')
  assert.deepEqual(result, { text: '文稿', voicePrompt: '提示' })
  assert.equal(requests.filter((request) => request.url.endsWith('/v1/chat/completions')).length, 3)
})

test('imports one managed core reference and uses GPT Image edits multipart', async () => {
  downloadMode = 'success'
  const source = path.join(userData, 'source.png')
  fs.writeFileSync(source, new Uint8Array([1, 2, 3]))
  selectedFile = source
  const reference = await workspace.selectCoreReference('reference-run')
  assert.ok(reference)
  assert.equal(reference.mimeType, 'image/png')
  assert.match(reference.relativePath, /^inputs\//)

  await cloud.generateStoryboardImage(
    'reference-run',
    1,
    '保持主体一致',
    '9:16',
    reference.relativePath,
  )
  const editRequest = requests.find((request) => request.url.endsWith('/v1/images/edits'))
  assert.equal(editRequest.data.model, 'gpt-image-2')
  assert.equal(editRequest.data.size, '1152x2048')
  assert.equal(typeof editRequest.data.image.pipe, 'function')
  selectedFile = ''
})
