<template>
  <v-sheet class="translation-inspector" border rounded>
    <div class="inspector-scroll">
      <header>
        <strong>{{
          mediaStore.workspaceView === 'dubbing' ? '成片工作台操作' : '字幕工作台操作'
        }}</strong>
        <small>扒片 · 豆包语音 · FFmpeg</small>
      </header>
      <div class="actions">
        <template v-for="action in actions" :key="action.key">
          <v-btn
            class="translation-action"
            block
            :prepend-icon="action.icon"
            :color="action.color"
            :variant="action.done ? 'tonal' : 'flat'"
            :title="!mediaStore.runId ? '请先新建或打开项目' : action.label"
            :disabled="
              !mediaStore.runId || Boolean(mediaStore.busyAction) || !available.has(action.key)
            "
            :loading="mediaStore.busyAction === action.key"
            @click="emit('action', action.key)"
            >{{ action.label }}</v-btn
          >
          <v-alert
            v-if="action.key === 'reverse-video' && mediaStore.busyAction === 'reverse-video'"
            type="info"
            density="compact"
            variant="tonal"
          >
            <v-progress-linear indeterminate class="mb-2" />
            {{ progressText || '正在启动扒片任务' }}
          </v-alert>
        </template>
      </div>
      <section
        v-if="mediaStore.workspaceView === 'script' && state.sourceVideoPath"
        class="manual-cue"
      >
        <strong>播放头字幕编辑</strong>
        <small>当前位置 {{ formatTime(playheadMs) }}</small>
        <small v-if="manualError" class="manual-cue-error">{{ manualError }}</small>
        <v-btn
          block
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="addManualCue"
          >{{ cueAtPlayhead ? '从当前位置拆分字幕' : '在当前位置新增字幕' }}</v-btn
        >
        <div class="manual-cue-times">
          <v-btn
            variant="text"
            prepend-icon="mdi-ray-start-arrow"
            :disabled="!selectedCue"
            @click="setBoundary('start')"
            >设为所选字幕开始</v-btn
          >
          <v-btn
            variant="text"
            prepend-icon="mdi-ray-end-arrow"
            :disabled="!selectedCue"
            @click="setBoundary('end')"
            >设为所选字幕结束</v-btn
          >
        </div>
      </section>
      <v-btn
        v-if="mediaStore.busyAction"
        icon="mdi-stop-circle-outline"
        color="error"
        variant="tonal"
        title="停止当前任务"
        aria-label="停止当前任务"
        @click="emit('cancel')"
      />
      <v-alert v-if="mediaStore.error" type="error" density="compact" variant="tonal">{{
        mediaStore.error
      }}</v-alert>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import {
  availableVideoTranslationActions,
  insertVideoTranslationCueAt,
  setVideoTranslationCueBoundary,
  type VideoTranslationAction,
} from '@/runtime/videoTranslation'

const props = defineProps<{ selectedCueId: string; playheadMs: number }>()
const emit = defineEmits<{
  action: [action: VideoTranslationAction]
  selectCue: [cueId: string]
  focusCue: [cueId: string]
  cancel: []
}>()
const mediaStore = useMediaTaskStore()
const progressText = ref('')
const state = computed(() => mediaStore.videoTranslation!)
const manualError = ref('')
const selectedCue = computed(() =>
  state.value.cues.find((cue) => cue.cueId === props.selectedCueId),
)
const cueAtPlayhead = computed(() =>
  state.value.cues.find((cue) => cue.startMs < props.playheadMs && props.playheadMs < cue.endMs),
)
const available = computed(
  () => new Set(availableVideoTranslationActions(state.value, mediaStore.videoTranslationRoles)),
)
const actions = computed(() =>
  (
    [
      {
        key: 'upload-video',
        label: state.value.sourceVideoPath ? '更换识别视频' : '上传识别视频',
        icon: 'mdi-upload',
        color: 'primary',
        done: false,
      },
      {
        key: 'upload-final-master',
        label: state.value.finalMasterVideoPath ? '更换无字幕成片母版' : '上传无字幕成片母版',
        icon: 'mdi-movie-open-plus-outline',
        color: 'primary',
        done: Boolean(state.value.finalMasterVideoPath),
      },
      {
        key: 'reverse-video',
        label: '扒片',
        icon: 'mdi-movie-search-outline',
        color: 'primary',
        done: state.value.speakerStatus === 'ready',
      },
      {
        key: 'translate-all-subtitles',
        label: '翻译所有字幕',
        icon: 'mdi-translate',
        done: state.value.translationStatus === 'ready',
      },
      {
        key: 'open-voice-workspace',
        label: '进入配音工作台',
        icon: 'mdi-account-voice',
        done: state.value.reviewStatus === 'ready',
      },
      {
        key: 'arrange-doubao-voice',
        label: '生成连续对白导演稿',
        icon: 'mdi-text-box-check-outline',
        done: state.value.arrangementStatus === 'ready',
      },
      {
        key: 'generate-target-voice',
        label: '生成并对齐连续对白',
        icon: 'mdi-waveform',
        done: state.value.voiceStatus === 'ready',
      },
      {
        key: 'separate-source-audio',
        label: '分离原人声和背景声',
        icon: 'mdi-call-split',
        done: state.value.separationStatus === 'ready',
      },
      {
        key: 'remove-original-vocal',
        label: '去除原人声',
        icon: 'mdi-account-voice-off',
        done: state.value.originalVocalRemoved,
      },
      {
        key: 'mix-background-audio',
        label: '混回背景声和目标语言配音',
        icon: 'mdi-tune-vertical',
        done: state.value.mixStatus === 'ready',
      },
      {
        key: 'burn-subtitles-and-voice',
        label: '烧录字幕和配音',
        icon: 'mdi-movie-check-outline',
        done: state.value.finalStatus === 'ready',
      },
    ] as Array<{
      key: VideoTranslationAction
      label: string
      icon: string
      color?: string
      done: boolean
    }>
  ).filter((action) =>
    mediaStore.workspaceView === 'dubbing'
      ? [
          'upload-video',
          'upload-final-master',
          'separate-source-audio',
          'remove-original-vocal',
          'mix-background-audio',
          'burn-subtitles-and-voice',
        ].includes(action.key)
      : [
          'upload-video',
          'upload-final-master',
          'reverse-video',
          'translate-all-subtitles',
          'open-voice-workspace',
        ].includes(action.key),
  ),
)

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(3)} 秒`
}

function addManualCue() {
  try {
    const result = insertVideoTranslationCueAt(
      state.value.cues,
      state.value.durationMs,
      props.playheadMs,
      `manual-cue-${crypto.randomUUID()}`,
    )
    state.value.cues = result.cues
    mediaStore.invalidateTranslation('source-dialogue')
    manualError.value = ''
    emit('selectCue', result.cue.cueId)
    emit('focusCue', result.cue.cueId)
  } catch (error) {
    manualError.value = error instanceof Error ? error.message : String(error)
  }
}

function setBoundary(boundary: 'start' | 'end') {
  try {
    state.value.cues = setVideoTranslationCueBoundary(
      state.value.cues,
      props.selectedCueId,
      boundary,
      props.playheadMs,
    )
    mediaStore.invalidateTranslation('source-dialogue')
    manualError.value = ''
    emit('focusCue', props.selectedCueId)
  } catch (error) {
    manualError.value = error instanceof Error ? error.message : String(error)
  }
}

watch(
  () => props.playheadMs,
  () => {
    manualError.value = ''
  },
)

let stopProgress: (() => void) | undefined
onMounted(() => {
  stopProgress = window.electron.cloud.onVideoTranslationProgress((progress) => {
    if (progress.runId === mediaStore.runId && progress.episodeId === mediaStore.episodeId)
      progressText.value = progress.message
  })
})
onBeforeUnmount(() => stopProgress?.())
</script>

<style scoped>
.translation-inspector {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.inspector-scroll {
  height: 100%;
  overflow: auto;
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 12px;
}
header {
  display: grid;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
header small {
  color: rgba(0, 0, 0, 0.56);
}
.actions {
  display: grid;
  gap: 7px;
}
.translation-action {
  min-height: 42px;
  justify-content: flex-start;
}
.manual-cue {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.manual-cue-times {
  display: grid;
  gap: 8px;
}
.manual-cue-error {
  color: rgb(var(--v-theme-error));
}
</style>
