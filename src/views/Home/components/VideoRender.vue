<template>
  <v-sheet class="p-3" border rounded>
    <div class="flex items-center justify-between gap-2 mb-2">
      <v-chip
        size="small"
        variant="tonal"
        :color="mediaStore.apiConfigured ? 'success' : 'warning'"
      >
        {{
          mediaStore.apiConfigured
            ? t('workflow.progress.apiReady')
            : t('workflow.progress.apiMissing')
        }}
      </v-chip>
      <span class="text-caption text-medium-emphasis">
        {{ t('workflow.progress.count', { done: completedStages, total: 5 }) }}
      </span>
    </div>
    <div
      v-if="mediaStore.segments.length"
      class="text-caption text-medium-emphasis text-right mb-2"
    >
      {{ t('workflow.progress.tasks', { done: completedTasks, total: totalTasks }) }}
    </div>
    <div v-if="mediaStore.error" class="text-caption text-error mb-2">{{ mediaStore.error }}</div>
    <div class="grid grid-cols-2 gap-2">
      <v-btn
        variant="tonal"
        prepend-icon="mdi-account-voice"
        :loading="mediaStore.busyAction === 'voice-plan'"
        :disabled="!canVoicePlan"
        @click="$emit('generateVoicePlan')"
        >{{ t('workflow.actions.voicePlan') }}</v-btn
      >
      <v-btn
        variant="tonal"
        prepend-icon="mdi-waveform"
        :loading="mediaStore.busyAction === 'voice'"
        :disabled="!canVoice"
        @click="$emit('generateVoice')"
        >{{ t('workflow.actions.voice') }}</v-btn
      >
      <v-btn
        variant="tonal"
        prepend-icon="mdi-view-grid-plus-outline"
        :loading="mediaStore.busyAction === 'storyboards'"
        :disabled="!canStoryboards"
        @click="$emit('generateStoryboards')"
        >{{ t('workflow.actions.storyboards') }}</v-btn
      >
      <v-btn
        variant="tonal"
        prepend-icon="mdi-video-plus-outline"
        :loading="mediaStore.busyAction === 'videos'"
        :disabled="!canVideos"
        @click="$emit('generateVideos')"
        >{{ t('workflow.actions.videos') }}</v-btn
      >
      <v-btn
        class="col-span-2"
        color="primary"
        prepend-icon="mdi-movie-open-plus"
        :loading="mediaStore.busyAction === 'compose'"
        :disabled="!canCompose"
        @click="$emit('compose')"
        >{{ t('workflow.actions.compose') }}</v-btn
      >
      <v-btn
        v-if="
          ['voice-plan', 'voice', 'storyboards', 'videos', 'compose', 'resume'].includes(
            mediaStore.busyAction,
          )
        "
        class="col-span-2"
        color="error"
        variant="tonal"
        prepend-icon="mdi-stop-circle-outline"
        @click="$emit('cancel')"
        >{{ t('workflow.actions.stop') }}</v-btn
      >
    </div>
    <div class="text-caption text-medium-emphasis mt-2 text-center">{{ stageHint }}</div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMediaTaskStore } from '@/store'
import { useTranslation } from 'i18next-vue'

defineEmits([
  'generateVoicePlan',
  'generateVoice',
  'generateStoryboards',
  'generateVideos',
  'compose',
  'cancel',
])
const mediaStore = useMediaTaskStore()
const { t } = useTranslation()
const idle = computed(() => !mediaStore.busyAction)
const canVoicePlan = computed(
  () => idle.value && mediaStore.apiConfigured && Boolean(mediaStore.approvedScript),
)
const canVoice = computed(
  () => idle.value && mediaStore.apiConfigured && Boolean(mediaStore.voicePlan),
)
const canStoryboards = computed(
  () =>
    idle.value &&
    mediaStore.apiConfigured &&
    Boolean(mediaStore.voicePath && mediaStore.voiceDuration) &&
    !mediaStore.allImagesReady,
)
const canVideos = computed(
  () =>
    idle.value &&
    mediaStore.apiConfigured &&
    mediaStore.allImagesReady &&
    !mediaStore.allVideosReady,
)
const canCompose = computed(
  () => idle.value && mediaStore.allVideosReady && Boolean(mediaStore.voicePath),
)
const completedStages = computed(
  () =>
    Number(Boolean(mediaStore.voicePlan)) +
    Number(Boolean(mediaStore.voicePath)) +
    Number(mediaStore.allImagesReady) +
    Number(mediaStore.allVideosReady) +
    Number(Boolean(mediaStore.finalPath)),
)
const completedTasks = computed(
  () =>
    Number(Boolean(mediaStore.voicePath)) +
    mediaStore.segments.filter((segment) => segment.imageStatus === 'success').length +
    mediaStore.segments.filter((segment) => segment.videoStatus === 'success').length +
    Number(Boolean(mediaStore.finalPath)),
)
const totalTasks = computed(() => mediaStore.segments.length * 2 + 2)
const stageHint = computed(() => {
  if (mediaStore.busyAction) return t('workflow.hints.busy')
  if (!mediaStore.apiConfigured && !mediaStore.allVideosReady) return t('workflow.hints.api')
  if (!mediaStore.approvedScript) return t('workflow.hints.approve')
  if (!mediaStore.voicePlan) return t('workflow.hints.voicePlan')
  if (!mediaStore.voicePath) return t('workflow.hints.voice')
  if (!mediaStore.allImagesReady) return t('workflow.hints.storyboards')
  if (!mediaStore.allVideosReady) return t('workflow.hints.videos')
  if (!mediaStore.finalPath) return t('workflow.hints.compose')
  return t('workflow.hints.done')
})
</script>
