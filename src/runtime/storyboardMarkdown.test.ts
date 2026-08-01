import assert from 'node:assert/strict'
import test from 'node:test'
import { assetGenerationChanged, assetVersionMatches, mergeStoryboardMedia, parseStoryboardMarkdown, sameJsonValue, withProjectDesign } from './storyboardMarkdown.ts'

test('parses director, shot and linked asset Markdown into the media contract', () => {
  const director = {
    path: 'wiki/分镜/导演总览.md',
    content: `# 导演分镜总览
## 创作依据
- 导演身份：芬奇 + 社交网络
- 参考场景：开场对话
- 节奏档案：快速反打
- 分发意图：首秒钩子
## 全局视觉锚点
冷暖电影光
## 节奏方案
- 最终节奏：fast
- 最终镜头数：1
- 数量理由：单句单镜`,
  }
  const asset = {
    path: 'wiki/资产/角色/character-host.md',
    content: `---
entityId: character-host
assetRole: character
---
# 主持人
## 说明
主要人物
## 身份特征
- 绿色夹克
## 风格要求
- 冷暖电影光
## 资产设计 JSON
\`\`\`json
{"project":{"visualStyle":"冷暖电影光","aspectRatio":"9:16"},"character":{"name":"主持人"}}
\`\`\`
## 参考图搜索词
live action host full body cast portrait`,
  }
  const shot = {
    path: 'wiki/分镜/镜头/shot-001.md',
    content: `# 镜头 01
## 镜头参数
- 叙事作用：开场钩子
- 镜头职责：hook
- 剪辑处理：progression
- 播放时长：4 秒
- 生成时长：4 秒
- 景别：近景
- 机位：平视
- 运镜：推近
- 资产：[[资产/角色/character-host|主持人]]
## 对应台词
你好
## 起始状态
站立
## 动作过程
抬手
## 结束状态
定格
## 画面提示词
主持人近景
## 视频提示词
单一连续镜头，无切镜，无转场，无背景音乐。`,
  }
  const result = parseStoryboardMarkdown(director, [shot], [asset], '你好', 4, 'fast')
  assert.equal(result.plan.segments[0].storyboardImagePrompt, '主持人近景')
  assert.deepEqual(result.plan.segments[0].referenceAssetIds, ['character-host'])
  assert.equal((result.assets[0].design?.project as { aspectRatio: string }).aspectRatio, '9:16')
  assert.equal(result.assets[0].searchQuery, 'live action host full body cast portrait')
})

test('adds fixed single-shot constraints to a natural-language video prompt', () => {
  const director = {
    path: 'wiki/分镜/导演总览.md',
    content: `# 导演分镜总览
## 创作依据
- 导演身份：芬奇 + 社交网络
## 全局视觉锚点
电影光
## 节奏方案
- 最终节奏：fast
- 最终镜头数：1`,
  }
  const shot = {
    path: 'wiki/分镜/镜头/shot-001.md',
    content: `# 镜头 01
## 镜头参数
- 镜头职责：hook
- 剪辑处理：progression
- 播放时长：4 秒
- 生成时长：4 秒
- 资产：无
## 对应台词
你好
## 画面提示词
主持人近景
## 视频提示词
镜头持续推近主持人。`,
  }
  const result = parseStoryboardMarkdown(director, [shot], [], '你好', 4, 'fast')
  assert.match(result.plan.segments[0].videoPrompt, /单一连续镜头，无切镜，无转场，无背景音乐/)
})

test('restores approved punctuation without accepting rewritten narration', () => {
  const director = {
    path: 'wiki/分镜/导演总览.md',
    content: `# 导演分镜总览
## 全局视觉锚点
电影光
## 节奏方案
- 最终节奏：fast
- 最终镜头数：1`,
  }
  const shot = {
    path: 'wiki/分镜/镜头/shot-001.md',
    content: `# 镜头 01
## 镜头参数
- 镜头职责：hook
- 剪辑处理：progression
- 播放时长：4 秒
- 生成时长：4 秒
- 资产：无
## 对应台词
你好。
## 画面提示词
近景
## 视频提示词
持续推近。`,
  }
  const restored = parseStoryboardMarkdown(director, [shot], [], '你，好！', 4, 'fast')
  assert.equal(restored.plan.segments[0].script, '你，好！')
  assert.throws(
    () => parseStoryboardMarkdown(director, [{ ...shot, content: shot.content.replace('你好。', '您好。') }], [], '你，好！', 4, 'fast'),
    /没有完整覆盖/,
  )
})

test('preserves paid media only while the shot inputs stay unchanged', () => {
  const base: any = {
    index: 1,
    storyBeat: '钩子',
    shotRole: 'hook',
    editTreatment: 'progression',
    playDuration: 4,
    generationDuration: 4,
    script: '你好',
    referenceAssetIds: [],
    shotSize: '近景',
    cameraAngle: '平视',
    cameraMovement: '推近',
    startState: '站立',
    actionProgression: '抬手',
    endState: '定格',
    storyboardImagePrompt: '画面 A',
    videoPrompt: '视频 A',
  }
  const existing = {
    ...base,
    imagePath: 'storyboards/001.png',
    videoPath: 'clips/001.mp4',
    imageStatus: 'success',
    videoStatus: 'success',
  }
  assert.equal(mergeStoryboardMedia([base], [existing])[0].videoPath, 'clips/001.mp4')
  const changed = mergeStoryboardMedia([{ ...base, storyboardImagePrompt: '画面 B' }], [existing])[0]
  assert.equal(changed.imagePath, '')
  assert.equal(changed.videoPath, '')
})

test('distinguishes asset generation changes from descriptive edits', () => {
  const previous: any = {
    identityTraits: ['短发'],
    styleRequirements: ['电影光'],
    design: { project: { visualStyle: '电影光', aspectRatio: '9:16' } },
    description: '旧说明',
  }
  assert.equal(assetGenerationChanged({ ...previous, description: '新说明' }, previous), false)
  assert.equal(
    assetGenerationChanged(
      { ...previous, design: { project: { visualStyle: '粘土', aspectRatio: '9:16' } } },
      previous,
    ),
    true,
  )
  assert.equal(
    sameJsonValue(
      { project: { visualStyle: '电影光', aspectRatio: '9:16' }, scene: { name: '书房' } },
      { scene: { name: '书房' }, project: { aspectRatio: '9:16', visualStyle: '电影光' } },
    ),
    true,
  )
  assert.equal(
    assetVersionMatches(
      { ...previous, referenceRevision: 2 },
      {
        source: 'generated',
        designFingerprint: JSON.stringify({ project: { aspectRatio: '9:16', visualStyle: '电影光' } }),
        referenceRevision: 2,
      } as any,
    ),
    true,
  )
})

test('restores current project style and ratio on incomplete Wiki asset designs', () => {
  assert.deepEqual(
    withProjectDesign({ scene: { name: '书房' } }, '真人电影感', '9:16'),
    {
      scene: { name: '书房' },
      project: { visualStyle: '真人电影感', aspectRatio: '9:16' },
    },
  )
})
