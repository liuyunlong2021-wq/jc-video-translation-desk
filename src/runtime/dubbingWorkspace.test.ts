import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')

test('provides the seven-stage dubbing and subtitle workspace skeleton', () => {
  const render = read('src/views/Home/components/VideoRender.vue')
  const manage = read('src/views/Home/components/VideoManage.vue')
  const workspace = read('src/views/Home/components/DubbingSubtitleWorkspace.vue')
  const home = read('src/views/Home/index.vue')
  const store = read('src/store/mediaTask.ts')

  assert.match(manage, /v-if="mediaStore\.allVideosReady" value="dubbing">配音字幕/)
  assert.doesNotMatch(render, /class="stage-progress"/)
  assert.match(render, /selectStep\('voice'\)/)
  assert.match(store, /export type WorkspaceView = [^\n]*dubbing/)
  assert.match(store, /step === 'voice'\s*\? 'dubbing'/)
  assert.match(manage, /DubbingSubtitleWorkspace/)
  assert.match(manage, /\.dubbing-view\s*\{[\s\S]*overflow: hidden;/)
  assert.match(workspace, /mediaStore\.ratio === '9:16' \? 'portrait-layout' : 'landscape-layout'/)
  assert.match(workspace, /\.landscape-layout\s*\{\s*grid-template-columns:/)
  assert.doesNotMatch(workspace, /@container/)
  assert.match(workspace, /\.dubbing-table-wrap\s*\{[^}]*min-height: 0;[^}]*overflow: auto;/)
  assert.match(workspace, /\.dubbing-table th\s*\{[^}]*position: sticky;/)
  assert.match(workspace, /:disabled="!mediaStore\.allEditingReady"/)
  assert.match(
    render,
    /mediaStore\.workflowStep !== 'voice'\s*&&\s*mediaStore\.workspaceView !== 'final'/,
  )
  assert.match(workspace, /@click="selectSegment\(segment\.index\)"/)
  assert.match(workspace, /@timeupdate="stopAtSelectedEnd"/)
  assert.match(home, /const dubbingRightOpen = ref\(true\)/)
  assert.match(
    home,
    /leftPanelVisible = computed\(\(\) => mediaStore\.workspaceView === 'script'\)/,
  )
  assert.match(
    home,
    /!isFinalWorkspace\.value && \(!isDubbingWorkspace\.value \|\| dubbingRightOpen\.value\)/,
  )
  assert.match(home, /v-show="!isVideoTranslation && leftPanelVisible"/)
  assert.match(home, /v-show="rightPanelVisible"/)
  assert.match(manage, /尚未生成成片，请在配音字幕工作台完成烧录。/)
  assert.doesNotMatch(manage, /所有单镜视频完成后即可合成。/)
  assert.match(render, /class="dubbing-action"/)
  assert.match(render, /min-height: 44px;/)
  for (const column of ['时间轴', '视频片段预览', '角色', '配音试听', '中文字幕', '英文字幕'])
    assert.match(workspace, new RegExp(column))
  for (const action of [
    '生成中文配音',
    '翻译所有字幕',
    '生成英语配音',
    '分离原人声和背景声',
    '去除原人声',
    '混回背景声、环境声和动作音',
    '烧录配音和字幕',
  ])
    assert.match(render, new RegExp(action))
  assert.doesNotMatch(render, />音频模式</)
  assert.doesNotMatch(render, />成片语言</)
  assert.match(workspace, /function speakerLabel/)
  assert.match(workspace, /#t=\$\{rangeFor\(segment\)\.start\}/)
  assert.match(workspace, /待生成 SRT/)
  assert.match(workspace, /待生成剪辑时间轴/)
  for (const forbidden of ['保存字幕', '确认最终时间轴', '试听最终混音', '设为入点', '设为出点'])
    assert.doesNotMatch(workspace + render, new RegExp(forbidden))
})

test('connects subtitle editing, translation, and per-line voice playback', () => {
  const render = read('src/views/Home/components/VideoRender.vue')
  const workspace = read('src/views/Home/components/DubbingSubtitleWorkspace.vue')
  const home = read('src/views/Home/index.vue')

  assert.match(workspace, /<textarea[^>]*:value="segment\.dialogueText"/)
  assert.match(workspace, /readonly[^>]*:value="segment\.englishDialogueText"/)
  assert.match(workspace, /chineseVoicePath/)
  assert.match(workspace, /englishVoicePath/)
  assert.match(workspace, /<audio/)
  assert.match(render, /@click="action\.event && emit\(action\.event\)"/)
  assert.match(home, /@generate-chinese-voice="generateChineseVoice"/)
  assert.match(home, /@translate-subtitles="translateAllSubtitles"/)
  assert.match(home, /@generate-english-voice="generateEnglishVoice"/)
  assert.match(home, /writeEpisodeSubtitles/)
})

test('connects the four audio processing and final video actions', () => {
  const render = read('src/views/Home/components/VideoRender.vue')
  const home = read('src/views/Home/index.vue')

  for (const event of [
    'separateSourceAudio',
    'removeOriginalVocal',
    'mixBackgroundAudio',
    'burnVoiceAndSubtitles',
  ]) {
    assert.match(render, new RegExp(`event: '${event}'`))
    assert.match(
      home,
      new RegExp(`@${event.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}=`),
    )
  }
  assert.match(render, /const selectedVoice = mediaStore\.voicePath \|\| mediaStore\.englishVoicePath/)
  assert.match(home, /const voiceFile =[\s\S]*mediaStore\.voicePath \|\| mediaStore\.englishVoicePath/)
  assert.doesNotMatch(render, /分离原人声和背景声（后续接入）/)
  assert.doesNotMatch(render, /混回背景声、环境声和动作音（后续接入）/)
})
