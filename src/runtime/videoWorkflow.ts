import type {
  ResolvedShotPace,
  ShotPace,
  TargetDuration,
  VideoRatio,
  VisualStyleId,
  AssetRole,
} from '~/electron/types'

export const VIDEO_RATIOS: VideoRatio[] = ['9:16', '16:9']
export const TARGET_DURATIONS: TargetDuration[] = [15, 30, 60]
export const TARGET_DURATION_MIN = 5
export const TARGET_DURATION_MAX = 180
export const VISUAL_STYLE_GROUPS = [
  {
    label: '真人',
    styles: [
      {
        id: 'cinematic-contrast',
        label: '冷暖对比电影',
        prompt:
          '暖色主体光、冷色环境光，中高反差，真实肤色和材质，克制电影调色，稳定摄影机；禁止赛博霓虹滥用、塑料皮肤、插画和 CGI 感',
      },
      {
        id: 'commercial-bright',
        label: '明亮通透商摄',
        prompt:
          '高调棚拍或柔和日光，大面积干净高光，通透材质，清晰轮廓，精准产品色，商业广告镜头；禁止脏灰、硬黑阴影、过曝和主体变形',
      },
      {
        id: 'natural-documentary',
        label: '自然光纪实',
        prompt:
          '可用自然光、低饱和真实色、适度手持或旁观机位、环境细节和生活质感；禁止影棚摆拍、夸张特效、过度磨皮和强行戏剧光',
      },
    ],
  },
  {
    label: '二维动画',
    styles: [
      {
        id: 'ink-wash',
        label: '水墨写意动画',
        prompt:
          '墨分五色、宣纸纹理、无勾线或克制笔线、晕染与大面积留白；禁止西式水彩、赛璐璐阴影、三维渲染和现代霓虹',
      },
      {
        id: 'cel-cinematic',
        label: '日系电影赛璐璐',
        prompt:
          '清晰线稿、分层赛璐璐上色、自然天空与环境光、电影式构图、克制高光；禁止指定作品角色、夸张热血特效、三维塑料感和风格漂移',
      },
      {
        id: 'gongbi-color',
        label: '工笔重彩动画',
        prompt:
          '铁线描、矿物颜料、朱砂石青石绿、大色块平涂、东方装饰构图；禁止日系赛璐璐、写实摄影、数字渐变和西式卡通造型',
      },
    ],
  },
  {
    label: '三维动画',
    styles: [
      {
        id: 'eastern-xianxia-cg',
        label: '东方仙侠写实 CG',
        prompt:
          '写实人物与织物、青绿山水、法宝金光、体积雾和克制灵气粒子、东方电影运镜；禁止欧美盔甲套用、游戏 UI、低模和廉价特效',
      },
      {
        id: 'realistic-fantasy-cg',
        label: '写实奇幻电影 CG',
        prompt:
          '照片级 PBR 材质、冷暖电影光、高反差、体积粒子、可信人物比例和史诗空间；禁止卡通比例、低模、过度光晕和游戏截图感',
      },
    ],
  },
  {
    label: '定格动画',
    styles: [
      {
        id: 'handmade-clay',
        label: '手工粘土定格',
        prompt:
          '可见粘土与织物纹理、手作微瑕、微缩布景、柔和棚拍光、逐格动画质感；禁止光滑 CGI、真人摄影和材质漂移',
      },
    ],
  },
] as { label: string; styles: { id: VisualStyleId; label: string; prompt: string }[] }[]
export const VISUAL_STYLES = VISUAL_STYLE_GROUPS.flatMap((group) => group.styles)

export function assetReferenceSearchQuery(
  query: string,
  role: AssetRole,
  styleId: VisualStyleId,
) {
  const liveAction = ['cinematic-contrast', 'commercial-bright', 'natural-documentary'].includes(
    styleId,
  )
  const suffix = liveAction
    ? {
        character: 'film character costume portrait full body movie still',
        scene: 'cinematic film still establishing shot wide shot',
        prop: 'movie prop close up film still',
      }[role]
    : {
        character: 'animation character design full body key visual',
        scene: 'animation background art establishing shot wide shot',
        prop: 'animation prop design concept art',
      }[role]
  return `${query.trim()} ${suffix}`.trim()
}

export const SHOT_PACES: ShotPace[] = ['auto', 'slow', 'medium', 'fast']
const SHOT_SECONDS: Record<ResolvedShotPace, number> = { slow: 7, medium: 4.5, fast: 2.5 }

export function isValidTargetDuration(value: unknown): value is TargetDuration {
  return (
    Number.isInteger(value) &&
    Number(value) >= TARGET_DURATION_MIN &&
    Number(value) <= TARGET_DURATION_MAX
  )
}

export interface VoiceDesignDraft {
  text: string
  voicePrompt: string
}

export interface PlannedAsset {
  assetKey: string
  role: AssetRole
  label: string
  description: string
  identityTraits: string[]
  styleRequirements: string[]
  required: boolean
}

export interface ParsedAssetPlan {
  assets: PlannedAsset[]
  shotAssetKeys: string[][]
}

export interface StoryboardSegment {
  index: number
  storyBeat: string
  shotRole: 'hook' | 'development' | 'payoff'
  editTreatment: 'hold' | 'progression' | 'montage'
  playDuration: number
  generationDuration: 4 | 6 | 8
  script: string
  timelineType?: 'dialogue' | 'action'
  soundType?: 'onscreen' | 'voiceover' | 'none'
  speakerId?: string
  dialogueCharacter?: string
  dialogueText?: string
  dialogueEmotion?: string
  emotionIntensity?: string
  speechRate?: string
  pauseEmphasis?: string
  dialogueDuration?: number
  lipSyncRequired?: boolean
  soundDesign?: string
  coreReferenceVisible: boolean
  referenceAssetIds: string[]
  shotSize: string
  cameraAngle: string
  cameraMovement: string
  startState: string
  actionProgression: string
  endState: string
  storyboardImagePrompt: string
  videoPrompt: string
  imagePath?: string
  videoPath?: string
  imageVersions?: string[]
  videoVersions?: string[]
  imageStatus?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  videoStatus?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  error?: string
}

export interface StoryboardPlan {
  actualDuration: number
  timelineDuration: number
  creativeIdentity: string
  sceneReference: string
  rhythmArchive: string
  distributionIntent: string
  resolvedPace: ResolvedShotPace
  referenceShotCount?: number
  finalShotCount: number
  shotCountRationale: string
  visualAnchor: string
  segments: StoryboardSegment[]
}

export type RevisionTargetType = 'script' | 'voice-plan' | 'asset-prompt' | 'shot' | 'image' | 'video'

export interface RevisionProposal {
  targetType: RevisionTargetType
  targetId: string
  revised: any
  changedFields: string[]
  impact: string[]
  requiresReplan?: boolean
  reason?: string
}

export function unfinishedSegments(segments: StoryboardSegment[], kind: 'image' | 'video') {
  return segments.filter((segment) =>
    kind === 'image' ? segment.imageStatus !== 'success' : segment.videoStatus !== 'success',
  )
}

export function estimateDuration(text: string) {
  const chars = text.replace(/\s/g, '').length
  return Math.max(4, (chars / 200) * 60)
}

export function generationDurationFor(playDuration: number): 4 | 6 | 8 {
  if (!Number.isFinite(playDuration) || playDuration <= 0) throw new Error('播放时长必须大于 0 秒')
  if (playDuration <= 4) return 4
  if (playDuration <= 6) return 6
  if (playDuration <= 8) return 8
  throw new Error('单镜头播放时长超过 8 秒')
}

function narrationText(value: string) {
  return value.replace(/[\p{P}\p{Z}\s]/gu, '')
}

function restoreApprovedScript(segments: StoryboardSegment[], approvedScript: string) {
  if (segments.map((segment) => narrationText(segment.script)).join('') !== narrationText(approvedScript))
    throw new Error('分镜文稿没有完整覆盖已确认文稿')
  const source = [...approvedScript]
  let cursor = 0
  return segments.map((segment, index) => {
    const targetLength = [...narrationText(segment.script)].length
    const start = cursor
    let consumed = 0
    while (cursor < source.length && consumed < targetLength) {
      if (narrationText(source[cursor])) consumed++
      cursor++
    }
    while (cursor < source.length && !narrationText(source[cursor])) cursor++
    return { ...segment, script: source.slice(start, index === segments.length - 1 ? source.length : cursor).join('').trim() }
  })
}

export function expectedShotCount(actualDuration: number, pace: ResolvedShotPace) {
  if (!Number.isFinite(actualDuration) || actualDuration <= 0)
    throw new Error('配音时长必须大于 0 秒')
  return Math.max(1, Math.ceil(actualDuration / SHOT_SECONDS[pace]))
}

export async function generateValidatedPlan<T>(
  generate: (validationError: string) => Promise<T>,
  validate: (value: T) => void,
) {
  let validationError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await generate(validationError)
    try {
      validate(value)
      return value
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(validationError)
}

export function createRunId() {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

export async function hashScript(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseAssetPlan(value: any): ParsedAssetPlan {
  const sourceAssets = Array.isArray(value?.assetPlan) ? value.assetPlan : []
  const shots = Array.isArray(value?.shots) ? value.shots : []
  if (!sourceAssets.length) throw new Error('导演分镜缺少资产计划')
  if (!shots.length) throw new Error('导演分镜缺少镜头资产引用')
  const keys = new Set<string>()
  const assets: PlannedAsset[] = sourceAssets.map((asset: any, index: number): PlannedAsset => {
    const assetKey = String(asset?.assetKey || '').trim()
    const role = String(asset?.role || '') as AssetRole
    const label = String(asset?.label || '').trim()
    const description = String(asset?.description || '').trim()
    if (!assetKey || keys.has(assetKey)) throw new Error(`第 ${index + 1} 项资产 key 无效或重复`)
    if (!['character', 'scene', 'prop'].includes(role))
      throw new Error(`第 ${index + 1} 项资产类型无效`)
    if (!label || !description) throw new Error(`第 ${index + 1} 项资产说明不完整`)
    keys.add(assetKey)
    return {
      assetKey,
      role,
      label,
      description,
      identityTraits: Array.isArray(asset.identityTraits)
        ? asset.identityTraits.map(String).filter(Boolean)
        : [],
      styleRequirements: Array.isArray(asset.styleRequirements)
        ? asset.styleRequirements.map(String).filter(Boolean)
        : [],
      required: asset.required !== false,
    }
  })
  const used = new Set<string>()
  const shotAssetKeys = shots.map((shot: any, index: number) => {
    if (!Array.isArray(shot?.assetKeys)) throw new Error(`第 ${index + 1} 镜缺少资产引用`)
    const values = shot.assetKeys.map(String)
    if (new Set(values).size !== values.length) throw new Error(`第 ${index + 1} 镜资产引用重复`)
    if (values.some((key: string) => !keys.has(key)))
      throw new Error(`第 ${index + 1} 镜引用了未知资产`)
    const sceneCount = values.filter(
      (key: string) => assets.find((asset) => asset.assetKey === key)?.role === 'scene',
    ).length
    if (sceneCount > 1) throw new Error(`第 ${index + 1} 镜只能绑定一个主要场景`)
    values.forEach((key: string) => used.add(key))
    return values
  })
  if (assets.some((asset) => !used.has(asset.assetKey)))
    throw new Error('资产计划包含未被镜头引用的资产')
  return { assets, shotAssetKeys }
}

export function parseVoiceDesign(value: any, approvedScript: string): VoiceDesignDraft {
  const text = String(value?.text || '').trim()
  const voicePrompt = String(value?.voicePrompt || '').trim()
  if (text !== approvedScript.trim()) throw new Error('声音方案改写了已确认文稿')
  if (!voicePrompt) throw new Error('声音方案缺少声音提示词')
  const labels = ['【人设】', '【音色特征】', '【风格】', '【情感】', '【节奏】']
  if (
    labels.some(
      (label, index) =>
        voicePrompt.indexOf(label) <= (index ? voicePrompt.indexOf(labels[index - 1]) : -1),
    )
  ) {
    throw new Error('声音方案必须按五项固定顺序输出')
  }
  return { text, voicePrompt }
}

export function parseStoryboardPlan(
  value: any,
  approvedScript: string,
  timelineDuration: number,
  selectedPace: ShotPace,
): StoryboardPlan {
  const segments = Array.isArray(value?.segments) ? value.segments : []
  const resolvedPace = String(value?.resolvedPace || '') as ResolvedShotPace
  if (!['slow', 'medium', 'fast'].includes(resolvedPace)) {
    throw new Error('分镜方案缺少有效的最终镜头节奏')
  }
  if (selectedPace !== 'auto' && resolvedPace !== selectedPace) {
    throw new Error('分镜方案没有遵循用户选择的镜头节奏')
  }
  if (!segments.length) throw new Error('分镜方案没有镜头')

  const normalized: StoryboardSegment[] = segments.map(
    (segment: any, offset: number): StoryboardSegment => {
      const playDuration = Number(segment?.playDuration)
      const generationDuration = Number(segment?.generationDuration)
      const script = String(segment?.script || '').trim()
      const storyboardImagePrompt = String(segment?.storyboardImagePrompt || '').trim()
      const videoPrompt = String(segment?.videoPrompt || '').trim()
      if (!script || !storyboardImagePrompt || !videoPrompt)
        throw new Error(`第 ${offset + 1} 段内容不完整`)
      if (!Number.isFinite(playDuration) || playDuration <= 0 || playDuration > 8) {
        throw new Error(`第 ${offset + 1} 段播放时长必须大于 0 且不超过 8 秒`)
      }
      if (![4, 6, 8].includes(generationDuration)) {
        throw new Error(`第 ${offset + 1} 段模型生成时长必须为 4、6 或 8 秒`)
      }
      if (generationDuration < playDuration) {
        throw new Error(`第 ${offset + 1} 段模型生成时长不能短于播放时长`)
      }
      if (generationDuration !== generationDurationFor(playDuration)) {
        throw new Error(`第 ${offset + 1} 段必须使用覆盖播放时长的最小模型时长`)
      }
      const shotRole = String(segment?.shotRole || 'development')
      const editTreatment = String(segment?.editTreatment || 'progression')
      if (!['hook', 'development', 'payoff'].includes(shotRole)) {
        throw new Error(`第 ${offset + 1} 段镜头职责无效`)
      }
      if (!['hold', 'progression', 'montage'].includes(editTreatment)) {
        throw new Error(`第 ${offset + 1} 段剪辑处理无效`)
      }
      if (
        /(?:再|然后|随后)?(?:切镜|转场)(?:到|至)|分屏|多画面/.test(videoPrompt) ||
        !videoPrompt.includes('单一连续镜头') ||
        !videoPrompt.includes('无切镜') ||
        !videoPrompt.includes('无背景音乐')
      ) {
        throw new Error(`第 ${offset + 1} 段必须是无切镜的单一连续镜头`)
      }
      return {
        index: offset + 1,
        storyBeat: String(segment?.storyBeat || script).trim(),
        shotRole: shotRole as StoryboardSegment['shotRole'],
        editTreatment: editTreatment as StoryboardSegment['editTreatment'],
        playDuration,
        generationDuration: generationDuration as 4 | 6 | 8,
        script,
        timelineType: segment?.soundType === 'none' || segment?.timelineType !== 'dialogue' ? 'action' : 'dialogue',
        soundType: ['onscreen', 'voiceover', 'none'].includes(segment?.soundType)
          ? segment.soundType
          : segment?.timelineType === 'dialogue'
            ? segment?.lipSyncRequired ? 'onscreen' : 'voiceover'
            : 'none',
        speakerId: String(segment?.speakerId || '').trim() || undefined,
        dialogueCharacter: String(segment?.dialogueCharacter || '无').trim(),
        dialogueText: String(segment?.dialogueText || '').trim(),
        dialogueEmotion: String(segment?.dialogueEmotion || '无').trim(),
        emotionIntensity: String(segment?.emotionIntensity || '无').trim(),
        speechRate: String(segment?.speechRate || '无').trim(),
        pauseEmphasis: String(segment?.pauseEmphasis || '无').trim(),
        dialogueDuration: Number.isFinite(Number(segment?.dialogueDuration))
          ? Math.max(0, Number(segment.dialogueDuration))
          : 0,
        lipSyncRequired: Boolean(segment?.lipSyncRequired),
        soundDesign: String(segment?.soundDesign || '无').trim(),
        coreReferenceVisible: Boolean(segment.coreReferenceVisible),
        referenceAssetIds: Array.isArray(segment?.referenceAssetIds)
          ? segment.referenceAssetIds.map(String)
          : [],
        shotSize: String(segment?.shotSize || '未记录').trim(),
        cameraAngle: String(segment?.cameraAngle || '未记录').trim(),
        cameraMovement: String(segment?.cameraMovement || '未记录').trim(),
        startState: String(segment?.startState || '未记录').trim(),
        actionProgression: String(segment?.actionProgression || '未记录').trim(),
        endState: String(segment?.endState || '未记录').trim(),
        storyboardImagePrompt,
        videoPrompt,
        imageVersions: Array.isArray(segment?.imageVersions) ? segment.imageVersions : [],
        videoVersions: Array.isArray(segment?.videoVersions) ? segment.videoVersions : [],
        imageStatus: 'pending',
        videoStatus: 'pending',
      }
    },
  )

  const restored = restoreApprovedScript(normalized, approvedScript)
  const total = restored.reduce((sum, segment) => sum + segment.playDuration, 0)
  if (Math.abs(total - timelineDuration) > 0.1) throw new Error('分镜总时长与时间轴不一致')

  const visualAnchor = String(value?.visualAnchor || '').trim()
  if (!visualAnchor) throw new Error('分镜方案缺少全局一致性锚点')
  if (restored.some((segment) => !segment.videoPrompt.includes('无背景音乐'))) {
    throw new Error('视频提示词必须明确要求无背景音乐')
  }

  const finalShotCount = Number(value?.finalShotCount ?? normalized.length)
  if (finalShotCount !== restored.length) throw new Error('最终镜头数与实际镜头数组不一致')
  const referenceShotCount = Number(value?.referenceShotCount)
  return {
    actualDuration: value?.actualDuration ? Number(value.actualDuration) : 0,
    timelineDuration,
    creativeIdentity: String(value?.creativeIdentity || '历史分镜（未记录导演身份）').trim(),
    sceneReference: String(value?.sceneReference || '历史分镜未记录参考场景').trim(),
    rhythmArchive: String(value?.rhythmArchive || '历史分镜未记录节奏档案').trim(),
    distributionIntent: String(value?.distributionIntent || '按原分镜推进').trim(),
    resolvedPace,
    referenceShotCount:
      Number.isInteger(referenceShotCount) && referenceShotCount > 0
        ? referenceShotCount
        : undefined,
    finalShotCount,
    shotCountRationale: String(value?.shotCountRationale || '沿用历史分镜数量').trim(),
    visualAnchor,
    segments: restored,
  }
}

export function parseRevisionProposal(
  value: any,
  targetType: RevisionTargetType,
  targetId: string,
) {
  if (value?.targetType !== targetType || String(value?.targetId) !== targetId) {
    throw new Error('AI 修改提案的目标与当前选择不一致')
  }
  if (value?.revised == null) throw new Error('AI 修改提案缺少修改结果')
  return {
    targetType,
    targetId,
    revised: value.revised,
    changedFields: Array.isArray(value.changedFields) ? value.changedFields.map(String) : [],
    impact: Array.isArray(value.impact) ? value.impact.map(String) : [],
    requiresReplan: Boolean(value.requiresReplan),
    reason: String(value.reason || ''),
  } satisfies RevisionProposal
}
