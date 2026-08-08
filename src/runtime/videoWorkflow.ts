import type {
  ResolvedShotPace,
  ShotPace,
  ShotVideoAnalysisResult,
  TargetDuration,
  VideoModel,
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
      {
        id: 'shonen-action-cel',
        label: '热血动作赛璐璐',
        prompt:
          '二维热血动作动画，硬朗清晰线稿、协调人物比例、分层赛璐璐上色、强动态透视、速度线与冲击光影、电影式动作构图；禁止真人摄影、三维塑料感、静态站桩和指定作品角色',
      },
      {
        id: 'monochrome-shonen-manga',
        label: '黑白少年漫画',
        prompt:
          '黑白少年漫画媒介，锐利墨线、协调人物比例、网点与排线塑造明暗、高反差光影、富有张力的单幅电影构图；禁止彩色上色、真人摄影、多格漫画排版和文字气泡',
      },
      {
        id: 'modern-anime-key-visual',
        label: '现代精致日系动画',
        prompt:
          '现代精致二维动画主视觉，干净细线、自然修长人物比例、细腻赛璐璐与柔和渐变上色、通透环境光、电影海报式单幅构图；禁止指定作品角色、低幼比例、三维塑料感和多格排版',
      },
      {
        id: 'hand-painted-watercolor-animation',
        label: '手绘水彩动画',
        prompt:
          '手绘水彩二维动画，柔韧铅笔线、自然人物比例、透明水彩叠色、纸张肌理、柔和散射光和诗意电影构图；禁止厚重油画、硬质赛璐璐、真人摄影和数字塑料感',
      },
      {
        id: 'dunhuang-mural-animation',
        label: '敦煌壁画动画',
        prompt:
          '敦煌壁画式二维动画，古拙描线、东方人物比例、矿物色平涂、赭石青绿与岁月斑驳、平面装饰光影、横向叙事构图；禁止现代服饰、日系赛璐璐、写实摄影和霓虹色',
      },
      {
        id: 'paper-cut-shadow-animation',
        label: '剪纸皮影动画',
        prompt:
          '中国剪纸皮影动画，镂空轮廓与关节化人物、平面侧身比例、红黑金纸张色块、透光幕布质感、层叠侧影构图；禁止写实体积、三维塑料材质、现代摄影光和细碎渐变',
      },
      {
        id: 'chinese-puppet-stop-motion',
        label: '中国木偶定格',
        prompt:
          '中国传统木偶定格动画，手工雕刻线条、木偶人物比例、木材织物与彩绘材质、微缩舞台光、戏剧化景深构图；禁止真人皮肤、光滑 CGI、现代塑料玩具感和材质漂移',
      },
      {
        id: 'origami-animation',
        label: '折纸动画',
        prompt:
          '折纸定格动画，明确纸张折线、几何化人物与物体比例、纯净纸色和纤维纹理、柔和棚拍阴影、层叠微缩场景构图；禁止真人摄影主体、金属塑料材质、复杂毛发和光滑 CGI',
      },
      {
        id: 'comic-minimalism',
        label: '东方极简漫画',
        prompt:
          '东方极简二维漫画，克制流畅线条、简练自然人物比例、少量平涂色块、大面积留白、清晰明暗关系和单幅叙事构图；禁止繁复背景、照片写实、三维渲染、多格排版和文字气泡',
      },
      {
        id: 'ink-paper-cut-animation',
        label: '水墨剪纸动画',
        prompt:
          '水墨与剪纸融合动画，纸刻轮廓、平面东方人物比例、墨色晕染叠加有限朱红、宣纸透光、层次分明的侧影构图；禁止日系赛璐璐、真人摄影、光滑三维和高饱和霓虹',
      },
    ],
  },
  {
    label: '游戏动漫',
    styles: [
      {
        id: 'anime-open-world-3d',
        label: '明亮二次元开放世界',
        prompt:
          '明亮二次元三维动画，精致描边、自然修长人物比例、柔和卡通渲染、通透天空与环境光、开阔冒险电影构图；禁止游戏 UI、指定角色、低模、写实皮肤和过曝光晕',
      },
      {
        id: 'dark-chinese-mythology-cg',
        label: '暗黑东方神话',
        prompt:
          '暗黑东方神话动画，苍劲轮廓、可信人物比例、粗粝写实材质、低饱和墨黑与暗金、强体积光和史诗电影构图；禁止欧美盔甲套用、游戏 UI、廉价仙气和卡通低幼感',
      },
      {
        id: 'xianxia-cultivation-animation',
        label: '修仙国风动画',
        prompt:
          '国风修仙动画，利落东方线条、飘逸修长人物比例、细腻动画上色、青绿山水与克制灵气、云雾层次和仙侠电影构图；禁止游戏 UI、欧美魔法阵、廉价光效和现代物件',
      },
      {
        id: 'victorian-mysticism',
        label: '蒸汽神秘悬疑',
        prompt:
          '维多利亚蒸汽神秘动画，精密墨线、写实修长人物比例、铜铁皮革材质、煤烟灰与暗红配色、煤气灯光影和悬疑电影构图；禁止现代科技、明亮糖果色、游戏 UI和低幼造型',
      },
      {
        id: 'creature-collection-animation',
        label: '萌系生物冒险',
        prompt:
          '萌系生物冒险动画，圆润干净线条、可爱但结构清晰的角色比例、鲜明赛璐璐上色、明快自然光和富有探索感的电影构图；禁止指定 IP 角色、游戏 UI、照片写实和恐怖畸形',
      },
      {
        id: 'cozy-pixel-farm',
        label: '温暖像素田园',
        prompt:
          '温暖像素田园动画，清晰像素轮廓、简化协调人物比例、有限暖色调色板、块状光影、温馨生活化场景构图；禁止高清平滑线条、写实摄影、三维材质、游戏 UI 和像素尺寸混乱',
      },
      {
        id: 'pixel-underwater-adventure',
        label: '像素海洋冒险',
        prompt:
          '像素海洋冒险动画，清晰像素轮廓、简化角色比例、蓝绿有限色盘、层叠水下光束和气泡、横向探索电影构图；禁止平滑矢量线、照片写实、三维塑料感、游戏 UI 和像素尺寸混乱',
      },
    ],
  },
  {
    label: '韩漫',
    styles: [
      {
        id: 'korean-webtoon-color',
        label: '韩漫彩色条漫',
        prompt:
          '彩色韩漫条漫画风，干净细线、修长自然人物比例、细腻平涂与柔和渐变上色、清透肤色、明确电影光影和单幅竖屏叙事构图；禁止多格排版、文字气泡、真人摄影、三维塑料感和指定作品角色',
      },
      {
        id: 'korean-webtoon-cinematic',
        label: '韩漫电影感',
        prompt:
          '电影感彩色韩漫，精致利落线稿、写实修长人物比例、细腻厚涂与赛璐璐融合上色、冷暖电影光、景深和高完成度单幅构图；禁止多格排版、对白文字、平淡正面站姿和真人摄影',
      },
      {
        id: 'korean-webtoon-romance',
        label: '韩漫恋爱漫',
        prompt:
          '韩漫恋爱题材画风，柔和精细线条、俊美修长人物比例、通透肤色与细腻渐变、柔光和克制高光、强调眼神与距离感的浪漫单幅构图；禁止多格排版、文字气泡、低幼比例和过度粉色滤镜',
      },
      {
        id: 'korean-webtoon-action',
        label: '韩漫动作漫',
        prompt:
          '韩漫动作题材画风，锐利有力线条、健美可信人物比例、高对比赛璐璐上色、强烈明暗切割、动态透视和冲击力单幅电影构图；禁止多格排版、文字拟声、静态站桩、肢体畸形和三维游戏截图感',
      },
      {
        id: 'korean-webtoon-dark',
        label: '韩漫暗黑漫',
        prompt:
          '暗黑悬疑韩漫画风，锐利细密线条、写实修长人物比例、低饱和冷色与局部暗红、深阴影和轮廓光、压迫感单幅电影构图；禁止多格排版、文字气泡、廉价血腥、纯黑丢失细节和真人摄影',
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
  _styleId: VisualStyleId,
) {
  const styleTerms = /\b(?:korean\s+webtoon|webtoon|manhwa|manga|anime|animation|animated|illustration|concept\s+art|environment(?:\s+art)?|background\s+art|character\s+(?:design|sheet|turnaround)|prop\s+design|asset\s+reference|game\s+asset\s+reference|key\s+visual|cinematic|stylized|photorealistic|dark|mystery|dramatic|ambient|glow|style|sharp\s+lines?|blue|red|green|cold|warm|neon|moody|suspense|horror|high\s+contrast)\b/gi
  const base = query.replace(styleTerms, ' ').replace(/\s+/g, ' ').trim()
  const suffixText = {
    character: 'film character portrait full body',
    scene: 'film still wide shot',
    prop: 'movie prop close up',
  }[role]
  const maxQueryLength = Math.max(20, 160 - suffixText.length - 1)
  return `${base.slice(0, maxQueryLength)} ${suffixText}`.replace(/\s+/g, ' ').trim()
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
  generationDuration: number
  script: string
  timelineType?: 'dialogue' | 'action'
  soundType?: 'onscreen' | 'voiceover' | 'none'
  speakerId?: string
  dialogueCharacter?: string
  dialogueText?: string
  englishDialogueText?: string
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
  transcriptStatus?: 'pending' | 'running' | 'ready' | 'failed'
  transcriptMediaId?: string
  transcriptJsonPath?: string
  transcriptSrtPath?: string
  transcriptError?: string
  editingStatus?: 'pending' | 'running' | 'ready' | 'failed'
  editingAnalysis?: ShotVideoAnalysisResult
  editingError?: string
  chineseVoicePath?: string
  chineseVoiceDuration?: number
  englishVoicePath?: string
  englishVoiceDuration?: number
  error?: string
}

export function videoSoundInstruction(segment: Pick<StoryboardSegment,
  'index' | 'soundType' | 'speakerId' | 'dialogueText' | 'dialogueEmotion' | 'emotionIntensity' | 'speechRate' | 'pauseEmphasis'
>) {
  const soundType = segment.soundType || 'none'
  if (soundType === 'none') return '声音要求：无对白、无旁白。'
  const speakerId = String(segment.speakerId || '').trim()
  const dialogueText = String(segment.dialogueText || '').trim()
  if (!speakerId || !dialogueText)
    throw new Error(`第 ${segment.index} 镜缺少${soundType === 'onscreen' ? '画面内对白' : '旁白'}的说话者 ID 或确认原文`)
  if (soundType === 'voiceover')
    return `声音要求：旁白：“${dialogueText}”；说话者 ${speakerId}；按分镜提示词正常生成对应的人声、情绪、节奏和画面反应，最终采用哪条声音轨由后期声音制作路线决定。`
  return `声音要求：角色 ${speakerId} 自然说出：“${dialogueText}”；情绪 ${segment.dialogueEmotion || '自然'}，强度 ${segment.emotionIntensity || '自然'}，语速 ${segment.speechRate || '自然'}，停顿与重音 ${segment.pauseEmphasis || '自然'}；口型与台词逐字同步。`
}

export function videoPromptWithSound(segment: StoryboardSegment) {
  return `${segment.videoPrompt.trim()}\n\n${videoSoundInstruction(segment)}`
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

export type RevisionTargetType = 'script' | 'project-director' | 'voice-plan' | 'seed-role-prompt' | 'seed-global-prompt' | 'asset-prompt' | 'shot' | 'image' | 'video'

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
    kind === 'image'
      ? segment.imageStatus !== 'success'
      : segment.videoStatus !== 'success',
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

export function isCombinedVideoModel(model: VideoModel) {
  return model === 'rh-grok-image-video' || model === 'rh-seedance2'
}

export function grokGenerationDuration(
  totalPlayDuration: number,
  model: VideoModel = 'rh-grok-image-video',
) {
  if (!Number.isFinite(totalPlayDuration) || totalPlayDuration <= 0)
    throw new Error('组合视频序列播放时长必须大于 0 秒')
  const [minDuration, maxDuration] = model === 'rh-seedance2' ? [4, 15] : [6, 30]
  return Math.min(maxDuration, Math.max(minDuration, Math.ceil(totalPlayDuration)))
}

export interface GrokSequence {
  id: string
  segments: StoryboardSegment[]
  generationDuration: number
  referenceAssetIds: string[]
}

export interface GrokReferenceAsset {
  id: string
  role: AssetRole
  label: string
}

export function grokStoryboardBoardInstruction(shotCount: number) {
  if (!Number.isInteger(shotCount) || shotCount < 1 || shotCount > 9)
    throw new Error('组合分镜板只能包含 1 到 9 个镜头')
  return `请生成一张包含准确 ${shotCount} 幅画面的连续分镜板，严格按上述镜头顺序呈现。版式自行安排，不要固定网格或均分；不得增加、遗漏或重复镜头，不要文字、编号、对白气泡或画外拼贴。`
}

export function grokReferenceGuide(assets: GrokReferenceAsset[], storyboardFirst: boolean) {
  if (assets.length > 6) throw new Error('组合视频最多引用 6 个资产')
  const purpose: Record<AssetRole, string> = {
    character: '锁定角色身份、脸部、发型和服装',
    scene: '锁定场景空间、陈设、光线和色彩',
    prop: '锁定道具外观、材质和关键细节',
  }
  const role: Record<AssetRole, string> = { character: '角色', scene: '场景', prop: '道具' }
  const lines = ['参考图使用规则：']
  if (storyboardFirst)
    lines.push('参考图1：组合分镜板，只参考镜头顺序、构图、景别、机位和动作。')
  assets.forEach((asset, index) => {
    lines.push(`参考图${index + (storyboardFirst ? 2 : 1)}：${role[asset.role]}“${asset.label}”（${asset.id}），${purpose[asset.role]}。`)
  })
  lines.push(storyboardFirst
    ? '分镜板只决定怎么拍；角色、场景和道具必须以对应资产参考图为准。'
    : '以上资产参考图只锁定是谁、在哪里和是什么；镜头顺序和拍法以分镜提示词为准。')
  return lines.join('\n')
}

export function buildGrokSequences(
  segments: StoryboardSegment[],
  model: VideoModel = 'rh-grok-image-video',
): GrokSequence[] {
  const sequences: GrokSequence[] = []
  const maxDuration = model === 'rh-seedance2' ? 15 : 30
  let current: StoryboardSegment[] = []
  let refs = new Set<string>()
  let duration = 0
  const flush = () => {
    if (!current.length) return
    const id = `grok-sequence-${current[0].index}`
    sequences.push({ id, segments: current, generationDuration: grokGenerationDuration(duration, model), referenceAssetIds: [...refs].slice(0, 6) })
    current = []
    refs = new Set()
    duration = 0
  }
  for (const segment of segments) {
    const nextRefs = new Set([...refs, ...segment.referenceAssetIds])
    const nextDuration = duration + segment.playDuration
    if (current.length && (nextDuration > maxDuration || nextRefs.size > 6 || current.length >= 9)) flush()
    current.push(segment)
    refs = new Set([...refs, ...segment.referenceAssetIds])
    duration += segment.playDuration
  }
  flush()
  return sequences
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
  strictDuration = true,
): StoryboardPlan {
  const segments = Array.isArray(value?.segments) ? value.segments : []
  const averageShotDuration = segments.length
    ? segments.reduce((sum: number, segment: any) => sum + Number(segment?.playDuration || 0), 0) / segments.length
    : 0
  const inferredPace: ResolvedShotPace = averageShotDuration <= 3.25 ? 'fast' : averageShotDuration <= 5.75 ? 'medium' : 'slow'
  const resolvedPace = String(value?.resolvedPace || (selectedPace === 'auto' ? inferredPace : '')) as ResolvedShotPace
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
        !videoPrompt.includes('无切镜')
      ) {
        throw new Error(`第 ${offset + 1} 段必须是无切镜的单一连续镜头`)
      }
      const soundType = ['onscreen', 'voiceover', 'none'].includes(segment?.soundType)
        ? segment.soundType as StoryboardSegment['soundType']
        : segment?.timelineType === 'dialogue'
          ? segment?.lipSyncRequired ? 'onscreen' : 'voiceover'
          : 'none'
      const speakerId = String(segment?.speakerId || '').trim() || undefined
      const dialogueText = String(segment?.dialogueText || '').trim()
      videoSoundInstruction({ index: offset + 1, soundType, speakerId, dialogueText })
      return {
        index: offset + 1,
        storyBeat: String(segment?.storyBeat || script).trim(),
        shotRole: shotRole as StoryboardSegment['shotRole'],
        editTreatment: editTreatment as StoryboardSegment['editTreatment'],
        playDuration,
        generationDuration: generationDuration as 4 | 6 | 8,
        script,
        timelineType: segment?.soundType === 'none' || segment?.timelineType !== 'dialogue' ? 'action' : 'dialogue',
        soundType,
        speakerId,
        dialogueCharacter: String(segment?.dialogueCharacter || '无').trim(),
        dialogueText,
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
        transcriptStatus: 'pending',
        editingStatus: 'pending',
      }
    },
  )

  const restored = restoreApprovedScript(normalized, approvedScript)
  const total = restored.reduce((sum, segment) => sum + segment.playDuration, 0)
  if (strictDuration && Math.abs(total - timelineDuration) > 0.1)
    throw new Error('分镜总时长与时间轴不一致')

  const visualAnchor = String(value?.visualAnchor || '').trim()
  if (!visualAnchor) throw new Error('分镜方案缺少全局一致性锚点')
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
