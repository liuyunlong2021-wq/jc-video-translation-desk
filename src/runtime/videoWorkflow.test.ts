import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateDuration,
  expectedShotCount,
  generateValidatedPlan,
  generationDurationFor,
  hashScript,
  isValidTargetDuration,
  parseAssetPlan,
  parseStoryboardPlan,
  parseRevisionProposal,
  parseVoiceDesign,
  unfinishedSegments,
  assetReferenceSearchQuery,
  buildGrokSequences,
  grokGenerationDuration,
  grokReferenceGuide,
  grokStoryboardBoardInstruction,
  isCombinedVideoModel,
  videoSoundInstruction,
  videoPromptWithSound,
} from './videoWorkflow.ts'

test('builds one validated sound instruction for Veo and Grok prompts', () => {
  const onscreen = {
    index: 5,
    soundType: 'onscreen' as const,
    speakerId: 'asset-character-host',
    dialogueText: '点一点',
    dialogueEmotion: '惊喜',
    videoPrompt: '单一连续镜头，无切镜，无背景音乐',
  } as any
  assert.match(videoPromptWithSound(onscreen), /角色 asset-character-host 自然说出：“点一点”/)
  assert.match(videoSoundInstruction({
    index: 1,
    soundType: 'voiceover',
    speakerId: 'narrator-male',
    dialogueText: '一分钟做完一条片。',
  }), /按分镜提示词正常生成对应的人声/)
  assert.doesNotMatch(videoSoundInstruction({
    index: 1,
    soundType: 'voiceover',
    speakerId: 'narrator-male',
    dialogueText: '一分钟做完一条片。',
  }), /不得生成人声/)
  assert.throws(() => videoSoundInstruction({ index: 2, soundType: 'onscreen' }), /说话者 ID 或确认原文/)
})

test('groups Grok shots into bounded multi-cut sequences', () => {
  assert.equal(isCombinedVideoModel('rh-grok-image-video'), true)
  assert.equal(isCombinedVideoModel('rh-seedance2'), true)
  assert.equal(isCombinedVideoModel('veo-3.1-generate-preview'), false)
  assert.equal(grokGenerationDuration(5.1), 6)
  assert.equal(grokGenerationDuration(30), 30)
  const segments = Array.from({ length: 4 }, (_, index) => ({
    index: index + 1,
    playDuration: 8,
    referenceAssetIds: [`asset-${index}`],
  })) as any
  const before = structuredClone(segments)
  const sequences = buildGrokSequences(segments)
  assert.equal(sequences.length, 2)
  assert.equal(sequences[0].generationDuration, 24)
  assert.deepEqual(segments, before)
})

test('describes an exact free-layout Grok storyboard and the real reference order', () => {
  const instruction = grokStoryboardBoardInstruction(7)
  assert.match(instruction, /准确 7 幅/)
  assert.match(instruction, /版式自行安排/)
  assert.doesNotMatch(instruction, /3x3|九宫格/)
  assert.throws(() => grokStoryboardBoardInstruction(10), /1 到 9/)

  const references = grokReferenceGuide([
    { id: 'scene-studio', role: 'scene', label: '工作室' },
    { id: 'character-host', role: 'character', label: '陈大发' },
    { id: 'prop-phone', role: 'prop', label: '手机' },
  ], true)
  assert.match(references, /参考图1：组合分镜板/)
  assert.match(references, /参考图2：场景“工作室”（scene-studio）/)
  assert.match(references, /参考图3：角色“陈大发”（character-host）/)
  assert.match(references, /参考图4：道具“手机”（prop-phone）/)
})

test('searches broad live-action references without carrying the project art style', () => {
  assert.equal(
    assetReferenceSearchQuery('anxious office worker', 'character', 'cinematic-contrast'),
    'anxious office worker film character portrait full body',
  )
  assert.equal(
    assetReferenceSearchQuery('dark webtoon digital creator studio workspace interior blue ambient glow environment concept art background art', 'scene', 'korean-webtoon-dark'),
    'digital creator studio workspace interior film still wide shot',
  )
  assert.equal(
    assetReferenceSearchQuery('old smartphone', 'prop', 'handmade-clay'),
    'old smartphone movie prop close up',
  )
  assert.equal(
    assetReferenceSearchQuery('Korean webtoon male artist black hoodie character sheet', 'character', 'korean-webtoon-cinematic'),
    'male artist black hoodie film character portrait full body',
  )
})

test('validates a storyboard asset plan and preserves shot references', () => {
  const plan = parseAssetPlan({
    assetPlan: [
      {
        assetKey: 'character:host',
        role: 'character',
        label: '主持人',
        description: '主角',
        identityTraits: ['短发'],
        styleRequirements: ['粘土'],
        required: true,
      },
      {
        assetKey: 'scene:studio',
        role: 'scene',
        label: '演播室',
        description: '主要场景',
        required: true,
      },
    ],
    shots: [{ assetKeys: ['scene:studio', 'character:host'] }],
  })
  assert.deepEqual(plan.shotAssetKeys, [['scene:studio', 'character:host']])
  assert.throws(
    () => parseAssetPlan({ assetPlan: [], shots: [{ assetKeys: ['missing'] }] }),
    /资产计划/,
  )
  assert.throws(
    () =>
      parseAssetPlan({
        assetPlan: [{ assetKey: 'product:legacy', role: 'product', label: '旧产品', description: '旧类型' }],
        shots: [{ assetKeys: ['product:legacy'] }],
      }),
    /资产类型无效/,
  )
})

test('estimates 200 Chinese characters as 60 seconds', () => {
  assert.equal(estimateDuration('字'.repeat(200)), 60)
})

test('accepts only integer target durations from 5 to 180 seconds', () => {
  assert.equal(isValidTargetDuration(5), true)
  assert.equal(isValidTargetDuration(180), true)
  assert.equal(isValidTargetDuration(4), false)
  assert.equal(isValidTargetDuration(181), false)
  assert.equal(isValidTargetDuration(15.5), false)
})

test('freezes an approved script with a stable SHA-256 hash', async () => {
  assert.equal(await hashScript(' 文稿 '), await hashScript('文稿'))
  assert.equal((await hashScript('文稿')).length, 64)
})

test('accepts a complete slow-paced 60 second storyboard', () => {
  const parts = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。', '辛。', '壬。']
  const script = parts.join('')
  const plan = parseStoryboardPlan(
    {
      resolvedPace: 'slow',
      visualAnchor: '统一写实风格',
      segments: parts.map((text, index) => ({
        index: index + 1,
        playDuration: 60 / 9,
        generationDuration: 8,
        script: text,
        coreReferenceVisible: true,
        storyboardImagePrompt: `图${index + 1}`,
        videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
      })),
    },
    script,
    60,
    'slow',
  )
  assert.equal(plan.segments.length, 9)
})

test('slow pacing adds another segment after 63 seconds', () => {
  const parts = ['甲。', '乙。', '丙。', '丁。', '戊。', '己。', '庚。', '辛。', '壬。', '癸。']
  const script = parts.join('')
  const plan = parseStoryboardPlan(
    {
      resolvedPace: 'slow',
      visualAnchor: '统一写实风格',
      segments: parts.map((text, index) => ({
        playDuration: 65 / 10,
        generationDuration: 8,
        script: text,
        coreReferenceVisible: false,
        storyboardImagePrompt: `图${index + 1}`,
        videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
      })),
    },
    script,
    65,
    'slow',
  )
  assert.equal(plan.segments.length, 10)
})

test('maps 15 seconds to three, four, or six independent shots', () => {
  assert.equal(expectedShotCount(15, 'slow'), 3)
  assert.equal(expectedShotCount(15, 'medium'), 4)
  assert.equal(expectedShotCount(15, 'fast'), 6)
})

test('accepts a director-selected shot count that differs from the pace estimate', () => {
  const parts = ['甲', '乙', '丙', '丁', '戊']
  const plan = parseStoryboardPlan(
    {
      resolvedPace: 'fast',
      visualAnchor: '统一写实风格',
      segments: parts.map((script, index) => ({
        playDuration: 2,
        generationDuration: 4,
        script,
        coreReferenceVisible: false,
        storyboardImagePrompt: `图${index + 1}`,
        videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
      })),
    },
    parts.join(''),
    10,
    'fast',
  )
  assert.equal(expectedShotCount(10, 'fast'), 4)
  assert.equal(plan.segments.length, 5)
})

test('retries one invalid plan with the validation error', async () => {
  const errors: string[] = []
  const plan = await generateValidatedPlan(
    async (validationError) => {
      errors.push(validationError)
      return { visualAnchor: errors.length === 1 ? '' : '统一视觉锚点' }
    },
    (value) => {
      if (!value.visualAnchor) throw new Error('分镜方案缺少全局一致性锚点')
    },
  )
  assert.equal(plan.visualAnchor, '统一视觉锚点')
  assert.deepEqual(errors, ['', '分镜方案缺少全局一致性锚点'])
})

test('auto pacing accepts one resolved pace while fixed pacing cannot drift', () => {
  const value = {
    resolvedPace: 'fast',
    visualAnchor: '统一写实风格',
    segments: Array.from({ length: 4 }, (_, index) => ({
      playDuration: 2.5,
      generationDuration: 4,
      script: '字',
      coreReferenceVisible: false,
      storyboardImagePrompt: `图${index + 1}`,
      videoPrompt: `视频${index + 1}，单一连续镜头，无切镜，无背景音乐`,
    })),
  }
  assert.equal(parseStoryboardPlan(value, '字字字字', 10, 'auto').resolvedPace, 'fast')
  assert.throws(() => parseStoryboardPlan(value, '字字字字', 10, 'medium'), /用户选择/)

  const { resolvedPace: _omitted, ...missingPace } = value
  assert.equal(parseStoryboardPlan(missingPace, '字字字字', 10, 'auto').resolvedPace, 'fast')
  assert.throws(() => parseStoryboardPlan(missingPace, '字字字字', 10, 'medium'), /最终镜头节奏/)
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
          resolvedPace: 'slow',
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
        'slow',
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
          resolvedPace: 'slow',
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
        'slow',
      ),
    /4、6 或 8/,
  )
})

test('rejects a larger Veo duration when a smaller supported duration covers the shot', () => {
  assert.throws(
    () =>
      parseStoryboardPlan(
        {
          resolvedPace: 'slow',
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
        'slow',
      ),
    /最小模型时长/,
  )
})

test('stage retries exclude already successful paid tasks', () => {
  const segments = [
    { index: 1, imageStatus: 'success', videoStatus: 'success', editingStatus: 'ready' },
    { index: 2, imageStatus: 'failed', videoStatus: 'failed' },
  ] as any
  assert.deepEqual(
    unfinishedSegments(segments, 'image').map((item) => item.index),
    [2],
  )
  assert.deepEqual(
    unfinishedSegments(segments, 'video').map((item) => item.index),
    [2],
  )
})

test('preserves the complete director document and reference bindings', () => {
  const plan = parseStoryboardPlan(
    {
      creativeIdentity: '大卫·芬奇《社交网络》开场审讯式对话节奏',
      sceneReference: '用快速信息推进建立钩子',
      rhythmArchive: '近景与插入镜头交替',
      distributionIntent: '首秒结果，结尾回收',
      resolvedPace: 'fast',
      referenceShotCount: 2,
      finalShotCount: 1,
      shotCountRationale: '单一连续动作更适合长镜',
      visualAnchor: '冷暖对比电影光',
      segments: [
        {
          index: 1,
          storyBeat: '展示产品结果',
          shotRole: 'hook',
          editTreatment: 'hold',
          playDuration: 4,
          generationDuration: 4,
          script: '测试文稿',
          coreReferenceVisible: true,
          referenceAssetIds: ['core-1'],
          shotSize: '近景',
          cameraAngle: '平视',
          cameraMovement: '缓慢推进',
          startState: '产品居中',
          actionProgression: '镜头推进',
          endState: '标识清晰',
          storyboardImagePrompt: '产品单幅首帧',
          videoPrompt: '单一连续镜头，无切镜，无背景音乐',
        },
      ],
    },
    '测试文稿',
    4,
    'fast',
  )
  assert.equal(plan.creativeIdentity.startsWith('大卫·芬奇'), true)
  assert.equal(plan.finalShotCount, 1)
  assert.deepEqual(plan.segments[0].referenceAssetIds, ['core-1'])
  assert.equal(plan.segments[0].cameraMovement, '缓慢推进')
})

test('rejects mismatched final shot counts and revision targets', () => {
  assert.throws(
    () =>
      parseStoryboardPlan(
        {
          resolvedPace: 'slow',
          finalShotCount: 2,
          visualAnchor: '锚点',
          segments: [
            {
              playDuration: 4,
              generationDuration: 4,
              script: '文稿',
              coreReferenceVisible: false,
              storyboardImagePrompt: '图',
              videoPrompt: '单一连续镜头，无切镜，无背景音乐',
            },
          ],
        },
        '文稿',
        4,
        'slow',
      ),
    /最终镜头数/,
  )
  assert.throws(
    () => parseRevisionProposal({ targetType: 'shot', targetId: '2', revised: {} }, 'shot', '1'),
    /目标/,
  )
})
