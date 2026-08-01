import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CoreReferenceAsset,
  AssetRole,
  ImportedMarkdown,
  PendingCloudTask,
  ReferenceAsset,
  ResolvedShotPace,
  ShotPace,
  TargetDuration,
  TextModel,
  VideoModel,
  VideoRatio,
  VoiceEngine,
  VisualStyleId,
} from '~/electron/types'
import type {
  RevisionProposal,
  StoryboardSegment,
  VoiceDesignDraft,
} from '../runtime/videoWorkflow.ts'
import { deserializeMediaTask, serializeMediaTask } from '../runtime/mediaPersistence.ts'

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

export type WorkspaceView = 'script' | 'assets' | 'storyboard' | 'media' | 'final'
export type MediaFilter = 'all' | 'references' | 'audio' | 'storyboards' | 'videos'
export type WorkflowStep = 'script' | 'voice' | 'assets' | 'shots' | 'images' | 'videos' | 'final'

export interface MediaRunSnapshot {
  request: string
  rawImports: ImportedMarkdown[]
  script: string
  approvedScript: string
  scriptHash: string
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
  stage: WorkflowStage
  voicePlan: VoiceDesignDraft | null
  voiceEngine: VoiceEngine
  voicePath: string
  voiceDuration: number
  creativeIdentity: string
  sceneReference: string
  rhythmArchive: string
  distributionIntent: string
  referenceShotCount?: number
  finalShotCount: number
  shotCountRationale: string
  visualAnchor: string
  segments: StoryboardSegment[]
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
    const stage = ref<WorkflowStage>('draft')
    const voicePlan = ref<VoiceDesignDraft | null>(null)
    const voiceEngine = ref<VoiceEngine>('cloud')
    const voicePath = ref('')
    const voiceDuration = ref(0)
    const creativeIdentity = ref('')
    const sceneReference = ref('')
    const rhythmArchive = ref('')
    const distributionIntent = ref('')
    const referenceShotCount = ref<number>()
    const finalShotCount = ref(0)
    const shotCountRationale = ref('')
    const visualAnchor = ref('')
    const segments = ref<StoryboardSegment[]>([])
    const finalPath = ref('')
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
      targetType: 'script' | 'voice-plan' | 'asset-prompt' | 'shot'
      value: any
    } | null>(
      null,
    )

    const allImagesReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.imageStatus === 'success'),
    )
    const allVideosReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.videoStatus === 'success'),
    )
    const allRequiredAssetsApproved = computed(() =>
      referenceAssets.value
        .filter((asset) => asset.required)
        .every((asset) => asset.versions.some((version) => version.source === 'generated')),
    )
    const assetPlanningComplete = computed(
      () =>
        assetPlanCompletedRoles.value.includes('character') &&
        assetPlanCompletedRoles.value.includes('scene') &&
        assetPlanCompletedRoles.value.includes('prop'),
    )

    function invalidateFrom(level: 'script' | 'voice' | 'images' | 'videos') {
      finalPath.value = ''
      if (level === 'videos') return
      segments.value.forEach((segment) => {
        segment.videoPath = ''
        segment.videoStatus = segment.imagePath ? 'pending' : undefined
      })
      if (level === 'images') return
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
      referenceAssets.value = []
      assetPlanCompletedRoles.value = []
      voicePlan.value = null
      voicePath.value = ''
      voiceDuration.value = 0
    }

    function invalidateVisuals() {
      finalPath.value = ''
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
      referenceAssets.value = []
      assetPlanCompletedRoles.value = []
    }

    function setVoicePrompt(value: string) {
      if (!voicePlan.value || voicePlan.value.voicePrompt === value) return
      voicePlan.value.voicePrompt = value
      invalidateFrom('voice')
      voicePath.value = ''
      voiceDuration.value = 0
      stage.value = 'voice-plan-ready'
    }

    function setVisualAnchor(value: string) {
      if (visualAnchor.value === value) return
      visualAnchor.value = value
      finalPath.value = ''
      segments.value.forEach((segment) => {
        segment.imagePath = ''
        segment.imageStatus = 'pending'
        segment.videoPath = ''
        segment.videoStatus = 'pending'
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
      finalPath.value = ''
      if (field === 'storyboardImagePrompt') {
        segment.imagePath = ''
        segment.imageStatus = 'pending'
      }
      segment.videoPath = ''
      segment.videoStatus = 'pending'
      segment.error = ''
      stage.value =
        field === 'videoPrompt' && allImagesReady.value ? 'storyboards-ready' : 'shot-plan-ready'
    }

    function selectView(view: WorkspaceView) {
      workspaceView.value = view
      if (view === 'storyboard') workflowStep.value = 'shots'
      else if (view === 'assets') workflowStep.value = 'assets'
      else if (view === 'final') workflowStep.value = 'final'
      else if (view === 'media' && workflowStep.value !== 'images' && workflowStep.value !== 'videos')
        workflowStep.value = mediaFilter.value === 'videos' ? 'videos' : 'images'
      else if (view === 'script' && workflowStep.value !== 'script' && workflowStep.value !== 'voice')
        workflowStep.value = approvedScript.value ? 'voice' : 'script'
      if (view !== 'storyboard') selectedShotIndex.value = undefined
      if (view !== 'media' && view !== 'assets') selectedAssetId.value = undefined
      revisionProposal.value = null
    }

    function selectStep(step: WorkflowStep) {
      workflowStep.value = step
      selectView(
        step === 'script' || step === 'voice'
          ? 'script'
          : step === 'shots'
            ? 'storyboard'
            : step === 'assets'
              ? 'assets'
              : step === 'images' || step === 'videos'
                ? 'media'
                : 'final',
      )
      if (step === 'images') mediaFilter.value = 'storyboards'
      if (step === 'videos') mediaFilter.value = 'videos'
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
      finalPath.value = ''
      if (from === 'image') {
        segment.imagePath = ''
        segment.imageStatus = 'pending'
      }
      segment.videoPath = ''
      segment.videoStatus = 'pending'
      segment.error = ''
      stage.value = from === 'image' ? 'shot-plan-ready' : 'storyboards-ready'
    }

    function adoptAssetVersion(assetId: string, versionId: string) {
      const asset = referenceAssets.value.find((item) => item.id === assetId)
      if (
        !asset ||
        !asset.versions.some(
          (version) => version.id === versionId && version.source === 'generated',
        )
      )
        return
      const changed = asset.activeVersionId && asset.activeVersionId !== versionId
      asset.activeVersionId = versionId
      asset.pendingVersionId = undefined
      asset.status = 'approved'
      if (!changed) return
      segments.value
        .filter((segment) => segment.referenceAssetIds.includes(assetId))
        .forEach((segment) => invalidateShot(segment.index, 'image'))
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
          asset.versions.find((item) => item.id === asset.activeVersionId && item.source === 'generated') ||
          [...asset.versions].reverse().find((item) => item.source === 'generated')
        asset.activeVersionId = generated?.id
        asset.status = generated ? 'ready' : 'design-ready'
      }
    }

    function reset() {
      request.value = ''
      rawImports.value = []
      script.value = ''
      approvedScript.value = ''
      scriptHash.value = ''
      runId.value = ''
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
      voicePath.value = ''
      voiceDuration.value = 0
      creativeIdentity.value = ''
      sceneReference.value = ''
      rhythmArchive.value = ''
      distributionIntent.value = ''
      referenceShotCount.value = undefined
      finalShotCount.value = 0
      shotCountRationale.value = ''
      visualAnchor.value = ''
      segments.value = []
      finalPath.value = ''
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
          stage: stage.value,
          voicePlan: voicePlan.value,
          voiceEngine: voiceEngine.value,
          voicePath: voicePath.value,
          voiceDuration: voiceDuration.value,
          creativeIdentity: creativeIdentity.value,
          sceneReference: sceneReference.value,
          rhythmArchive: rhythmArchive.value,
          distributionIntent: distributionIntent.value,
          referenceShotCount: referenceShotCount.value,
          finalShotCount: finalShotCount.value,
          shotCountRationale: shotCountRationale.value,
          visualAnchor: visualAnchor.value,
          segments: segments.value,
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
      stage,
      voicePlan,
      voiceEngine,
      voicePath,
      voiceDuration,
      creativeIdentity,
      sceneReference,
      rhythmArchive,
      distributionIntent,
      referenceShotCount,
      finalShotCount,
      shotCountRationale,
      visualAnchor,
      segments,
      finalPath,
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
      allRequiredAssetsApproved,
      assetPlanningComplete,
      invalidateFrom,
      invalidateVisuals,
      setVoicePrompt,
      setVisualAnchor,
      setSegmentPrompt,
      selectView,
      selectStep,
      selectShot,
      selectAsset,
      invalidateShot,
      adoptAssetVersion,
      currentGeneratedAssetVersion,
      removeAssetReferenceVersion,
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
