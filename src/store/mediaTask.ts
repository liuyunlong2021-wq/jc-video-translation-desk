import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CoreReferenceAsset,
  TargetDuration,
  VideoRatio,
  VisualStyleId,
} from '~/electron/types'
import type { StoryboardSegment, VoiceDesignDraft } from '../runtime/videoWorkflow.ts'
import { deserializeMediaTask, serializeMediaTask } from '../runtime/mediaPersistence.ts'

export type WorkflowStage =
  | 'draft'
  | 'script-generated'
  | 'script-approved'
  | 'voice-plan-ready'
  | 'voice-ready'
  | 'storyboards-ready'
  | 'videos-ready'
  | 'completed'

export interface MediaRunSnapshot {
  request: string
  script: string
  approvedScript: string
  scriptHash: string
  ratio: VideoRatio
  targetDuration: TargetDuration
  styleId: VisualStyleId
  coreReference: CoreReferenceAsset | null
  runId: string
  stage: WorkflowStage
  voicePlan: VoiceDesignDraft | null
  voicePath: string
  voiceDuration: number
  visualAnchor: string
  segments: StoryboardSegment[]
  finalPath: string
}

export const useMediaTaskStore = defineStore(
  'media-task',
  () => {
    const request = ref('')
    const script = ref('')
    const approvedScript = ref('')
    const scriptHash = ref('')
    const ratio = ref<VideoRatio>('9:16')
    const targetDuration = ref<TargetDuration>(15)
    const styleId = ref<VisualStyleId>('live-action')
    const coreReference = ref<CoreReferenceAsset | null>(null)
    const runId = ref('')
    const stage = ref<WorkflowStage>('draft')
    const voicePlan = ref<VoiceDesignDraft | null>(null)
    const voicePath = ref('')
    const voiceDuration = ref(0)
    const visualAnchor = ref('')
    const segments = ref<StoryboardSegment[]>([])
    const finalPath = ref('')
    const busyAction = ref('')
    const cancelRequested = ref(false)
    const error = ref('')
    const apiConfigured = ref(false)
    const history = ref<MediaRunSnapshot[]>([])

    const allImagesReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.imageStatus === 'success'),
    )
    const allVideosReady = computed(
      () =>
        segments.value.length > 0 && segments.value.every((item) => item.videoStatus === 'success'),
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
      segments.value = []
      if (level === 'voice') return
      voicePlan.value = null
      voicePath.value = ''
      voiceDuration.value = 0
    }

    function invalidateVisuals() {
      finalPath.value = ''
      visualAnchor.value = ''
      segments.value = []
    }

    function reset() {
      request.value = ''
      script.value = ''
      approvedScript.value = ''
      scriptHash.value = ''
      runId.value = ''
      targetDuration.value = 15
      styleId.value = 'live-action'
      coreReference.value = null
      stage.value = 'draft'
      voicePlan.value = null
      voicePath.value = ''
      voiceDuration.value = 0
      visualAnchor.value = ''
      segments.value = []
      finalPath.value = ''
      busyAction.value = ''
      cancelRequested.value = false
      error.value = ''
    }

    function archiveCurrent() {
      if (!runId.value) return
      const snapshot: MediaRunSnapshot = JSON.parse(
        JSON.stringify({
          request: request.value,
          script: script.value,
          approvedScript: approvedScript.value,
          scriptHash: scriptHash.value,
          ratio: ratio.value,
          targetDuration: targetDuration.value,
          styleId: styleId.value,
          coreReference: coreReference.value,
          runId: runId.value,
          stage: stage.value,
          voicePlan: voicePlan.value,
          voicePath: voicePath.value,
          voiceDuration: voiceDuration.value,
          visualAnchor: visualAnchor.value,
          segments: segments.value,
          finalPath: finalPath.value,
        }),
      )
      history.value = [snapshot, ...history.value.filter((run) => run.runId !== runId.value)]
    }

    return {
      request,
      script,
      approvedScript,
      scriptHash,
      ratio,
      targetDuration,
      styleId,
      coreReference,
      runId,
      stage,
      voicePlan,
      voicePath,
      voiceDuration,
      visualAnchor,
      segments,
      finalPath,
      busyAction,
      cancelRequested,
      error,
      apiConfigured,
      history,
      allImagesReady,
      allVideosReady,
      invalidateFrom,
      invalidateVisuals,
      archiveCurrent,
      reset,
    }
  },
  {
    persist: {
      omit: ['busyAction', 'cancelRequested', 'error', 'apiConfigured'],
      serializer: {
        serialize: serializeMediaTask,
        deserialize: deserializeMediaTask,
      },
    },
  },
)
