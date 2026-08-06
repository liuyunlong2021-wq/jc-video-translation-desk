<template>
  <v-sheet class="translation-inspector" border rounded>
    <div class="inspector-scroll">
      <header><strong>视频翻译操作</strong><small>扒片 · 豆包语音 · FFmpeg</small></header>
      <v-textarea
        v-if="state.seedPromptText"
        :model-value="state.seedPromptText"
        label="豆包语音稿"
        rows="7"
        auto-grow
        density="compact"
        @update:model-value="updatePrompt"
      />
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMediaTaskStore } from '@/store'
import {
  availableVideoTranslationActions,
  type VideoTranslationAction,
} from '@/runtime/videoTranslation'

defineProps<{ selectedCueId: string }>()
const emit = defineEmits<{ action: [action: VideoTranslationAction]; cancel: [] }>()
const mediaStore = useMediaTaskStore()
const progressText = ref('')
const state = computed(() => mediaStore.videoTranslation!)
const available = computed(
  () => new Set(availableVideoTranslationActions(state.value, mediaStore.videoTranslationRoles)),
)
const actions = computed(
  () =>
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
        key: 'confirm-speakers-and-subtitles',
        label: '确认角色与字幕',
        icon: 'mdi-check-decagram-outline',
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
    }>,
)

let stopProgress: (() => void) | undefined
onMounted(() => {
  stopProgress = window.electron.cloud.onVideoTranslationProgress((progress) => {
    if (progress.runId === mediaStore.runId && progress.episodeId === mediaStore.episodeId)
      progressText.value = progress.message
  })
})
onBeforeUnmount(() => stopProgress?.())

function updatePrompt(value: string) {
  state.value.seedPromptText = value
  mediaStore.invalidateTranslation('voice-prompt')
}
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
</style>
