import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateDuration,
  generationDurationFor,
  hashScript,
  parseStoryboardPlan,
  parseVoiceDesign,
  unfinishedSegments,
} from './videoWorkflow.ts'

test('estimates 200 Chinese characters as 60 seconds', () => {
  assert.equal(estimateDuration('字'.repeat(200)), 60)
})

test('freezes an approved script with a stable SHA-256 hash', async () => {
  assert.equal(await hashScript(' 文稿 '), await hashScript('文稿'))
  assert.equal((await hashScript('文稿')).length, 64)
})

test('accepts a complete eight-part 60 second storyboard', () => {
  const parts = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。', '辛。']
  const script = parts.join('')
  const plan = parseStoryboardPlan(
    {
      visualAnchor: '统一写实风格',
      segments: parts.map((text, index) => ({
        index: index + 1,
        playDuration: 7.5,
        generationDuration: 8,
        script: text,
        coreReferenceVisible: true,
        storyboardImagePrompt: `图${index + 1}`,
        videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
      })),
    },
    script,
    60,
  )
  assert.equal(plan.segments.length, 8)
})

test('requires an additional segment when real voice duration exceeds 64 seconds', () => {
  const parts = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。', '辛。', '壬。']
  const script = parts.join('')
  const plan = parseStoryboardPlan(
    {
      visualAnchor: '统一写实风格',
      segments: parts.map((text, index) => ({
        playDuration: 65 / 9,
        generationDuration: 8,
        script: text,
        coreReferenceVisible: false,
        storyboardImagePrompt: `图${index + 1}`,
        videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
      })),
    },
    script,
    65,
  )
  assert.equal(plan.segments.length, 9)
})

test('requires the five voice-design fields in their fixed order', () => {
  const text = '测试文稿'
  const result = parseVoiceDesign(
    {
      text,
      voicePrompt:
        '【人设】讲解者。【音色特征】清晰温润。【风格】自然可信。【情感】克制亲和。【节奏】重点放慢。',
    },
    text,
  )
  assert.equal(result.text, text)
})

test('rejects a video segment that asks Veo to cut between shots', () => {
  assert.throws(
    () =>
      parseStoryboardPlan(
        {
          visualAnchor: '统一写实风格',
          segments: [
            {
              playDuration: 4,
              generationDuration: 4,
              script: '测试文稿',
              coreReferenceVisible: false,
              storyboardImagePrompt: '单幅首帧',
              videoPrompt: '先展示产品，再切镜到工厂，无背景音乐',
            },
          ],
        },
        '测试文稿',
        4,
      ),
    /单一连续镜头/,
  )
})

test('maps timeline durations to the smallest supported Veo duration', () => {
  assert.equal(generationDurationFor(4), 4)
  assert.equal(generationDurationFor(4.1), 6)
  assert.equal(generationDurationFor(6.1), 8)
  assert.throws(() => generationDurationFor(8.1), /超过/)
})

test('rejects non-discrete Veo generation durations', () => {
  assert.throws(
    () =>
      parseStoryboardPlan(
        {
          visualAnchor: '统一写实风格',
          segments: [
            {
              playDuration: 6,
              generationDuration: 7,
              script: '测试文稿',
              coreReferenceVisible: true,
              storyboardImagePrompt: '单幅首帧',
              videoPrompt: '单一连续镜头，无切镜，无背景音乐',
            },
          ],
        },
        '测试文稿',
        6,
      ),
    /4、6 或 8/,
  )
})

test('rejects a larger Veo duration when a smaller supported duration covers the shot', () => {
  assert.throws(
    () =>
      parseStoryboardPlan(
        {
          visualAnchor: '统一写实风格',
          segments: [
            {
              playDuration: 4,
              generationDuration: 8,
              script: '测试文稿',
              coreReferenceVisible: false,
              storyboardImagePrompt: '单幅首帧',
              videoPrompt: '单一连续镜头，无切镜，无背景音乐',
            },
          ],
        },
        '测试文稿',
        4,
      ),
    /最小模型时长/,
  )
})

test('stage retries exclude already successful paid tasks', () => {
  const segments = [
    { index: 1, imageStatus: 'success', videoStatus: 'success' },
    { index: 2, imageStatus: 'failed', videoStatus: 'failed' },
  ] as any
  assert.deepEqual(unfinishedSegments(segments, 'image').map((item) => item.index), [2])
  assert.deepEqual(unfinishedSegments(segments, 'video').map((item) => item.index), [2])
})
