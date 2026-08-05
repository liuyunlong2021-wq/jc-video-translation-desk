<template>
  <v-sheet class="translation-inspector" border rounded>
    <div class="inspector-scroll">
      <header><strong>视频翻译操作</strong><small>豆包语音 · Whisper · FFmpeg</small></header>
      <section class="voice-section">
        <strong>{{ selectedRole?.displayName || '选择字幕行后设置角色声音' }}</strong>
        <v-select
          :model-value="selectedRole?.voiceProfileId || ''"
          :items="voiceProfiles"
          item-title="displayName"
          item-value="voiceProfileId"
          label="目标语言声音"
          density="compact"
          hide-details
          :disabled="!selectedRole || Boolean(mediaStore.busyAction)"
          @update:model-value="bindVoice"
        />
        <v-btn
          icon="mdi-play"
          size="small"
          variant="tonal"
          title="试听当前声音"
          aria-label="试听当前声音"
          :disabled="!selectedRole?.voiceProfileId"
          @click="loadPreview"
        />
        <audio v-if="previewUrl" :src="previewUrl" controls autoplay />
      </section>
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
        <v-btn
          v-for="action in actions"
          :key="action.key"
          class="translation-action"
          block
          :prepend-icon="action.icon"
          :color="action.color"
          :variant="action.done ? 'tonal' : 'flat'"
          :disabled="Boolean(mediaStore.busyAction) || !available.has(action.key)"
          :loading="mediaStore.busyAction === action.key"
          @click="emit('action', action.key)"
        >{{ action.label }}</v-btn>
      </div>
      <v-alert v-if="mediaStore.error" type="error" density="compact" variant="tonal">{{ mediaStore.error }}</v-alert>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import { availableVideoTranslationActions, type VideoTranslationAction } from '@/runtime/videoTranslation'
import type { VoiceProfile } from '~/electron/voice-library'

const props = defineProps<{ selectedCueId: string }>()
const emit = defineEmits<{ action: [action: VideoTranslationAction] }>()
const mediaStore = useMediaTaskStore()
const state = computed(() => mediaStore.videoTranslation!)
const selectedCue = computed(() => state.value.cues.find((cue) => cue.cueId === props.selectedCueId))
const selectedRole = computed(() => mediaStore.videoTranslationRoles.find((role) => role.translationRoleId === selectedCue.value?.translationRoleId))
const voiceProfiles = ref<VoiceProfile[]>([])
const previewUrl = ref('')
const available = computed(() => new Set(availableVideoTranslationActions(state.value, mediaStore.videoTranslationRoles)))
const actions = computed(() => [
  { key: 'upload-video', label: state.value.sourceVideoPath ? '更换视频' : '上传视频', icon: 'mdi-upload', color: 'primary', done: false },
  { key: 'generate-source-subtitles', label: '生成原字幕', icon: 'mdi-subtitles-outline', done: state.value.transcriptStatus === 'ready' },
  { key: 'identify-speakers', label: '识别说话角色', icon: 'mdi-account-voice', done: state.value.speakerStatus === 'ready' },
  { key: 'translate-all-subtitles', label: '翻译所有字幕', icon: 'mdi-translate', done: state.value.translationStatus === 'ready' },
  { key: 'confirm-speakers-and-subtitles', label: '确认角色与字幕', icon: 'mdi-check-decagram-outline', done: state.value.reviewStatus === 'ready' },
  { key: 'arrange-doubao-voice', label: '生成豆包配音安排', icon: 'mdi-text-box-check-outline', done: state.value.arrangementStatus === 'ready' },
  { key: 'generate-target-voice', label: '生成目标语言配音', icon: 'mdi-waveform', done: state.value.voiceStatus === 'ready' },
  { key: 'separate-source-audio', label: '分离原人声和背景声', icon: 'mdi-call-split', done: state.value.separationStatus === 'ready' },
  { key: 'remove-original-vocal', label: '去除原人声', icon: 'mdi-account-voice-off', done: state.value.originalVocalRemoved },
  { key: 'mix-background-audio', label: '混回背景声和目标语言配音', icon: 'mdi-tune-vertical', done: state.value.mixStatus === 'ready' },
  { key: 'burn-subtitles-and-voice', label: '烧录字幕和配音', icon: 'mdi-movie-check-outline', done: state.value.finalStatus === 'ready' },
] as Array<{ key: VideoTranslationAction; label: string; icon: string; color?: string; done: boolean }>)

async function loadProfiles() {
  voiceProfiles.value = await window.electron.cloud.listVoiceProfiles({ includeNonCommercial: true, sourceGroup: 'Seed Audio' })
}
async function bindVoice(voiceProfileId: string) {
  if (!selectedRole.value || !voiceProfileId) return
  selectedRole.value.voiceProfileId = voiceProfileId
  mediaStore.invalidateTranslation('voice-binding')
  await window.electron.cloud.bindVideoTranslationVoice(mediaStore.runId, selectedRole.value)
  previewUrl.value = ''
}
async function loadPreview() {
  if (selectedRole.value?.voiceProfileId)
    previewUrl.value = await window.electron.cloud.previewVoiceProfile(selectedRole.value.voiceProfileId)
}
function updatePrompt(value: string) {
  state.value.seedPromptText = value
  mediaStore.invalidateTranslation('voice-prompt')
}
onMounted(loadProfiles)
watch(() => mediaStore.runId, loadProfiles)
watch(() => selectedRole.value?.voiceProfileId, () => { previewUrl.value = '' })
</script>

<style scoped>
.translation-inspector { height: 100%; min-height: 0; overflow: hidden; }
.inspector-scroll { height: 100%; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 12px; }
header { display: grid; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,.1); }
header small { color: rgba(0,0,0,.56); }
.voice-section { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; }
.voice-section > strong, .voice-section audio { grid-column: 1 / -1; }
audio { width: 100%; height: 32px; }
.actions { display: grid; gap: 7px; }
.translation-action { min-height: 42px; justify-content: flex-start; }
</style>
