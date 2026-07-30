<template>
  <div class="w-full h-full flex flex-col">
    <div
      class="w-full h-[40px] relative border-b"
      :class="isMac ? 'title-bar' : 'window-drag'"
      @mousedown="handleTitleBarMouseDown"
      @dblclick="handleTitleBarDoubleClick"
    >
      <div class="window-control-bar-no-drag-mask" @mousedown.stop @dblclick.stop />
    </div>

    <div
      class="w-full h-0 min-h-0 flex-1 grid grid-rows-[minmax(0,1fr)] grid-cols-[minmax(280px,1fr)_minmax(320px,1.15fr)_minmax(280px,0.9fr)] gap-3 py-3 px-3"
    >
      <TextGenerate />
      <VideoManage @retry-image="retryImage" @retry-video="retryVideo" />
      <div class="min-w-0 min-h-0 overflow-y-auto flex flex-col gap-3">
        <div class="h-0 flex-1 min-h-0"><TtsControl /></div>
        <VideoRender
          @generate-voice-plan="generateVoicePlan"
          @generate-voice="generateVoice"
          @generate-storyboards="generateStoryboards"
          @generate-videos="generateVideos"
          @compose="composeVideo"
          @cancel="cancelWorkflow"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import TtsControl from './components/TtsControl.vue'
import VideoRender from './components/VideoRender.vue'
import { useMediaTaskStore } from '@/store'
import {
  parseStoryboardPlan,
  parseVoiceDesign,
  unfinishedSegments,
  VISUAL_STYLES,
  type StoryboardSegment,
} from '@/runtime/videoWorkflow'
import { deserializeMediaTask, serializeMediaTask } from '@/runtime/mediaPersistence'

const mediaStore = useMediaTaskStore()
const toast = useToast()
const { t } = useTranslation()
const isMac = window.electron.platform === 'darwin'

async function runAction(name: string, action: () => Promise<void>) {
  if (mediaStore.busyAction) return
  mediaStore.cancelRequested = false
  mediaStore.busyAction = name
  mediaStore.error = ''
  try {
    await action()
  } catch (error) {
    mediaStore.error = error instanceof Error ? error.message : String(error)
    toast.error(mediaStore.error)
  } finally {
    mediaStore.busyAction = ''
  }
}

async function generateVoicePlan() {
  await runAction('voice-plan', async () => {
    mediaStore.invalidateFrom('script')
    const raw = await window.electron.cloud.runSkill(
      'jc-voice-design',
      JSON.stringify({ text: mediaStore.approvedScript }),
      mediaStore.runId,
    )
    mediaStore.voicePlan = parseVoiceDesign(raw, mediaStore.approvedScript)
    mediaStore.stage = 'voice-plan-ready'
  })
}

async function generateVoice() {
  await runAction('voice', async () => {
    if (!mediaStore.voicePlan) throw new Error(t('workflow.messages.voicePlanFirst'))
    mediaStore.invalidateFrom('voice')
    mediaStore.voicePath = ''
    mediaStore.voiceDuration = 0
    const result = await window.electron.cloud.generateVoice(
      mediaStore.runId,
      mediaStore.voicePlan.text,
      mediaStore.voicePlan.voicePrompt,
    )
    mediaStore.voicePath = result.path
    mediaStore.voiceDuration = result.duration
    mediaStore.stage = 'voice-ready'
  })
}

async function generateStoryboards() {
  await runAction('storyboards', async () => {
    if (!mediaStore.voiceDuration) throw new Error(t('workflow.messages.voiceFirst'))
    if (!mediaStore.segments.length) {
      const skillInput = {
        script: mediaStore.approvedScript,
        actualDuration: mediaStore.voiceDuration,
        ratio: mediaStore.ratio,
        style: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId),
        coreReference: mediaStore.coreReference
          ? {
              id: mediaStore.coreReference.id,
              label: mediaStore.coreReference.label,
              mimeType: mediaStore.coreReference.mimeType,
              source: mediaStore.coreReference.source,
            }
          : null,
      }
      const shotPlan = await window.electron.cloud.runSkill(
        'jc-script-storyboard',
        JSON.stringify(skillInput),
        mediaStore.runId,
      )
      const raw = await window.electron.cloud.runSkill(
        'jc-gpt-image',
        JSON.stringify({
          ...skillInput,
          shotPlan,
        }),
        mediaStore.runId,
      )
      const plan = parseStoryboardPlan(raw, mediaStore.approvedScript, mediaStore.voiceDuration)
      mediaStore.visualAnchor = plan.visualAnchor
      mediaStore.segments = plan.segments
    }
    await pool(unfinishedSegments(mediaStore.segments, 'image'), 2, generateImage)
    if (!mediaStore.allImagesReady) throw new Error(t('workflow.messages.imagePartial'))
    mediaStore.stage = 'storyboards-ready'
  })
}

async function generateVideos() {
  await runAction('videos', async () => {
    await pool(unfinishedSegments(mediaStore.segments, 'video'), 2, generateVideo)
    if (!mediaStore.allVideosReady) throw new Error(t('workflow.messages.videoPartial'))
    mediaStore.stage = 'videos-ready'
  })
}

async function composeVideo() {
  await runAction('compose', async () => {
    if (!mediaStore.voicePath || !mediaStore.allVideosReady)
      throw new Error(t('workflow.messages.assetsIncomplete'))
    mediaStore.finalPath = await window.electron.cloud.composeVideo({
      runId: mediaStore.runId,
      videoFiles: mediaStore.segments.map((segment) => segment.videoPath!),
      playDurations: mediaStore.segments.map((segment) => segment.playDuration),
      voiceFile: mediaStore.voicePath,
      ratio: mediaStore.ratio,
    })
    mediaStore.stage = 'completed'
    toast.success(t('workflow.messages.composed'))
  })
}

async function generateImage(segment: StoryboardSegment) {
  segment.imageStatus = 'running'
  segment.error = ''
  try {
    segment.imagePath = await window.electron.cloud.generateStoryboard({
      runId: mediaStore.runId,
      index: segment.index,
      prompt: `${segment.storyboardImagePrompt}\n\n${t('workflow.messages.visualAnchor')}：${mediaStore.visualAnchor}`,
      ratio: mediaStore.ratio,
      referencePath:
        segment.coreReferenceVisible && mediaStore.coreReference
          ? mediaStore.coreReference.relativePath
          : undefined,
    })
    segment.imageStatus = 'success'
  } catch (error) {
    segment.imageStatus = 'failed'
    segment.error = error instanceof Error ? error.message : String(error)
  }
}

async function generateVideo(segment: StoryboardSegment) {
  if (!segment.imagePath) return
  segment.videoStatus = 'running'
  segment.error = ''
  try {
    segment.videoPath = await window.electron.cloud.generateVideo({
      runId: mediaStore.runId,
      index: segment.index,
      prompt: segment.videoPrompt,
      ratio: mediaStore.ratio,
      generationDuration: segment.generationDuration,
      imagePath: segment.imagePath,
    })
    segment.videoStatus = 'success'
  } catch (error) {
    segment.videoStatus = 'failed'
    segment.error = error instanceof Error ? error.message : String(error)
  }
}

async function retryImage(index: number) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  await runAction(`image-${index}`, async () => {
    await generateImage(segment)
    if (segment.imageStatus !== 'success')
      throw new Error(segment.error || t('workflow.messages.imageFailed'))
    segment.videoPath = ''
    segment.videoStatus = 'pending'
    mediaStore.finalPath = ''
    if (mediaStore.allImagesReady) mediaStore.stage = 'storyboards-ready'
  })
}

async function retryVideo(index: number) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  await runAction(`video-${index}`, async () => {
    await generateVideo(segment)
    if (segment.videoStatus !== 'success')
      throw new Error(segment.error || t('workflow.messages.videoFailed'))
    mediaStore.finalPath = ''
    if (mediaStore.allVideosReady) mediaStore.stage = 'videos-ready'
  })
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && !mediaStore.cancelRequested) {
        const item = items[next++]
        await worker(item)
      }
    }),
  )
}

async function cancelWorkflow() {
  if (!mediaStore.runId || !mediaStore.busyAction) return
  mediaStore.cancelRequested = true
  await window.electron.cloud.cancelRun(mediaStore.runId)
  mediaStore.segments.forEach((segment) => {
    if (segment.imageStatus === 'running') segment.imageStatus = 'cancelled'
    if (segment.videoStatus === 'running') segment.videoStatus = 'cancelled'
  })
  toast.warning(t('workflow.messages.cancelled'))
}

async function resumeWorkflow() {
  if (!mediaStore.runId || !mediaStore.apiConfigured || mediaStore.busyAction) return
  mediaStore.busyAction = 'resume'
  try {
    const assets = [
      mediaStore.coreReference?.relativePath || '',
      mediaStore.voicePath,
      ...mediaStore.segments.flatMap((segment) => [
        segment.imagePath || '',
        segment.videoPath || '',
      ]),
      mediaStore.finalPath,
    ].filter(Boolean)
    if (assets.length) {
      const resolved = await window.electron.cloud.resolveMedia(mediaStore.runId, assets)
      let offset = 0
      if (mediaStore.coreReference) mediaStore.coreReference.relativePath = resolved[offset++]
      if (mediaStore.voicePath) mediaStore.voicePath = resolved[offset++]
      mediaStore.segments.forEach((segment) => {
        if (segment.imagePath) segment.imagePath = resolved[offset++]
        if (segment.videoPath) segment.videoPath = resolved[offset++]
      })
      if (mediaStore.finalPath) mediaStore.finalPath = resolved[offset]
    }
    const results = await window.electron.cloud.resumePending(mediaStore.runId)
    for (const result of results) {
      if (result.kind === 'voice' && result.status === 'success') {
        mediaStore.voicePath = result.path || ''
        mediaStore.voiceDuration = result.duration || 0
        continue
      }
      const segment = mediaStore.segments.find((item) => item.index === result.index)
      if (!segment) continue
      if (result.kind === 'storyboard') {
        segment.imageStatus = result.status
        segment.imagePath = result.path || ''
      } else {
        segment.videoStatus = result.status
        segment.videoPath = result.path || ''
      }
      if (result.error) segment.error = result.error
    }
    mediaStore.segments.forEach((segment) => {
      if (segment.imageStatus === 'running') segment.imageStatus = 'failed'
      if (segment.videoStatus === 'running') segment.videoStatus = 'failed'
    })
    if (mediaStore.finalPath) mediaStore.stage = 'completed'
    else if (mediaStore.allVideosReady) mediaStore.stage = 'videos-ready'
    else if (mediaStore.allImagesReady) mediaStore.stage = 'storyboards-ready'
    else if (mediaStore.voicePath) mediaStore.stage = 'voice-ready'
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    mediaStore.busyAction = ''
  }
}

async function restoreWorkflow() {
  if (!mediaStore.runId) {
    const saved = await window.electron.cloud.loadLatestState()
    if (saved) mediaStore.$patch(deserializeMediaTask(saved))
  }
  await resumeWorkflow()
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => mediaStore.$state,
  () => {
    clearTimeout(persistTimer)
    if (!mediaStore.runId) return
    persistTimer = setTimeout(() => {
      void window.electron.cloud.saveState(
        mediaStore.runId,
        serializeMediaTask(mediaStore.$state),
      )
    }, 100)
  },
  { deep: true },
)

onMounted(restoreWorkflow)
watch(
  () => mediaStore.apiConfigured,
  (configured) => {
    if (configured) void resumeWorkflow()
  },
)

let dragState: {
  startMouseX: number
  startMouseY: number
  startClientX: number
  startWindowX: number
  startWindowY: number
  dragging: boolean
  preparing: boolean
} | null = null

function clearTitleBarDragListeners() {
  window.removeEventListener('mousemove', handleTitleBarMouseMove)
  window.removeEventListener('mouseup', handleTitleBarMouseUp)
}

async function handleTitleBarMouseMove(event: MouseEvent) {
  if (!isMac || !dragState) return
  const deltaX = event.screenX - dragState.startMouseX
  const deltaY = event.screenY - dragState.startMouseY
  if (!dragState.dragging && Math.hypot(deltaX, deltaY) < 2) return
  if (!dragState.dragging) {
    if (dragState.preparing) return
    dragState.preparing = true
    const dragInfo = await window.electron.prepareWindowDrag()
    if (!dragState || !dragInfo) return
    let initialX = dragInfo.bounds.x
    let initialY = dragInfo.bounds.y
    if (dragInfo.wasMaximized) {
      initialX =
        event.screenX - dragInfo.bounds.width * (dragState.startClientX / window.innerWidth)
      initialY = Math.max(0, event.screenY - 20)
      window.electron.setWindowPosition(initialX, initialY)
    }
    dragState.startMouseX = event.screenX
    dragState.startMouseY = event.screenY
    dragState.startWindowX = initialX
    dragState.startWindowY = initialY
  }
  dragState.dragging = true
  window.electron.setWindowPosition(
    dragState.startWindowX + event.screenX - dragState.startMouseX,
    dragState.startWindowY + event.screenY - dragState.startMouseY,
  )
}

function handleTitleBarMouseUp() {
  dragState = null
  clearTitleBarDragListeners()
}

async function handleTitleBarMouseDown(event: MouseEvent) {
  if (!isMac || event.button !== 0 || event.detail > 1) return
  const bounds = await window.electron.getWindowBounds()
  if (!bounds) return
  dragState = {
    startMouseX: event.screenX,
    startMouseY: event.screenY,
    startClientX: event.clientX,
    startWindowX: bounds.x,
    startWindowY: bounds.y,
    dragging: false,
    preparing: false,
  }
  clearTitleBarDragListeners()
  window.addEventListener('mousemove', handleTitleBarMouseMove)
  window.addEventListener('mouseup', handleTitleBarMouseUp)
}

function handleTitleBarDoubleClick() {
  if (isMac) window.electron.toggleWindowMaximize()
}

onBeforeUnmount(() => {
  clearTimeout(persistTimer)
  clearTitleBarDragListeners()
})
</script>

<style scoped>
.title-bar {
  user-select: none;
}
</style>
