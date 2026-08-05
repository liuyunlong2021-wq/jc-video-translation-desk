import type {
  EditingTimeline,
  EditingTimelineDialogue,
  EditingTimelineShot,
  ProductionRoute,
} from './productionContract.ts'

export type { EditingTimeline, EditingTimelineShot } from './productionContract.ts'

export interface ShotAnalysis {
  shotId: string
  sourceVideoPath: string
  sourceDurationMs: number
  trimStartMs: number
  trimEndMs: number
  needsReview: boolean
  promptSegmentId?: string
  sourceMediaId?: string
  observedContent?: string
  subtitleCueIds?: string[]
  speakerIds?: string[]
  confidence?: number
  dialogue?: EditingTimelineDialogue
  adoptedStartMs?: number
  adoptedEndMs?: number
  adoptedBy?: 'gemini' | 'user'
  revision?: number
}

export interface EpisodeVoiceTask {
  shotId: string
  speakerId: string
  text: string
  emotion: string
  startMs: number
  endMs: number
}

export function buildEditingTimeline(
  analyses: ShotAnalysis[],
  route: ProductionRoute = 'drama',
): EditingTimeline {
  const shots = analyses.map((analysis): EditingTimelineShot => {
    const validTrim = Number.isFinite(analysis.trimStartMs) && Number.isFinite(analysis.trimEndMs)
      && analysis.trimStartMs >= 0 && analysis.trimStartMs < analysis.trimEndMs
      && analysis.trimEndMs <= analysis.sourceDurationMs
    const geminiStartMs = !analysis.needsReview && validTrim ? analysis.trimStartMs : 0
    const geminiEndMs = !analysis.needsReview && validTrim ? analysis.trimEndMs : analysis.sourceDurationMs
    const persistedTrim = Number.isFinite(analysis.adoptedStartMs)
      && Number.isFinite(analysis.adoptedEndMs)
      && Number(analysis.adoptedStartMs) >= 0
      && Number(analysis.adoptedStartMs) < Number(analysis.adoptedEndMs)
      && Number(analysis.adoptedEndMs) <= analysis.sourceDurationMs
    return {
      shotId: analysis.shotId,
      promptSegmentId: analysis.promptSegmentId || analysis.shotId,
      sourceMediaId: analysis.sourceMediaId || analysis.shotId,
      sourceVideoPath: analysis.sourceVideoPath,
      sourceDurationMs: analysis.sourceDurationMs,
      geminiStartMs,
      geminiEndMs,
      adoptedStartMs: persistedTrim ? Number(analysis.adoptedStartMs) : geminiStartMs,
      adoptedEndMs: persistedTrim ? Number(analysis.adoptedEndMs) : geminiEndMs,
      adoptedBy: persistedTrim ? analysis.adoptedBy || 'user' : 'gemini',
      revision: persistedTrim ? Math.max(0, Math.floor(Number(analysis.revision) || 0)) : 0,
      outputStartMs: 0,
      outputEndMs: 0,
      observedContent: analysis.observedContent || '',
      subtitleCueIds: analysis.subtitleCueIds || [],
      speakerIds: analysis.speakerIds || (analysis.dialogue ? [analysis.dialogue.speakerId] : []),
      confidence: Number.isFinite(analysis.confidence) ? Number(analysis.confidence) : validTrim ? 1 : 0,
      needsReview: analysis.needsReview || !validTrim,
      dialogue: analysis.dialogue,
    }
  })
  return rebuildTimeline({ schemaVersion: 2, route, shots })
}

export function adoptEditingPoint(
  timeline: EditingTimeline,
  shotId: string,
  adoptedStartMs: number,
  adoptedEndMs: number,
) {
  const target = timeline.shots.find((shot) => shot.shotId === shotId)
  if (
    !target ||
    !Number.isFinite(adoptedStartMs) ||
    !Number.isFinite(adoptedEndMs) ||
    adoptedStartMs < 0 ||
    adoptedStartMs >= adoptedEndMs ||
    adoptedEndMs > target.sourceDurationMs
  )
    throw new Error(`${shotId} 人工剪辑区间无效`)
  return rebuildTimeline({
    ...timeline,
    shots: timeline.shots.map((shot) => shot.shotId === shotId
      ? {
          ...shot,
          adoptedStartMs,
          adoptedEndMs,
          adoptedBy: 'user' as const,
          revision: shot.revision + 1,
        }
      : shot),
  })
}

function rebuildTimeline(timeline: EditingTimeline) {
  let cursor = 0
  const shots = timeline.shots.map((shot) => {
    const outputStartMs = cursor
    const outputEndMs = cursor += shot.adoptedEndMs - shot.adoptedStartMs
    const dialogue = shot.dialogue && {
      ...shot.dialogue,
      outputStartMs: outputStartMs + Math.max(0, (shot.dialogue.sourceStartMs ?? shot.adoptedStartMs) - shot.adoptedStartMs),
      outputEndMs: outputStartMs + Math.min(shot.adoptedEndMs - shot.adoptedStartMs, (shot.dialogue.sourceEndMs ?? shot.adoptedEndMs) - shot.adoptedStartMs),
    }
    return { ...shot, outputStartMs, outputEndMs, dialogue }
  })
  return validateEditingTimeline({ ...timeline, shots })
}

export function validateEditingTimeline(timeline: EditingTimeline) {
  if (timeline.schemaVersion !== 2 || !['narration-promo', 'drama'].includes(timeline.route))
    throw new Error('剪辑时间轴合同无效')
  let cursor = 0
  const sourceEnds = new Map<string, number>()
  for (const shot of timeline.shots) {
    if (!shot.shotId || !shot.sourceVideoPath || !Number.isFinite(shot.sourceDurationMs) || shot.sourceDurationMs <= 0)
      throw new Error('剪辑时间轴缺少有效镜头来源')
    if (
      !Number.isFinite(shot.geminiStartMs) ||
      !Number.isFinite(shot.geminiEndMs) ||
      shot.geminiStartMs < 0 ||
      shot.geminiStartMs >= shot.geminiEndMs ||
      shot.geminiEndMs > shot.sourceDurationMs
    )
      throw new Error(`${shot.shotId} Gemini 区间无效`)
    if (
      !Number.isFinite(shot.adoptedStartMs) ||
      !Number.isFinite(shot.adoptedEndMs) ||
      shot.adoptedStartMs < 0 ||
      shot.adoptedStartMs >= shot.adoptedEndMs ||
      shot.adoptedEndMs > shot.sourceDurationMs
    )
      throw new Error(`${shot.shotId} 采用区间无效`)
    const sourceEnd = sourceEnds.get(shot.sourceVideoPath)
    if (sourceEnd !== undefined && shot.adoptedStartMs < sourceEnd)
      throw new Error(`${shot.shotId} 与同源前一镜采用区间重叠`)
    sourceEnds.set(shot.sourceVideoPath, shot.adoptedEndMs)
    if (
      shot.outputStartMs !== cursor ||
      shot.outputEndMs !== cursor + shot.adoptedEndMs - shot.adoptedStartMs
    )
      throw new Error(`${shot.shotId} 输出时间轴不连续`)
    if (
      shot.dialogue &&
      (shot.dialogue.outputStartMs < shot.outputStartMs ||
        shot.dialogue.outputEndMs > shot.outputEndMs ||
        shot.dialogue.outputStartMs >= shot.dialogue.outputEndMs)
    )
      throw new Error(`${shot.shotId} 说话窗口无效`)
    cursor = shot.outputEndMs
  }
  return timeline
}

export function timelineSubtitleCues(timeline: EditingTimeline) {
  return timeline.shots.flatMap((shot) => shot.dialogue?.text.trim()
    ? [{ start: shot.dialogue.outputStartMs / 1000, end: shot.dialogue.outputEndMs / 1000, text: shot.dialogue.text.trim() }]
    : [])
}

export function episodeVoiceTasks(
  timeline: EditingTimeline,
  segments: Array<{
    index: number
    soundType?: 'onscreen' | 'voiceover' | 'none'
    speakerId?: string
    dialogueText?: string
    dialogueEmotion?: string
    dialogueDuration?: number
  }>,
): EpisodeVoiceTask[] {
  return segments.flatMap((segment, index) => {
    if (!segment.soundType || segment.soundType === 'none') return []
    const shot = timeline.shots[index]
    if (!shot) throw new Error(`镜头 ${segment.index} 缺少剪辑时间轴`)
    const speakerId = String(segment.speakerId || '').trim()
    const text = String(segment.dialogueText || '').trim()
    if (!speakerId || !text) throw new Error(`镜头 ${segment.index} 缺少说话者或确认原文`)
    if (segment.soundType === 'onscreen' && !shot.dialogue)
      throw new Error(`镜头 ${segment.index} 没有可靠的画面内说话时间窗，请先重试剪辑分析`)
    const startMs = shot.dialogue?.outputStartMs ?? shot.outputStartMs
    const budget = Math.max(0, Number(segment.dialogueDuration || 0) * 1000)
    const endMs = shot.dialogue?.outputEndMs ?? Math.min(shot.outputEndMs, startMs + (budget || shot.outputEndMs - startMs))
    return [{
      shotId: shot.shotId,
      speakerId,
      text,
      emotion: segment.dialogueEmotion || 'neutral',
      startMs,
      endMs,
    }]
  })
}
