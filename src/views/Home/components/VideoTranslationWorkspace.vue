<template>
  <v-sheet class="translation-workspace" border rounded>
    <section class="translation-preview">
      <header>
        <div>
          <h2>视频字幕工作台</h2>
          <p>{{ previewCaption }}</p>
        </div>
      </header>
      <video
        v-if="state.sourceVideoPath"
        ref="sourcePreview"
        class="source-preview"
        :class="{ 'full-width': !state.finalVideoPath }"
        :src="fileUrl(state.sourceVideoPath)"
        controls
        preload="metadata"
        @timeupdate="stopAtSelectedEnd"
      />
      <div v-else class="source-placeholder">
        <v-icon size="42">mdi-video-outline</v-icon><span>请从右栏上传视频</span>
      </div>
      <video
        v-if="state.finalVideoPath"
        class="final-preview"
        :src="fileUrl(state.finalVideoPath)"
        controls
        preload="metadata"
      />
    </section>
    <div class="translation-table-wrap">
      <table class="translation-table">
        <thead>
          <tr>
            <th class="timeline-column">时间轴</th>
            <th class="preview-column">视频片段预览</th>
            <th class="role-column">说话角色</th>
            <th>{{ languageLabel(state.sourceLanguage) }}字幕</th>
            <th>{{ languageLabel(state.targetLanguage) }}字幕</th>
            <th class="audio-column">目标语言配音</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!state.cues.length">
            <td colspan="6" class="empty-row">点击右栏“扒片”后在这里审核角色、原文和译文</td>
          </tr>
          <tr
            v-for="cue in state.cues"
            :key="cue.cueId"
            :class="{ selected: selectedCueId === cue.cueId }"
            @click="selectCue(cue.cueId)"
          >
            <td>
              <strong>{{ formatTime(cue.startMs) }}</strong
              ><small>{{ formatTime(cue.endMs) }}</small>
            </td>
            <td>
              <video
                :src="`${fileUrl(state.sourceVideoPath!)}#t=${cue.startMs / 1000},${cue.endMs / 1000}`"
                muted
                preload="metadata"
              />
            </td>
            <td @click.stop>
              <v-select
                :model-value="cue.translationRoleId || ''"
                :items="roleItems(cue)"
                density="compact"
                hide-details
                :label="cue.proposedName ? `候选：${cue.proposedName}` : '选择角色'"
                @update:model-value="bindRole(cue, $event)"
              />
              <small v-if="cue.evidence" :title="cue.evidence"
                >置信度 {{ Math.round((cue.confidence || 0) * 100) }}%</small
              >
            </td>
            <td @click.stop>
              <textarea
                :value="cue.sourceText"
                aria-label="原字幕"
                @input="updateText(cue, 'sourceText', $event)"
              />
            </td>
            <td @click.stop>
              <textarea
                :value="cue.translatedText"
                aria-label="译文字幕"
                @input="updateText(cue, 'translatedText', $event)"
              />
            </td>
            <td>
              <audio
                v-if="cue.voicePath || state.targetVoicePath"
                :src="`${fileUrl(cue.voicePath || state.targetVoicePath!)}#t=${cue.startMs / 1000},${cue.endMs / 1000}`"
                controls
                preload="metadata"
              />
              <small v-else>待生成</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'
import type { VideoTranslationCue } from '@/runtime/videoTranslation'

const props = defineProps<{ selectedCueId: string }>()
const emit = defineEmits<{ selectCue: [cueId: string] }>()
const mediaStore = useMediaTaskStore()
const state = computed(() => mediaStore.videoTranslation!)
const sourcePreview = ref<HTMLVideoElement>()
const selectedCue = computed(() =>
  state.value.cues.find((cue) => cue.cueId === props.selectedCueId),
)
const previewCaption = computed(() =>
  state.value.sourceVideoPath
    ? `${Math.round(state.value.durationMs / 1000)} 秒 · ${state.value.cues.length} 条字幕`
    : '保持原片完整画面和时间轴',
)

function fileUrl(filePath: string) {
  return managedMediaUrl(mediaStore.runId, filePath)
}
function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}
function languageLabel(value: string) {
  return (
    (
      {
        auto: '源语言',
        zh: '中文',
        en: '英语',
        ja: '日语',
        ko: '韩语',
        es: '西班牙语',
        fr: '法语',
        de: '德语',
      } as Record<string, string>
    )[value] || value
  )
}
function roleItems(cue: VideoTranslationCue) {
  return [
    ...mediaStore.videoTranslationRoles.map((role) => ({
      title: role.displayName,
      value: role.translationRoleId,
    })),
    ...(cue.proposedName ? [{ title: `新建角色：${cue.proposedName}`, value: '__new__' }] : []),
  ]
}
function bindRole(cue: VideoTranslationCue, value: string) {
  if (value === '__new__') {
    const name = cue.proposedName?.trim() || '新角色'
    const roleId = `role-${crypto.randomUUID()}`
    mediaStore.videoTranslationRoles.push({
      translationRoleId: roleId,
      displayName: name,
      aliases: [],
      sourceEpisodeIds: [mediaStore.episodeId],
      status: 'confirmed',
    })
    cue.translationRoleId = roleId
    cue.needsReview = false
  } else {
    cue.translationRoleId = value
    cue.needsReview = false
  }
  mediaStore.invalidateTranslation('source-dialogue')
}
function updateText(cue: VideoTranslationCue, key: 'sourceText' | 'translatedText', event: Event) {
  cue[key] = (event.target as HTMLTextAreaElement).value
  mediaStore.invalidateTranslation(key === 'sourceText' ? 'source-dialogue' : 'translation')
}
function selectCue(cueId: string) {
  emit('selectCue', cueId)
}
function stopAtSelectedEnd() {
  if (
    sourcePreview.value &&
    selectedCue.value &&
    sourcePreview.value.currentTime >= selectedCue.value.endMs / 1000
  )
    sourcePreview.value.pause()
}
watch(
  () => props.selectedCueId,
  async () => {
    await nextTick()
    if (sourcePreview.value && selectedCue.value)
      sourcePreview.value.currentTime = selectedCue.value.startMs / 1000
  },
)
</script>

<style scoped>
.translation-workspace {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 14px;
  display: grid;
  gap: 14px;
  grid-template-rows: minmax(220px, 42%) minmax(0, 1fr);
}
.translation-preview {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 28%);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px 12px;
}
.translation-preview header {
  grid-column: 1 / -1;
}
h2 {
  margin: 0;
  font-size: 18px;
}
p {
  margin: 3px 0 0;
  color: rgba(0, 0, 0, 0.56);
}
.source-preview,
.final-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  background: #111;
  border-radius: 6px;
}
.source-preview.full-width {
  grid-column: 1 / -1;
}
.source-placeholder {
  grid-column: 1 / -1;
  min-height: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
}
.translation-table-wrap {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.translation-table {
  width: 100%;
  min-width: 1000px;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
}
.timeline-column {
  width: 110px;
}
.preview-column {
  width: 112px;
}
.role-column {
  width: 190px;
}
.audio-column {
  width: 122px;
}
th,
td {
  padding: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  text-align: left;
  vertical-align: top;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}
tr.selected {
  background: rgba(21, 122, 53, 0.08);
}
td small {
  display: block;
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
}
td video {
  width: 96px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #111;
  border-radius: 4px;
}
textarea {
  width: 100%;
  min-height: 62px;
  resize: vertical;
  padding: 6px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 4px;
  background: transparent;
  font: inherit;
}
audio {
  width: 108px;
  height: 30px;
}
.empty-row {
  padding: 32px;
  text-align: center;
  color: rgba(0, 0, 0, 0.56);
}
</style>
