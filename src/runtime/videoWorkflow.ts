import type { TargetDuration, VideoRatio, VisualStyleId } from '~/electron/types'

export const VIDEO_RATIOS: VideoRatio[] = ['9:16', '16:9']
export const TARGET_DURATIONS: TargetDuration[] = [10, 15, 30]
export const VISUAL_STYLES: { id: VisualStyleId; label: string; prompt: string }[] = [
  { id: 'live-action', label: '真人写实', prompt: '电影级真人实拍，真实材质，自然主光与克制辅光，中性电影色彩，稳定摄影机语言；禁止插画感、塑料皮肤和夸张特效' },
  { id: 'illustration', label: '2D 漫画/插画', prompt: '精致二维商业插画，清晰轮廓，细腻平涂材质，统一配色与柔和明暗，平面化镜头语言；禁止写实摄影、三维渲染和风格漂移' },
  { id: '3d', label: '3D 渲染', prompt: '高品质三维渲染，可信 PBR 材质，体积光，清晰层次与稳定电影机位；禁止二维笔触、低模粗糙感和过度炫光' },
  { id: 'clay', label: '粘土定格', prompt: '手工粘土定格动画，细腻粘土材质，可见手作纹理，柔和棚拍光与稳定定格镜头；禁止真人摄影、光滑塑料感和材质漂移' },
]

export interface VoiceDesignDraft {
  text: string
  voicePrompt: string
}

export interface StoryboardSegment {
  index: number
  playDuration: number
  generationDuration: 4 | 6 | 8
  script: string
  coreReferenceVisible: boolean
  storyboardImagePrompt: string
  videoPrompt: string
  imagePath?: string
  videoPath?: string
  imageStatus?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  videoStatus?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  error?: string
}

export interface StoryboardPlan {
  actualDuration: number
  visualAnchor: string
  segments: StoryboardSegment[]
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

export function createRunId() {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

export async function hashScript(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
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
  actualDuration: number,
): StoryboardPlan {
  const segments = Array.isArray(value?.segments) ? value.segments : []
  const expectedCount = Math.ceil(actualDuration / 8)
  if (segments.length !== expectedCount) throw new Error(`分镜段数应为 ${expectedCount} 段`)

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
      if (typeof segment?.coreReferenceVisible !== 'boolean') {
        throw new Error(`第 ${offset + 1} 段缺少核心参考资产可见性判断`)
      }
      if (
        !videoPrompt.includes('单一连续镜头') ||
        !videoPrompt.includes('无切镜') ||
        !videoPrompt.includes('无背景音乐')
      ) {
        throw new Error(`第 ${offset + 1} 段必须是无切镜的单一连续镜头`)
      }
      return {
        index: offset + 1,
        playDuration,
        generationDuration: generationDuration as 4 | 6 | 8,
        script,
        coreReferenceVisible: segment.coreReferenceVisible,
        storyboardImagePrompt,
        videoPrompt,
        imageStatus: 'pending',
        videoStatus: 'pending',
      }
    },
  )

  const joined = normalized.map((segment) => segment.script.replace(/\s/g, '')).join('')
  if (joined !== approvedScript.replace(/\s/g, ''))
    throw new Error('分镜文稿没有完整覆盖已确认文稿')
  const total = normalized.reduce((sum, segment) => sum + segment.playDuration, 0)
  if (Math.abs(total - actualDuration) > 0.1) throw new Error('分镜总时长与配音不一致')

  const visualAnchor = String(value?.visualAnchor || '').trim()
  if (!visualAnchor) throw new Error('分镜方案缺少全局一致性锚点')
  if (normalized.some((segment) => !segment.videoPrompt.includes('无背景音乐'))) {
    throw new Error('视频提示词必须明确要求无背景音乐')
  }

  return {
    actualDuration,
    visualAnchor,
    segments: normalized,
  }
}
