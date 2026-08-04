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

  assert.match(render, /label: '配音字幕'/)
  assert.match(render, /label: '配音字幕'[\s\S]*enabled: mediaStore\.allVideosReady/)
  assert.match(manage, /v-if="mediaStore\.allVideosReady" value="dubbing"/)
  assert.match(render, /repeat\(7,\s*minmax\(0,\s*1fr\)\)/)
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
  assert.match(render, /v-else-if="mediaStore\.workflowStep !== 'voice'" class="action-bar"/)
  assert.match(workspace, /@click="selectSegment\(segment\.index\)"/)
  assert.match(workspace, /@timeupdate="stopAtSelectedEnd"/)
  assert.match(home, /const dubbingLeftOpen = ref\(false\)/)
  assert.match(home, /const dubbingRightOpen = ref\(true\)/)
  assert.match(home, /v-show="leftPanelVisible"/)
  assert.match(home, /v-show="rightPanelVisible"/)
  for (const column of ['时间轴', '视频片段预览', '角色', '配音试听', '中文字幕', '英文字幕'])
    assert.match(workspace, new RegExp(column))
  for (const action of [
    '重选剪辑点',
    '生成中文配音',
    '翻译所有字幕',
    '生成英语配音',
    '分离原人声和背景声',
    '去除原人声',
    '混回背景声、环境声和动作音',
    '烧录配音和字幕',
  ]) assert.match(render, new RegExp(action))
  for (const forbidden of ['保存字幕', '确认最终时间轴', '试听最终混音', '设为入点', '设为出点'])
    assert.doesNotMatch(workspace + render, new RegExp(forbidden))
})
