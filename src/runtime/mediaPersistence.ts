import { assetVersionMatches } from './storyboardMarkdown.ts'

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
  run.referenceAssets?.forEach((asset: any) =>
    asset.versions?.forEach((version: any) => {
      version.relativePath = relativeAsset(run.runId, version.relativePath)
    }),
  )
  run.voicePath = relativeAsset(run.runId, run.voicePath)
  run.finalPath = relativeAsset(run.runId, run.finalPath)
  run.segments?.forEach((segment: any) => {
    segment.imagePath = relativeAsset(run.runId, segment.imagePath)
    segment.videoPath = relativeAsset(run.runId, segment.videoPath)
  })
}

function migrateRun(run: any) {
  const styleMigration: Record<string, string> = {
    'live-action': 'cinematic-contrast',
    illustration: 'cel-cinematic',
    '3d': 'realistic-fantasy-cg',
    clay: 'handmade-clay',
  }
  if (styleMigration[run.styleId]) run.styleId = styleMigration[run.styleId]
  if (
    ![
      'cinematic-contrast',
      'commercial-bright',
      'natural-documentary',
      'ink-wash',
      'cel-cinematic',
      'gongbi-color',
      'eastern-xianxia-cg',
      'realistic-fantasy-cg',
      'handmade-clay',
    ].includes(run.styleId)
  )
    run.styleId = 'cinematic-contrast'
  if (!Number.isInteger(run.targetDuration) || run.targetDuration < 5 || run.targetDuration > 180)
    run.targetDuration = 15
  if (!['auto', 'slow', 'medium', 'fast'].includes(run.shotPace)) run.shotPace = 'auto'
  if (!['slow', 'medium', 'fast'].includes(run.resolvedPace)) run.resolvedPace = null
  if (!['cloud', 'local'].includes(run.voiceEngine)) run.voiceEngine = 'cloud'
  if (
    ![
      'gemini-3.6-flash',
      'claude-fable-5',
      'claude-opus-5',
      'gpt-5.6-sol',
      'deepseek-v4-pro',
    ].includes(run.textModel)
  )
    run.textModel = 'gemini-3.6-flash'
  if (
    ![
      'veo-3.1-generate-preview',
      'veo-3.0-generate-001',
      'rh-grok-image-video',
    ].includes(run.videoModel)
  )
    run.videoModel = 'veo-3.1-generate-preview'
  if (!['script', 'voice', 'shots', 'assets', 'images', 'videos', 'final'].includes(run.workflowStep))
    run.workflowStep = run.workspaceView === 'script' ? 'script' : run.workspaceView || 'script'
  if (!['script', 'storyboard', 'assets', 'media', 'final'].includes(run.workspaceView))
    run.workspaceView = 'script'
  if (!['all', 'references', 'audio', 'storyboards', 'videos'].includes(run.mediaFilter))
    run.mediaFilter = 'all'
  run.rawImports ||= []
  if (!Array.isArray(run.referenceAssets)) run.referenceAssets = []
  const legacyCoreId = run.coreReference?.id
  run.referenceAssets = run.referenceAssets.filter(
    (asset: any) => asset.planKey !== 'legacy-core-reference' && asset.id !== legacyCoreId,
  )
  run.referenceAssets.forEach((asset: any) => {
    if (asset.role === 'product') asset.role = 'prop'
    if (asset.status === 'prompt-ready') asset.status = 'design-ready'
    delete asset.prompt
    asset.versions?.forEach((version: any) => delete version.prompt)
    if (!asset.activeVersionId) {
      const recovered = [...(asset.versions || [])]
        .reverse()
        .find((version: any) => assetVersionMatches(asset, version))
      if (recovered) {
        asset.activeVersionId = recovered.id
        asset.status = 'approved'
      }
    }
  })
  if (!Array.isArray(run.assetPlanCompletedRoles)) run.assetPlanCompletedRoles = []
  run.coreReference = null
  run.finalShotCount ||= run.segments?.length || 0
  run.segments?.forEach((segment: any) => {
    if (segment.playDuration == null && segment.duration != null) {
      segment.playDuration = Number(segment.duration)
    }
    if (segment.generationDuration == null && segment.playDuration != null) {
      const duration = Number(segment.playDuration)
      segment.generationDuration = duration <= 4 ? 4 : duration <= 6 ? 6 : 8
    }
    if (segment.coreReferenceVisible == null) segment.coreReferenceVisible = false
    if (!Array.isArray(segment.referenceAssetIds)) {
      segment.referenceAssetIds =
        segment.coreReferenceVisible && legacyCoreId ? [legacyCoreId] : []
    }
    segment.referenceAssetIds = segment.referenceAssetIds.filter((id: string) => id !== legacyCoreId)
    segment.coreReferenceVisible = false
    segment.storyBeat ||= segment.script || '历史镜头'
    segment.timelineType = segment.timelineType === 'dialogue' ? 'dialogue' : 'action'
    segment.dialogueCharacter ||= '无'
    segment.dialogueText ||= ''
    segment.dialogueEmotion ||= '无'
    segment.emotionIntensity ||= '无'
    segment.speechRate ||= '无'
    segment.pauseEmphasis ||= '无'
    if (!Number.isFinite(Number(segment.dialogueDuration))) segment.dialogueDuration = 0
    segment.lipSyncRequired = Boolean(segment.lipSyncRequired)
    segment.soundDesign ||= '无'
    segment.shotRole ||=
      segment.index === 1
        ? 'hook'
        : segment.index === run.segments.length
          ? 'payoff'
          : 'development'
    segment.editTreatment ||= 'progression'
    segment.shotSize ||= '未记录'
    segment.cameraAngle ||= '未记录'
    segment.cameraMovement ||= '未记录'
    segment.startState ||= '未记录'
    segment.actionProgression ||= '未记录'
    segment.endState ||= '未记录'
    segment.imageVersions ||= []
    segment.videoVersions ||= []
    delete segment.duration
  })
}
