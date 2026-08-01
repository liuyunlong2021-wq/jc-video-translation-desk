import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
const cloud = read('electron/cloud.ts')
const localVoice = read('electron/local-tts.ts')
const ipc = read('electron/ipc.ts')
const preload = read('electron/preload.ts')
const ffmpeg = read('electron/ffmpeg/index.ts')
const workspace = read('electron/media-workspace.ts')
const pinterestReference = read('electron/pinterest-reference.ts')
const pinterestAudit = read('electron/pinterest-audit.ts')
const baseStyle = read('src/assets/base.scss')
const homeUi = read('src/views/Home/index.vue')
const main = read('electron/main.ts')
const textUi = read('src/views/Home/components/TextGenerate.vue')
const renderUi = read('src/views/Home/components/VideoRender.vue')
const mediaUi = read('src/views/Home/components/VideoManage.vue')
const wikiUi = read('src/views/Home/components/WikiDocument.vue')
const shotSkill = read('skills/jc-script-storyboard/SKILL.md')
const imageSkill = read('skills/jc-gpt-image/SKILL.md')
const scriptSkill = read('skills/jc-media-script/SKILL.md')
const revisionSkill = read('skills/jc-context-revision/SKILL.md')
const referenceSearchSkill = read('skills/jc-asset-reference-search/SKILL.md')
const paceSdd = read('docs/镜头节奏控制SDD.md')
const brandingSdd = read('docs/创作参数与品牌视觉升级SDD.md')
const propSdd = read('docs/道具提示词参考搜索与资产生成P0-SDD.md')

test('locks the API, selectable text models, and fixed media models to the SDD values', () => {
  for (const model of [
    'gemini-3.6-flash',
    'claude-fable-5',
    'claude-opus-5',
    'gpt-5.6-sol',
    'deepseek-v4-pro',
  ]) {
    assert.match(cloud, new RegExp(model))
    assert.match(textUi, new RegExp(model))
  }
  assert.match(cloud, /model: 'gpt-image-2'/)
  assert.match(cloud, /model: 'veo-3\.1-generate-preview'/)
  assert.match(cloud, /model: 'rh-aiapp-voice-design'/)
  assert.match(textUi, /:model-value="API_URL"\s+readonly/)
  assert.match(textUi, /mediaStore\.textModel/)
  assert.match(cloud, /上次输出解析失败/)
  assert.match(cloud, /response_format: \{ type: 'json_object' \}/)
  assert.match(cloud, /status === 524/)
  assert.match(cloud, /stream: true/)
  assert.match(cloud, /responseType: 'stream'/)
  assert.match(renderUi, /variant="plain"/)
  for (const skill of [
    'jc-media-script',
    'jc-script-storyboard',
    'jc-gpt-image',
    'jc-voice-design',
    'jc-context-revision',
  ]) {
    assert.match(cloud, new RegExp(`'${skill}'`))
  }
  assert.match(scriptSkill, /targetDuration/)
})

test('passes all supported ratios through image, video, and final output contracts', () => {
  for (const ratio of ['9:16', '16:9']) {
    assert.match(cloud, new RegExp(`'${ratio.replace(':', ':')}'`))
    assert.match(ffmpeg, new RegExp(`'${ratio.replace(':', ':')}'`))
  }
  assert.match(cloud, /size: imageSize\(ratio\)/)
  assert.match(cloud, /aspectRatio: ratio/)
  assert.match(ffmpeg, /OUTPUT_SIZES\[params\.ratio\]/)
})

test('submits exactly the two voice-design business inputs', () => {
  const voiceBlock = cloud.slice(
    cloud.indexOf('export async function generateVoice'),
    cloud.indexOf('function imageSize'),
  )
  assert.deepEqual(
    [...voiceBlock.matchAll(/nodeId: '(\d+)'/g)].map((match) => match[1]),
    ['14', '15'],
  )
  assert.doesNotMatch(voiceBlock, /language|语言/)
})

test('selects cloud or local VoiceDesign without silent cloud fallback', () => {
  assert.match(textUi, /mediaStore\.voiceEngine/)
  assert.match(textUi, /value="cloud"/)
  assert.match(textUi, /value="local"/)
  assert.match(homeUi, /mediaStore\.voiceEngine/)
  assert.match(renderUi, /mediaStore\.voiceEngine === 'local' \|\| mediaStore\.apiConfigured/)
  assert.match(preload, /cloud-generate-voice[\s\S]*engine/)
  assert.match(ipc, /engine === 'local'[\s\S]*generateLocalVoice[\s\S]*generateCloudVoice/)
  assert.match(localVoice, /spawn\(/)
  assert.doesNotMatch(localVoice, /shell:\s*true|generateCloudVoice|generateVoice\(/)
})

test('keeps five center views and one contextual scrolling inspector', () => {
  const renderTemplate = renderUi.slice(0, renderUi.indexOf('<script setup'))
  for (const view of ['文稿', '分镜', '资产', '分镜图/视频', '成片'])
    assert.match(mediaUi, new RegExp(view))
  assert.match(renderUi, /inspector-scroll/)
  assert.match(renderUi, /action-bar/)
  assert.match(renderUi, /label="修改意见"/)
  assert.match(renderUi, /确认修改/)
  assert.doesNotMatch(renderUi, /撤销上次 AI 修改|资产生图提示词|文稿状态/)
  assert.match(revisionSkill, /requiresReplan/)
  assert.doesNotMatch(homeUi, /TtsControl/)
  assert.ok(mediaUi.indexOf('value="assets"') < mediaUi.indexOf('value="storyboard"'))
  assert.ok(renderUi.indexOf("key: 'assets'") < renderUi.indexOf("key: 'shots'"))
  assert.match(mediaUi, /parent-label="返回分镜总表"/)
  assert.doesNotMatch(mediaUi, /v-if="false"/)
  assert.match(renderUi, /type: 'asset-prompt'/)
  assert.match(homeUi, /mode: 'app-revise'/)
  assert.match(homeUi, /assetSkill\(asset\)/)
  assert.match(renderUi, /class="primary-action"/)
  assert.doesNotMatch(renderUi, /approve-assets|approveAssets/)
  assert.match(mediaUi, /@click\.stop="previewAssetVersion\(asset\)"/)
  assert.match(homeUi, /adoptAssetVersion\(asset\.id, version\.id\)/)
  assert.doesNotMatch(mediaUi, /搜索下载参考图|生成资产设计 JSON|>生成资产图</)
  assert.equal((renderTemplate.match(/生成资产设计 JSON/g) || []).length, 1)
  assert.equal((renderTemplate.match(/搜索下载参考图/g) || []).length, 1)
  assert.equal((renderTemplate.match(/>生成资产图</g) || []).length, 1)
  assert.doesNotMatch(mediaUi, /上传参考|>确认</)
  assert.match(homeUi, /searchAssetImage/)
  assert.match(cloud, /runReferenceSearchSkill/)
  assert.match(cloud, /contract\.includes\('search_and_download'\)/)
  assert.match(cloud, /generatedBySkill: 'jc-asset-reference-search'/)
  assert.match(referenceSearchSkill, /search_and_download/)
  assert.doesNotMatch(referenceSearchSkill, /generationPrompt|生成资产图/)
  assert.match(homeUi, /validPropDesign/)
  assert.match(homeUi, /design: asset\.design \|\| existingById\.get\(asset\.id\)\?\.design/)
  assert.match(homeUi, /searchQuery: asset\.searchQuery \|\| existingById\.get\(asset\.id\)\?\.searchQuery/)
  assert.match(homeUi, /searchAssets/)
  assert.match(mediaUi, /removeAssetReferenceVersion/)
  assert.match(mediaUi, /删除当前参考图/)
  assert.doesNotMatch(mediaUi, /删除当前资产图/)
  assert.match(homeUi, /searchQuery\.length > 160/)
  assert.doesNotMatch(homeUi, /searchWords\.length/)
  assert.match(propSdd, /\[生成资产提示词\].*\[搜索下载参考图（可跳过）\].*\[生成资产图\]/)
  assert.match(renderUi, /:loading="mediaStore\.busyAction === primaryAction\.key"/)
  assert.doesNotMatch(renderUi, /Boolean\(mediaStore\.busyAction\)[^>]*primaryAction\.label/)
  assert.doesNotMatch(
    renderUi.slice(renderUi.indexOf('const canStop'), renderUi.indexOf('const displayError')),
    /revision/,
  )
  assert.doesNotMatch(textUi, /创作结果会显示在中间工作区/)
})

test('keeps asset generation recoverable and validates every professional design', () => {
  assert.match(homeUi, /designFingerprint: designFingerprint\(asset\)/)
  assert.match(homeUi, /mediaStore\.adoptAssetVersion\(asset\.id, version\.id\)/)
  assert.match(homeUi, /failures\.push\(error\)/)
  assert.match(homeUi, /validAssetDesign\(asset\.role, revisedDesign\)/)
  assert.match(homeUi, /project\?\.visualStyle/)
  assert.match(homeUi, /project\?\.aspectRatio/)
  assert.match(homeUi, /visualStyle: VISUAL_STYLES\.find/)
  assert.match(homeUi, /aspectRatio: mediaStore\.ratio/)
  assert.match(cloud, /const prompt = JSON\.stringify\(design, null, 2\)/)
  assert.match(homeUi, /design: JSON\.parse\(JSON\.stringify\(asset\.design\)\)/)
  assert.doesNotMatch(homeUi, /asset\.prompt|generationPrompt|currentPrompt/)
  assert.match(workspace, /assertDownloadedImage/)
  assert.match(workspace, /搜索结果不是可用图片/)
  assert.match(workspace, /net\.request\(\{ url, method: 'GET', redirect: 'manual' \}\)/)
  assert.match(workspace, /setTimeout\(abort, 300_000\)/)
  assert.match(pinterestReference, /persist:pinterest-reference/)
  assert.match(pinterestReference, /executeJavaScript/)
  assert.match(pinterestReference, /capturePage/)
  assert.match(pinterestReference, /document\.images\[0\]/)
  assert.match(pinterestReference, /i\.pinimg\.com/)
  assert.doesNotMatch(workspace, /BaseSearchResource|get\/|www\.bing\.com\/images\/search|commons\.wikimedia\.org/)
  assert.match(referenceSearchSkill, /媒介、具体对象和制作用途构图/)
  assert.match(pinterestReference, /show: false/)
  assert.match(pinterestReference, /closeAfterBatch/)
  assert.match(pinterestAudit, /Pinterest 搜索窗口未自动关闭/)
  assert.match(homeUi, /\[\.\.\.\(asset\.rejectedReferencePinIds \|\| \[\]\)\]\.map\(String\)/)
})

test('does not let background media recovery lock project navigation', () => {
  assert.doesNotMatch(homeUi, /resumePending\(|resumeWorkflow/)
  assert.match(cloud, /existing\.resultUrl \|\| existing\.pollRoute/)
  assert.match(cloud, /export async function stopCloudTask/)
  assert.doesNotMatch(homeUi, /runAction\('(?:assets|storyboards|videos)'/)
})

test('writes the confirmed script before mounting its Markdown document', () => {
  const approve = homeUi.slice(
    homeUi.indexOf('async function approveScript'),
    homeUi.indexOf('async function runAction'),
  )
  assert.ok(approve.indexOf('writeMarkdown(') < approve.indexOf('mediaStore.approvedScript = approved'))
  assert.ok(approve.indexOf('writeMarkdown(') < approve.indexOf("mediaStore.selectStep('voice')"))
  assert.match(wikiUi, /<div v-if="loaded">/)
  assert.match(workspace, /确认文稿不能为空/)
})

test('keeps every paid stage explicit and every result visible in the media library', () => {
  for (const action of [
    'generateVoicePlan',
    'generateVoice',
    'generateShotPlan',
    'generateStoryboards',
    'generateVideos',
    'compose',
  ]) {
    assert.match(renderUi, new RegExp(action))
  }
  assert.match(mediaUi, /<audio/)
  assert.match(mediaUi, /segment\.imagePath/)
  assert.match(mediaUi, /segment\.videoPath/)
  assert.match(mediaUi, /mediaStore\.finalPath/)
  assert.match(mediaUi, /v-tabs|v-btn-toggle/)
  assert.match(mediaUi, /v-dialog/)
  assert.match(renderUi, /重新生成本图/)
  assert.match(renderUi, /重新生成本镜/)
  assert.doesNotMatch(renderUi, /Veo 3\.1|声音方案已生成/)
  assert.match(baseStyle, /#app\s*\{\s*height: 100%/)
  assert.match(homeUi, /workspace-grid/)
  assert.match(homeUi, /runWikiSkill\([\s\S]*'jc-script-storyboard'/)
  const shotPlanAction = homeUi.slice(
    homeUi.indexOf('async function generateShotPlan'),
    homeUi.indexOf('async function generateStoryboards'),
  )
  const storyboardAction = homeUi.slice(
    homeUi.indexOf('async function generateStoryboards'),
    homeUi.indexOf('async function generateVideos'),
  )
  assert.match(shotPlanAction, /runWikiSkill\([\s\S]*'jc-script-storyboard'/)
  assert.match(shotPlanAction, /referenceShotCount/)
  assert.doesNotMatch(shotPlanAction, /requiredShotCount/)
  assert.match(shotPlanAction, /parseStoryboardMarkdown/)
  assert.doesNotMatch(shotPlanAction, /generateStoryboard\(/)
  assert.match(storyboardAction, /shotPlanFirst/)
  assert.doesNotMatch(storyboardAction, /runSkill/)
  assert.match(renderUi, /repeat\(7,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(homeUi, /inspector-toggle[\s\S]*inspector-column\.open/)
  assert.match(shotSkill, /单一连续镜头/)
  assert.match(shotSkill, /世界知名[\s\S]*具体代表作/)
  assert.match(shotSkill, /亨利·塞利克《鬼妈妈》/)
  assert.match(imageSkill, /禁止多宫格、分屏、拼贴、卷轴/)
})

test('implements the multi-asset image contract and discrete video durations', () => {
  assert.match(cloud, /\/v1\/images\/edits/)
  assert.match(cloud, /localReferences\.map\(\(item\) => fs\.createReadStream\(item\)\)/)
  assert.match(cloud, /\[4, 6, 8\]\.includes/)
  assert.match(textUi, /targetDuration/)
  assert.match(textUi, /styleId/)
  assert.doesNotMatch(textUi, /selectCoreReference/)
  assert.doesNotMatch(mediaUi, /uploadAsset/)
  assert.match(homeUi, /referencePaths/)
  assert.match(main, /short-video-media/)
  assert.match(main, /assertRunAsset/)
  assert.doesNotMatch(
    homeUi.slice(homeUi.indexOf('const skillInput'), homeUi.indexOf("'jc-script-storyboard'")),
    /relativePath/,
  )
})

test('keeps shot pacing explicit and Veo clips single-shot', () => {
  assert.match(textUi, /mediaStore\.shotPace/)
  assert.match(homeUi, /shotPace: mediaStore\.shotPace/)
  assert.match(shotSkill, /slow=7.*medium=4\.5.*fast=2\.5/)
  assert.match(shotSkill, /最终节奏/)
  assert.match(shotSkill, /导演身份/)
  assert.match(shotSkill, /第一镜.*hook/)
  assert.match(shotSkill, /起始状态[\s\S]*动作过程[\s\S]*结束状态/)
  assert.match(imageSkill, /resolvedPace/)
  assert.match(imageSkill, /creativeIdentity/)
  assert.match(imageSkill, /第一镜必须服务于/)
  assert.match(paceSdd, /不启用 Veo 单条视频内部的蒙太奇或跳切/)
})

test('keeps style, duration, branding, and legacy-data contracts explicit', () => {
  assert.match(brandingSdd, /冷暖对比电影/)
  assert.match(brandingSdd, /5..180/)
  assert.match(brandingSdd, /赚钱短片/)
  assert.match(main, /app\.getPath\('appData'\)/)
  assert.match(main, /media-runs/)
  assert.match(textUi, /customDuration/)
  assert.match(textUi, /durationInvalid/)
})

test('discards source audio and preserves old generated files', () => {
  assert.match(ffmpeg, /concat=n=\$\{streams\.length\}:v=1:a=0/)
  assert.match(ffmpeg, /\[\$\{videoFiles\.length\}:a\]loudnorm/)
  assert.match(ffmpeg, /const totalDuration = await mediaDuration\(voiceFile\)/)
  assert.match(ffmpeg, /generateUniqueFileName\(getRunAssetPath\(params\.runId, 'final'\)\)/)
  assert.match(cloud, /generateUniqueFileName\(getRunAssetPath/)
})

test('stores resumable task metadata under the managed user-data directory', () => {
  assert.match(workspace, /app\.getPath\('userData'\), 'media-runs', runId/)
  assert.match(cloud, /path\.join\(getRunDir\(runId\), 'run\.json'\)/)
  assert.match(cloud, /export async function resumePendingTasks/)
  assert.match(cloud, /export async function cancelRun/)
  assert.match(cloud, /const existing = \(await readPending\(runId\)\)\.find/)
  const runJsonBlock = cloud.slice(
    cloud.indexOf('function runJsonPath'),
    cloud.indexOf('export async function withRunAbort'),
  )
  assert.doesNotMatch(runJsonBlock, /apiKey|Authorization/)
})

test('keeps remote Markdown outside the privileged Electron renderer', () => {
  const wikiDocument = read('src/views/Home/components/WikiDocument.vue')
  assert.match(main, /webSecurity:\s*true/)
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(main, /will-navigate[\s\S]*preventDefault/)
  assert.match(main, /setWindowOpenHandler/)
  assert.doesNotMatch(main, /OutOfBlinkCors|BlockInsecurePrivateNetworkRequests/)
  assert.doesNotMatch(preload, /exposeInMainWorld\('ipcRenderer'|exposeInMainWorld\('sqlite'/)
  assert.match(wikiDocument, /event\.preventDefault\(\)[\s\S]*window\.electron\.openExternal/)
})
