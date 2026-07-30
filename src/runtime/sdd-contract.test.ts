import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
const cloud = read('electron/cloud.ts')
const ffmpeg = read('electron/ffmpeg/index.ts')
const workspace = read('electron/media-workspace.ts')
const baseStyle = read('src/assets/base.scss')
const homeUi = read('src/views/Home/index.vue')
const main = read('electron/main.ts')
const textUi = read('src/views/Home/components/TextGenerate.vue')
const renderUi = read('src/views/Home/components/VideoRender.vue')
const mediaUi = read('src/views/Home/components/VideoManage.vue')
const shotSkill = read('skills/jc-script-storyboard/SKILL.md')
const imageSkill = read('skills/jc-gpt-image/SKILL.md')
const scriptSkill = read('skills/jc-media-script/SKILL.md')

test('locks the API and fixed models to the SDD values', () => {
  assert.match(cloud, /TEXT_MODEL = 'gemini-3\.6-flash'/)
  assert.match(cloud, /model: 'gpt-image-2'/)
  assert.match(cloud, /model: 'veo-3\.1-generate-preview'/)
  assert.match(cloud, /model: 'rh-aiapp-voice-design'/)
  assert.match(textUi, /:model-value="API_URL"\s+readonly/)
  assert.doesNotMatch(textUi, /modelName|模型名称/)
  assert.match(cloud, /上次输出不是合法 JSON，请严格修正/)
  assert.match(cloud, /'jc-media-script', 'jc-script-storyboard', 'jc-gpt-image', 'jc-voice-design'/)
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

test('keeps every paid stage explicit and every result visible in the media library', () => {
  for (const action of [
    'generateVoicePlan',
    'generateVoice',
    'generateStoryboards',
    'generateVideos',
    'compose',
  ]) {
    assert.match(renderUi, new RegExp(`\\$emit\\('${action}'\\)`))
  }
  assert.match(mediaUi, /<audio controls/)
  assert.match(mediaUi, /segment\.imagePath/)
  assert.match(mediaUi, /segment\.videoPath/)
  assert.match(mediaUi, /mediaStore\.finalPath/)
  assert.match(mediaUi, /v-tabs|v-btn-toggle/)
  assert.match(mediaUi, /v-dialog/)
  assert.match(mediaUi, /workflow\.library\.storyboardPrompt/)
  assert.match(mediaUi, /workflow\.library\.regenerateStoryboard/)
  assert.match(mediaUi, /veo-3\.1-generate-preview/)
  assert.match(baseStyle, /#app\s*\{\s*height: 100%/)
  assert.match(homeUi, /grid-rows-\[minmax\(0,1fr\)\]/)
  assert.match(homeUi, /'jc-script-storyboard'[\s\S]*'jc-gpt-image'/)
  assert.match(shotSkill, /单一连续镜头/)
  assert.match(imageSkill, /禁止多宫格、分屏、拼贴、卷轴/)
})

test('implements the single-core-reference image contract and discrete video durations', () => {
  assert.match(cloud, /\/v1\/images\/edits/)
  assert.match(cloud, /fs\.createReadStream\(localReference\)/)
  assert.match(cloud, /\[4, 6, 8\]\.includes/)
  assert.match(textUi, /targetDuration/)
  assert.match(textUi, /styleId/)
  assert.match(textUi, /selectCoreReference/)
  assert.match(main, /short-video-media/)
  assert.match(main, /assertRunAsset/)
  assert.doesNotMatch(
    homeUi.slice(homeUi.indexOf('const skillInput'), homeUi.indexOf("'jc-script-storyboard'")),
    /relativePath/,
  )
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
