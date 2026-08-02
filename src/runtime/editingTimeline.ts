export type AudioMode = 'keep-original' | 'replace-preserve-ambience' | 'replace-all'

export interface EditingTimelineShot {
  shotId: string
  sourceVideoPath: string
  sourceDurationMs: number
  trimStartMs: number
  trimEndMs: number
  outputStartMs: number
  outputEndMs: number
  needsReview: boolean
  dialogue?: {
    speakerId: string
    text: string
    emotion: string
    sourceStartMs?: number
    sourceEndMs?: number
    outputStartMs: number
    outputEndMs: number
  }
}

export interface EditingTimeline { schemaVersion: 1; shots: EditingTimelineShot[] }
export type ShotAnalysis = Omit<EditingTimelineShot, 'outputStartMs' | 'outputEndMs'>

export function buildEditingTimeline(analyses: ShotAnalysis[]): EditingTimeline {
  let cursor = 0
  const shots = analyses.map((analysis) => {
    const validTrim = Number.isFinite(analysis.trimStartMs) && Number.isFinite(analysis.trimEndMs)
      && analysis.trimStartMs >= 0 && analysis.trimStartMs < analysis.trimEndMs
      && analysis.trimEndMs <= analysis.sourceDurationMs
    const trimStartMs = !analysis.needsReview && validTrim ? analysis.trimStartMs : 0
    const trimEndMs = !analysis.needsReview && validTrim ? analysis.trimEndMs : analysis.sourceDurationMs
    const outputStartMs = cursor
    const outputEndMs = cursor += trimEndMs - trimStartMs
    const dialogue = analysis.dialogue && {
      ...analysis.dialogue,
      outputStartMs: outputStartMs + Math.max(0, (analysis.dialogue.sourceStartMs ?? trimStartMs) - trimStartMs),
      outputEndMs: outputStartMs + Math.min(trimEndMs - trimStartMs, (analysis.dialogue.sourceEndMs ?? trimEndMs) - trimStartMs),
    }
    return { ...analysis, trimStartMs, trimEndMs, outputStartMs, outputEndMs, needsReview: analysis.needsReview || !validTrim, dialogue }
  })
  const timeline = { schemaVersion: 1 as const, shots }
  validateEditingTimeline(timeline)
  return timeline
}

export function validateEditingTimeline(timeline: EditingTimeline) {
  let cursor = 0
  for (const shot of timeline.shots) {
    if (!shot.shotId || !shot.sourceVideoPath || shot.sourceDurationMs <= 0) throw new Error('剪辑时间轴缺少有效镜头来源')
    if (shot.trimStartMs < 0 || shot.trimStartMs >= shot.trimEndMs || shot.trimEndMs > shot.sourceDurationMs) throw new Error(`${shot.shotId} 裁切区间无效`)
    if (shot.outputStartMs !== cursor || shot.outputEndMs !== cursor + shot.trimEndMs - shot.trimStartMs) throw new Error(`${shot.shotId} 输出时间轴不连续`)
    if (shot.dialogue && (shot.dialogue.outputStartMs < shot.outputStartMs || shot.dialogue.outputEndMs > shot.outputEndMs || shot.dialogue.outputStartMs >= shot.dialogue.outputEndMs)) throw new Error(`${shot.shotId} 说话窗口无效`)
    cursor = shot.outputEndMs
  }
  return timeline
}

export function timelineSubtitleCues(timeline: EditingTimeline) {
  return timeline.shots.flatMap((shot) => shot.dialogue?.text.trim()
    ? [{ start: shot.dialogue.outputStartMs / 1000, end: shot.dialogue.outputEndMs / 1000, text: shot.dialogue.text.trim() }]
    : [])
}
