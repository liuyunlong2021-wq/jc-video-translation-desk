<template>
  <v-sheet class="translation-inspector" border rounded>
    <div class="inspector-scroll">
      <header>
        <strong>{{ mediaStore.workspaceView === 'dubbing' ? '成片工作台操作' : '字幕工作台操作' }}</strong>
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
      <section v-if="mediaStore.workspaceView === 'script' && state.cues.length" class="manual-cue">
        <strong>补充漏识别台词</strong>
        <div class="manual-cue-times">
          <v-text-field
            v-model="manualStartSeconds"
            type="number"
            min="0"
            step="0.001"
            density="compact"
            hide-details
            label="开始秒"
          />
          <v-text-field
            v-model="manualEndSeconds"
            type="number"
            min="0"
            step="0.001"
            density="compact"
            hide-details
            label="结束秒"
          />
        </div>
        <v-textarea
          v-model="manualText"
          rows="3"
          no-resize
          hide-details
          label="补充原字幕"
          placeholder="输入漏掉的一句台词"
        />
        <small v-if="manualError" class="manual-cue-error">{{ manualError }}</small>
        <v-btn
          block
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          :disabled="!manualText.trim()"
          @click="addManualCue"
          >添加字幕行</v-btn
        >
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
  type VideoTranslationAction,
} from '@/runtime/videoTranslation'

const props = defineProps<{ selectedCueId: string }>()
const emit = defineEmits<{
  action: [action: VideoTranslationAction]
  selectCue: [cueId: string]
  cancel: []
}>()
const mediaStore = useMediaTaskStore()
const progressText = ref('')
const state = computed(() => mediaStore.videoTranslation!)
const manualStartSeconds = ref('0')
const manualEndSeconds = ref('1')
const manualText = ref('')
const manualError = ref('')
const available = computed(
  () => new Set(availableVideoTranslationActions(state.value, mediaStore.videoTranslationRoles)),
)
const actions = computed(() =>
  (
    [
      {
        key: 'upload-video',
        label: state.value.sourceVideoPath ? '更换视频' : '上传视频',
        icon: 'mdi-upload',
        color: 'primary',
        done: false,
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
        label: '生成豆包配音安排',
        icon: 'mdi-text-box-check-outline',
        done: state.value.arrangementStatus === 'ready',
      },
      {
        key: 'generate-target-voice',
        label: '生成目标语言配音',
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
          'separate-source-audio',
          'remove-original-vocal',
          'mix-background-audio',
          'burn-subtitles-and-voice',
        ].includes(action.key)
      : [
          'upload-video',
          'reverse-video',
          'translate-all-subtitles',
          'open-voice-workspace',
        ].includes(action.key),
  ),
)

function suggestManualCueTime() {
  const selectedIndex = state.value.cues.findIndex((cue) => cue.cueId === props.selectedCueId)
  const selected = state.value.cues[selectedIndex]
  const startMs = selected?.endMs || state.value.cues.at(-1)?.endMs || 0
  const nextStartMs = state.value.cues[selectedIndex + 1]?.startMs || state.value.durationMs
  const endMs = Math.min(state.value.durationMs, Math.max(startMs + 1000, nextStartMs))
  manualStartSeconds.value = (startMs / 1000).toFixed(3)
  manualEndSeconds.value = (endMs / 1000).toFixed(3)
  manualError.value = ''
}

function addManualCue() {
  const startMs = Math.round(Number(manualStartSeconds.value) * 1000)
  const endMs = Math.round(Number(manualEndSeconds.value) * 1000)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
    manualError.value = '开始和结束时间无效'
    return
  }
  if (endMs > state.value.durationMs) {
    manualError.value = '结束时间不能超过视频时长'
    return
  }
  if (state.value.cues.some((cue) => startMs < cue.endMs && endMs > cue.startMs)) {
    manualError.value = '这段时间与现有字幕重叠，请调整时间'
    return
  }
  const selected = state.value.cues.find((cue) => cue.cueId === props.selectedCueId)
  const cueId = `manual-cue-${crypto.randomUUID()}`
  state.value.cues.push({
    cueId,
    startMs,
    endMs,
    recognizedText: manualText.value.trim(),
    sourceText: manualText.value.trim(),
    translatedText: '',
    translationRoleId: selected?.translationRoleId,
    proposedName: selected?.proposedName,
    confidence: 1,
    evidence: '人工补充',
    needsReview: !selected?.translationRoleId,
  })
  state.value.cues.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  mediaStore.invalidateTranslation('source-dialogue')
  manualText.value = ''
  manualError.value = ''
  emit('selectCue', cueId)
}

watch(() => props.selectedCueId, suggestManualCueTime, { immediate: true })

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
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.manual-cue-error {
  color: rgb(var(--v-theme-error));
}
</style>
