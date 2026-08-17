<template>
  <v-sheet class="translation-workspace" border rounded>
    <section class="translation-preview">
      <header>
        <div>
          <h2>{{ showRoles ? '字幕工作台' : '成片工作台' }}</h2>
          <p>{{ previewCaption }}</p>
        </div>
      </header>
      <video
        v-if="state.sourceVideoPath"
        ref="sourcePreview"
        class="source-preview"
        :class="{ 'full-width': !state.finalVideoPath }"
        :src="fileUrl(previewVideoPath)"
        controls
        preload="metadata"
        @play="armSelectedEnd"
        @timeupdate="updatePlayhead"
        @seeked="updatePlayhead"
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
    <div ref="tableWrap" class="translation-table-wrap">
      <table class="translation-table">
        <thead>
          <tr>
            <th class="sequence-column">序号</th>
            <th class="timeline-column">时间轴</th>
            <th class="preview-column">视频片段预览</th>
            <th v-if="showRoles" class="role-column">
              <span>说话角色</span>
              <label class="batch-role-toggle">
                <input v-model="batchSameVisualPerson" type="checkbox" />
                相同画面人物
              </label>
              <small v-if="batchTargetCount > 1" class="batch-target-count">
                将修改 {{ batchTargetCount }} 条字幕
              </small>
            </th>
            <th>人工确认稿</th>
            <th>{{ languageLabel(state.targetLanguage) }}字幕</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!state.cues.length">
            <td :colspan="showRoles ? 6 : 5" class="empty-row">
              点击右栏“识别字幕”后在这里审核角色、原文和译文
            </td>
          </tr>
          <tr
            v-for="(cue, index) in state.cues"
            :key="cue.cueId"
            :class="{ selected: selectedCueId === cue.cueId }"
            @click="selectCue(cue.cueId)"
          >
            <td class="sequence-cell">
              <strong>#{{ String(index + 1).padStart(2, '0') }}</strong>
              <small v-if="cue.dubbingGroupId">组{{ groupNumber(cue.dubbingGroupId) }}</small>
            </td>
            <td>
              <strong>{{ formatTime(cue.startMs) }}</strong
              ><small>{{ formatTime(cue.endMs) }}</small>
              <v-chip v-if="cue.suspectedMissing" size="x-small" color="warning" variant="tonal">
                疑似漏句
              </v-chip>
            </td>
            <td>
              <img
                v-if="cue.framePath"
                class="frame-preview"
                :src="fileUrl(cue.framePath)"
                alt="画面识别人物参考帧"
                @error="cue.framePath = undefined"
              />
              <video
                v-if="!cue.framePath"
                :src="`${fileUrl(previewVideoPath)}#t=${cue.startMs / 1000},${cue.endMs / 1000}`"
                muted
                preload="metadata"
              />
            </td>
            <td v-if="showRoles" @click.stop="selectCue(cue.cueId)">
              <v-select
                :model-value="cue.translationRoleId || ''"
                :items="roleItems(cue)"
                density="compact"
                hide-details
                :label="roleCandidateName(cue) ? `候选：${roleCandidateName(cue)}` : '选择角色'"
                @update:model-value="bindRole(cue, $event)"
              />
              <small v-if="cue.speakerCluster"
                >声音识别：{{ speakerLabel(cue.speakerCluster) }}</small
              >
              <small v-if="cue.visiblePersonIds?.length">
                画面出现：{{ cue.visiblePersonIds.map(visualPersonLabel).join('、') }}
              </small>
            </td>
            <td @click.stop="selectCue(cue.cueId)">
              <textarea
                :value="cue.sourceText"
                :data-cue-id="cue.cueId"
                aria-label="原字幕"
                :placeholder="cue.suspectedMissing ? cue.recognizedText : undefined"
                @input="updateText(cue, 'sourceText', $event)"
                @click="rememberTextCursor(cue, $event)"
                @keyup="rememberTextCursor(cue, $event)"
                @select="rememberTextCursor(cue, $event)"
              />
              <small
                v-if="cue.calibrationSuggestion && cue.calibrationSuggestion !== cue.sourceText"
                class="calibration-suggestion"
                >建议：{{ cue.calibrationSuggestion }}</small
              >
            </td>
            <td @click.stop="selectCue(cue.cueId)">
              <textarea
                :value="cue.translatedText"
                aria-label="译文字幕"
                @input="updateText(cue, 'translatedText', $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <v-dialog v-model="roleDialogOpen" max-width="420">
      <v-card title="新建角色">
        <v-card-text>
          <v-text-field
            v-model="roleNameDraft"
            label="真实角色姓名"
            autofocus
            hide-details
            @keyup.enter="confirmNewRole"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <button type="button" class="dialog-action" @click="roleDialogOpen = false">取消</button>
          <button
            type="button"
            class="dialog-action primary"
            :disabled="!roleNameDraft.trim()"
            @click="confirmNewRole"
          >
            确认
          </button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'
import {
  videoTranslationRoleBindingTargets,
  type VideoTranslationCue,
} from '@/runtime/videoTranslation'

const props = withDefaults(defineProps<{ selectedCueId: string; showRoles?: boolean }>(), {
  showRoles: true,
})
const { showRoles } = props
const emit = defineEmits<{
  selectCue: [cueId: string]
  playhead: [playheadMs: number]
  textCursor: [cueId: string, offset: number]
}>()
const mediaStore = useMediaTaskStore()
const state = computed(() => mediaStore.videoTranslation!)
const sourcePreview = ref<HTMLVideoElement>()
const tableWrap = ref<HTMLDivElement>()
const selectedEndMs = ref<number>()
const roleDialogOpen = ref(false)
const roleNameDraft = ref('')
const pendingRoleCue = ref<VideoTranslationCue>()
const batchSameVisualPerson = ref(false)
watch(
  () => [mediaStore.runId, mediaStore.episodeId, state.value.speakerStatus],
  () => {
    batchSameVisualPerson.value = false
  },
)
const selectedCue = computed(() =>
  state.value.cues.find((cue) => cue.cueId === props.selectedCueId),
)
const batchTargetCount = computed(() => {
  const selected = selectedCue.value
  return selected
    ? videoTranslationRoleBindingTargets(
        state.value.cues,
        selected.cueId,
        false,
        batchSameVisualPerson.value,
      ).length
    : 0
})
const previewCaption = computed(() =>
  state.value.sourceVideoPath
    ? `${Math.round(state.value.durationMs / 1000)} 秒 · ${state.value.cues.length} 条字幕`
    : '保持原片完整画面和时间轴',
)
const previewVideoPath = computed(() =>
  !showRoles && state.value.finalMasterVideoPath
    ? state.value.finalMasterVideoPath
    : state.value.sourceVideoPath!,
)
const groupedNumberById = computed(() => {
  const ids = state.value.cues
    .map((cue) => cue.dubbingGroupId)
    .filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index)
  return new Map(ids.map((id, index) => [id, String(index + 1).padStart(2, '0')]))
})

function groupNumber(groupId: string) {
  return groupedNumberById.value.get(groupId) || ''
}

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
function speakerLabel(speakerId: string) {
  return `声音人物 ${Number(speakerId.match(/\d+$/)?.[0] || 0) + 1}`
}
function visualPersonLabel(personId: string) {
  return `画面人物 ${Number(personId.match(/\d+$/)?.[0] || 0)}`
}
function roleCandidateName(cue: VideoTranslationCue) {
  if (state.value.frameCalibrationStatus === 'ready')
    return cue.visiblePersonIds?.length === 1 ? visualPersonLabel(cue.visiblePersonIds[0]) : ''
  return cue.proposedName || ''
}
function roleItems(cue: VideoTranslationCue) {
  const candidateName = roleCandidateName(cue)
  return [
    ...mediaStore.videoTranslationRoles.map((role) => ({
      title: role.displayName,
      value: role.translationRoleId,
    })),
    ...(candidateName ? [{ title: `新建角色：${candidateName}`, value: '__new__' }] : []),
  ]
}
function bindRole(cue: VideoTranslationCue, value: string) {
  if (value === '__new__') {
    pendingRoleCue.value = cue
    roleNameDraft.value = roleCandidateName(cue)
    roleDialogOpen.value = true
    return
  }
  applyRole(cue, value)
}
function applyRole(cue: VideoTranslationCue, roleId: string) {
  videoTranslationRoleBindingTargets(
    state.value.cues,
    cue.cueId,
    false,
    batchSameVisualPerson.value,
  ).forEach((item) => {
    item.translationRoleId = roleId
    item.needsReview = false
  })
  mediaStore.invalidateTranslation('role-binding')
}
function confirmNewRole() {
  const cue = pendingRoleCue.value
  const name = roleNameDraft.value.trim()
  if (!cue || !name) return
  const roleId = `role-${crypto.randomUUID()}`
  mediaStore.videoTranslationRoles.push({
    translationRoleId: roleId,
    displayName: name,
    aliases: [],
    sourceEpisodeIds: [mediaStore.episodeId],
    screenshotId: `screenshot-${crypto.randomUUID()}`,
    status: 'confirmed',
  })
  applyRole(cue, roleId)
  roleDialogOpen.value = false
  pendingRoleCue.value = undefined
}
function updateText(cue: VideoTranslationCue, key: 'sourceText' | 'translatedText', event: Event) {
  cue[key] = (event.target as HTMLTextAreaElement).value
  if (key === 'sourceText') rememberTextCursor(cue, event)
  mediaStore.invalidateTranslation(key === 'translatedText' ? 'translation' : 'source-dialogue')
}
function rememberTextCursor(cue: VideoTranslationCue, event: Event) {
  emit('textCursor', cue.cueId, (event.target as HTMLTextAreaElement).selectionStart || 0)
}
function selectCue(cueId: string) {
  emit('selectCue', cueId)
}
function armSelectedEnd() {
  const currentMs = Math.round((sourcePreview.value?.currentTime || 0) * 1000)
  selectedEndMs.value =
    selectedCue.value && Math.abs(currentMs - selectedCue.value.startMs) <= 150
      ? selectedCue.value.endMs
      : undefined
}
function updatePlayhead() {
  if (!sourcePreview.value) return
  const currentMs = Math.round(sourcePreview.value.currentTime * 1000)
  emit('playhead', currentMs)
  if (selectedEndMs.value !== undefined && currentMs >= selectedEndMs.value) {
    sourcePreview.value.pause()
    selectedEndMs.value = undefined
  }
}
watch(
  () => props.selectedCueId,
  async () => {
    await nextTick()
    if (sourcePreview.value && selectedCue.value)
      sourcePreview.value.currentTime = selectedCue.value.startMs / 1000
  },
)

function focusSourceCue(cueId: string) {
  void nextTick(() => {
    tableWrap.value?.querySelector<HTMLTextAreaElement>(`textarea[data-cue-id="${cueId}"]`)?.focus()
  })
}

defineExpose({ focusSourceCue })
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
.calibration-suggestion {
  display: block;
  margin-top: 5px;
  color: rgb(var(--v-theme-primary));
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
.sequence-column {
  width: 62px;
}
.sequence-cell strong,
.sequence-cell small {
  white-space: nowrap;
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
.batch-role-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  font-size: 11px;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.6);
}
.batch-target-count {
  display: block;
  margin-top: 5px;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 500;
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
td video,
.frame-preview {
  width: 96px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #111;
  border-radius: 4px;
}
.frame-preview {
  object-fit: contain;
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
.dialog-action {
  min-height: 36px;
  padding: 0 14px;
  color: rgba(0, 0, 0, 0.72);
}
.dialog-action.primary {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.dialog-action:disabled {
  opacity: 0.38;
}
</style>
