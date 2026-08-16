import { assetVersionMatches } from './storyboardMarkdown.ts'
import { projectDirectorAssets } from './projectDirector.ts'
import { generationDurationFor } from './videoWorkflow.ts'
import { DEFAULT_EPISODE_ID } from './productionContract.ts'

function relativeAsset(runId: string, filePath?: string) {
  if (!filePath) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const marker = `/media-runs/${runId}/`
  const offset = normalized.lastIndexOf(marker)
  return offset >= 0 ? normalized.slice(offset + marker.length) : normalized
}

function isLegacyTranslationSeedPrompt(value: unknown) {
  const prompt = String(value || '')
  return /只生成(?:zh|en)的干净对白人声。/.test(prompt) && /^\s*-\s*\d+-\d+ms\s*\|/m.test(prompt)
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
  run.englishVoicePath = relativeAsset(run.runId, run.englishVoicePath)
  run.vocalPath = relativeAsset(run.runId, run.vocalPath)
  run.instrumentPath = relativeAsset(run.runId, run.instrumentPath)
  run.mixedAudioPath = relativeAsset(run.runId, run.mixedAudioPath)
  run.seedAudioVoicePath = relativeAsset(run.runId, run.seedAudioVoicePath)
  run.seedAudioArrangementPath = relativeAsset(run.runId, run.seedAudioArrangementPath)
  run.seedAudioTrackPath = relativeAsset(run.runId, run.seedAudioTrackPath)
  run.seedAudioDialogueTimelinePath = relativeAsset(run.runId, run.seedAudioDialogueTimelinePath)
  run.seedAudioSrtPath = relativeAsset(run.runId, run.seedAudioSrtPath)
  if (run.seedAudioRolePrompts && typeof run.seedAudioRolePrompts === 'object') {
    run.seedAudioRolePrompts = { ...run.seedAudioRolePrompts }
  }
  run.editingTimelinePath = relativeAsset(run.runId, run.editingTimelinePath)
  run.pictureMasterPath = relativeAsset(run.runId, run.pictureMasterPath)
  run.finalPath = relativeAsset(run.runId, run.finalPath)
  if (run.videoTranslation) {
    for (const key of [
      'sourceVideoPath',
      'finalMasterVideoPath',
      'sourceTranscriptPath',
      'sourceSrtPath',
      'seedArrangementPath',
      'seedPromptPath',
      'targetVoicePath',
      'vocalPath',
      'instrumentPath',
      'mixedPath',
      'finalVideoPath',
    ])
      run.videoTranslation[key] = relativeAsset(run.runId, run.videoTranslation[key])
    run.videoTranslation.voiceVersions?.forEach((version: any) => {
      version.previewPath = relativeAsset(run.runId, version.previewPath)
      version.blocks?.forEach((block: any) => {
        block.audioPath = relativeAsset(run.runId, block.audioPath)
      })
    })
    run.videoTranslation.cues?.forEach((cue: any) => {
      cue.voicePath = relativeAsset(run.runId, cue.voicePath)
    })
  }
  run.segments?.forEach((segment: any) => {
    segment.imagePath = relativeAsset(run.runId, segment.imagePath)
    segment.videoPath = relativeAsset(run.runId, segment.videoPath)
    segment.transcriptJsonPath = relativeAsset(run.runId, segment.transcriptJsonPath)
    segment.transcriptSrtPath = relativeAsset(run.runId, segment.transcriptSrtPath)
    segment.chineseVoicePath = relativeAsset(run.runId, segment.chineseVoicePath)
    segment.englishVoicePath = relativeAsset(run.runId, segment.englishVoicePath)
  })
}

function migrateRun(run: any) {
  if (!/^[A-Za-z0-9_-]+$/.test(run.episodeId)) run.episodeId = DEFAULT_EPISODE_ID
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
      'shonen-action-cel',
      'monochrome-shonen-manga',
      'modern-anime-key-visual',
      'hand-painted-watercolor-animation',
      'dunhuang-mural-animation',
      'paper-cut-shadow-animation',
      'chinese-puppet-stop-motion',
      'origami-animation',
      'comic-minimalism',
      'ink-paper-cut-animation',
      'anime-open-world-3d',
      'dark-chinese-mythology-cg',
      'xianxia-cultivation-animation',
      'victorian-mysticism',
      'creature-collection-animation',
      'cozy-pixel-farm',
      'pixel-underwater-adventure',
      'korean-webtoon-color',
      'korean-webtoon-cinematic',
      'korean-webtoon-romance',
      'korean-webtoon-action',
      'korean-webtoon-dark',
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
  if (!['qwen3-tts', 'indextts2'].includes(run.localVoiceEngine)) run.localVoiceEngine = 'qwen3-tts'
  if (!['design', 'clone'].includes(run.voiceSource)) run.voiceSource = 'clone'
  if (!['keep-original', 'replace-preserve-ambience', 'replace-all'].includes(run.audioMode))
    run.audioMode = 'replace-all'
  if (!['seed-full-track', 'post-dub'].includes(run.audioProductionRoute))
    run.audioProductionRoute = 'seed-full-track'
  if (!['zh', 'en'].includes(run.outputLanguage)) run.outputLanguage = 'zh'
  if (!['idle', 'running', 'ready', 'failed'].includes(run.audioProcessingStatus))
    run.audioProcessingStatus = run.instrumentPath ? 'ready' : 'idle'
  run.englishVoicePath ||= ''
  run.vocalPath ||= ''
  run.instrumentPath ||= ''
  run.mixedAudioPath ||= ''
  run.seedAudioVoicePath ||= ''
  run.seedAudioArrangementPath ||= ''
  run.seedAudioTrackPath ||= ''
  run.seedAudioDialogueTimelinePath ||= ''
  run.seedAudioSrtPath ||= ''
  if (!run.seedAudioRolePrompts || typeof run.seedAudioRolePrompts !== 'object')
    run.seedAudioRolePrompts = {}
  run.seedAudioGlobalPrompt ||= ''
  run.seedAudioDirectorDraftPath ||= ''
  run.seedAudioDuration = Number.isFinite(Number(run.seedAudioDuration))
    ? Number(run.seedAudioDuration)
    : 0
  run.originalVocalRemoved = Boolean(run.originalVocalRemoved)
  if (run.workspaceEntry !== 'video-translate') run.workspaceEntry = 'video-translate'
  if (!Array.isArray(run.videoTranslationRoles)) run.videoTranslationRoles = []
  if (run.videoTranslation && typeof run.videoTranslation === 'object') {
    run.videoTranslation.sourceLanguage ||= 'auto'
    run.videoTranslation.targetLanguage ||= 'en'
    if (
      !['import-srt', 'subtitled-video', 'plain-video'].includes(
        run.videoTranslation.subtitleSourceMode,
      )
    )
      run.videoTranslation.subtitleSourceMode = 'plain-video'
    run.videoTranslation.durationMs = Number.isFinite(Number(run.videoTranslation.durationMs))
      ? Number(run.videoTranslation.durationMs)
      : 0
    run.videoTranslation.hasAudio = Boolean(run.videoTranslation.hasAudio)
    if (!Array.isArray(run.videoTranslation.cues)) run.videoTranslation.cues = []
    if (!Array.isArray(run.videoTranslation.voiceVersions)) run.videoTranslation.voiceVersions = []
    if (
      !run.videoTranslation.groupedVoicePrompts ||
      typeof run.videoTranslation.groupedVoicePrompts !== 'object'
    )
      run.videoTranslation.groupedVoicePrompts = {}
    for (const key of [
      'transcriptStatus',
      'speakerStatus',
      'frameCalibrationStatus',
      'calibrationStatus',
      'translationStatus',
      'reviewStatus',
      'arrangementStatus',
      'voiceStatus',
      'separationStatus',
      'mixStatus',
      'finalStatus',
    ]) {
      if (run.videoTranslation[key] === 'running') run.videoTranslation[key] = 'idle'
      else if (!['idle', 'ready', 'failed', 'stale'].includes(run.videoTranslation[key]))
        run.videoTranslation[key] = 'idle'
    }
    run.videoTranslation.calibrationApplied =
      typeof run.videoTranslation.calibrationApplied === 'boolean'
        ? run.videoTranslation.calibrationApplied
        : run.videoTranslation.speakerStatus === 'ready'
    run.videoTranslation.originalVocalRemoved = Boolean(run.videoTranslation.originalVocalRemoved)
    const legacyPrompt = run.videoTranslation.seedPromptText || run.seedAudioGlobalPrompt
    if (
      !run.videoTranslation.seedPromptGeneratedBySkill &&
      isLegacyTranslationSeedPrompt(legacyPrompt)
    ) {
      run.videoTranslation.seedPromptText = ''
      run.videoTranslation.seedPromptPath = ''
      run.videoTranslation.seedPromptGeneratedBySkill = false
      run.videoTranslation.seedArrangementPath = ''
      run.videoTranslation.targetVoicePath = ''
      run.videoTranslation.arrangementStatus = 'idle'
      run.videoTranslation.voiceStatus = 'idle'
      run.videoTranslation.mixedPath = ''
      run.videoTranslation.mixStatus = 'idle'
      run.videoTranslation.finalVideoPath = ''
      run.videoTranslation.finalStatus = 'idle'
      run.seedAudioGlobalPrompt = ''
      run.seedAudioArrangementPath = ''
      run.seedAudioTrackPath = ''
    }
  } else run.videoTranslation = null
  if (
    ![
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview',
      'doubao-seed-evolving',
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'gpt-5.6-sol',
      'grok-4.5',
      'deepseek-v4-pro',
    ].includes(run.textModel)
  )
    run.textModel = 'gemini-3.6-flash'
  if (
    ![
      'veo-3.1-generate-preview',
      'veo-3.0-generate-001',
      'rh-grok-image-video',
      'rh-seedance2',
    ].includes(run.videoModel)
  )
    run.videoModel = 'veo-3.1-generate-preview'
  if (
    !['script', 'seed-voice', 'voice', 'shots', 'assets', 'images', 'videos', 'final'].includes(
      run.workflowStep,
    )
  )
    run.workflowStep = run.workspaceView === 'script' ? 'script' : run.workspaceView || 'script'
  if (
    ![
      'script',
      'director',
      'storyboard',
      'assets',
      'seed-voice',
      'media',
      'dubbing',
      'final',
    ].includes(run.workspaceView)
  )
    run.workspaceView = 'script'
  if (!['all', 'references', 'audio', 'storyboards', 'videos'].includes(run.mediaFilter))
    run.mediaFilter = 'all'
  run.rawImports ||= []
  run.projectDirectorDraft ||= null
  run.projectDirectorPlan ||= null
  if (
    run.projectDirectorDraft &&
    (!['narration-promo', 'drama'].includes(run.projectDirectorDraft.productionRoute) ||
      !String(run.projectDirectorDraft.routeReason || '').trim())
  )
    run.projectDirectorDraft = null
  if (
    run.projectDirectorPlan &&
    (!['narration-promo', 'drama'].includes(run.projectDirectorPlan.productionRoute) ||
      !String(run.projectDirectorPlan.routeReason || '').trim())
  )
    run.projectDirectorPlan = null
  if (!Array.isArray(run.referenceAssets)) run.referenceAssets = []
  const legacyCoreId = run.coreReference?.id
  run.referenceAssets = run.referenceAssets.filter(
    (asset: any) => asset.planKey !== 'legacy-core-reference' && asset.id !== legacyCoreId,
  )
  run.referenceAssets = projectDirectorAssets(run.projectDirectorPlan, run.referenceAssets)
  const directorAssetIds = run.projectDirectorPlan
    ? new Set(run.projectDirectorPlan.assets.map((asset: any) => asset.id))
    : null
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
  run.pictureMasterPath ||= ''
  run.editingTimelinePath ||= ''
  run.finalShotCount ||= run.segments?.length || 0
  run.segments?.forEach((segment: any) => {
    if (segment.playDuration == null && segment.duration != null) {
      segment.playDuration = Number(segment.duration)
    }
    const playDuration = Number(segment.playDuration)
    if (Number.isFinite(playDuration) && playDuration > 0 && playDuration <= 8)
      segment.generationDuration = generationDurationFor(playDuration)
    if (segment.coreReferenceVisible == null) segment.coreReferenceVisible = false
    if (!Array.isArray(segment.referenceAssetIds)) {
      segment.referenceAssetIds = segment.coreReferenceVisible && legacyCoreId ? [legacyCoreId] : []
    }
    segment.referenceAssetIds = segment.referenceAssetIds.filter(
      (id: string) => id !== legacyCoreId && (!directorAssetIds || directorAssetIds.has(id)),
    )
    segment.coreReferenceVisible = false
    segment.storyBeat ||= segment.script || '历史镜头'
    segment.timelineType = segment.timelineType === 'dialogue' ? 'dialogue' : 'action'
    segment.dialogueCharacter ||= '无'
    segment.dialogueText ||= ''
    segment.englishDialogueText ||= ''
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
    if (!['pending', 'running', 'ready', 'failed'].includes(segment.transcriptStatus))
      segment.transcriptStatus = segment.transcriptSrtPath ? 'ready' : 'pending'
    segment.transcriptError ||= ''
    if (!['pending', 'running', 'ready', 'failed'].includes(segment.editingStatus))
      segment.editingStatus = segment.editingAnalysis ? 'ready' : 'pending'
    segment.editingError ||= ''
    delete segment.grokSequenceId
    delete segment.grokSequenceLeader
    delete segment.duration
  })
}
