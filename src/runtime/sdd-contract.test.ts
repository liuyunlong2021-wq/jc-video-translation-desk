import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (file: string) =>
  fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const cloud = read('electron/cloud.ts')
const seedAudio = read('electron/seed-audio.ts')
const localVoice = read('electron/local-tts.ts')
const ipc = read('electron/ipc.ts')
const preload = read('electron/preload.ts')
const ffmpeg = read('electron/ffmpeg/index.ts')
const workspace = read('electron/media-workspace.ts')
const pinterestReference = read('electron/pinterest-reference.ts')
const pinterestAudit = read('electron/pinterest-audit.ts')
const baseStyle = read('src/assets/base.scss')
const homeUi = read('src/views/Home/index.vue')
const mediaStoreSource = read('src/store/mediaTask.ts')
const mediaPersistence = read('src/runtime/mediaPersistence.ts')
const productionContract = read('src/runtime/productionContract.ts')
const materialTranscriptMain = read('electron/material-transcript.ts')
const funAsrInstaller = read('electron/funasr-installer.ts')
const runtimeTools = read('electron/runtime-tools.ts')
const videoTranslationAsr = read('electron/video-translation-asr.ts')
const videoTranslationOcr = read('electron/video-translation-ocr.ts')
const videoTranslationMain = read('electron/video-translation.ts')
const funAsrRuntime = read('runtime/funasr/runtime.py')
const videoSubFinder = read('electron/video-subfinder.ts')
const indexTts = read('electron/index-tts.ts')
const main = read('electron/main.ts')
const beforePack = read('build/scripts/before-pack.js')
const electronI18n = read('electron/i18n/index.ts')
const viteConfig = read('vite.config.ts')
const translationBuilder = read('electron-builder.translation.json5')
const defaultBuilder = read('electron-builder.json5')
const packageJson = read('package.json')
const rendererMain = read('src/main.ts')
const defaultLayout = read('src/layout/default.vue')
const rendererI18n = read('src/lib/i18n.ts')
const textUi = read('src/views/Home/components/TextGenerate.vue')
const renderUi = read('src/views/Home/components/VideoRender.vue')
const mediaUi = read('src/views/Home/components/VideoManage.vue')
const wikiUi = read('src/views/Home/components/WikiDocument.vue')
const shotSkill = read('skills/jc-script-storyboard/SKILL.md')
const imageSkill = read('skills/jc-gpt-image/SKILL.md')
const scriptSkill = read('skills/jc-media-script/SKILL.md')
const revisionSkill = read('skills/jc-context-revision/SKILL.md')
const referenceSearchSkill = read('skills/jc-asset-reference-search/SKILL.md')
const projectDirectorSkill = read('skills/jc-film-style/SKILL.md')
const paceSdd = read('docs/镜头节奏控制SDD.md')
const brandingSdd = read('docs/创作参数与品牌视觉升级SDD.md')
const propSdd = read('docs/道具提示词参考搜索与资产生成P0-SDD.md')

test('locks the API and selectable text and video models to the SDD values', () => {
  for (const model of [
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
    'claude-fable-5',
    'claude-opus-5',
    'claude-sonnet-5',
    'gpt-5.6-sol',
    'grok-4.5',
    'deepseek-v4-pro',
  ]) {
    assert.match(cloud, new RegExp(model))
    assert.match(textUi, new RegExp(model))
  }
  assert.match(cloud, /model: 'gpt-image-2'/)
  for (const model of [
    'veo-3.1-generate-preview',
    'veo-3.0-generate-001',
    'rh-grok-image-video',
    'rh-seedance2',
  ]) {
    assert.match(cloud, new RegExp(model.replace(/\./g, '\\.')))
    assert.match(textUi, new RegExp(model.replace(/\./g, '\\.')))
  }
  assert.match(cloud, /model: 'rh-aiapp-voice-design'/)
  assert.match(seedAudio, /API_ORIGIN.*\/v1\/audio\/speech/)
  assert.match(seedAudio, /readApiKey\(\)/)
  assert.match(seedAudio, /responseType: 'arraybuffer'/)
  assert.doesNotMatch(textUi, /Seed Audio API Key|火山引擎 API Key/)
  assert.doesNotMatch(cloud, /ark\.cn-beijing\.volces\.com|readSeedAudioApiKey/)
  assert.doesNotMatch(textUi, /workflow\.api\.address|const API_URL/)
  assert.match(textUi, /title: 'Gemini 3\.6 Flash'/)
  assert.match(textUi, /title: '豆包'/)
  assert.match(textUi, /mediaStore\.textModel/)
  assert.match(textUi, /mediaStore\.videoModel/)
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
    'jc-film-style',
  ]) {
    assert.match(cloud, new RegExp(`'${skill}'`))
  }
  assert.match(scriptSkill, /targetDuration/)
})

test('bundles translations and uses the branded macOS dock icon', () => {
  assert.match(rendererI18n, /resources:\s*\{[\s\S]*'zh-CN': \{ common: zhCN \}/)
  assert.match(main, /app\.setName\(appName\)/)
  assert.match(main, /app\.dock\.setIcon/)
  assert.match(main, /await initI18n\(\)[\s\S]*initIPC\(\)[\s\S]*createWindow\(\)/)
})

test('ships only the video translation product identity', () => {
  assert.equal((viteConfig.match(/APP_EDITION \|\| 'translation'/g) || []).length, 2)
  assert.doesNotMatch(homeUi, /value="content-create"/)
  assert.match(homeUi, /const isVideoTranslation = computed\(\(\) => true\)/)
  assert.match(main, /const appName = '视频翻译工作台'/)
  assert.doesNotMatch(main, /点一点|translationEdition/)
  assert.match(main, /const userDataPath = path\.join\(appDataPath, 'jc-video-translation-desk'\)/)
  assert.match(main, /const legacyRoots = \['视频翻译工作台', '短视频工厂'/)
  assert.match(main, /if \(!fs\.existsSync\(target\) && source\)[\s\S]*fs\.cpSync\(source, target/)
  assert.match(main, /app\.setPath\('userData', userDataPath\)/)
  assert.match(main, /label: appName/)
  assert.match(rendererMain, /document\.title = '视频翻译工作台'/)
  assert.match(defaultLayout, /<span>视频翻译工作台<\/span>/)
  assert.match(defaultLayout, /video-translation-icon\.png/)
  assert.match(rendererI18n, /appStore\.updateLocale\('zh-CN'\)/)
  assert.match(electronI18n, /lng: 'zh-CN'/)
  assert.match(defaultBuilder, /productName: '视频翻译工作台'/)
  assert.match(defaultBuilder, /appId: 'com\.yils\.video-translation-workbench'/)
  assert.match(packageJson, /"dev": "cross-env APP_EDITION=translation/)
  assert.match(packageJson, /"build": ".*electron-builder\.translation\.json5/)
  assert.match(homeUi, /:translation-final-ready="translationFinalWorkspaceReady"/)
  assert.match(renderUi, /!props\.translationFinalReady/)
  assert.doesNotMatch(renderUi, /activeTranslationVoiceComplete/)
  assert.match(mediaStoreSource, /workspaceEntry = ref<WorkspaceEntry>\('video-translate'\)/)
  assert.match(mediaPersistence, /run\.workspaceEntry = 'video-translate'/)
  assert.match(homeUi, /mdi-cog-outline[\s\S]*textGenerateRef\?\.openConfig\(\)/)
  assert.match(
    homeUi,
    /ref="textGenerateRef"[\s\S]*v-show="!isVideoTranslation && leftPanelVisible"/,
  )
  assert.match(textUi, /defineExpose\(\{ openConfig \}\)/)
  assert.match(textUi, /if \(!hasApiKey\.value\) configDialog\.value = true/)
  assert.match(translationBuilder, /productName: '视频翻译工作台'/)
  assert.match(translationBuilder, /appId: 'com\.yils\.video-translation-workbench'/)
  assert.match(translationBuilder, /video-translation-icon\.png/)
})

test('installs the local subtitle and source-separation engines from the app', () => {
  assert.match(ipc, /funasr-install-status/)
  assert.match(ipc, /funasr-install-progress/)
  assert.match(preload, /installFunAsr/)
  assert.match(preload, /onFunAsrInstallProgress/)
  assert.match(textUi, /本地字幕与人声分离引擎/)
  assert.match(textUi, /一键安装/)
  assert.match(runtimeTools, /resolveBundledUvPath/)
  assert.match(runtimeTools, /runtime-tools.*uv/s)
  assert.match(funAsrInstaller, /resolveBundledUvPath/)
  assert.match(funAsrInstaller, /使用安装包内置 uv/)
  assert.match(funAsrInstaller, /uv.*venv.*--python.*3\.10/s)
  assert.match(funAsrInstaller, /funasr==1\.4\.1/)
  assert.match(funAsrInstaller, /sherpa-onnx==1\.13\.4/)
  assert.match(funAsrInstaller, /rapidocr/)
  assert.match(funAsrInstaller, /rapid-videocr==3\.1\.1/)
  assert.match(funAsrInstaller, /onnxruntime/)
  assert.match(funAsrInstaller, /opencv-python-headless/)
  assert.match(funAsrInstaller, /VIDEO_SUB_FINDER_URL/)
  assert.match(funAsrInstaller, /VideoSubFinder_6\.10_x64\.zip/)
  assert.match(funAsrInstaller, /assertZipArchive/)
  assert.match(funAsrInstaller, /VideoSubFinderWXW\.exe/)
  assert.match(funAsrInstaller, /resolveVideoSubFinderPath/)
  assert.match(videoSubFinder, /resolveVideoSubFinderPath/)
  assert.match(videoSubFinder, /Downloads/)
  assert.match(videoSubFinder, /cachedPath/)
  assert.match(funAsrInstaller, /import rapidocr, rapid_videocr, cv2, onnxruntime/)
  assert.match(funAsrInstaller, /vocals\.fp16\.onnx/)
  assert.match(funAsrInstaller, /accompaniment\.fp16\.onnx/)
  assert.match(funAsrInstaller, /models\/iic--SenseVoiceSmall\/snapshots\/master/)
  assert.match(ffmpeg, /Scripts\/python\.exe/)
  assert.doesNotMatch(ffmpeg, /\/Users\/by3\/Documents\/peiyin-pyvideotrans/)
  assert.match(funAsrInstaller, /runtimePath\(\).*'probe'/s)
  assert.doesNotMatch(funAsrInstaller, /git clone/)
  assert.match(videoTranslationAsr, /PYTHONIOENCODING: 'utf-8'/)
  assert.match(videoTranslationAsr, /PYTHONUTF8: '1'/)
  assert.match(videoTranslationOcr, /--vsf-exe/)
  assert.match(videoTranslationOcr, /resolveVideoSubFinderPath/)
  assert.match(videoTranslationOcr, /未检测到清晰硬字幕/)
  assert.match(videoTranslationOcr, /本地硬字幕识别工具缺失/)
  assert.match(videoTranslationOcr, /rapid-videocr-3\.1\.1-rapidocr-vsf/)
  assert.match(funAsrRuntime, /from rapid_videocr import RapidVideOCR, RapidVideOCRInput/)
  assert.match(funAsrRuntime, /run_videosubfinder/)
  assert.match(funAsrRuntime, /parse_srt/)
  assert.match(funAsrRuntime, /RGBImages/)
  assert.doesNotMatch(funAsrRuntime, /rapidocr-frame-sampler-fallback/)
  assert.match(homeUi, /ocrVideoTranslationSubtitles/)
  assert.doesNotMatch(homeUi, /视频硬字幕识别正在接入/)
})

test('frame calibration uses retryable 20-cue project task batches instead of a hard cue limit', () => {
  assert.match(cloud, /VIDEO_TRANSLATION_FRAME_BATCH_SIZE = 20/)
  assert.match(cloud, /kind: 'frame-calibration'/)
  assert.match(cloud, /readFrameCalibrationBatchResult/)
  assert.match(homeUi, /'frame-calibration': '画面识别人物'/)
  assert.match(homeUi, /画面识别人物会按每批 20 条/)
  assert.doesNotMatch(homeUi, />抽帧校准</)
  assert.doesNotMatch(homeUi, /最多处理 30 条/)
  assert.doesNotMatch(cloud, /最多处理 30 条/)
})

test('bundles Windows runtime tools and never relies on system ffmpeg or ffprobe', () => {
  assert.match(packageJson, /"ffprobe-static": "?\^?3\.1\.0"?/)
  assert.match(defaultBuilder, /dist-native\/runtime-tools/)
  assert.match(beforePack, /UV_VERSION = '0\.12\.3'/)
  assert.match(beforePack, /uv-x86_64-pc-windows-msvc\.zip/)
  assert.match(beforePack, /sha256/)
  assert.match(runtimeTools, /resolveFfmpegPath/)
  assert.match(runtimeTools, /resolveFfprobePath/)
  assert.match(ffmpeg, /resolveFfmpegPath/)
  assert.match(workspace, /resolveFfprobePath/)
  assert.match(workspace, /show_entries', 'format=duration'/)
  assert.match(videoTranslationMain, /resolveFfprobePath\(\)/)
  assert.doesNotMatch(videoTranslationMain, /'ffprobe'/)
  assert.doesNotMatch(videoTranslationMain, /"ffprobe"/)
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

test('keeps VoiceDesign as a post-storyboard single-narrator backend only', () => {
  assert.match(textUi, /mediaStore\.voiceEngine/)
  assert.match(textUi, /value="cloud"/)
  assert.match(textUi, /value="local"/)
  assert.doesNotMatch(homeUi, /generateVoicePlan/)
  assert.doesNotMatch(renderUi, /生成声音方案|请先完成本集配音/)
  assert.match(preload, /cloud-generate-voice[\s\S]*engine/)
  assert.match(ipc, /engine === 'local'[\s\S]*generateLocalVoice[\s\S]*generateCloudVoice/)
  assert.match(localVoice, /spawn\(/)
  assert.doesNotMatch(localVoice, /shell:\s*true|generateCloudVoice|generateVoice\(/)
})

test('exposes two real local voice engines without creating dialogue work early', () => {
  assert.match(textUi, /mediaStore\.localVoiceEngine/)
  assert.match(textUi, /value="qwen3-tts"/)
  assert.match(textUi, /value="indextts2"/)
  assert.match(textUi, /启动服务/)
  assert.match(textUi, /停止服务/)
  assert.match(preload, /indexTtsStart/)
  assert.match(preload, /indexTtsStop/)
  assert.match(ipc, /startIndexTtsService/)
  assert.match(ipc, /stopIndexTtsService/)
  assert.match(mediaUi, /indexTtsReady:\s*true/)
  assert.doesNotMatch(mediaUi, /八种情绪|情绪播放器|逐句待处理|配音完成数/)
})

test('adds the project director gate without changing the seven-stage workflow', () => {
  const renderTemplate = renderUi.slice(0, renderUi.indexOf('<script setup'))
  for (const view of ['文稿', '项目总监', '分镜', '资产', '分镜图/视频', '成片'])
    assert.match(mediaUi, new RegExp(view))
  assert.match(mediaUi, /value="director"/)
  assert.match(renderUi, /生成项目总监方案/)
  assert.match(renderUi, /确认项目总监方案/)
  assert.match(
    renderUi,
    /v-if="mediaStore\.workflowStep === 'assets' && mediaStore\.workspaceView !== 'director'"[\s\S]*?class="action-bar asset-actions"/,
  )
  assert.match(renderUi, /@click="runPrimary"[\s\S]*primaryAction\.label/)
  assert.match(projectDirectorSkill, /app-director/)
  assert.match(projectDirectorSkill, /currentPlan/)
  assert.match(projectDirectorSkill, /productionRoute/)
  assert.match(projectDirectorSkill, /narration-promo/)
  assert.match(projectDirectorSkill, /routeReason/)
  assert.match(mediaUi, /value="narration-promo"/)
  assert.match(mediaUi, /value="drama"/)
  assert.match(mediaUi, /setProjectDirectorRoute/)
  assert.equal((mediaUi.match(/<v-tab\b/g) || []).length, 8)
  assert.doesNotMatch(renderUi, /class="stage-progress"/)
  assert.match(renderUi, /inspector-scroll/)
  assert.match(renderUi, /action-bar/)
  assert.match(renderUi, /修改角色音色提示词/)
  assert.match(renderUi, /确认修改/)
  assert.doesNotMatch(renderUi, /撤销上次 AI 修改|资产生图提示词|文稿状态/)
  assert.match(revisionSkill, /requiresReplan/)
  assert.doesNotMatch(homeUi, /TtsControl/)
  assert.ok(mediaUi.indexOf('value="assets"') < mediaUi.indexOf('value="storyboard"'))
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
  assert.equal((renderTemplate.match(/>生成资产设计 JSON</g) || []).length, 1)
  assert.equal((renderTemplate.match(/搜索下载参考图/g) || []).length, 1)
  assert.equal((renderTemplate.match(/>生成资产图</g) || []).length, 1)
  assert.match(renderTemplate, /seed-full-track' \? '全局配音' : '转分镜'/)
  assert.match(renderUi, /openNextFromAssets/)
  assert.doesNotMatch(renderTemplate, />进入分镜</)
  assert.match(mediaUi, /添加参考图/)
  assert.match(mediaUi, /uploadAssetReference/)
  assert.match(homeUi, /searchAssetImage/)
  const storyboardGeneration = homeUi.slice(
    homeUi.indexOf('async function generateStoryboards'),
    homeUi.indexOf('async function generateVideos'),
  )
  const videoGeneration = homeUi.slice(
    homeUi.indexOf('async function generateVideos'),
    homeUi.indexOf('async function generateMaterialSrts'),
  )
  assert.doesNotMatch(storyboardGeneration, /reloadStoryboardMarkdown/)
  assert.doesNotMatch(videoGeneration, /reloadStoryboardMarkdown/)
  assert.match(cloud, /runReferenceSearchSkill/)
  assert.match(cloud, /contract\.includes\('search_and_download'\)/)
  assert.match(cloud, /generatedBySkill: 'jc-asset-reference-search'/)
  assert.match(referenceSearchSkill, /search_and_download/)
  assert.doesNotMatch(referenceSearchSkill, /generationPrompt|生成资产图/)
  assert.match(homeUi, /validPropDesign/)
  assert.match(
    homeUi,
    /design: withProjectDesign\([\s\S]*asset\.design \|\| existing\?\.design[\s\S]*mediaStore\.ratio/,
  )
  assert.match(homeUi, /searchQuery: asset\.searchQuery \|\| existing\?\.searchQuery/)
  assert.match(homeUi, /searchAssets/)
  assert.match(mediaUi, /removeAssetReferenceVersion/)
  assert.match(mediaUi, /删除参考图/)
  assert.match(mediaUi, /删除当前资产图/)
  assert.match(mediaUi, /removeGeneratedAssetVersion/)
  assert.match(mediaUi, /删除当前结果/)
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
  assert.match(textUi, /v-model="mediaStore\.videoModel"\s+class="text-model-select"/)
  assert.match(
    homeUi,
    /task\.kind === 'video'\) mediaStore\.invalidateShot\(segment\.index, 'video'\)/,
  )
  assert.match(
    homeUi,
    /cloudTasks\.every\(\(item\) => item\.status === 'success'\).*taskDrawerOpen\.value = false/,
  )
  assert.doesNotMatch(videoGeneration, /analyzeMaterialVideo|analyzeShotVideo/)
  assert.match(homeUi, /generateMaterialSrts/)
  assert.match(homeUi, /generateEditingTimeline/)
  assert.match(renderUi, /生成 SRT/)
  assert.match(renderUi, /生成剪辑时间轴/)
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
  assert.match(cloud, /const designJson = JSON\.stringify\(design, null, 2\)/)
  assert.match(cloud, /请结合全部参考图生成，最终内容、画风和比例以资产设计 JSON 为准/)
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
  assert.doesNotMatch(
    workspace,
    /BaseSearchResource|get\/|www\.bing\.com\/images\/search|commons\.wikimedia\.org/,
  )
  assert.match(referenceSearchSkill, /寻找现实视觉参考/)
  assert.match(referenceSearchSkill, /不得加入韩漫、日漫、动画、插画、概念图/)
  assert.match(pinterestReference, /www\.pinterest\.com/)
  assert.match(
    homeUi,
    /assetReferenceSearchQuery\(asset\.searchQuery!, asset\.role, mediaStore\.styleId\)/,
  )
  assert.doesNotMatch(homeUi, /将生成 \$\{pending\.length\} 张资产图/)
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
  assert.ok(
    approve.indexOf('writeMarkdown(') < approve.indexOf('mediaStore.approvedScript = approved'),
  )
  assert.ok(approve.indexOf('writeMarkdown(') < approve.indexOf("mediaStore.selectStep('assets')"))
  assert.match(wikiUi, /<div v-if="loaded">/)
  assert.match(workspace, /确认文稿不能为空/)
})

test('writes the project director Wiki before exposing its confirmed state', () => {
  const confirm = homeUi.slice(
    homeUi.indexOf('async function confirmProjectDirector'),
    homeUi.indexOf('async function runAction'),
  )
  assert.ok(
    confirm.indexOf('writeMarkdown(') < confirm.indexOf('mediaStore.confirmProjectDirector('),
  )
  assert.match(confirm, /wiki\/项目总监\/\$\{mediaStore\.episodeId\}-制作路线\.md/)
  assert.ok(
    confirm.lastIndexOf('writeMarkdown(') < confirm.indexOf('mediaStore.confirmProjectDirector('),
  )
  assert.ok(
    confirm.indexOf('writeAssetDocuments(') < confirm.indexOf('mediaStore.confirmProjectDirector('),
  )
})

test('keeps every paid stage explicit and every result visible in the media library', () => {
  for (const action of ['generateShotPlan', 'generateStoryboards', 'generateVideos', 'compose']) {
    assert.match(renderUi, new RegExp(action))
  }
  assert.match(mediaUi, /<audio[\s\S]*?v-if="mediaStore\.seedAudioTrackPath"/)
  assert.match(mediaUi, /segment\.imagePath/)
  assert.match(mediaUi, /segment\.videoPath/)
  assert.match(mediaUi, /mediaStore\.finalPath/)
  assert.match(mediaUi, /v-tabs|v-btn-toggle/)
  assert.match(mediaUi, /v-dialog/)
  assert.match(mediaUi, /@click="previewMediaAsset\(asset\)"/)
  assert.match(mediaUi, /previewAsset\.value = asset/)
  assert.match(mediaUi, /mediaStore\.referenceAssets/)
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
  assert.equal((mediaUi.match(/<v-tab\b/g) || []).length, 8)
  assert.match(homeUi, /inspector-toggle[\s\S]*inspector-column\.open/)
  assert.match(shotSkill, /单一连续镜头/)
  assert.match(shotSkill, /不得重新推荐、选择或替换导演/)
  assert.match(shotSkill, /原样继承具体导演、代表作和视觉总纲/)
  assert.match(imageSkill, /禁止多宫格、分屏、拼贴、卷轴/)
})

test('implements the multi-asset image contract and discrete video durations', () => {
  assert.match(cloud, /\/v1\/images\/edits/)
  assert.match(cloud, /localReferences\.map\(\(item\) => fs\.createReadStream\(item\)\)/)
  assert.match(cloud, /\[4, 6, 8\]\.includes/)
  assert.match(textUi, /targetDuration/)
  assert.match(textUi, /styleId/)
  assert.doesNotMatch(textUi, /selectCoreReference/)
  assert.match(mediaUi, /uploadAssetReference/)
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

test('keeps style, duration, branding, and app-data contracts explicit', () => {
  assert.match(brandingSdd, /冷暖对比电影/)
  assert.match(brandingSdd, /5..180/)
  assert.match(brandingSdd, /赚钱短片/)
  assert.match(main, /app\.getPath\('appData'\)/)
  assert.match(main, /path\.join\(appDataPath, 'jc-video-translation-desk'\)/)
  assert.match(textUi, /customDuration/)
  assert.match(textUi, /durationInvalid/)
})

test('uses a separated instrument stem for the selectable final sound policy', () => {
  assert.match(ffmpeg, /concat=n=\$\{streams\.length\}:v=1:a=0/)
  assert.match(ffmpeg, /params\.audioMode === 'keep-original'/)
  assert.doesNotMatch(ffmpeg, /\[original\]\[voice\]amix/)
  assert.doesNotMatch(ffmpeg, /sidechaincompress/)
  assert.match(ffmpeg, /\[bg\]\[voice\]amix=inputs=2:duration=first/)
  assert.match(ffmpeg, /loudnorm=I=-24.*aresample=48000\[bg\]/)
  assert.match(ffmpeg, /loudnorm=I=-18.*aresample=48000\[voice\]/)
  assert.match(ffmpeg, /randomUUID\(\).*\.tmp\.wav/)
  assert.match(ffmpeg, /rename\(temporary, target\.mixed\)/)
  assert.match(ffmpeg, /abortSignal\?\.aborted[\s\S]*任务已停止/)
  assert.match(ffmpeg, /instrumentPath/)
  assert.match(ffmpeg, /const timelineDuration = durations\.reduce/)
  assert.match(ffmpeg, /apad=pad_dur=\$\{totalDuration\}/)
  assert.match(ffmpeg, /subtitleCues/)
  assert.match(
    ffmpeg,
    /generateUniqueFileName\(\s*getRunAssetPath\(params\.runId, params\.episodeId, 'final'\),?\s*\)/,
  )
  assert.match(cloud, /generateUniqueFileName\(getRunAssetPath/)
})

test('stores resumable task metadata under the registered project directory', () => {
  assert.match(workspace, /function projectSettingsPath\(\)/)
  assert.match(workspace, /media-projects\.json/)
  assert.match(workspace, /export function resolveProjectRoot/)
  assert.doesNotMatch(workspace, /app\.getPath\('userData'\), 'media-runs', runId/)
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

test('does not save a stale project id before creating or opening a registered project', () => {
  assert.match(homeUi, /function currentProjectRegistered\(\)[\s\S]*projects\.value\.some/)
  const saveBlock = homeUi.slice(
    homeUi.indexOf('async function saveCurrentProject'),
    homeUi.indexOf('async function newProject'),
  )
  assert.match(saveBlock, /currentProjectRegistered\(\)/)
  const persistenceWatcher = homeUi.slice(
    homeUi.lastIndexOf('watch(\n  () => mediaStore.$state'),
    homeUi.indexOf('let taskRefreshTimer'),
  )
  assert.match(persistenceWatcher, /!currentProjectRegistered\(\)/)
})

test('keeps every episode artifact path dynamic outside the one default episode constant', () => {
  const sources = [
    cloud,
    localVoice,
    ipc,
    preload,
    ffmpeg,
    workspace,
    homeUi,
    mediaStoreSource,
    mediaPersistence,
    materialTranscriptMain,
    indexTts,
    productionContract.replace("export const DEFAULT_EPISODE_ID = 'episode-001'", ''),
  ]
  for (const source of sources) assert.doesNotMatch(source, /episode-001/)
  assert.match(workspace, /getEpisodeDir\(projectId, episodeId\)/)
  assert.match(workspace, /shared-state\.json/)
  assert.match(mediaUi, /wiki\/文稿\/\$\{mediaStore\.episodeId\}\/确认文稿\.md/)
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
