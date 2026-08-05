import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import axios, { AxiosError } from 'axios'
import { app, safeStorage } from 'electron'
import { generateUniqueFileName } from './lib/tools.ts'
import type { PendingCloudTask, ResumedCloudTask } from './types.ts'
import type {
  AnalyzeMaterialVideoParams,
  MaterialVideoAnalysisResult,
  MediaScriptBrief,
  ShotVideoAnalysisResult,
  TextModel,
  TranslateSubtitlesParams,
  TranslateVideoSubtitlesParams,
  IdentifyVideoTranslationSpeakersParams,
  VideoTranslationContextSource,
  VideoTranslationSpeakerDraft,
  VideoModel,
} from './types.ts'
import {
  assertEpisodeAsset,
  assertRunAsset,
  downloadMedia,
  ensureRunDir,
  getRunAssetPath,
  mediaDuration,
  relativeRunAsset,
  getRunDir,
  listProjectMarkdown,
  readProjectMarkdown,
  searchAssetImage,
  writeStoryboardMarkdownBatch,
  writeDataUrl,
} from './media-workspace.ts'
import { validateMaterialTranscript } from '../src/runtime/productionContract.ts'

export const API_ORIGIN = 'https://api.jiucaihezi.studio'
export const OPENAI_BASE_URL = `${API_ORIGIN}/v1`
export const API_KEYS_URL = `${API_ORIGIN}/keys`
export const TEXT_MODELS: TextModel[] = [
  'gemini-3.6-flash',
  'claude-fable-5',
  'claude-opus-5',
  'gpt-5.6-sol',
  'deepseek-v4-pro',
]

const KEY_FILE = 'jiucai-api-key.bin'
const SKILLS = new Set([
  'jc-media-script',
  'jc-script-storyboard',
  'jc-gpt-image',
  'jc-voice-design',
  'jc-context-revision',
  'jc-film-style',
  'jc-character-prompt',
  'jc-scene-prompt',
  'jc-prop-prompt',
  'jc-asset-reference-search',
  'jc-doubao-seed-audio',
])
const runControllers = new Map<string, Set<AbortController>>()
const taskControllers = new Map<
  string,
  { controller: AbortController; finished: Promise<void> }
>()
const runJsonWrites = new Map<string, Promise<void>>()
let sessionApiKey = ''

function keyPath() {
  return path.join(app.getPath('userData'), KEY_FILE)
}

export async function hasApiKey() {
  try {
    return Boolean(await readApiKey())
  } catch {
    return false
  }
}

export async function saveApiKey(apiKey: string) {
  const clean = apiKey.trim()
  if (!clean) {
    sessionApiKey = ''
    await fs.promises.rm(keyPath(), { force: true })
    return true
  }
  sessionApiKey = clean
  if (!safeStorage.isEncryptionAvailable()) {
    await fs.promises.rm(keyPath(), { force: true })
    return false
  }
  await fs.promises.mkdir(path.dirname(keyPath()), { recursive: true })
  await fs.promises.writeFile(keyPath(), safeStorage.encryptString(clean), { mode: 0o600 })
  return true
}

async function readApiKey() {
  if (sessionApiKey) return sessionApiKey
  let encrypted: Buffer
  try {
    encrypted = await fs.promises.readFile(keyPath())
  } catch (error: any) {
    if (error?.code === 'ENOENT') throw new Error('请先配置韭菜盒子 API Key')
    throw error
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用')
  return safeStorage.decryptString(encrypted).trim()
}

function friendlyError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/system cpu overloaded|cpu.*threshold/i.test(message))
    return new Error('云端当前繁忙，本次内容尚未生成，请稍后重试。')
  if (axios.isCancel(error)) return new Error('任务已停止；云端任务可能仍会继续并产生费用')
  if (!(error instanceof AxiosError))
    return error instanceof Error ? error : new Error(String(error))
  if (error.response?.status === 401 || error.response?.status === 403)
    return new Error('API Key 无效或没有权限')
  if (error.response?.status === 429) return new Error('请求过于频繁，请稍后重试')
  if (error.response?.status === 524)
    return new Error('当前模型响应超时，内容尚未生成。请重试或切换其他文本模型。')
  const detail =
    typeof error.response?.data === 'string'
      ? error.response.data
      : (error.response?.data as any)?.error?.message || (error.response?.data as any)?.message
  return new Error(
    detail
      ? `云端请求失败：${String(detail).slice(0, 180)}`
      : `云端请求失败 (${error.response?.status || '网络错误'})`,
  )
}

async function request<T = any>(
  method: 'GET' | 'POST',
  route: string,
  data?: unknown,
  signal?: AbortSignal,
) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request<T>({
      method,
      url: `${API_ORIGIN}${route}`,
      data,
      timeout: method === 'GET' ? 60_000 : 300_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal,
    })
    const payload: any = response.data
    if (payload?.success === false || payload?.error?.message) {
      throw new Error(payload?.error?.message || payload?.message || '上游任务失败')
    }
    return response.data
  } catch (error) {
    throw friendlyError(error)
  }
}

async function downloadResultMedia(url: string, outputPath: string, signal?: AbortSignal) {
  const apiKey = new URL(url).origin === API_ORIGIN ? await readApiKey() : ''
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : undefined
  try {
    return await downloadMedia(url, outputPath, signal, headers)
  } catch (error) {
    if (!/ERR_CONNECTION_CLOSED/.test(error instanceof Error ? error.message : String(error))) throw error
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 300_000,
      maxRedirects: 0,
      headers,
      signal,
    })
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.promises.writeFile(outputPath, Buffer.from(response.data))
    return outputPath
  }
}

export async function testApiKey() {
  await request('GET', '/v1/models')
  return true
}

export async function generateScript(brief: MediaScriptBrief) {
  if (!brief?.request?.trim()) throw new Error('视频诉求不能为空')
  if (
    !Number.isInteger(brief.targetDuration) ||
    brief.targetDuration < 5 ||
    brief.targetDuration > 180
  ) {
    throw new Error('目标时长必须是 5 到 180 秒的整数')
  }
  if (brief.ratio !== '9:16' && brief.ratio !== '16:9') throw new Error('画面比例无效')
  if (
    ![
      'cinematic-contrast',
      'commercial-bright',
      'natural-documentary',
      'ink-wash',
      'cel-cinematic',
      'gongbi-color',
      'shonen-action-cel',
      'monochrome-shonen-manga',
      'modern-anime-key-visual',
      'hand-painted-watercolor-animation',
      'dunhuang-mural-animation',
      'paper-cut-shadow-animation',
      'chinese-puppet-stop-motion',
      'origami-animation',
      'comic-minimalism',
      'ink-paper-cut-animation',
      'anime-open-world-3d',
      'dark-chinese-mythology-cg',
      'xianxia-cultivation-animation',
      'victorian-mysticism',
      'creature-collection-animation',
      'cozy-pixel-farm',
      'pixel-underwater-adventure',
      'korean-webtoon-color',
      'korean-webtoon-cinematic',
      'korean-webtoon-romance',
      'korean-webtoon-action',
      'korean-webtoon-dark',
      'eastern-xianxia-cg',
      'realistic-fantasy-cg',
      'handmade-clay',
    ].includes(brief.styleId)
  ) {
    throw new Error('视觉风格无效')
  }
  const result = await runSkill('jc-media-script', JSON.stringify(brief), undefined, brief.textModel)
  const text = String(result?.text || '').trim()
  if (!text) throw new Error('文稿模型没有返回正文')
  return text
}

export async function runSkill(
  skillName: string,
  input: string,
  runId?: string,
  textModel: TextModel = 'gpt-5.6-sol',
) {
  if (!SKILLS.has(skillName)) throw new Error('未知的内置 Skill')
  if (!TEXT_MODELS.includes(textModel)) throw new Error('不支持的文本模型')
  const skillPath = path.join(process.env.APP_ROOT, 'skills', skillName, 'SKILL.md')
  let system = await fs.promises.readFile(skillPath, 'utf8')
  const formatFile = {
    'jc-character-prompt': 'prompt-format.md',
    'jc-scene-prompt': 'scene-format.md',
    'jc-prop-prompt': 'prop-format.md',
  }[skillName]
  if (formatFile) {
    system += `\n\n# 必须遵守的完整设计 JSON 模板\n\n${await fs.promises.readFile(
      path.join(path.dirname(skillPath), 'references', formatFile),
      'utf8',
    )}`
  }
  if (skillName === 'jc-doubao-seed-audio') {
    for (const file of ['reference-selector.md', 'prompt-standard.md', 'prompt-examples.md'])
      system += `\n\n${await fs.promises.readFile(path.join(path.dirname(skillPath), 'references', file), 'utf8')}`
  }
  const plainText = skillName === 'jc-doubao-seed-audio'
  const prompt = plainText
    ? `${input}\n\n只输出可直接提交给 Seed Audio 的 text_prompt 正文，不要使用 Markdown 代码块。`
    : `${input}\n\n只输出合法 JSON，不要使用 Markdown 代码块。`
  const action = async (signal?: AbortSignal) => {
    const output = await generateText(system, prompt, textModel, signal)
    if (plainText) return { text_prompt: output.trim() }
    try {
      return parseJson(output)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return parseJson(
        await generateText(
          system,
          `${prompt}\n\n上次输出解析失败（${reason}）。请只修复 JSON 语法，保留原有内容、镜头数量和字段，不要解释。`,
          textModel,
          signal,
        ),
      )
    }
  }
  return runId ? withRunAbort(runId, action) : action()
}

export async function translateSubtitles(params: TranslateSubtitlesParams) {
  if (!params?.runId || !TEXT_MODELS.includes(params.textModel) || !params.subtitles?.length)
    throw new Error('字幕翻译参数无效')
  const ids = new Set<string>()
  for (const subtitle of params.subtitles) {
    if (!subtitle.shotId?.trim() || ids.has(subtitle.shotId) || !subtitle.text?.trim())
      throw new Error('中文字幕条目无效')
    ids.add(subtitle.shotId)
  }
  const prompt = `把以下中文字幕准确翻译成自然英文。保留专有名词、语气和逐条对应关系，不增删、合并或拆分条目。只返回 JSON：{"subtitles":[{"shotId":"原ID","text":"English"}]}\n\n${JSON.stringify(params.subtitles)}`
  return withRunAbort(params.runId, async (signal) => {
    let reason = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const output = await generateJsonResponse(
        '你是影视字幕翻译器。只输出合法 JSON。',
        `${prompt}${reason ? `\n\n上次结果无效：${reason}。请按原 ID 和原数量重新输出。` : ''}`,
        params.textModel,
        signal,
        8_000,
      )
      try {
        const value = parseJson(output)
        const translated = Array.isArray(value?.subtitles) ? value.subtitles : []
        if (translated.length !== params.subtitles.length) throw new Error('英文字幕数量不一致')
        const byId = new Map(translated.map((item: any) => [String(item?.shotId || ''), String(item?.text || '').trim()]))
        if (byId.size !== ids.size || [...ids].some((id) => !byId.get(id)))
          throw new Error('英文字幕 ID 或正文不完整')
        return params.subtitles.map((item) => ({ shotId: item.shotId, text: byId.get(item.shotId)! }))
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error)
      }
    }
    throw new Error(reason || '字幕翻译失败')
  })
}

export async function collectVideoTranslationContext(
  runId: string,
  episodeId: string,
): Promise<VideoTranslationContextSource[]> {
  const allowed = [
    `wiki/文稿/${episodeId}/确认文稿.md`,
    `wiki/项目总监/${episodeId}.md`,
    'wiki/资产/角色/',
    'wiki/声音/角色/',
    'wiki/翻译/角色/',
  ]
  const paths = (await listProjectMarkdown(runId)).filter((item) =>
    allowed.some((prefix) => item === prefix || item.startsWith(prefix)),
  ).slice(0, 40)
  const sources: VideoTranslationContextSource[] = []
  let bytes = 0
  for (const relativePath of paths) {
    const document = await readProjectMarkdown(runId, relativePath)
    const content = document.content.slice(0, 20_000)
    bytes += Buffer.byteLength(content, 'utf8')
    if (bytes > 300_000) break
    sources.push({
      path: relativePath,
      hash: createHash('sha256').update(document.content).digest('hex'),
      content,
    })
  }
  return sources
}

export async function translateVideoSubtitles(params: TranslateVideoSubtitlesParams) {
  if (
    !params?.runId || !params.episodeId || !TEXT_MODELS.includes(params.textModel) ||
    !params.sourceLanguage?.trim() || !params.targetLanguage?.trim() || !params.subtitles?.length
  ) throw new Error('视频字幕翻译参数无效')
  const ids = new Set<string>()
  for (const item of params.subtitles) {
    if (!item.cueId?.trim() || ids.has(item.cueId) || !item.text?.trim())
      throw new Error('视频字幕条目无效')
    ids.add(item.cueId)
  }
  const context = await collectVideoTranslationContext(params.runId, params.episodeId)
  const prompt = `把字幕从 ${params.sourceLanguage} 准确翻译为 ${params.targetLanguage}。结合角色和剧本资料保持称呼、专有名词、语气一致。不得增删、合并、拆分或改变 cueId。只返回 JSON：{"subtitles":[{"cueId":"原ID","text":"译文"}]}\n\n上下文：${JSON.stringify(context)}\n\n字幕：${JSON.stringify(params.subtitles)}`
  return withRunAbort(params.runId, async (signal) => {
    let reason = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const output = await generateJsonResponse(
        '你是影视本地化字幕翻译器。只输出合法 JSON。',
        `${prompt}${reason ? `\n\n上次结果无效：${reason}` : ''}`,
        params.textModel,
        signal,
        8_000,
      )
      try {
        const value = parseJson(output)
        const translated = Array.isArray(value?.subtitles) ? value.subtitles : []
        if (translated.length !== params.subtitles.length) throw new Error('译文字幕数量不一致')
        const byId = new Map(translated.map((item: any) => [String(item?.cueId || ''), String(item?.text || '').trim()]))
        if (byId.size !== ids.size || [...ids].some((id) => !byId.get(id)))
          throw new Error('译文字幕 ID 或正文不完整')
        return {
          subtitles: params.subtitles.map((item) => ({ cueId: item.cueId, text: byId.get(item.cueId)! })),
          contextPaths: context.map(({ path, hash }) => ({ path, hash })),
        }
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error)
      }
    }
    throw new Error(reason || '视频字幕翻译失败')
  })
}

export async function identifyVideoTranslationSpeakers(
  params: IdentifyVideoTranslationSpeakersParams,
): Promise<{ speakers: VideoTranslationSpeakerDraft[]; contextPaths: Array<{ path: string; hash: string }> }> {
  if (!params?.runId || !params.episodeId || !params.videoPath || !params.cues?.length)
    throw new Error('说话角色识别参数无效')
  const videoPath = assertEpisodeAsset(params.runId, params.episodeId, params.videoPath)
  const video = await fs.promises.readFile(videoPath)
  if (video.byteLength > 90 * 1024 * 1024) throw new Error('原片过大，无法提交角色识别')
  const context = await collectVideoTranslationContext(params.runId, params.episodeId)
  const output = await withRunAbort(params.runId, (signal) => generateJsonResponse(
    '你是影视对白说话角色识别器。只输出合法 JSON；不得改写 cueId、时间或字幕。',
    [
      { type: 'file', file: { filename: path.basename(videoPath), file_data: `data:video/mp4;base64,${video.toString('base64')}` } },
      { type: 'text', text: `结合视频画面、声音、已确认角色和项目资料，为每个 cue 判断说话角色。已有角色只能返回其 translationRoleId；新人不填写 proposedRoleId，只给 proposedName 并 needsReview=true。返回 JSON：{"speakers":[{"cueId":"cue-001","proposedRoleId":"role-1","proposedName":"角色名","confidence":0.9,"evidence":"简短证据","needsReview":false}]}\n\n已有翻译角色：${JSON.stringify(params.roles)}\n\n项目资料：${JSON.stringify(context)}\n\n字幕：${JSON.stringify(params.cues)}` },
    ],
    params.textModel,
    signal,
    4_000,
  ))
  const value = parseJson(output)
  const returned = new Map((Array.isArray(value?.speakers) ? value.speakers : []).map((item: any) => [String(item?.cueId || ''), item]))
  const roleIds = new Set(params.roles.map((role) => role.translationRoleId))
  const speakers = params.cues.map((cue): VideoTranslationSpeakerDraft => {
    const item: any = returned.get(cue.cueId) || {}
    const proposedRoleId = roleIds.has(String(item.proposedRoleId || '')) ? String(item.proposedRoleId) : undefined
    return {
      cueId: cue.cueId,
      proposedRoleId,
      proposedName: String(item.proposedName || '新角色').trim() || '新角色',
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      evidence: String(item.evidence || '').trim(),
      needsReview: Boolean(item.needsReview) || !proposedRoleId,
    }
  })
  return { speakers, contextPaths: context.map(({ path, hash }) => ({ path, hash })) }
}

export async function analyzeMaterialVideo(
  params: AnalyzeMaterialVideoParams,
): Promise<MaterialVideoAnalysisResult> {
  if (!params?.mediaId || !params.approvedScript?.trim() || !params.shots?.length)
    throw new Error('素材剪辑分析参数无效')
  const shotIds = new Set<string>()
  for (const shot of params.shots) {
    if (!shot.shotId?.trim() || shotIds.has(shot.shotId) || !shot.script?.trim() || !shot.videoPrompt?.trim())
      throw new Error('素材分镜参数无效')
    if (shot.soundType === 'onscreen' && (!shot.speakerId?.trim() || !shot.dialogueText?.trim() || !shot.dialogueEmotion?.trim()))
      throw new Error(`${shot.shotId} 缺少确认的对白角色、原文或情绪`)
    shotIds.add(shot.shotId)
  }
  const videoPath = assertEpisodeAsset(params.runId, params.episodeId, params.videoPath)
  const video = await fs.promises.readFile(videoPath)
  if (video.byteLength > 90 * 1024 * 1024) throw new Error('单镜视频过大，无法提交分析')
  const sourceDurationMs = Math.round((await mediaDuration(videoPath)) * 1000)
  const transcriptJsonPath = assertRunAsset(params.runId, params.transcriptJsonPath)
  const transcriptSrtPath = assertRunAsset(params.runId, params.transcriptSrtPath)
  if (
    !relativeRunAsset(params.runId, transcriptJsonPath).startsWith(`wiki/转录/${params.episodeId}/`) ||
    !relativeRunAsset(params.runId, transcriptSrtPath).startsWith(`wiki/字幕/素材/${params.episodeId}/`)
  ) throw new Error('素材转录不属于当前剧集')
  const transcript = validateMaterialTranscript(JSON.parse(await fs.promises.readFile(transcriptJsonPath, 'utf8')))
  if (transcript.mediaId !== params.mediaId || transcript.sourceMediaPath !== relativeRunAsset(params.runId, videoPath))
    throw new Error('素材转录与视频来源不匹配')
  const srt = await fs.promises.readFile(transcriptSrtPath, 'utf8')
  const prompt = `分析这一条原始视频，并严格对照确认剧本与完整导演分镜。每个 shot 找出完整覆盖导演要求动作的最小连续区间。时间单位只能是毫秒，范围必须在 0 到 ${sourceDurationMs} 之间。不要改写确认剧本、台词、情绪或视频提示词。通过素材 SRT 和确认剧本确定稳定 speakerId；通过画面确定对白以外的戏剧动作和真实剪辑点。

确认剧本：
${params.approvedScript}

素材转录 JSON：
${JSON.stringify(transcript)}

素材 SRT：
${srt}

完整分镜：
${JSON.stringify(params.shots)}

只返回以下 JSON，不要解释：
{"shots":[{"shotId":"${params.shots[0].shotId}","trimStartMs":0,"trimEndMs":${sourceDurationMs},"observedContent":"","subtitleCueIds":[],"speakerIds":[],"confidence":0,"needsReview":true,"dialogue":null}]}
返回所有 shot，不能遗漏。画面内对白的 dialogue 必须包含 sourceStartMs、sourceEndMs；其他镜头 dialogue 必须为 null。无法可靠定位时返回完整区间并 needsReview=true。`
  let value: any
  try {
    const output = await withRunAbort(params.runId, (signal) =>
      generateJsonResponse(
        '你是短视频剪辑分析器。只根据原始视频、确认剧本、完整导演分镜和素材 SRT 判断时间与证据，不输出解释。',
        [
          { type: 'file', file: { filename: path.basename(videoPath), file_data: `data:video/mp4;base64,${video.toString('base64')}` } },
          { type: 'text', text: prompt },
        ],
        'gemini-3.6-flash',
        signal,
        2_000,
      ),
    )
    value = parseJson(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/API Key|任务已停止/.test(message)) throw error
    value = { shots: [], error: message }
  }
  const returned = new Map((Array.isArray(value?.shots) ? value.shots : []).map((shot: any) => [String(shot?.shotId || ''), shot]))
  return {
    mediaId: params.mediaId,
    analyses: params.shots.map((shot) => normalizeMaterialShot(params, shot, returned.get(shot.shotId), sourceDurationMs, value?.error, transcript)),
  }
}

function normalizeMaterialShot(
  params: AnalyzeMaterialVideoParams,
  shot: AnalyzeMaterialVideoParams['shots'][number],
  value: any,
  sourceDurationMs: number,
  error?: string,
  transcript?: import('../src/runtime/productionContract.ts').MaterialTranscript,
): ShotVideoAnalysisResult {
  const proposedStart = Number(value?.trimStartMs)
  const proposedEnd = Number(value?.trimEndMs)
  const validTrim = Number.isFinite(proposedStart) && Number.isFinite(proposedEnd) && proposedStart >= 0 && proposedStart < proposedEnd && proposedEnd <= sourceDurationMs
  const trimStartMs = validTrim ? Math.round(proposedStart) : 0
  const trimEndMs = validTrim ? Math.round(proposedEnd) : sourceDurationMs
  const validCueIds = new Set((transcript?.cues || []).map((cue) => cue.cueId))
  const requestedCueIds = Array.isArray(value?.subtitleCueIds) ? value.subtitleCueIds.map(String) : []
  const subtitleCueIds = requestedCueIds.filter((id: string) => {
    return id && validCueIds.has(id)
  })
  const unknownCue = requestedCueIds.some((id: string) => !validCueIds.has(id))
  const requestedSpeakers = Array.isArray(value?.speakerIds) ? value.speakerIds.map(String) : []
  const expectedSpeaker = String(shot.speakerId || '').trim()
  const speakerIds = requestedSpeakers.filter((id: string) => id === expectedSpeaker)
  const unknownSpeaker = requestedSpeakers.some((id: string) => id !== expectedSpeaker)
  const missingSpeaker = shot.soundType === 'onscreen' && !speakerIds.includes(expectedSpeaker)
  const dialogueStart = Number(value?.dialogue?.sourceStartMs)
  const dialogueEnd = Number(value?.dialogue?.sourceEndMs)
  const validDialogue = shot.soundType === 'onscreen' && Number.isFinite(dialogueStart) && Number.isFinite(dialogueEnd) && dialogueStart >= trimStartMs && dialogueStart < dialogueEnd && dialogueEnd <= trimEndMs
  return {
    shotId: shot.shotId,
    promptSegmentId: shot.shotId,
    sourceMediaId: params.mediaId,
    sourceVideoPath: relativeRunAsset(params.runId, assertEpisodeAsset(params.runId, params.episodeId, params.videoPath)),
    sourceDurationMs,
    trimStartMs,
    trimEndMs,
    observedContent: String(value?.observedContent || error || '').trim(),
    subtitleCueIds,
    speakerIds,
    confidence: validTrim && !unknownSpeaker ? Math.max(0, Math.min(1, Number(value?.confidence) || 0)) : 0,
    needsReview: Boolean(error) || Boolean(value?.needsReview) || !validTrim || unknownCue || unknownSpeaker || missingSpeaker || (shot.soundType === 'onscreen' && (!validDialogue || !subtitleCueIds.length)),
    dialogue: validDialogue ? {
      speakerId: expectedSpeaker,
      text: String(shot.dialogueText || shot.script).trim(),
      emotion: String(shot.dialogueEmotion || 'neutral').trim(),
      sourceStartMs: Math.round(dialogueStart),
      sourceEndMs: Math.round(dialogueEnd),
      outputStartMs: 0,
      outputEndMs: 0,
    } : undefined,
  }
}

export async function runReferenceSearchSkill(
  runId: string,
  assetId: string,
  searchQuery: string,
  rejectedPinIds: string[] = [],
) {
  const contract = await fs.promises.readFile(
    path.join(process.env.APP_ROOT, 'skills', 'jc-asset-reference-search', 'SKILL.md'),
    'utf8',
  )
  if (!contract.includes('search_and_download') || !contract.includes('selectedImage'))
    throw new Error('资产参考搜索 Skill 合同无效')
  const version = await searchAssetImage(runId, assetId, searchQuery, rejectedPinIds)
  if (version.searchQuery !== searchQuery.trim() || !version.relativePath || !version.sourceUrl)
    throw new Error('资产参考搜索 Skill 返回无效')
  return {
    ...version,
    generatedBySkill: 'jc-asset-reference-search',
  }
}

const WIKI_TOOLS = [
  { type: 'function', function: { name: 'write_batch', description: '一次创建或替换整套导演总览和单镜 Markdown。生成分镜时必须使用此工具，不要逐文件 write/edit', parameters: { type: 'object', required: ['files'], properties: { files: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } } } } } },
] as const

export async function runWikiSkill(
  skillName: string,
  input: string,
  projectId: string,
  episodeId: string,
  textModel: TextModel = 'gpt-5.6-sol',
) {
  if (!SKILLS.has(skillName)) throw new Error('未知的内置 Skill')
  if (!TEXT_MODELS.includes(textModel)) throw new Error('不支持的文本模型')
  const system = await fs.promises.readFile(
    path.join(process.env.APP_ROOT, 'skills', skillName, 'SKILL.md'),
    'utf8',
  )
  const contextPaths = (await listProjectMarkdown(projectId)).filter(
    (value) =>
      value === `wiki/项目总监/${episodeId}.md` ||
      value === `wiki/文稿/${episodeId}/确认文稿.md` ||
      value.startsWith('wiki/资产/'),
  )
  const context = await Promise.all(
    contextPaths.map(async (value) => {
      const document = await readProjectMarkdown(projectId, value)
      return `## ${value}\n\n${document.content}`
    }),
  )
  const messages: any[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `${input}\n\n以下是 App 已读取的项目总监、确认文稿和已确认资产。必须继承项目总监的导演与参考作品，只能引用资产 Markdown 中现有的 entityId，不得创建或改写资产。完成整套设计后，使用一次 write_batch 提交导演总览和全部镜头 Markdown：\n\n${context.join('\n\n')}`,
    },
  ]
  return withRunAbort(projectId, async (signal) => {
    const result = await generateToolTurn(messages, textModel, signal)
    if (result.toolCalls.length !== 1 || result.toolCalls[0].function.name !== 'write_batch')
      throw new Error('导演没有一次性提交完整的分镜文件')
    const args = JSON.parse(result.toolCalls[0].function.arguments || '{}')
    for (const file of args.files || []) assertStoryboardWritePath(file?.path, episodeId)
    const documents = await writeStoryboardMarkdownBatch(projectId, args.files)
    return { text: result.text, writtenPaths: documents.map((document) => document.path) }
  })
}

function assertStoryboardWritePath(value: unknown, episodeId: string) {
  const target = String(value || '')
  if (!target.startsWith(`wiki/分镜/${episodeId}/`)) throw new Error('导演 Skill 只能修改当前剧集分镜 Markdown')
}

async function generateToolTurn(messages: any[], textModel: TextModel, signal?: AbortSignal) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request({
      method: 'POST',
      url: `${API_ORIGIN}/v1/chat/completions`,
      data: {
        model: textModel,
        messages,
        tools: WIKI_TOOLS,
        tool_choice: { type: 'function', function: { name: 'write_batch' } },
        temperature: 0.2,
        max_tokens: 32_000,
        stream: true,
      },
      responseType: 'stream',
      timeout: 300_000,
      headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      signal,
    })
    let pending = ''
    const decoder = new StringDecoder('utf8')
    let text = ''
    const calls: any[] = []
    let finishReason = ''
    let done = false
    const processLine = (line: string) => {
      if (!line.startsWith('data:')) return
      const value = line.slice(5).trim()
      if (!value) return
      if (value === '[DONE]') {
        done = true
        return
      }
      const choice = JSON.parse(value)?.choices?.[0] || {}
      finishReason = choice.finish_reason || finishReason
      const delta = choice.delta || {}
      text += delta.content || ''
      for (const part of delta.tool_calls || []) {
        const index = Number(part.index || 0)
        calls[index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } }
        calls[index].id += part.id || ''
        calls[index].function.name += part.function?.name || ''
        calls[index].function.arguments += part.function?.arguments || ''
      }
    }
    for await (const chunk of response.data) {
      pending += decoder.write(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) processLine(line)
    }
    pending += decoder.end()
    if (pending.trim()) processLine(pending)
    if (!done && !finishReason) throw new Error('模型响应流提前中断')
    if (finishReason && !['stop', 'tool_calls'].includes(finishReason))
      throw new Error(`模型响应未完整结束（${finishReason}）`)
    for (const call of calls) JSON.parse(call.function.arguments || '{}')
    return { text: text.trim(), toolCalls: calls.filter((call) => call.function.name) }
  } catch (error) {
    throw friendlyError(error)
  }
}

async function generateText(
  system: string,
  prompt: string,
  textModel: TextModel,
  signal?: AbortSignal,
) {
  return generateJsonResponse(system, prompt, textModel, signal, 16_000)
}

async function generateJsonResponse(
  system: string,
  userContent: string | Record<string, unknown>[],
  textModel: TextModel,
  signal?: AbortSignal,
  maxTokens = 16_000,
) {
  try {
    const apiKey = await readApiKey()
    const response = await axios.request({
      method: 'POST',
      url: `${API_ORIGIN}/v1/chat/completions`,
      data: {
        model: textModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: maxTokens,
        stream: true,
      },
      responseType: 'stream',
      timeout: 300_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal,
    })
    let pending = ''
    const decoder = new StringDecoder('utf8')
    let text = ''
    for await (const chunk of response.data) {
      pending += decoder.write(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const value = line.slice(5).trim()
        if (!value || value === '[DONE]') continue
        const event = JSON.parse(value)
        if (event?.error?.message) throw new Error(event.error.message)
        text += event?.choices?.[0]?.delta?.content || ''
      }
    }
    pending += decoder.end()
    if (!text.trim()) throw new Error('文稿模型没有返回内容')
    return text.trim()
  } catch (error) {
    throw friendlyError(error)
  }
}

function parseJson(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let firstError: unknown
  try {
    return JSON.parse(clean)
  } catch (error) {
    firstError = error
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1))
  }
  const message = firstError instanceof Error ? firstError.message : String(firstError)
  throw new Error(`模型返回的 JSON 无法解析：${message}`)
}

function extractTaskId(data: any): string {
  const nested = data?.data
  return String(
    data?.rh_task_id ||
      (typeof nested === 'string' ? nested : nested?.task_id || nested?.taskId || nested?.id) ||
      data?.task_id ||
      data?.taskId ||
      data?.id ||
      '',
  )
}

function extractStatus(data: any): string {
  return String(
    data?.status || data?.data?.status || data?.state || data?.data?.state || '',
  ).toLowerCase()
}

function extractMediaUrl(data: any, kind: 'image' | 'video' | 'audio'): string {
  const seen = new Set<object>()
  const walk = (value: any): string => {
    if (typeof value === 'string') return /^(https:|data:)/.test(value) ? value : ''
    if (!value || typeof value !== 'object' || seen.has(value)) return ''
    seen.add(value)
    if (typeof value.b64_json === 'string')
      return `data:${kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg'};base64,${value.b64_json}`
    for (const key of [
      'url',
      'result_url',
      'video_url',
      'videoUrl',
      'audio_url',
      'audioUrl',
      'image_url',
      'imageUrl',
      'output',
    ]) {
      if (typeof value[key] === 'string' && /^(https:|data:)/.test(value[key])) return value[key]
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = walk(item)
          if (found) return found
        }
      } else {
        const found = walk(child)
        if (found) return found
      }
    }
    return ''
  }
  return walk(data)
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('任务已停止；云端任务可能仍会继续并产生费用'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('任务已停止；云端任务可能仍会继续并产生费用'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function poll(pollRoute: string, kind: 'image' | 'video' | 'audio', signal?: AbortSignal) {
  for (let attempt = 0; attempt < 120; attempt++) {
    await wait(5_000, signal)
    const data: any = await request('GET', pollRoute, undefined, signal)
    const status = extractStatus(data)
    if (/^(completed|complete|success|succeeded|done)$/.test(status)) {
      const url = extractMediaUrl(data, kind)
      if (url) return url
    }
    if (/^(failed|failure|fail|error|cancelled|canceled)$/.test(status)) {
      throw Object.assign(
        new Error(String(data?.fail_reason || data?.error?.message || data?.message || '生成失败')),
        { terminal: true },
      )
    }
  }
  throw new Error('生成超时，请稍后重试')
}

function runJsonPath(runId: string) {
  return path.join(getRunDir(runId), 'run.json')
}

async function readPending(runId: string): Promise<PendingCloudTask[]> {
  try {
    const data = JSON.parse(await fs.promises.readFile(runJsonPath(runId), 'utf8'))
    const tasks = Array.isArray(data?.tasks) ? data.tasks : data?.pending
    return Array.isArray(tasks)
      ? tasks.map((task: PendingCloudTask) => ({
          ...task,
          targetId: task.targetId || String(task.index),
          targetLabel:
            task.targetLabel ||
            (task.kind === 'asset' ? String(task.targetId || task.id.slice(6)) : `镜头 ${task.index}`),
          status:
            task.status ||
            (task.resultUrl ? 'stopped' : task.pollRoute ? 'stopped' : 'failed'),
          resumeFrom:
            task.resumeFrom ||
            (task.resultUrl ? 'downloading' : task.pollRoute ? 'generating' : undefined),
          updatedAt: task.updatedAt || task.createdAt,
        }))
      : []
  } catch (error: any) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function mutatePending(
  runId: string,
  change: (tasks: PendingCloudTask[]) => PendingCloudTask[],
) {
  const previous = runJsonWrites.get(runId) || Promise.resolve()
  const next = previous.then(async () => {
    await ensureRunDir(runId)
    const filePath = runJsonPath(runId)
    const tempPath = `${filePath}.tmp`
    await fs.promises.writeFile(
      tempPath,
      JSON.stringify({ tasks: change(await readPending(runId)) }, null, 2),
    )
    await fs.promises.rename(tempPath, filePath)
  })
  runJsonWrites.set(runId, next)
  try {
    await next
  } finally {
    if (runJsonWrites.get(runId) === next) runJsonWrites.delete(runId)
  }
}

async function putPending(runId: string, task: PendingCloudTask) {
  await mutatePending(runId, (tasks) => {
    const current = tasks.find((item) => item.id === task.id)
    const archived =
      current &&
      current.createdAt !== task.createdAt &&
      ['success', 'failed', 'stopped'].includes(current.status || '')
        ? { ...current, id: `${current.id}@${current.updatedAt || current.createdAt}` }
        : undefined
    return [...tasks.filter((item) => item.id !== task.id), ...(archived ? [archived] : []), task]
  })
}

async function removePending(runId: string, id: string) {
  await mutatePending(runId, (tasks) => tasks.filter((item) => item.id !== id))
}

async function updateTask(
  runId: string,
  id: string,
  change: (task: PendingCloudTask) => PendingCloudTask,
) {
  await mutatePending(runId, (tasks) =>
    tasks.map((task) => (task.id === id ? change(task) : task)),
  )
}

export async function listCloudTasks(runId: string) {
  return (await readPending(runId))
    .filter((task) => task.kind !== 'voice')
    .map((task) =>
      ['generating', 'downloading'].includes(task.status || '') &&
      !taskControllers.has(taskControllerKey(runId, task.id))
        ? {
            ...task,
            status: 'stopped' as const,
            resumeFrom: task.resultUrl ? ('downloading' as const) : ('generating' as const),
          }
        : task,
    )
}

function taskControllerKey(runId: string, taskId: string) {
  return `${runId}:${taskId}`
}

async function withTaskAbort<T>(
  runId: string,
  taskId: string,
  action: (signal: AbortSignal) => Promise<T>,
) {
  const key = taskControllerKey(runId, taskId)
  if (taskControllers.has(key)) throw new Error('该任务正在执行')
  const controller = new AbortController()
  let finish!: () => void
  const entry = { controller, finished: new Promise<void>((resolve) => (finish = resolve)) }
  taskControllers.set(key, entry)
  try {
    return await action(controller.signal)
  } finally {
    if (taskControllers.get(key) === entry) taskControllers.delete(key)
    finish()
  }
}

async function markCloudTaskStopped(runId: string, taskId: string) {
  const now = new Date().toISOString()
  await updateTask(runId, taskId, (task) => ({
    ...task,
    status: 'stopped',
    resumeFrom: task.resultUrl ? 'downloading' : 'generating',
    error: task.resultUrl
      ? '已停止本地下载'
      : '已停止本地等待；云端任务可能仍在执行并产生费用',
    updatedAt: now,
  }))
}

export async function stopCloudTask(runId: string, taskId: string) {
  const entry = taskControllers.get(taskControllerKey(runId, taskId))
  entry?.controller.abort()
  await markCloudTaskStopped(runId, taskId)
  await entry?.finished
  return Boolean(entry)
}

export async function abandonCloudTask(runId: string, taskId: string) {
  taskControllers.get(taskControllerKey(runId, taskId))?.controller.abort()
  await removePending(runId, taskId)
}

async function finishPending(runId: string, task: PendingCloudTask, signal?: AbortSignal) {
  const outputPath = assertRunAsset(runId, task.outputPath)
  if (!fs.existsSync(outputPath)) {
    let url = task.resultUrl
    if (!url && task.pollRoute) {
      await updateTask(runId, task.id, (current) => ({
        ...(current.status === 'stopped'
          ? current
          : {
              ...current,
              status: 'generating',
              resumeFrom: undefined,
              error: undefined,
              updatedAt: new Date().toISOString(),
            }),
      }))
      try {
        url = await poll(
          task.pollRoute,
          task.kind === 'voice'
            ? 'audio'
            : task.kind === 'storyboard' || task.kind === 'asset'
              ? 'image'
              : 'video',
          signal,
        )
      } catch (error) {
        if (!signal?.aborted)
          await updateTask(runId, task.id, (current) => ({
            ...current,
            status: 'failed',
            resumeFrom: current.pollRoute ? 'generating' : undefined,
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date().toISOString(),
          }))
        throw error
      }
      task = { ...task, resultUrl: url, status: 'downloading', updatedAt: new Date().toISOString() }
      await putPending(runId, task)
    }
    if (!url) throw new Error('任务缺少结果地址')
    await updateTask(runId, task.id, (current) => ({
      ...(current.status === 'stopped'
        ? { ...current, resultUrl: url, resumeFrom: 'downloading' }
        : {
            ...current,
            resultUrl: url,
            status: 'downloading',
            resumeFrom: undefined,
            error: undefined,
            updatedAt: new Date().toISOString(),
          }),
    }))
    if (signal?.aborted) throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    try {
      if (url.startsWith('data:')) await writeDataUrl(url, outputPath)
      else await downloadResultMedia(url, outputPath, signal)
    } catch (error) {
      if (!signal?.aborted)
        await updateTask(runId, task.id, (current) => ({
          ...current,
          status: 'failed',
          resumeFrom: 'downloading',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        }))
      throw error
    }
  }
  await updateTask(runId, task.id, (current) => ({
    ...current,
    status: 'success',
    resumeFrom: undefined,
    error: undefined,
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  }))
  return outputPath
}

export async function resumeCloudTask(runId: string, taskId: string) {
  const task = (await readPending(runId)).find((item) => item.id === taskId)
  if (!task) throw new Error('任务不存在')
  if (!task.resultUrl && !task.pollRoute) throw new Error('该任务没有可恢复的结果或任务 ID')
  return withTaskAbort(runId, task.id, (signal) => finishPending(runId, task, signal))
}

export async function withRunAbort<T>(runId: string, action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const controllers = runControllers.get(runId) || new Set<AbortController>()
  controllers.add(controller)
  runControllers.set(runId, controllers)
  try {
    return await action(controller.signal)
  } finally {
    if (controller.signal.aborted)
      await mutatePending(runId, (tasks) => tasks.filter((task) => task.kind !== 'voice'))
    controllers.delete(controller)
    if (!controllers.size) runControllers.delete(runId)
  }
}

export async function cancelRun(runId: string) {
  const controllers = runControllers.get(runId)
  controllers?.forEach((controller) => controller.abort())
  await mutatePending(runId, (tasks) => tasks.filter((task) => task.kind !== 'voice'))
  return controllers?.size || 0
}

function pendingTask(
  runId: string,
  kind: PendingCloudTask['kind'],
  index: number,
  outputPath: string,
  data: any,
  resultUrl: string,
  pollRoute?: string,
  pendingId?: string,
  targetId?: string,
  targetLabel?: string,
): PendingCloudTask {
  const now = new Date().toISOString()
  return {
    id: pendingId || `${kind}:${index}`,
    kind,
    index,
    targetId: targetId || String(index),
    targetLabel: targetLabel || `镜头 ${index}`,
    status: resultUrl ? 'downloading' : 'generating',
    taskId: extractTaskId(data) || undefined,
    pollRoute,
    resultUrl: resultUrl || undefined,
    outputPath: relativeRunAsset(runId, outputPath),
    createdAt: now,
    startedAt: now,
    updatedAt: now,
  }
}

export async function generateVoice(runId: string, episodeId: string, text: string, voicePrompt: string) {
  return withRunAbort(runId, async (signal) => {
    const pendingId = `${episodeId}:voice:0`
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (existing) {
      const filePath = await finishPending(runId, existing, signal)
      return { path: filePath, duration: await mediaDuration(filePath) }
    }
    const nodeInfoList = [
      { nodeId: '14', fieldName: 'text', fieldValue: text, description: '文稿' },
      {
        nodeId: '15',
        fieldName: 'text',
        fieldValue: voicePrompt,
        description: '【人设】+【音色特征】+【风格】+【情感】+【节奏】',
      },
    ]
    const data: any = await request(
      'POST',
      '/v1/audio/speech',
      {
        model: 'rh-aiapp-voice-design',
        nodeInfoList,
        voice: `__rh_nodeinfo__${Buffer.from(JSON.stringify(nodeInfoList)).toString('base64')}`,
      },
      signal,
    )
    let url = extractMediaUrl(data, 'audio')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('声音任务没有返回任务 ID')
      pollRoute = `/rh/tasks/${encodeURIComponent(taskId)}?ai_app=true`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'voice',
      0,
      generateUniqueFileName(getRunAssetPath(runId, episodeId, 'voice')),
      data,
      url,
      pollRoute,
      pendingId,
    )
    await putPending(runId, task)
    const filePath = await finishPending(runId, task, signal)
    return { path: filePath, duration: await mediaDuration(filePath) }
  })
}

function imageSize(ratio: string) {
  const sizes: Record<string, string> = {
    '9:16': '1152x2048',
    '16:9': '2048x1152',
    '1:1': '2048x2048',
    '4:3': '2731x2048',
    '3:4': '2048x2731',
    '21:9': '4779x2048',
  }
  const size = sizes[ratio]
  if (!size) throw new Error('不支持的画面比例')
  return size
}

export async function generateStoryboardImage(
  runId: string,
  episodeId: string,
  index: number,
  prompt: string,
  ratio: string,
  referencePath?: string | string[],
) {
  const pendingId = `${episodeId}:storyboard:${index}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (existing && existing.status !== 'success' && (existing.resultUrl || existing.pollRoute))
      return finishPending(runId, existing, signal)
    const references = Array.isArray(referencePath)
      ? referencePath.filter(Boolean)
      : referencePath
        ? [referencePath]
        : []
    const outputPath = generateUniqueFileName(getRunAssetPath(runId, episodeId, 'storyboard', index))
    const started = pendingTask(runId, 'storyboard', index, outputPath, {}, '', undefined, pendingId)
    await putPending(runId, started)
    let data: any
    try {
      if (references.length) {
        const localReferences = references.map((item) => assertRunAsset(runId, item))
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${API_ORIGIN}/v1/images/edits`,
          {
            model: 'gpt-image-2',
            prompt,
            size: imageSize(ratio),
            response_format: 'url',
            image:
              localReferences.length === 1
                ? fs.createReadStream(localReferences[0])
                : localReferences.map((item) => fs.createReadStream(item)),
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
      } else {
        data = await request(
          'POST',
          '/v1/images/generations',
          {
            model: 'gpt-image-2',
            prompt,
            n: 1,
            size: imageSize(ratio),
            response_format: 'url',
          },
          signal,
        )
      }
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
    let url = extractMediaUrl(data, 'image')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('图片任务没有返回结果')
      pollRoute = `/rh/tasks/${encodeURIComponent(taskId)}`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'storyboard',
      index,
      outputPath,
      data,
      url,
      pollRoute,
      pendingId,
    )
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function generateAssetImage(
  runId: string,
  assetId: string,
  role: 'character' | 'scene' | 'prop',
  design: Record<string, unknown>,
  referencePath?: string | string[],
  assetLabel?: string,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) throw new Error('无效的资产 ID')
  if (!['character', 'scene', 'prop'].includes(role)) throw new Error('无效的资产类型')
  if (!design || typeof design !== 'object' || Array.isArray(design)) throw new Error('资产设计 JSON 无效')
  const ratio = String((design as any).project?.aspectRatio || '')
  imageSize(ratio)
  const designJson = JSON.stringify(design, null, 2)
  const prompt = referencePath
    ? `请结合全部参考图生成，最终内容、画风和比例以资产设计 JSON 为准。\n\n${designJson}`
    : designJson
  const pendingId = `asset:${assetId}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (existing && existing.status !== 'success' && (existing.resultUrl || existing.pollRoute))
      return finishPending(runId, existing, signal)
    const references = (Array.isArray(referencePath) ? referencePath : referencePath ? [referencePath] : [])
      .filter(Boolean)
      .map((item) => assertRunAsset(runId, item))
    const outputPath = generateUniqueFileName(
      path.join(getRunDir(runId), 'assets', assetId, 'generated.png'),
    )
    await putPending(
      runId,
      pendingTask(runId, 'asset', 0, outputPath, {}, '', undefined, pendingId, assetId, assetLabel || assetId),
    )
    let data: any
    try {
      if (references.length) {
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${API_ORIGIN}/v1/images/edits`,
          {
            model: 'gpt-image-2',
            prompt,
            size: imageSize(ratio),
            response_format: 'url',
            image:
              references.length === 1
                ? fs.createReadStream(references[0])
                : references.map((item) => fs.createReadStream(item)),
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
      } else {
        data = await request(
          'POST',
          '/v1/images/generations',
          {
            model: 'gpt-image-2',
            prompt,
            n: 1,
            size: imageSize(ratio),
            response_format: 'url',
          },
          signal,
        )
      }
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
    const url = extractMediaUrl(data, 'image')
    if (!url) throw new Error('资产图片任务没有返回结果')
    const task = pendingTask(
      runId,
      'asset',
      0,
      outputPath,
      data,
      url,
      undefined,
      pendingId,
      assetId,
      assetLabel || assetId,
    )
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function generateSegmentVideo(
  runId: string,
  episodeId: string,
  index: number,
  model: VideoModel,
  prompt: string,
  ratio: string,
  generationDuration: number,
  imagePath: string,
  imagePaths: string[] = [],
) {
  if (
    ![
      'veo-3.1-generate-preview',
      'veo-3.0-generate-001',
      'rh-grok-image-video',
      'rh-seedance2',
    ].includes(model)
  )
    throw new Error('不支持的视频模型')
  const pendingId = `${episodeId}:video:${index}`
  return withTaskAbort(runId, pendingId, async (signal) => {
    const existing = (await readPending(runId)).find((task) => task.id === pendingId)
    if (
      existing &&
      (existing.model || 'veo-3.1-generate-preview') === model &&
      existing.status !== 'success' &&
      (existing.resultUrl || existing.pollRoute)
    )
      return finishPending(runId, existing, signal)
    imageSize(ratio)
    const combinedVideo = model === 'rh-grok-image-video' || model === 'rh-seedance2'
    if (model === 'rh-grok-image-video') {
      if (!Number.isInteger(generationDuration) || generationDuration < 6 || generationDuration > 30)
        throw new Error('Grok 视频生成时长只能为 6 到 30 秒的整数')
    } else if (model === 'rh-seedance2') {
      if (!Number.isInteger(generationDuration) || generationDuration < 4 || generationDuration > 15)
        throw new Error('Seedance 2.0 视频生成时长只能为 4 到 15 秒的整数')
    } else if (![4, 6, 8].includes(generationDuration)) throw new Error('视频生成时长只能为 4、6 或 8 秒')
    if (ratio !== '9:16' && ratio !== '16:9') throw new Error('视频模型仅支持 9:16 或 16:9')
    const runningHub = combinedVideo
    const seconds = model === 'veo-3.0-generate-001'
      ? 8
      : generationDuration
    const localImages = [imagePath, ...imagePaths].filter(Boolean).slice(0, 7).map((item) => assertRunAsset(runId, item))
    const localImage = localImages[0]
    const outputPath = generateUniqueFileName(getRunAssetPath(runId, episodeId, 'clip', index))
    await putPending(
      runId,
      { ...pendingTask(runId, 'video', index, outputPath, {}, '', undefined, pendingId), model },
    )
    let data: any
    try {
      if (runningHub) {
        const images = await Promise.all(localImages.map(async (file) => {
          const extension = path.extname(file).toLowerCase()
          const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png'
          return `data:${mimeType};base64,${await fs.promises.readFile(file, 'base64')}`
        }))
        data = await request(
          'POST',
          '/v1/videos',
          {
            model,
            prompt,
            duration: seconds,
            aspectRatio: ratio,
            resolution: '720p',
            images,
          },
          signal,
        )
      } else {
        const apiKey = await readApiKey()
        const response = await axios.postForm(
          `${OPENAI_BASE_URL}/videos`,
          {
            model,
            prompt,
            input_reference: fs.createReadStream(localImage),
            seconds: String(seconds),
            duration: String(seconds),
            size: ratio === '9:16' ? '720x1280' : '1280x720',
            resolution: '720p',
            aspectRatio: ratio,
          },
          {
            timeout: 300_000,
            headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
            signal,
            maxBodyLength: Infinity,
          },
        )
        data = response.data
      }
    } catch (error) {
      if (!signal.aborted)
        await updateTask(runId, pendingId, (task) => ({
          ...task,
          status: 'failed',
          error: friendlyError(error).message,
          updatedAt: new Date().toISOString(),
        }))
      throw friendlyError(error)
    }
    if (signal.aborted) throw new Error('已停止本地等待；云端任务可能仍在执行并产生费用')
    let url = extractMediaUrl(data, 'video')
    let pollRoute: string | undefined
    if (!url) {
      const taskId = extractTaskId(data)
      if (!taskId) throw new Error('视频任务没有返回任务 ID')
      pollRoute = combinedVideo
        ? /^task_/.test(taskId)
          ? `/v1/videos/${encodeURIComponent(taskId)}`
          : `/rh/tasks/${encodeURIComponent(taskId)}`
        : `/v1/video/generations/${encodeURIComponent(taskId)}`
    }
    await ensureRunDir(runId)
    const task = pendingTask(
      runId,
      'video',
      index,
      outputPath,
      data,
      url,
      pollRoute,
      pendingId,
    )
    task.model = model
    await putPending(runId, task)
    if (signal.aborted) {
      await markCloudTaskStopped(runId, pendingId)
      throw new Error('任务已停止；云端任务可能仍会继续并产生费用')
    }
    return finishPending(runId, task, signal)
  })
}

export async function resumePendingTasks(runId: string): Promise<ResumedCloudTask[]> {
  const results: ResumedCloudTask[] = []
  for (const task of (await readPending(runId)).filter((item) => item.status !== 'success')) {
    try {
      const path = await (task.kind === 'voice'
        ? withRunAbort(runId, (signal) => finishPending(runId, task, signal))
        : withTaskAbort(runId, task.id, (signal) => finishPending(runId, task, signal)))
      results.push({
        id: task.id,
        kind: task.kind,
        index: task.index,
        status: 'success',
        path,
        duration: task.kind === 'voice' ? await mediaDuration(path) : undefined,
      })
    } catch (error) {
      results.push({
        id: task.id,
        kind: task.kind,
        index: task.index,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
