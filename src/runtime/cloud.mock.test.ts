import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import test, * as nodeTest from 'node:test'

const { after, mock } = nodeTest as any

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-factory-cloud-'))
let postCount = 0
let downloadCount = 0
let downloadMode: 'success' | 'fail-once' | 'connection-closed' | 'abort' | 'unsafe-redirect' = 'fail-once'
const requests: any[] = []
const downloads: any[] = []
const chatOutputs: any[] = []
let omitChatDone = false
let encryptionAvailable = true
let selectedFile = ''
let splitUtf8 = false

class MockAxiosError extends Error {}

mock.module('../../electron/pinterest-reference.ts', {
  namedExports: {
    capturePinterestReference: async () => ({
      pinId: '12345',
      sourceUrl: 'https://i.pinimg.com/originals/orc.jpg',
      sourcePageUrl: 'https://jp.pinterest.com/pin/12345/',
      png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }),
  },
})

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
      const output = chatOutputs.shift()
      const delta = typeof output === 'string' ? { content: output } : output
      const payload = Buffer.from(
        [
          `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
          omitChatDone ? '' : 'data: [DONE]\n\n',
        ].filter(Boolean).join(''),
      )
      const splitAt = payload.indexOf(Buffer.from('你')) + 1
      return { data: Readable.from(splitUtf8 && splitAt > 0 ? [payload.subarray(0, splitAt), payload.subarray(splitAt)] : [payload]) }
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
    return {
      data: new Uint8Array(
        url === 'https://i.pinimg.com/originals/orc.jpg' ? [0xff, 0xd8, 0xff, 0xd9] : [1, 2, 3],
      ).buffer,
    }
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
      showOpenDialog: async () => ({
        canceled: !selectedFile,
        filePaths: selectedFile ? [selectedFile] : [],
      }),
    },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
    },
    net: {
      request: ({ url }: { url: string }) => {
        const request = new EventEmitter() as any
        const headers: Record<string, string> = {}
        request.setHeader = (key: string, value: string) => (headers[key] = value)
        request.followRedirect = () => undefined
        request.abort = () => undefined
        request.end = () => {
          downloads.push({ url, headers })
          downloadCount++
          queueMicrotask(() => {
            if (downloadMode === 'unsafe-redirect') {
              request.emit('redirect', 302, 'GET', 'http://media.example/file.png')
              return
            }
            if (downloadMode === 'fail-once' && downloadCount === 1) {
              request.emit('error', new Error('download failed'))
              return
            }
            if (downloadMode === 'connection-closed') {
              request.emit('error', new Error('net::ERR_CONNECTION_CLOSED'))
              return
            }
            if (downloadMode === 'abort') return
            const response = Readable.from([
              url.includes('i.pinimg.com') ? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) : Buffer.from([1, 2, 3]),
            ]) as any
            response.statusCode = 200
            request.emit('response', response)
          })
        }
        return request
      },
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
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')).tasks[0]
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
  assert.equal(JSON.parse(fs.readFileSync(pendingPath, 'utf8')).tasks[0].status, 'success')
})

test('falls back to the Node downloader when Electron closes a media connection', async () => {
  downloadMode = 'connection-closed'
  const before = downloadCount
  const output = await cloud.generateStoryboardImage('connection-closed-run', 1, 'prompt', '9:16')
  assert.equal(downloadCount, before + 2)
  assert.equal(fs.readFileSync(output).byteLength, 3)
  downloadMode = 'success'
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
  await workspace.saveMediaState(
    'older-run',
    JSON.stringify({ runId: 'older-run', stage: 'voice-ready' }),
  )
  await workspace.saveMediaState(
    'latest-run',
    JSON.stringify({ runId: 'latest-run', stage: 'storyboards-ready' }),
  )
  const recovered = JSON.parse((await workspace.loadLatestMediaState())!)
  assert.equal(recovered.runId, 'latest-run')
  assert.equal(recovered.stage, 'storyboards-ready')
})

test('creates a project wiki, preserves Raw, and restores an explicit project', async () => {
  const projectId = 'wiki-project'
  const state = {
    runId: projectId,
    stage: 'script-approved',
    approvedScript: '确认后的文稿',
    ratio: '9:16',
    targetDuration: 15,
    segments: [],
  }
  await workspace.createProject(projectId, JSON.stringify(state))
  const rawPath = await workspace.saveRawSubmission(projectId, '用户的原始需求')
  assert.equal(rawPath, '.raw/提交记录/0001-原始需求.md')

  const source = path.join(userData, '外部资料.md')
  fs.writeFileSync(source, '# 外部原稿\n')
  selectedFile = source
  const imported = await workspace.importMarkdown(projectId)
  selectedFile = ''
  assert.equal(imported?.content, '# 外部原稿\n')
  await workspace.saveMediaState(projectId, JSON.stringify(state))

  const projectDir = path.join(userData, 'media-runs', projectId)
  assert.equal(fs.existsSync(path.join(projectDir, 'project.json')), true)
  assert.equal(fs.existsSync(path.join(projectDir, 'wiki/文稿/确认文稿.md')), true)
  assert.match(fs.readFileSync(path.join(projectDir, 'wiki/index.md'), 'utf8'), /确认文稿/)
  const sourceIndex = fs.readFileSync(path.join(projectDir, 'wiki/来源索引.md'), 'utf8')
  assert.match(sourceIndex, /0001-原始需求/)
  assert.doesNotMatch(sourceIndex, new RegExp(userData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const projects = await workspace.listProjects()
  assert.equal(
    projects.some((project) => project.projectId === projectId),
    true,
  )
  await workspace.setLastOpenedProject(projectId)
  assert.equal(await workspace.getLastOpenedProject(), projectId)
  assert.deepEqual(JSON.parse(await workspace.loadProjectState(projectId)), state)
})

test('state persistence never overwrites an edited creative Markdown document', async () => {
  const projectId = 'markdown-truth'
  const state = {
    runId: projectId,
    stage: 'script-approved',
    approvedScript: '状态中的旧文稿',
    segments: [],
  }
  await workspace.createProject(projectId, JSON.stringify(state))
  for (const relativePath of ['wiki/文稿/确认文稿.md']) {
    const current = await workspace.readProjectMarkdown(projectId, relativePath)
    await workspace.writeProjectMarkdown(
      projectId,
      relativePath,
      '# 确认文稿\n\n用户的新文稿',
      current.revision,
    )
  }
  await workspace.saveMediaState(projectId, JSON.stringify(state))
  assert.match(
    (await workspace.readProjectMarkdown(projectId, 'wiki/文稿/确认文稿.md')).content,
    /用户的新文稿/,
  )
})

test('rejects an empty confirmed script without changing the saved document', async () => {
  const projectId = 'nonempty-confirmed-script'
  await workspace.ensureRunDir(projectId)
  const created = await workspace.writeProjectMarkdown(
    projectId,
    'wiki/文稿/确认文稿.md',
    '# 确认文稿\n\n保留正文',
  )
  await assert.rejects(
    workspace.writeProjectMarkdown(
      projectId,
      'wiki/文稿/确认文稿.md',
      '# 确认文稿\n',
      created.revision,
    ),
    /确认文稿不能为空/,
  )
  assert.match(
    (await workspace.readProjectMarkdown(projectId, 'wiki/文稿/确认文稿.md')).content,
    /保留正文/,
  )
})

test('requires a revision before replacing an existing Markdown file', async () => {
  const projectId = 'revision-project'
  await workspace.ensureRunDir(projectId)
  await workspace.writeProjectMarkdown(projectId, 'wiki/空白.md', '')
  await assert.rejects(
    workspace.writeProjectMarkdown(projectId, 'wiki/空白.md', '覆盖'),
    /先读取后使用 edit/,
  )
  const current = await workspace.readProjectMarkdown(projectId, 'wiki/空白.md')
  const saved = await workspace.writeProjectMarkdown(
    projectId,
    'wiki/空白.md',
    '按版本修改',
    current.revision,
  )
  assert.equal(saved.content, '按版本修改\n')
})

test('rolls back a partial storyboard update and preserves confirmed assets', async () => {
  const projectId = 'storyboard-transaction'
  await workspace.ensureRunDir(projectId)
  await workspace.writeProjectMarkdown(projectId, 'wiki/分镜/导演总览.md', '旧导演')
  await workspace.writeProjectMarkdown(projectId, 'wiki/分镜/镜头/shot-001.md', '旧镜头')
  await workspace.writeProjectMarkdown(projectId, 'wiki/资产/角色/old.md', '旧资产')

  const rollbackId = await workspace.beginStoryboardMarkdownUpdate(projectId)
  const director = await workspace.readProjectMarkdown(projectId, 'wiki/分镜/导演总览.md')
  await workspace.writeProjectMarkdown(
    projectId,
    director.path,
    '半写导演',
    director.revision,
  )
  await workspace.writeProjectMarkdown(projectId, 'wiki/分镜/镜头/shot-002.md', '半写镜头')
  await workspace.rollbackStoryboardMarkdownUpdate(projectId, rollbackId)
  assert.equal(
    (await workspace.readProjectMarkdown(projectId, director.path)).content,
    '旧导演\n',
  )
  assert.equal(
    (await workspace.listProjectMarkdown(projectId)).includes('wiki/分镜/镜头/shot-002.md'),
    false,
  )

  const commitId = await workspace.beginStoryboardMarkdownUpdate(projectId)
  const currentDirector = await workspace.readProjectMarkdown(projectId, director.path)
  await workspace.writeProjectMarkdown(
    projectId,
    director.path,
    '新导演',
    currentDirector.revision,
  )
  const shot = await workspace.readProjectMarkdown(projectId, 'wiki/分镜/镜头/shot-001.md')
  await workspace.writeProjectMarkdown(projectId, shot.path, '新镜头', shot.revision)
  await workspace.commitStoryboardMarkdownUpdate(projectId, commitId, [director.path, shot.path])
  assert.equal(
    (await workspace.listProjectMarkdown(projectId)).includes('wiki/资产/角色/old.md'),
    true,
  )
})

test('rejects a Wiki model stream that ends without a completion marker', async () => {
  omitChatDone = true
  chatOutputs.push('未完成')
  await assert.rejects(
    cloud.runWikiSkill('jc-script-storyboard', '测试', 'interrupted-wiki-run'),
    /提前中断/,
  )
  omitChatDone = false
})

test('accepts only successful Wiki writes as the current director result', async () => {
  const projectId = 'wiki-tool-result'
  await workspace.ensureRunDir(projectId)
  await workspace.writeProjectMarkdown(projectId, 'wiki/分镜/导演总览.md', '旧导演')
  chatOutputs.push(
    {
      tool_calls: [
        {
          index: 0,
          id: 'call-batch',
          function: {
            name: 'write_batch',
            arguments: JSON.stringify({
              files: [
                { path: 'wiki/分镜/导演总览.md', content: '导演总览' },
                { path: 'wiki/分镜/镜头/shot-001.md', content: '镜头一' },
              ],
            }),
          },
        },
      ],
    },
  )
  const result = await cloud.runWikiSkill('jc-script-storyboard', '测试', projectId)
  const request = requests.at(-1)
  assert.deepEqual(request.data.tool_choice, {
    type: 'function',
    function: { name: 'write_batch' },
  })
  assert.equal(request.data.tools.length, 1)
  assert.equal(request.data.max_tokens, 32_000)
  assert.deepEqual(result.writtenPaths, [
    'wiki/分镜/导演总览.md',
    'wiki/分镜/镜头/shot-001.md',
  ])
  assert.equal(
    (await workspace.readProjectMarkdown(projectId, 'wiki/分镜/镜头/shot-001.md')).content,
    '镜头一\n',
  )
  assert.equal(
    (await workspace.readProjectMarkdown(projectId, 'wiki/分镜/导演总览.md')).content,
    '导演总览\n',
  )

  chatOutputs.push('没有调用工具')
  await assert.rejects(
    cloud.runWikiSkill('jc-script-storyboard', '测试', 'wiki-no-write'),
    /没有一次性提交/,
  )
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
  const submittedPostCount = postCount
  const [resumed] = await cloud.resumePendingTasks(runId)
  assert.equal(resumed.status, 'success')
  assert.equal(postCount, submittedPostCount)

  downloadMode = 'abort'
  const cancelRunId = 'cancel-run'
  const running = cloud.generateStoryboardImage(cancelRunId, 1, 'prompt', '9:16')
  while (postCount < submittedPostCount + 1) await new Promise((resolve) => setTimeout(resolve, 0))
  await cloud.stopCloudTask(cancelRunId, 'storyboard:1')
  await assert.rejects(running, /停止/)
  downloadMode = 'success'
  await cloud.resumeCloudTask(cancelRunId, 'storyboard:1')
  const runState = JSON.parse(
    fs.readFileSync(path.join(userData, 'media-runs', cancelRunId, 'run.json'), 'utf8'),
  )
  assert.equal(runState.tasks.find((task: any) => task.id === 'storyboard:1').status, 'success')
})

test('submits the fixed voice and selectable video contracts through controlled run assets', async () => {
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
  await cloud.generateSegmentVideo(
    runId,
    1,
    'veo-3.1-generate-preview',
    '无背景音乐',
    '9:16',
    8,
    imagePath,
  )
  assert.equal(
    requests.some((request) => request.url.includes('/api/creations/uploads')),
    false,
  )
  const videoRequest = requests.find((request) => request.url.endsWith('/v1/videos'))
  assert.equal(videoRequest.data.model, 'veo-3.1-generate-preview')
  assert.equal(videoRequest.data.prompt, '无背景音乐')
  assert.equal(videoRequest.data.seconds, '8')
  assert.equal(videoRequest.data.size, '720x1280')
  assert.equal(videoRequest.data.resolution, '720p')
  assert.equal(videoRequest.data.aspectRatio, '9:16')
  assert.equal(typeof videoRequest.data.input_reference.pipe, 'function')
  const videoDownload = downloads.find((download) =>
    download.url.includes('/v1/videos/task_test/content'),
  )
  assert.equal(videoDownload.headers.Authorization, 'Bearer test-key')
  assert.throws(() => workspace.assertRunAsset(runId, '../outside.mp4'), /素材不属于当前任务/)
  await assert.rejects(
    cloud.generateSegmentVideo(
      runId,
      2,
      'veo-3.1-generate-preview',
      '无背景音乐',
      '9:16',
      7,
      imagePath,
    ),
    /4、6 或 8/,
  )
  await assert.rejects(
    cloud.generateSegmentVideo(
      runId,
      2,
      'unknown-video-model' as any,
      '无背景音乐',
      '9:16',
      6,
      imagePath,
    ),
    /不支持的视频模型/,
  )

  const grokImagePath = await cloud.generateStoryboardImage(runId, 2, 'prompt', '9:16')
  const grokRequestStart = requests.length
  await cloud.generateSegmentVideo(
    runId,
    2,
    'rh-grok-image-video',
    '单一连续镜头',
    '9:16',
    6,
    grokImagePath,
    [imagePath],
  )
  const grokRequest = requests
    .slice(grokRequestStart)
    .find((request) => request.url.endsWith('/v1/videos'))
  assert.equal(grokRequest.data.model, 'rh-grok-image-video')
  assert.equal(grokRequest.data.duration, 6)
  assert.equal(grokRequest.data.aspectRatio, '9:16')
  assert.equal(grokRequest.data.resolution, '720p')
  assert.equal(grokRequest.data.images.length, 2)
  assert.match(grokRequest.data.images[0], /^data:image\/png;base64,/)
  assert.equal('input_reference' in grokRequest.data, false)

  const veo3ImagePath = await cloud.generateStoryboardImage(runId, 3, 'prompt', '9:16')
  const veo3RequestStart = requests.length
  await cloud.generateSegmentVideo(
    runId,
    3,
    'veo-3.0-generate-001',
    '单一连续镜头',
    '9:16',
    4,
    veo3ImagePath,
  )
  const veo3Request = requests
    .slice(veo3RequestStart)
    .find((request) => request.url.endsWith('/v1/videos'))
  assert.equal(veo3Request.data.model, 'veo-3.0-generate-001')
  assert.equal(veo3Request.data.seconds, '8')
  assert.equal(typeof veo3Request.data.input_reference.pipe, 'function')
})

test('sends video, script, complete shot prompt and material SRT to Gemini once', async () => {
  const runId = 'shot-analysis-run'
  await workspace.ensureRunDir(runId)
  const videoPath = workspace.getRunAssetPath(runId, 'clip', 1)
  fs.writeFileSync(videoPath, Buffer.from('mock mp4'))
  const transcriptDir = path.join(userData, 'media-runs', runId, 'wiki', '转录', 'episode-001')
  const subtitleDir = path.join(userData, 'media-runs', runId, 'wiki', '字幕', '素材')
  fs.mkdirSync(transcriptDir, { recursive: true })
  fs.mkdirSync(subtitleDir, { recursive: true })
  const transcriptJsonPath = path.join(transcriptDir, 'media-shot-001-whisper.json')
  const transcriptSrtPath = path.join(subtitleDir, 'media-shot-001-whisper.srt')
  fs.writeFileSync(transcriptJsonPath, JSON.stringify({
    schemaVersion: 1,
    mediaId: 'media-shot-001',
    sourceMediaPath: 'clips/001.mp4',
    durationMs: 12_000,
    cues: [{ cueId: 'cue-001', mediaId: 'media-shot-001', startMs: 2500, endMs: 4000, recognizedText: '你好' }],
  }))
  fs.writeFileSync(transcriptSrtPath, '1\n00:00:02,500 --> 00:00:04,000\n你好\n')
  chatOutputs.push(JSON.stringify({
    shots: [{
      shotId: 'shot-001',
      trimStartMs: 2_000,
      trimEndMs: 5_000,
      observedContent: '角色完整举手并说你好',
      subtitleCueIds: ['cue-001'],
      speakerIds: ['character-1'],
      confidence: 0.96,
      needsReview: false,
      dialogue: { sourceStartMs: 2_500, sourceEndMs: 4_000 },
    }],
  }))

  const requestStart = requests.length
  const result = await cloud.analyzeMaterialVideo({
    runId,
    mediaId: 'media-shot-001',
    videoPath,
    transcriptJsonPath,
    transcriptSrtPath,
    approvedScript: '陈大发举手并说：“你好”。',
    shots: [{
      shotId: 'shot-001',
      script: '角色举手并说你好',
      soundType: 'onscreen',
      speakerId: 'character-1',
      dialogueText: '你好',
      dialogueEmotion: 'happy',
      startState: '手臂放下',
      actionProgression: '角色举手',
      endState: '手举过肩',
      videoPrompt: '单一连续镜头，角色举手',
    }],
  })

  const analysisRequests = requests
    .slice(requestStart)
    .filter((request) => request.url.endsWith('/v1/chat/completions'))
  assert.equal(analysisRequests.length, 1)
  assert.equal(analysisRequests[0].data.model, 'gemini-3.6-flash')
  const content = analysisRequests[0].data.messages[1].content
  assert.equal(content.filter((part: any) => part.type === 'file').length, 1)
  assert.match(content.find((part: any) => part.type === 'file').file.file_data, /^data:video\/mp4;base64,/)
  const prompt = content.find((part: any) => part.type === 'text').text
  assert.match(prompt, /陈大发举手并说/)
  assert.match(prompt, /单一连续镜头，角色举手/)
  assert.match(prompt, /cue-001/)
  assert.match(prompt, /00:00:02,500/)
  assert.equal(result.analyses[0].sourceDurationMs, 12_000)
  assert.equal(result.analyses[0].trimStartMs, 2_000)
  assert.equal(result.analyses[0].trimEndMs, 5_000)
  assert.deepEqual(result.analyses[0].subtitleCueIds, ['cue-001'])
  assert.deepEqual(result.analyses[0].speakerIds, ['character-1'])
  assert.equal(result.analyses[0].dialogue?.sourceStartMs, 2_500)
  assert.equal(result.analyses[0].dialogue?.sourceEndMs, 4_000)
})

test('keeps every Grok shot whole when Gemini returns invalid or missing evidence', async () => {
  const runId = 'grok-analysis-fallback'
  await workspace.ensureRunDir(runId)
  const videoPath = workspace.getRunAssetPath(runId, 'clip', 1)
  fs.writeFileSync(videoPath, Buffer.from('mock mp4'))
  const transcriptJsonPath = path.join(userData, 'media-runs', runId, 'wiki', '转录', 'episode-001', 'media-shot-001-whisper.json')
  const transcriptSrtPath = path.join(userData, 'media-runs', runId, 'wiki', '字幕', '素材', 'media-shot-001-whisper.srt')
  fs.mkdirSync(path.dirname(transcriptJsonPath), { recursive: true })
  fs.mkdirSync(path.dirname(transcriptSrtPath), { recursive: true })
  fs.writeFileSync(transcriptJsonPath, JSON.stringify({
    schemaVersion: 1,
    mediaId: 'media-shot-001',
    sourceMediaPath: 'clips/001.mp4',
    durationMs: 12_000,
    cues: [],
  }))
  fs.writeFileSync(transcriptSrtPath, '')
  chatOutputs.push(JSON.stringify({
    shots: [{
      shotId: 'shot-001',
      trimStartMs: 9000,
      trimEndMs: 1000,
      subtitleCueIds: ['unknown-cue'],
      speakerIds: ['unknown-role'],
      needsReview: false,
    }],
  }))
  const requestStart = requests.length
  const result = await cloud.analyzeMaterialVideo({
    runId,
    mediaId: 'media-shot-001',
    videoPath,
    transcriptJsonPath,
    transcriptSrtPath,
    approvedScript: '角色先抬头，再转身。',
    shots: [
      { shotId: 'shot-001', script: '抬头', soundType: 'none', startState: '低头', actionProgression: '抬头', endState: '平视', videoPrompt: '角色缓慢抬头' },
      { shotId: 'shot-002', script: '转身', soundType: 'none', startState: '正面', actionProgression: '转身', endState: '背面', videoPrompt: '角色转身离开' },
    ],
  })
  assert.equal(requests.slice(requestStart).filter((request) => request.url.endsWith('/v1/chat/completions')).length, 1)
  assert.deepEqual(result.analyses.map((item) => [item.trimStartMs, item.trimEndMs, item.needsReview]), [
    [0, 12_000, true],
    [0, 12_000, true],
  ])
})

test('uses the selected text model and retries one malformed Skill JSON response', async () => {
  const initialRequestCount = requests.length
  chatOutputs.push('{"text":"正文"}', '{"items":[1,]}', '{"text":"文稿","voicePrompt":"提示"}')
  assert.equal(
    await cloud.generateScript({
      request: '诉求',
      targetDuration: 15,
      ratio: '9:16',
      styleId: 'cinematic-contrast',
      hasCoreReference: false,
      textModel: 'claude-fable-5',
    }),
    '正文',
  )
  const scriptRequest = requests
    .slice(initialRequestCount)
    .find((request) => request.url.endsWith('/v1/chat/completions'))
  assert.equal(scriptRequest.data.model, 'claude-fable-5')
  assert.equal(scriptRequest.data.stream, true)
  assert.equal(scriptRequest.responseType, 'stream')
  assert.deepEqual(scriptRequest.data.response_format, { type: 'json_object' })
  assert.equal(scriptRequest.data.max_tokens, 16_000)

  const result = await cloud.runSkill('jc-voice-design', '{"text":"文稿"}', 'skill-run', 'deepseek-v4-pro')
  assert.deepEqual(result, { text: '文稿', voicePrompt: '提示' })
  assert.equal(requests.at(-1).data.model, 'deepseek-v4-pro')
  assert.equal(
    requests.slice(initialRequestCount).filter((request) => request.url.endsWith('/v1/chat/completions')).length,
    3,
  )
})

test('loads the complete prop template and downloads one searched reference', async () => {
  const initialRequestCount = requests.length
  chatOutputs.push(
    JSON.stringify({
      assets: [
        {
          role: 'prop',
          label: '兽人',
          description: '主道具',
          required: true,
          design: {
            project: { visualStyle: '冷暖电影感', aspectRatio: '9:16' },
            prop: { name: '兽人' }, shape: {}, material: {}, views: {},
          },
          searchQuery: 'rusty sickle prop design',
        },
      ],
    }),
  )
  await cloud.runSkill('jc-prop-prompt', '{"mode":"app-plan"}', 'prop-skill-run')
  const request = requests
    .slice(initialRequestCount)
    .find((item) => item.url.endsWith('/v1/chat/completions'))
  assert.match(request.data.messages[0].content, /wearAndTear/)
  assert.match(request.data.messages[0].content, /detailCloseup/)

  downloadMode = 'success'
  const version = await cloud.runReferenceSearchSkill('prop-search-run', 'asset-prop-1', 'rusty sickle prop design')
  assert.equal(version.source, 'search')
  assert.equal(version.searchQuery, 'rusty sickle prop design')
  assert.equal(version.generatedBySkill, 'jc-asset-reference-search')
  assert.equal(version.sourceUrl, 'https://i.pinimg.com/originals/orc.jpg')
  assert.equal(version.sourcePageUrl, 'https://jp.pinterest.com/pin/12345/')
  assert.equal(
    fs.existsSync(path.join(userData, 'media-runs', 'prop-search-run', version.relativePath)),
    true,
  )
})

test('keeps UTF-8 characters intact when an SSE chunk splits mid-character', async () => {
  splitUtf8 = true
  chatOutputs.push(JSON.stringify({ text: '你好' }))
  const result = await cloud.runSkill('jc-media-script', '测试', 'utf8-sse-run', 'gemini-3.6-flash')
  splitUtf8 = false
  assert.equal(result.text, '你好')
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

  const secondSource = path.join(userData, 'source-2.png')
  fs.writeFileSync(secondSource, new Uint8Array([4, 5, 6]))
  const secondPath = path.join(userData, 'media-runs', 'reference-run', 'inputs', 'second.png')
  fs.copyFileSync(secondSource, secondPath)
  await cloud.generateStoryboardImage('reference-run', 2, '保持两个资产一致', '9:16', [
    reference.relativePath,
    'inputs/second.png',
  ])
  const multiEdit = requests.filter((request) => request.url.endsWith('/v1/images/edits')).at(-1)
  assert.equal(Array.isArray(multiEdit.data.image), true)
  assert.equal(multiEdit.data.image.length, 2)

  const design = {
    project: { visualStyle: '冷暖电影感', aspectRatio: '9:16' },
    prop: { name: '展示手机' },
    shape: { silhouette: '完整手机' },
  }
  await cloud.generateAssetImage('reference-run', 'asset-phone', 'prop', design)
  const assetRequest = requests.filter((request) => request.url.endsWith('/v1/images/generations')).at(-1)
  assert.deepEqual(JSON.parse(assetRequest.data.prompt), design)

  await cloud.generateAssetImage(
    'reference-run',
    'asset-phone-reference',
    'prop',
    design,
    reference.relativePath,
  )
  const referencedAssetRequest = requests
    .filter((request) => request.url.endsWith('/v1/images/edits'))
    .at(-1)
  assert.match(referencedAssetRequest.data.prompt, /请结合全部参考图生成/)
  assert.match(referencedAssetRequest.data.prompt, /最终内容、画风和比例以资产设计 JSON 为准/)
  assert.match(referencedAssetRequest.data.prompt, /"name": "展示手机"/)

  await cloud.generateAssetImage(
    'reference-run',
    'asset-phone-multi-reference',
    'prop',
    design,
    [reference.relativePath, 'inputs/second.png'],
  )
  const multiReferenceAssetRequest = requests
    .filter((request) => request.url.endsWith('/v1/images/edits'))
    .at(-1)
  assert.equal(Array.isArray(multiReferenceAssetRequest.data.image), true)
  assert.equal(multiReferenceAssetRequest.data.image.length, 2)
  selectedFile = ''
})
