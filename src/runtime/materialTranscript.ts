import type { MaterialTranscript } from './productionContract.ts'
import { validateMaterialTranscript } from './productionContract.ts'

export interface WhisperOutput {
  duration: number
  segments: Array<{ start: number; end: number; text: string }>
}

export function normalizeWhisperOutput(
  mediaId: string,
  sourceMediaPath: string,
  output: WhisperOutput,
): MaterialTranscript {
  const durationMs = Math.max(1, Math.round(Number(output.duration) * 1000))
  let previousEnd = 0
  const cues = (Array.isArray(output.segments) ? output.segments : []).flatMap((segment, index) => {
    const recognizedText = String(segment.text || '').trim()
    const startMs = Math.max(previousEnd, Math.round(Number(segment.start) * 1000))
    const endMs = Math.min(durationMs, Math.round(Number(segment.end) * 1000))
    if (!recognizedText || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs)
      return []
    previousEnd = endMs
    return [{
      cueId: `${mediaId}-cue-${String(index + 1).padStart(3, '0')}`,
      mediaId,
      startMs,
      endMs,
      recognizedText,
    }]
  })
  return validateMaterialTranscript({
    schemaVersion: 1,
    mediaId,
    sourceMediaPath,
    durationMs,
    cues,
  })
}

function srtTime(milliseconds: number) {
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1000)
  const millis = Math.floor(milliseconds % 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export function materialTranscriptToSrt(transcript: MaterialTranscript) {
  validateMaterialTranscript(transcript)
  return transcript.cues.map((cue, index) =>
    `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.recognizedText}\n`,
  ).join('\n')
}

export function uniqueTranscriptInputs(
  segments: Array<{ index: number; videoPath?: string }>,
) {
  const inputs = new Map<string, {
    mediaId: string
    videoPath: string
    segmentIndexes: number[]
  }>()
  for (const segment of segments) {
    const videoPath = String(segment.videoPath || '').trim()
    if (!videoPath) continue
    const existing = inputs.get(videoPath)
    if (existing) existing.segmentIndexes.push(segment.index)
    else inputs.set(videoPath, {
      mediaId: `media-shot-${String(segment.index).padStart(3, '0')}`,
      videoPath,
      segmentIndexes: [segment.index],
    })
  }
  return [...inputs.values()]
}
