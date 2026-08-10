import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CoreReferenceAsset,
  AssetRole,
  ImportedMarkdown,
  PendingCloudTask,
  ProjectDirectorDraft,
  ProjectDirectorPlan,
  ProductionRoute,
  ReferenceAsset,
  ResolvedShotPace,
  ShotPace,
  TargetDuration,
  TextModel,
  VideoModel,
  VideoRatio,
  VoiceEngine,
  LocalVoiceEngine,
  VoiceSource,
  AudioMode,
  AudioProductionRoute,
  OutputLanguage,
  VisualStyleId,
} from '~/electron/types'
import {
  buildGrokSequences,
  isCombinedVideoModel,
  type RevisionProposal,
  type StoryboardSegment,
  type VoiceDesignDraft,
} from '../runtime/videoWorkflow.ts'
import { deserializeMediaTask, serializeMediaTask } from '../runtime/mediaPersistence.ts'
import { DEFAULT_EPISODE_ID } from '../runtime/productionContract.ts'
import {
  createVideoTranslationState,
  invalidateVideoTranslation,
  type TranslationRole,
  type VideoTranslationChange,
  type VideoTranslationState,
  type WorkspaceEntry,
} from '../runtime/videoTranslation.ts'

export type WorkflowStage =
  | 'draft'
  | 'script-generated'
  | 'script-approved'
  | 'voice-plan-ready'
  | 'voice-ready'
  | 'shot-plan-ready'
  | 'assets-ready'
  | 'storyboards-ready'
  | 'videos-ready'
  | 'completed'

export type WorkspaceView = 'script' | 'director' | 'assets' | 'seed-voice' | 'storyboard' | 'media' | 'dubbing' | 'final'
export type MediaFilter = 'all' | 'references' | 'audio' | 'storyboards' | 'videos'
export type WorkflowStep =
  | 'script'
  | 'seed-voice'
  | 'voice'
  | 'assets'
  | 'shots'
  | 'images'
  | 'videos'
  | 'final'
export type { VoiceSource, AudioMode } from '~/electron/types'

export interface MediaRunSnapshot {
  request: string
  rawImports: ImportedMarkdown[]
  script: string
  approvedScript: string
  scriptHash: string
  projectDirectorDraft: ProjectDirectorDraft | null
  projectDirectorPlan: ProjectDirectorPlan | null
  ratio: VideoRatio
  targetDuration: TargetDuration
  textModel: TextModel
  videoModel: VideoModel
  shotPace: ShotPace
  resolvedPace: ResolvedShotPace | null
  styleId: VisualStyleId
  coreReference: CoreReferenceAsset | null
  referenceAssets: ReferenceAsset[]
  assetPlanCompletedRoles: AssetRole[]
  runId: string
  episodeId: string
  stage: WorkflowStage
  voicePlan: VoiceDesignDraft | null
  voiceEngine: VoiceEngine
  localVoiceEngine: LocalVoiceEngine
  voiceSource: VoiceSource
  audioMode: AudioMode
  audioProductionRoute: AudioProductionRoute
  seedAudioVoicePath: string
  seedAudioArrangementPath: string
  seedAudioTrackPath: string
  seedAudioDialogueTimelinePath: string
  seedAudioSrtPath: string
  seedAudioDuration: number
  seedAudioRolePrompts: Record<string, string>
  seedAudioGlobalPrompt: string
  seedAudioDirectorDraftPath: string
  voicePath: string
  englishVoicePath: string
  voiceDuration: number
  outputLanguage: OutputLanguage
  vocalPath: string
  instrumentPath: string
  mixedAudioPath: string
  originalVocalRemoved: boolean
  audioProcessingStatus: 'idle' | 'running' | 'ready' | 'failed'
  creativeIdentity: string
  sceneReference: string
  rhythmArchive: string
  distributionIntent: string
  referenceShotCount?: number
  finalShotCount: number
  shotCountRationale: string
  visualAnchor: string
  segments: StoryboardSegment[]
  editingTimelinePath: string
  pictureMasterPath: string
  finalPath: string
}

export const useMediaTaskStore = defineStore(
  'media-task',
  () => {
    const request = ref('')
    const rawImports = ref<ImportedMarkdown[]>([])
    const script = ref('')
    const approvedScript = ref('')
    const scriptHash = ref('')
    const projectDirectorDraft = ref<ProjectDirectorDraft | null>(null)
    const projectDirectorPlan = ref<ProjectDirectorPlan | null>(null)
    const ratio = ref<VideoRatio>('9:16')
    const targetDuration = ref<TargetDuration>(15)
    const textModel = ref<TextModel>('gemini-3.6-flash')
    const videoModel = ref<VideoModel>('veo-3.1-generate-preview')
    const shotPace = ref<ShotPace>('auto')
    const resolvedPace = ref<ResolvedShotPace | null>(null)
    const styleId = ref<VisualStyleId>('cinematic-contrast')
    const coreReference = ref<CoreReferenceAsset | null>(null)
    const referenceAssets = ref<ReferenceAsset[]>([])
    const assetPlanCompletedRoles = ref<AssetRole[]>([])
    const runId = ref('')
    const episodeId = ref(DEFAULT_EPISODE_ID)
    const stage = ref<WorkflowStage>('draft')
    const voicePlan = ref<VoiceDesignDraft | null>(null)
    const voiceEngine = ref<VoiceEngine>('cloud')
    const localVoiceEngine = ref<LocalVoiceEngine>('qwen3-tts')
    const voiceSource = ref<VoiceSource>('clone')
    const audioMode = ref<AudioMode>('replace-all')
    const audioProductionRoute = ref<AudioProductionRoute>('seed-full-track')
    const seedAudioVoicePath = ref('')
    const seedAudioArrangementPath = ref('')
    const seedAudioTrackPath = ref('')
    const seedAudioDialogueTimelinePath = ref('')
    const seedAudioSrtPath = ref('')
    const seedAudioDuration = ref(0)
    const seedAudioRolePrompts = ref<Record<string, string>>({})
    const seedAudioGlobalPrompt = ref('')
    const seedAudioDirectorDraftPath = ref('')
    const seedVoiceTab = ref<'roles' | 'global'>('roles')
    const voicePath = ref('')
    const englishVoicePath = ref('')
    const voiceDuration = ref(0)
    const outputLanguage = ref<OutputLanguage>('zh')
    const vocalPath = ref('')
    const instrumentPath = ref('')
    const mixedAudioPath = ref('')
    const originalVocalRemoved = ref(false)
    const audioProcessingStatus = ref<'idle' | 'running' | 'ready' | 'failed'>('idle')
    const creativeIdentity = ref('')
    const sceneReference = ref('')
    const rhythmArchive = ref('')
    const distributionIntent = ref('')
    const referenceShotCount = ref<number>()
    const finalShotCount = ref(0)
    const shotCountRationale = ref('')
    const visualAnchor = ref('')
    const segments = ref<StoryboardSegment[]>([])
    const editingTimelinePath = ref('')
    const pictureMasterPath = ref('')
    const finalPath = ref('')
    const workspaceEntry = ref<WorkspaceEntry>('video-translate')
    const videoTranslationRoles = ref<TranslationRole[]>([])
    const videoTranslation = ref<VideoTranslationState | null>(null)
    const busyAction = ref('')
    const cancelRequested = ref(false)
    const error = ref('')
    const apiConfigured = ref(false)
    const history = ref<MediaRunSnapshot[]>([])
    const cloudTasks = ref<PendingCloudTask[]>([])
    const workspaceView = ref<WorkspaceView>('script')
    const workflowStep = ref<WorkflowStep>('script')
    const mediaFilter = ref<MediaFilter>('all')
    const selectedShotIndex = ref<number>()
    const selectedAssetId = ref<string>()
    const scriptEditing = ref(false)
    const revisionProposal = ref<RevisionProposal | null>(null)
    const revisionUndo = ref<{
      targetType:
        | 'script'
        | 'project-director'
        | 'voice-plan'
        | 'seed-role-prompt'
        | 'seed-global-prompt'
        | 'asset-prompt'
        | 'shot'
      value: any
    } | null>(null)

    const allImagesReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.imageStatus === 'success'),
    )
    const allVideosReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.videoStatus === 'success'),
    )
    const allTranscriptsReady = computed(
      () =>
        segments.value.length > 0 &&
        segments.value.every((item) => item.transcriptStatus === 'ready'),
    )
    const allEditingReady = computed(
      () =>
        Boolean(editingTimelinePath.value) &&
        allTranscriptsReady.value &&
        segments.value.every((item) => item.editingStatus === 'ready' && item.editingAnalysis),
    )
    const allRequiredAssetsApproved = computed(() =>
      referenceAssets.value
        .filter((asset) => asset.required)
        .every(
          (asset) =>
            Boolean(asset.activeVersionId) &&
            asset.versions.some((version) => version.id === asset.activeVersionId),
        ),
    )
    const assetPlanningComplete = computed(
      () =>
        Boolean(confirmedProductionRoute.value) &&
        ((assetPlanCompletedRoles.value.includes('character') &&
          assetPlanCompletedRoles.value.includes('scene') &&
          assetPlanCompletedRoles.value.includes('prop')) ||
          (referenceAssets.value.length > 0 &&
            referenceAssets.value.every((asset) => Boolean(asset.design)))),
    )
    const requiredSpeakerIds = computed(() => [
      ...new Set(
        segments.value
          .filter((segment) => segment.soundType && segment.soundType !== 'none')
          .map((segment) => segment.speakerId || '')
          .filter(Boolean),
      ),
    ])
    const hasSoundSegments = computed(() =>
      segments.value.some((segment) => segment.soundType && segment.soundType !== 'none'),
    )
    const voiceReady = computed(
      () =>
        segments.value.length > 0 &&
        (!hasSoundSegments.value ||
          audioMode.value === 'keep-original' ||
          Boolean(outputLanguage.value === 'zh' ? voicePath.value : englishVoicePath.value)),
    )
    const confirmedProductionRoute = computed<ProductionRoute | null>(() =>
      projectDirectorPlan.value && !projectDirectorDraft.value
        ? projectDirectorPlan.value.productionRoute
        : null,
    )

    function invalidateAudioProcessing(keepStems = false) {
      if (!keepStems) {
        vocalPath.value = ''
        instrumentPath.value = ''
        originalVocalRemoved.value = false
      }
      mixedAudioPath.value = ''
      audioProcessingStatus.value = keepStems && instrumentPath.value ? 'ready' : 'idle'
      finalPath.value = ''
    }

    function selectWorkspaceEntry(entry: WorkspaceEntry) {
      workspaceEntry.value = entry
      error.value = ''
      if (entry === 'video-translate' && !videoTranslation.value)
        videoTranslation.value = createVideoTranslationState()
    }

    function invalidateTranslation(change: VideoTranslationChange) {
      if (videoTranslation.value)
        videoTranslation.value = invalidateVideoTranslation(videoTranslation.value, change)
    }

    function invalidateFrom(level: 'script' | 'voice' | 'images' | 'videos') {
      editingTimelinePath.value = ''
      pictureMasterPath.value = ''
      invalidateAudioProcessing()
      if (level === 'videos') return
      segments.value.forEach((segment) => {
        segment.videoPath = ''
        segment.videoStatus = segment.imagePath ? 'pending' : undefined
        segment.transcriptStatus = 'pending'
        segment.transcriptMediaId = undefined
        segment.transcriptJsonPath = undefined
        segment.transcriptSrtPath = undefined
        segment.transcriptError = ''
        segment.editingStatus = 'pending'
        segment.editingAnalysis = undefined
        segment.editingError = ''
      })
      if (level === 'images') return
      if (level === 'voice' || level === 'script') {
        seedAudioRolePrompts.value = {}
        seedAudioGlobalPrompt.value = ''
        seedAudioDirectorDraftPath.value = ''
        seedAudioArrangementPath.value = ''
        seedAudioTrackPath.value = ''
        seedAudioDialogueTimelinePath.value = ''
        seedAudioSrtPath.value = ''
        seedAudioDuration.value = 0
      }
      visualAnchor.value = ''
      creativeIdentity.value = ''
      sceneReference.value = ''
      rhythmArchive.value = ''
      distributionIntent.value = ''
      referenceShotCount.value = undefined
      finalShotCount.value = 0
      shotCountRationale.value = ''
      resolvedPace.value = null
      segments.value = []
      if (level === 'voice') return
      projectDirectorDraft.value = null
      projectDirectorPlan.value = null
      referenceAssets.value = []
      assetPlanCompletedRoles.value = []
      voicePlan.value = null
      voicePath.value = ''
      englishVoicePath.value = ''
      voiceDuration.value = 0
    }

    function invalidateVisuals() {
      editingTimelinePath.value = ''
      pictureMasterPath.value = ''
      invalidateAudioProcessing()
      visualAnchor.value = ''
      creativeIdentity.value = ''
      sceneReference.value = ''
      rhythmArchive.value = ''
      distributionIntent.value = ''
      referenceShotCount.value = undefined
      finalShotCount.value = 0
      shotCountRationale.value = ''
      resolvedPace.value = null
      segments.value = []
      projectDirectorDraft.value = null
      projectDirectorPlan.value = null
      referenceAssets.value = []
      assetPlanCompletedRoles.value = []
    }

    function setVoicePrompt(value: string) {
      if (!voicePlan.value || voicePlan.value.voicePrompt === value) return
      voicePlan.value.voicePrompt = value
      invalidateFrom('voice')
      voicePath.value = ''
      englishVoicePath.value = ''
      voiceDuration.value = 0
      stage.value = 'voice-plan-ready'
    }

    function confirmProjectDirector(plan: ProjectDirectorPlan, assets: ReferenceAsset[]) {
      invalidateFrom('script')
      projectDirectorDraft.value = null
      projectDirectorPlan.value = plan
      referenceAssets.value = assets
      stage.value = 'script-approved'
    }

    function setProjectDirectorRoute(route: ProductionRoute) {
      if (!['narration-promo', 'drama'].includes(route)) return
      const source = projectDirectorDraft.value || projectDirectorPlan.value
      if (!source || source.productionRoute === route) return
      projectDirectorDraft.value = {
        ...JSON.parse(JSON.stringify(source)),
        productionRoute: route,
        routeReason: `用户手动选择${route === 'narration-promo' ? '旁白宣传片' : '剧情片'}路线`,
      }
      selectView('director')
    }

    function setVisualAnchor(value: string) {
      if (visualAnchor.value === value) return
      visualAnchor.value = value
      editingTimelinePath.value = ''
      pictureMasterPath.value = ''
      invalidateAudioProcessing()
      segments.value.forEach((segment) => {
        segment.imagePath = ''
        segment.imageStatus = 'pending'
        segment.videoPath = ''
        segment.videoStatus = 'pending'
        segment.transcriptStatus = 'pending'
        segment.transcriptMediaId = undefined
        segment.transcriptJsonPath = undefined
        segment.transcriptSrtPath = undefined
        segment.transcriptError = ''
        segment.error = ''
      })
      stage.value = 'shot-plan-ready'
    }

    function setSegmentPrompt(
      index: number,
      field: 'storyboardImagePrompt' | 'videoPrompt',
      value: string,
    ) {
      const segment = segments.value.find((item) => item.index === index)
      if (!segment || segment[field] === value) return
      segment[field] = value
      invalidateShot(index, field === 'storyboardImagePrompt' ? 'image' : 'video')
    }

    function selectView(view: WorkspaceView) {
      workspaceView.value = view
      if (view === 'storyboard') workflowStep.value = 'shots'
      else if (view === 'director') workflowStep.value = 'assets'
      else if (view === 'assets') workflowStep.value = 'assets'
      else if (view === 'seed-voice') workflowStep.value = 'seed-voice'
      else if (view === 'dubbing') workflowStep.value = 'voice'
      else if (view === 'final') workflowStep.value = 'final'
      else if (
        view === 'media' &&
        workflowStep.value !== 'images' &&
        workflowStep.value !== 'videos'
      )
        workflowStep.value = mediaFilter.value === 'videos' ? 'videos' : 'images'
      else if (view === 'script' && workflowStep.value !== 'script') workflowStep.value = 'script'
      if (view !== 'storyboard') selectedShotIndex.value = undefined
      if (view !== 'media' && view !== 'assets' && view !== 'seed-voice')
        selectedAssetId.value = undefined
      revisionProposal.value = null
    }

    function selectStep(step: WorkflowStep) {
      selectView(
        step === 'script'
          ? 'script'
          : step === 'voice'
            ? 'dubbing'
            : step === 'seed-voice'
              ? 'seed-voice'
              : step === 'shots'
                ? 'storyboard'
                : step === 'assets'
                  ? confirmedProductionRoute.value
                    ? 'assets'
                    : 'director'
                  : step === 'images' || step === 'videos'
                    ? 'media'
                    : 'final',
      )
      workflowStep.value = step
      if (step === 'images') mediaFilter.value = 'storyboards'
      if (step === 'videos') mediaFilter.value = 'videos'
    }

    function setVoiceSource(value: VoiceSource) {
      if (voiceSource.value === value) return
      voiceSource.value = value
      voicePath.value = ''
      englishVoicePath.value = ''
      voiceDuration.value = 0
      invalidateAudioProcessing(true)
    }

    function setAudioMode(value: AudioMode) {
      if (audioMode.value === value) return
      audioMode.value = value
      invalidateAudioProcessing()
    }

    function setAudioProductionRoute(value: AudioProductionRoute) {
      if (audioProductionRoute.value === value) return
      audioProductionRoute.value = value
      invalidateFrom('voice')
    }

    function setOutputLanguage(value: OutputLanguage) {
      if (outputLanguage.value === value) return
      outputLanguage.value = value
      invalidateAudioProcessing(true)
    }

    function selectShot(index?: number) {
      workspaceView.value = 'storyboard'
      workflowStep.value = 'shots'
      selectedShotIndex.value = index
      selectedAssetId.value = undefined
      scriptEditing.value = false
      revisionProposal.value = null
    }

    function selectAsset(id?: string) {
      workspaceView.value = 'assets'
      workflowStep.value = 'assets'
      selectedAssetId.value = id
      selectedShotIndex.value = undefined
      revisionProposal.value = null
    }

    function invalidateShot(index: number, from: 'image' | 'video') {
      const segment = segments.value.find((item) => item.index === index)
      if (!segment) return
      editingTimelinePath.value = ''
      pictureMasterPath.value = ''
      invalidateAudioProcessing()
      const sequence = isCombinedVideoModel(videoModel.value)
        ? buildGrokSequences(segments.value, videoModel.value).find((item) =>
            item.segments.includes(segment),
          )
        : undefined
      const targets = sequence?.segments || [segment]
      targets.forEach((item) => {
        if (from === 'image') {
          item.imagePath = ''
          item.imageStatus = 'pending'
        }
        item.videoPath = ''
        item.videoStatus = 'pending'
        item.transcriptStatus = 'pending'
        item.transcriptMediaId = undefined
        item.transcriptJsonPath = undefined
        item.transcriptSrtPath = undefined
        item.transcriptError = ''
        item.editingStatus = 'pending'
        item.editingAnalysis = undefined
        item.editingError = ''
        item.error = ''
      })
      stage.value = from === 'image' ? 'shot-plan-ready' : 'storyboards-ready'
    }

    function adoptAssetVersion(assetId: string, versionId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      if (!asset || !asset.versions.some((version) => version.id === versionId)) return
      const changed = asset.activeVersionId !== versionId
      asset.activeVersionId = versionId
      asset.pendingVersionId = undefined
      asset.status = 'approved'
      if (!changed) return
      segments.value
        .filter((segment) => segment.referenceAssetIds.includes(assetId))
        .forEach((segment) => invalidateShot(segment.index, 'image'))
    }

    function currentAssetVersion(assetId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      return asset?.versions.find((version) => version.id === asset.activeVersionId)
    }

    function currentGeneratedAssetVersion(assetId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      if (!asset) return undefined
      return (
        asset.versions.find(
          (version) => version.id === asset.activeVersionId && version.source === 'generated',
        ) || [...asset.versions].reverse().find((version) => version.source === 'generated')
      )
    }

    function removeAssetReferenceVersion(assetId: string, versionId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      const version = asset?.versions.find((item) => item.id === versionId)
      if (!asset || !version || version.source === 'generated') return
      const pinId = version.sourcePageUrl?.match(/\/pin\/(\d+)/)?.[1]
      if (pinId && !asset.rejectedReferencePinIds?.includes(pinId))
        asset.rejectedReferencePinIds = [...(asset.rejectedReferencePinIds || []), pinId]
      asset.versions = asset.versions.filter((item) => item.id !== versionId)
      asset.referenceRevision = (asset.referenceRevision || 0) + 1
      if (asset.pendingVersionId === versionId) asset.pendingVersionId = undefined
      if (asset.activeVersionId === versionId) asset.activeVersionId = undefined
      const fallback = [...asset.versions].reverse().find((item) => item.source !== 'generated')
      if (fallback) {
        asset.pendingVersionId = fallback.id
        asset.status = 'ready'
      } else {
        const generated =
          asset.versions.find(
            (item) => item.id === asset.activeVersionId && item.source === 'generated',
          ) || [...asset.versions].reverse().find((item) => item.source === 'generated')
        asset.activeVersionId = generated?.id
        asset.status = generated ? 'ready' : 'design-ready'
      }
    }

    function removeGeneratedAssetVersion(assetId: string, versionId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      const version = asset?.versions.find((item) => item.id === versionId)
      if (!asset || !version || version.source !== 'generated') return
      const wasActive = asset.activeVersionId === versionId
      asset.versions = asset.versions.filter((item) => item.id !== versionId)
      if (!wasActive) return
      const fallback = [...asset.versions].reverse().find((item) => item.source === 'generated')
      asset.activeVersionId = fallback?.id
      asset.status = fallback ? 'approved' : asset.design ? 'design-ready' : 'planned'
      segments.value
        .filter((segment) => segment.referenceAssetIds.includes(assetId))
        .forEach((segment) => invalidateShot(segment.index, 'image'))
    }

    function reset() {
      request.value = ''
      rawImports.value = []
      script.value = ''
      approvedScript.value = ''
      scriptHash.value = ''
      projectDirectorDraft.value = null
      projectDirectorPlan.value = null
      runId.value = ''
      episodeId.value = DEFAULT_EPISODE_ID
      targetDuration.value = 15
      textModel.value = 'gemini-3.6-flash'
      videoModel.value = 'veo-3.1-generate-preview'
      shotPace.value = 'auto'
      resolvedPace.value = null
      styleId.value = 'cinematic-contrast'
      coreReference.value = null
      referenceAssets.value = []
      assetPlanCompletedRoles.value = []
      stage.value = 'draft'
      voicePlan.value = null
      voiceSource.value = 'clone'
      audioMode.value = 'replace-all'
      audioProductionRoute.value = 'seed-full-track'
      seedAudioVoicePath.value = ''
      seedAudioArrangementPath.value = ''
      seedAudioTrackPath.value = ''
      seedAudioDialogueTimelinePath.value = ''
      seedAudioSrtPath.value = ''
      seedAudioDuration.value = 0
      seedAudioRolePrompts.value = {}
      seedAudioGlobalPrompt.value = ''
      seedAudioDirectorDraftPath.value = ''
      voicePath.value = ''
      englishVoicePath.value = ''
      voiceDuration.value = 0
      outputLanguage.value = 'zh'
      vocalPath.value = ''
      instrumentPath.value = ''
      mixedAudioPath.value = ''
      originalVocalRemoved.value = false
      audioProcessingStatus.value = 'idle'
      creativeIdentity.value = ''
      sceneReference.value = ''
      rhythmArchive.value = ''
      distributionIntent.value = ''
      referenceShotCount.value = undefined
      finalShotCount.value = 0
      shotCountRationale.value = ''
      visualAnchor.value = ''
      segments.value = []
      editingTimelinePath.value = ''
      pictureMasterPath.value = ''
      finalPath.value = ''
      workspaceEntry.value = 'video-translate'
      videoTranslationRoles.value = []
      videoTranslation.value = null
      busyAction.value = ''
      cancelRequested.value = false
      error.value = ''
      cloudTasks.value = []
      workspaceView.value = 'script'
      workflowStep.value = 'script'
      mediaFilter.value = 'all'
      selectedShotIndex.value = undefined
      selectedAssetId.value = undefined
      scriptEditing.value = false
      revisionProposal.value = null
      revisionUndo.value = null
    }

    function archiveCurrent() {
      if (!runId.value) return
      const snapshot: MediaRunSnapshot = JSON.parse(
        JSON.stringify({
          request: request.value,
          rawImports: rawImports.value,
          script: script.value,
          approvedScript: approvedScript.value,
          scriptHash: scriptHash.value,
          projectDirectorDraft: projectDirectorDraft.value,
          projectDirectorPlan: projectDirectorPlan.value,
          ratio: ratio.value,
          targetDuration: targetDuration.value,
          textModel: textModel.value,
          videoModel: videoModel.value,
          shotPace: shotPace.value,
          resolvedPace: resolvedPace.value,
          styleId: styleId.value,
          coreReference: coreReference.value,
          referenceAssets: referenceAssets.value,
          assetPlanCompletedRoles: assetPlanCompletedRoles.value,
          runId: runId.value,
          episodeId: episodeId.value,
          stage: stage.value,
          voicePlan: voicePlan.value,
          voiceEngine: voiceEngine.value,
          localVoiceEngine: localVoiceEngine.value,
          voiceSource: voiceSource.value,
          audioMode: audioMode.value,
          audioProductionRoute: audioProductionRoute.value,
          seedAudioVoicePath: seedAudioVoicePath.value,
          seedAudioArrangementPath: seedAudioArrangementPath.value,
          seedAudioTrackPath: seedAudioTrackPath.value,
          seedAudioDialogueTimelinePath: seedAudioDialogueTimelinePath.value,
          seedAudioSrtPath: seedAudioSrtPath.value,
          seedAudioDuration: seedAudioDuration.value,
          seedAudioRolePrompts: seedAudioRolePrompts.value,
          seedAudioGlobalPrompt: seedAudioGlobalPrompt.value,
          seedAudioDirectorDraftPath: seedAudioDirectorDraftPath.value,
          voicePath: voicePath.value,
          englishVoicePath: englishVoicePath.value,
          voiceDuration: voiceDuration.value,
          outputLanguage: outputLanguage.value,
          vocalPath: vocalPath.value,
          instrumentPath: instrumentPath.value,
          mixedAudioPath: mixedAudioPath.value,
          originalVocalRemoved: originalVocalRemoved.value,
          audioProcessingStatus: audioProcessingStatus.value,
          creativeIdentity: creativeIdentity.value,
          sceneReference: sceneReference.value,
          rhythmArchive: rhythmArchive.value,
          distributionIntent: distributionIntent.value,
          referenceShotCount: referenceShotCount.value,
          finalShotCount: finalShotCount.value,
          shotCountRationale: shotCountRationale.value,
          visualAnchor: visualAnchor.value,
          segments: segments.value,
          editingTimelinePath: editingTimelinePath.value,
          pictureMasterPath: pictureMasterPath.value,
          finalPath: finalPath.value,
        }),
      )
      history.value = [snapshot, ...history.value.filter((run) => run.runId !== runId.value)]
    }

    return {
      request,
      rawImports,
      script,
      approvedScript,
      scriptHash,
      projectDirectorDraft,
      projectDirectorPlan,
      ratio,
      targetDuration,
      textModel,
      videoModel,
      shotPace,
      resolvedPace,
      styleId,
      coreReference,
      referenceAssets,
      assetPlanCompletedRoles,
      runId,
      episodeId,
      stage,
      voicePlan,
      voiceEngine,
      localVoiceEngine,
      voiceSource,
      audioMode,
      audioProductionRoute,
      seedAudioVoicePath,
      seedAudioArrangementPath,
      seedAudioTrackPath,
      seedAudioDialogueTimelinePath,
      seedAudioSrtPath,
      seedAudioDuration,
      seedAudioRolePrompts,
      seedAudioGlobalPrompt,
      seedAudioDirectorDraftPath,
      seedVoiceTab,
      voicePath,
      englishVoicePath,
      voiceDuration,
      outputLanguage,
      vocalPath,
      instrumentPath,
      mixedAudioPath,
      originalVocalRemoved,
      audioProcessingStatus,
      creativeIdentity,
      sceneReference,
      rhythmArchive,
      distributionIntent,
      referenceShotCount,
      finalShotCount,
      shotCountRationale,
      visualAnchor,
      segments,
      editingTimelinePath,
      pictureMasterPath,
      finalPath,
      workspaceEntry,
      videoTranslationRoles,
      videoTranslation,
      busyAction,
      cancelRequested,
      error,
      apiConfigured,
      history,
      cloudTasks,
      workspaceView,
      workflowStep,
      mediaFilter,
      selectedShotIndex,
      selectedAssetId,
      scriptEditing,
      revisionProposal,
      revisionUndo,
      allImagesReady,
      allVideosReady,
      allTranscriptsReady,
      allEditingReady,
      allRequiredAssetsApproved,
      assetPlanningComplete,
      confirmedProductionRoute,
      requiredSpeakerIds,
      hasSoundSegments,
      voiceReady,
      invalidateFrom,
      invalidateVisuals,
      setVoicePrompt,
      confirmProjectDirector,
      setProjectDirectorRoute,
      setVisualAnchor,
      setSegmentPrompt,
      selectView,
      selectStep,
      setVoiceSource,
      setAudioMode,
      setAudioProductionRoute,
      setOutputLanguage,
      invalidateAudioProcessing,
      selectWorkspaceEntry,
      invalidateTranslation,
      selectShot,
      selectAsset,
      invalidateShot,
      adoptAssetVersion,
      currentAssetVersion,
      currentGeneratedAssetVersion,
      removeAssetReferenceVersion,
      removeGeneratedAssetVersion,
      archiveCurrent,
      reset,
    }
  },
  {
    persist: {
      omit: [
        'busyAction',
        'cancelRequested',
        'error',
        'cloudTasks',
        'apiConfigured',
        'scriptEditing',
        'revisionProposal',
        'revisionUndo',
      ],
      serializer: {
        serialize: serializeMediaTask,
        deserialize: deserializeMediaTask,
      },
    },
  },
)
