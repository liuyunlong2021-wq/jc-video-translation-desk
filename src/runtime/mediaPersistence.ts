function relativeAsset(runId: string, filePath?: string) {
  if (!filePath) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const marker = `/media-runs/${runId}/`
  const offset = normalized.lastIndexOf(marker)
  return offset >= 0 ? normalized.slice(offset + marker.length) : normalized
}

export function serializeMediaTask(state: any) {
  const copy = JSON.parse(JSON.stringify(state))
  copy.history?.forEach((run: any) => relativizeRun(run))
  if (!copy.runId) return JSON.stringify(copy)
  relativizeRun(copy)
  return JSON.stringify(copy)
}

export function deserializeMediaTask(value: string) {
  const state = JSON.parse(value)
  migrateRun(state)
  state.history?.forEach((run: any) => migrateRun(run))
  return state
}

function relativizeRun(run: any) {
  if (run.coreReference) {
    run.coreReference.relativePath = relativeAsset(run.runId, run.coreReference.relativePath)
  }
  run.voicePath = relativeAsset(run.runId, run.voicePath)
  run.finalPath = relativeAsset(run.runId, run.finalPath)
  run.segments?.forEach((segment: any) => {
    segment.imagePath = relativeAsset(run.runId, segment.imagePath)
    segment.videoPath = relativeAsset(run.runId, segment.videoPath)
  })
}

function migrateRun(run: any) {
  run.segments?.forEach((segment: any) => {
    if (segment.playDuration == null && segment.duration != null) {
      segment.playDuration = Number(segment.duration)
    }
    if (segment.generationDuration == null && segment.playDuration != null) {
      const duration = Number(segment.playDuration)
      segment.generationDuration = duration <= 4 ? 4 : duration <= 6 ? 6 : 8
    }
    if (segment.coreReferenceVisible == null) segment.coreReferenceVisible = false
    delete segment.duration
  })
}
