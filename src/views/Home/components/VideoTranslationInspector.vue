<template>
  <v-sheet class="translation-inspector" border rounded>
    <div class="inspector-scroll">
      <header>
        <strong>{{
          mediaStore.workspaceView === 'dubbing' ? '成片工作台操作' : '字幕工作台操作'
        }}</strong>
      </header>
      <div class="actions">
        <template v-for="action in actions" :key="action.key">
          <v-btn
            class="translation-action"
            block
            color="primary"
            :prepend-icon="action.icon"
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
            v-if="
              ['reverse-video', 'timestamp-target-dialogue'].includes(action.key) &&
              mediaStore.busyAction === action.key
            "
            type="info"
            density="compact"
            variant="tonal"
          >
            <v-progress-linear indeterminate class="mb-2" />
            {{ progressText || '正在启动字幕识别' }}
          </v-alert>
        </template>
        <v-btn
          v-if="mediaStore.videoTranslation?.finalVideoPath"
          class="translation-action"
          block
          color="primary"
          variant="flat"
          prepend-icon="mdi-play-circle-outline"
          @click="openFinalVideo"
          >打开翻译成片</v-btn
        >
      </div>
      <section
        v-if="mediaStore.workspaceView === 'script' && state.speakerStatus === 'ready'"
        class="semantic-calibration"
      >
        <strong>抽帧校准确认</strong>
        <small>画面字幕只是辅助建议，最终以人工确认稿为准。</small>
        <v-btn
          block
          color="primary"
          variant="tonal"
          prepend-icon="mdi-check"
          :disabled="!hasFrameSuggestion"
          @click="applyFrameCalibration"
          >应用抽帧建议</v-btn
        >
        <v-btn
          block
          variant="text"
          prepend-icon="mdi-undo"
          :disabled="!hasFrameBackup"
          @click="undoFrameCalibration"
          >撤销本次抽帧校准</v-btn
        >
      </section>
      <section
        v-if="mediaStore.workspaceView === 'script' && state.speakerStatus === 'ready'"
        class="semantic-calibration"
      >
        <strong>语义校准确认</strong>
        <small>FunASR 原文永久保留；校准只提供人工确认稿建议。</small>
        <v-btn
          block
          color="primary"
          variant="tonal"
          prepend-icon="mdi-check"
          :disabled="!hasCalibrationSuggestion"
          @click="applyCalibration"
          >应用校准建议</v-btn
        >
        <v-btn
          block
          variant="text"
          prepend-icon="mdi-undo"
          :disabled="!hasCalibrationBackup"
          @click="undoCalibration"
          >撤销本次校准</v-btn
        >
        <v-btn block variant="text" prepend-icon="mdi-restore" @click="restoreRecognizedText"
          >恢复并采用 FunASR 原文</v-btn
        >
      </section>
      <section
        v-if="mediaStore.workspaceView === 'script' && state.sourceVideoPath"
        class="manual-cue"
      >
        <strong>播放头字幕编辑</strong>
        <small>当前位置 {{ formatTime(playheadMs) }}</small>
        <small v-if="manualError" class="manual-cue-error">{{ manualError }}</small>
        <v-btn block color="primary" variant="tonal" prepend-icon="mdi-plus" @click="addManualCue"
          >在当前位置新增对白</v-btn
        >
        <div class="manual-cue-times">
          <v-btn
            variant="text"
            prepend-icon="mdi-content-cut"
            :disabled="!selectedCue"
            @click="splitSelectedCue"
            >在当前位置拆分所选对白</v-btn
          >
          <v-btn
            variant="text"
            prepend-icon="mdi-call-merge"
            :disabled="!selectedCue"
            @click="mergeWithNext"
            >与下一条对白合并</v-btn
          >
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
          <v-btn
            variant="text"
            color="error"
            prepend-icon="mdi-delete-outline"
            :disabled="!selectedCue"
            @click="deleteSelectedCue"
            >删除所选对白</v-btn
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
  deleteVideoTranslationCue,
  insertVideoTranslationCueAt,
  mergeVideoTranslationCueWithNext,
  setVideoTranslationCueBoundary,
  splitVideoTranslationCueAt,
  type VideoTranslationAction,
} from '@/runtime/videoTranslation'

const props = defineProps<{ selectedCueId: string; playheadMs: number; textCursorOffset: number }>()
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
        label: '识别字幕',
        icon: 'mdi-subtitles-outline',
        color: 'primary',
        done: state.value.speakerStatus === 'ready',
      },
      {
        key: 'calibrate-frames',
        label: '抽帧校准',
        icon: 'mdi-image-search-outline',
        color: 'primary',
        done: state.value.frameCalibrationStatus === 'ready',
      },
      {
        key: 'calibrate-subtitles',
        label: '大模型语义校准',
        icon: 'mdi-text-recognition',
        color: 'primary',
        done: state.value.calibrationStatus === 'ready',
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
        label: '生成全局配音提示词',
        icon: 'mdi-text-box-check-outline',
        done: state.value.arrangementStatus === 'ready',
      },
      {
        key: 'generate-target-voice',
        label: '生成全局配音',
        icon: 'mdi-waveform',
        done: state.value.voiceStatus === 'ready',
      },
      {
        key: 'timestamp-target-dialogue',
        label: '配音对白时间戳',
        icon: 'mdi-timeline-clock-outline',
        done: Boolean(state.value.dubDialogueTimestampHash),
      },
      {
        key: 'separate-source-audio',
        label: '分离原人声和背景声',
        icon: 'mdi-call-split',
        done: state.value.separationStatus === 'ready',
      },
      {
        key: 'mix-background-audio',
        label: '合成目标语言音轨',
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
          'timestamp-target-dialogue',
          'separate-source-audio',
          'mix-background-audio',
          'burn-subtitles-and-voice',
        ].includes(action.key)
      : [
          'upload-video',
          'upload-final-master',
          'reverse-video',
          'calibrate-frames',
          'calibrate-subtitles',
          'translate-all-subtitles',
          'open-voice-workspace',
        ].includes(action.key),
  ),
)
const hasCalibrationSuggestion = computed(() =>
  state.value.cues.some((cue) => cue.calibrationSuggestion?.trim()),
)
const hasCalibrationBackup = computed(() =>
  state.value.cues.some((cue) => cue.calibrationBackupText !== undefined),
)
const hasFrameSuggestion = computed(() =>
  state.value.cues.some((cue) => cue.frameSuggestion?.trim()),
)
const hasFrameBackup = computed(() =>
  state.value.cues.some((cue) => cue.frameCalibrationBackupText !== undefined),
)

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(3)} 秒`
}

function openFinalVideo() {
  const path = mediaStore.videoTranslation?.finalVideoPath
  if (mediaStore.runId && path) window.electron.cloud.showMedia(mediaStore.runId, path)
}

function addManualCue() {
  try {
    const result = insertVideoTranslationCueAt(
      state.value.cues,
      state.value.durationMs,
      props.playheadMs,
      `cue-${crypto.randomUUID()}`,
    )
    state.value.cues = result.cues
    mediaStore.invalidateTranslation('timing')
    manualError.value = ''
    emit('selectCue', result.cue.cueId)
    emit('focusCue', result.cue.cueId)
  } catch (error) {
    manualError.value = error instanceof Error ? error.message : String(error)
  }
}

function mergeWithNext() {
  try {
    state.value.cues = mergeVideoTranslationCueWithNext(state.value.cues, props.selectedCueId)
    mediaStore.invalidateTranslation('translation')
  } catch (error) {
    manualError.value = error instanceof Error ? error.message : String(error)
  }
}

function splitSelectedCue() {
  try {
    const result = splitVideoTranslationCueAt(
      state.value.cues,
      props.selectedCueId,
      props.playheadMs,
      props.textCursorOffset,
      `cue-${crypto.randomUUID()}`,
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

function deleteSelectedCue() {
  try {
    state.value.cues = deleteVideoTranslationCue(state.value.cues, props.selectedCueId)
    emit('selectCue', '')
    mediaStore.invalidateTranslation('source-dialogue')
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

function applyCalibration() {
  state.value.cues.forEach((cue) => {
    if (!cue.calibrationSuggestion?.trim()) return
    cue.calibrationBackupText = cue.sourceText
    cue.sourceText = cue.calibrationSuggestion
  })
  state.value.calibrationApplied = true
  mediaStore.invalidateTranslation('source-dialogue')
}

function applyFrameCalibration() {
  state.value.cues.forEach((cue) => {
    if (!cue.frameSuggestion?.trim()) return
    cue.frameCalibrationBackupText = cue.sourceText
    cue.sourceText = cue.frameSuggestion
  })
  mediaStore.invalidateTranslation('source-dialogue')
}

function undoFrameCalibration() {
  state.value.cues.forEach((cue) => {
    if (cue.frameCalibrationBackupText === undefined) return
    cue.sourceText = cue.frameCalibrationBackupText
    cue.frameCalibrationBackupText = undefined
  })
  mediaStore.invalidateTranslation('source-dialogue')
}

function undoCalibration() {
  state.value.cues.forEach((cue) => {
    if (cue.calibrationBackupText === undefined) return
    cue.sourceText = cue.calibrationBackupText
    cue.calibrationBackupText = undefined
  })
  state.value.calibrationApplied = false
  mediaStore.invalidateTranslation('source-dialogue')
}

function restoreRecognizedText() {
  state.value.cues.forEach((cue) => {
    cue.sourceText = cue.recognizedText
    cue.calibrationBackupText = undefined
  })
  state.value.calibrationApplied = true
  mediaStore.invalidateTranslation('source-dialogue')
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
.translation-action.v-btn--disabled {
  opacity: 1;
  background: rgba(var(--v-theme-primary), 0.12) !important;
  color: rgba(var(--v-theme-primary), 0.48) !important;
}
.manual-cue {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.semantic-calibration {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.semantic-calibration small {
  color: rgba(0, 0, 0, 0.56);
}
.manual-cue-times {
  display: grid;
  gap: 8px;
}
.manual-cue-error {
  color: rgb(var(--v-theme-error));
}
</style>
