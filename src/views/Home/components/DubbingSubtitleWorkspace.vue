<template>
  <section
    class="dubbing-workspace"
    :class="mediaStore.ratio === '9:16' ? 'portrait-layout' : 'landscape-layout'"
    aria-label="配音字幕工作台"
  >
    <div class="dubbing-preview">
      <div class="dubbing-heading">
        <div><h2>配音字幕工作台</h2><p>按素材内剪辑点逐条核对画面、角色和字幕。</p></div>
      </div>
      <v-chip class="timeline-status" size="small" :color="timelineStatus.color" variant="tonal">
        {{ timelineStatus.text }}
      </v-chip>
      <audio
        v-if="mediaStore.audioProductionRoute === 'seed-full-track' && mediaStore.seedAudioTrackPath"
        class="seed-track-preview"
        :src="fileUrl(mediaStore.seedAudioTrackPath)"
        controls
        preload="metadata"
      />
      <video
        v-if="selectedSegment?.videoPath"
        ref="sourcePreview"
        class="source-preview"
        :src="fileUrl(selectedSegment.videoPath)"
        controls
        preload="metadata"
        @loadedmetadata="seekSelectedRange"
        @play="guardSelectedRange"
        @timeupdate="stopAtSelectedEnd"
      />
      <div v-else class="source-placeholder"><v-icon size="42">mdi-video-outline</v-icon><span>选择一条已生成的视频素材预览</span></div>
      <small v-if="selectedSegment" class="preview-caption">素材 {{ selectedSegment.index }} · {{ selectedRange.start.toFixed(1) }}-{{ selectedRange.end.toFixed(1) }} 秒</small>
    </div>
    <div class="dubbing-table-wrap">
      <table class="dubbing-table">
        <colgroup>
          <col class="timeline-column" />
          <col class="preview-column" />
          <col class="role-column" />
          <col class="audio-column" />
          <col class="chinese-column" />
          <col class="english-column" />
        </colgroup>
        <thead><tr><th>时间轴</th><th>视频片段预览</th><th>角色</th><th>配音试听</th><th>中文字幕</th><th>英文字幕</th></tr></thead>
        <tbody>
          <tr v-for="segment in mediaStore.segments" :key="segment.index" :class="{ selected: selectedIndex === segment.index }" @click="selectSegment(segment.index)">
            <td class="timeline-cell">
              <span>{{ rangeFor(segment).start.toFixed(1) }}-{{ rangeFor(segment).end.toFixed(1) }}s</span>
              <label>起点 <input type="range" min="0" :max="durationFor(segment)" step="0.1" :value="rangeFor(segment).start" :disabled="!mediaStore.allEditingReady" @input.stop="updateRange(segment.index, 'start', $event)" @change.stop="persistRange(segment.index)" /></label>
              <label>终点 <input type="range" min="0" :max="durationFor(segment)" step="0.1" :value="rangeFor(segment).end" :disabled="!mediaStore.allEditingReady" @input.stop="updateRange(segment.index, 'end', $event)" @change.stop="persistRange(segment.index)" /></label>
            </td>
            <td><video v-if="segment.videoPath" :src="segmentPreviewUrl(segment)" muted preload="metadata" /><span v-else class="muted">待生成</span></td>
            <td><strong>{{ speakerLabel(segment) }}</strong><small v-if="segment.dialogueEmotion">{{ segment.dialogueEmotion }}</small></td>
            <td class="audio-cell" @click.stop>
              <label v-if="segment.chineseVoicePath">中文<audio :src="fileUrl(segment.chineseVoicePath)" controls preload="metadata" /></label>
              <label v-if="segment.englishVoicePath">英文<audio :src="fileUrl(segment.englishVoicePath)" controls preload="metadata" /></label>
              <span v-if="mediaStore.audioProductionRoute === 'seed-full-track' && mediaStore.seedAudioTrackPath" class="muted">使用整段声音轨</span>
              <span v-else-if="!segment.chineseVoicePath && !segment.englishVoicePath" class="muted">待生成配音</span>
            </td>
            <td><textarea :value="segment.dialogueText" rows="3" :disabled="!mediaStore.allEditingReady" placeholder="无台词" @click.stop @input="updateSubtitle(segment, $event)" /></td>
            <td><textarea readonly :value="segment.englishDialogueText" rows="3" placeholder="待翻译" @click.stop /></td>
          </tr>
          <tr v-if="!mediaStore.segments.length"><td colspan="6" class="empty-row">剪辑时间轴完成后，素材会显示在这里。</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useMediaTaskStore } from '@/store'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'
import type { StoryboardSegment } from '@/runtime/videoWorkflow'

const emit = defineEmits<{
  updateEditPoint: [index: number, startMs: number, endMs: number]
  updateChineseSubtitle: [index: number, text: string]
}>()
const mediaStore = useMediaTaskStore()
const selectedIndex = ref(mediaStore.segments[0]?.index)
const sourcePreview = ref<HTMLVideoElement>()
const ranges = ref<Record<number, { start: number; end: number }>>({})
const timelineStatus = computed(() => {
  if (mediaStore.allEditingReady) return { text: '时间轴已就绪', color: 'success' }
  if (!mediaStore.allTranscriptsReady) return { text: '待生成 SRT', color: 'warning' }
  return { text: '待生成剪辑时间轴', color: 'warning' }
})
function durationFor(segment: StoryboardSegment) { return Math.max(0.1, (segment.editingAnalysis?.sourceDurationMs || segment.generationDuration * 1000) / 1000) }
function rangeFor(segment: StoryboardSegment) {
  if (ranges.value[segment.index]) return ranges.value[segment.index]
  const duration = durationFor(segment)
  const analysis = segment.editingAnalysis
  const next = { start: Math.max(0, Math.min(duration, (analysis?.adoptedStartMs ?? analysis?.trimStartMs ?? 0) / 1000)), end: Math.max(0.1, Math.min(duration, (analysis?.adoptedEndMs ?? analysis?.trimEndMs ?? duration * 1000) / 1000)) }
  if (next.end <= next.start) next.end = Math.min(duration, next.start + 0.1)
  ranges.value[segment.index] = next
  return next
}
const selectedSegment = computed(() => mediaStore.segments.find((segment) => segment.index === selectedIndex.value) || mediaStore.segments[0])
const selectedRange = computed(() => selectedSegment.value ? rangeFor(selectedSegment.value) : { start: 0, end: 0 })
function seekSelectedRange() {
  if (sourcePreview.value) sourcePreview.value.currentTime = selectedRange.value.start
}
function selectSegment(index: number) {
  selectedIndex.value = index
  void nextTick(() => {
    seekSelectedRange()
    void sourcePreview.value?.play().catch(() => undefined)
  })
}
function guardSelectedRange() {
  const video = sourcePreview.value
  if (video && (video.currentTime < selectedRange.value.start || video.currentTime >= selectedRange.value.end))
    video.currentTime = selectedRange.value.start
}
function stopAtSelectedEnd() {
  const video = sourcePreview.value
  if (video && video.currentTime >= selectedRange.value.end) {
    video.pause()
    video.currentTime = selectedRange.value.end
  }
}
function updateRange(index: number, edge: 'start' | 'end', event: Event) {
  if (!mediaStore.allEditingReady) return
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  const range = rangeFor(segment)
  const value = Number((event.target as HTMLInputElement).value)
  if (edge === 'start') range.start = Math.min(value, range.end - 0.1)
  else range.end = Math.max(value, range.start + 0.1)
  if (selectedIndex.value === index && sourcePreview.value) {
    sourcePreview.value.pause()
    sourcePreview.value.currentTime = value
  }
}
function persistRange(index: number) {
  const range = ranges.value[index]
  if (range) emit('updateEditPoint', index, Math.round(range.start * 1000), Math.round(range.end * 1000))
}
function updateSubtitle(segment: StoryboardSegment, event: Event) {
  const text = (event.target as HTMLTextAreaElement).value
  segment.dialogueText = text
  emit('updateChineseSubtitle', segment.index, text)
}
function fileUrl(path: string) { return managedMediaUrl(mediaStore.runId, path) }
function segmentPreviewUrl(segment: StoryboardSegment) { return `${fileUrl(segment.videoPath!)}#t=${rangeFor(segment).start}` }
function speakerLabel(segment: StoryboardSegment) {
  if (!segment.soundType || segment.soundType === 'none') return '无台词'
  if (segment.soundType === 'voiceover' || segment.speakerId?.startsWith('narrator')) return '旁白'
  const asset = mediaStore.referenceAssets.find((item) => item.id === segment.speakerId)
  if (asset) return asset.label
  return segment.dialogueCharacter && segment.dialogueCharacter !== '无' ? segment.dialogueCharacter : '未知角色'
}
</script>

<style scoped>
.dubbing-workspace { display: grid; gap: 14px; height: 100%; min-height: 0; overflow: hidden; padding: 14px; }
.dubbing-workspace.portrait-layout { grid-template-columns: minmax(230px, 28%) minmax(0, 1fr); }
.dubbing-workspace.landscape-layout { grid-template-columns: minmax(320px, 38%) minmax(0, 1fr); }
.dubbing-preview { min-width: 0; min-height: 0; display: grid; gap: 8px; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }
.timeline-status { justify-self: start; }
.seed-track-preview { width: 100%; height: 34px; }
.dubbing-heading h2 { margin: 0; font-size: 18px; }
.dubbing-heading p, .preview-caption { margin: 3px 0 0; color: rgba(0,0,0,.56); }
.source-preview { min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; object-fit: contain; justify-self: center; background: #111; border-radius: 6px; }
.portrait-layout .source-preview { height: 100%; aspect-ratio: 9 / 16; }
.landscape-layout .source-preview { width: 100%; aspect-ratio: 16 / 9; }
.source-placeholder { min-height: 0; display: grid; place-items: center; align-content: center; gap: 8px; color: rgba(0,0,0,.5); background: rgba(0,0,0,.04); border-radius: 6px; }
.dubbing-table-wrap { min-width: 0; min-height: 0; overflow: auto; }
.dubbing-table { width: 100%; min-width: 780px; table-layout: fixed; border-collapse: collapse; font-size: 12px; }
.timeline-column { width: 170px; }
.preview-column { width: 108px; }
.role-column { width: 100px; }
.audio-column { width: 100px; }
.chinese-column { width: auto; }
.english-column { width: 130px; }
.dubbing-table th, .dubbing-table td { padding: 8px; border-bottom: 1px solid rgba(0,0,0,.1); text-align: left; vertical-align: top; }
.dubbing-table th { position: sticky; top: 0; background: rgb(var(--v-theme-surface)); z-index: 1; }
.dubbing-table tr.selected { background: rgba(21,122,53,.08); }
.dubbing-table td video { width: 92px; aspect-ratio: 16 / 9; object-fit: cover; background: #111; border-radius: 4px; }
.dubbing-table td > small { display: block; margin-top: 4px; color: rgba(0,0,0,.5); }
.dubbing-table textarea { width: 100%; min-height: 54px; resize: vertical; padding: 5px; border: 1px solid rgba(0,0,0,.16); border-radius: 4px; background: transparent; font: inherit; }
.dubbing-table textarea:read-only { color: rgba(0,0,0,.62); background: rgba(0,0,0,.025); }
.audio-cell { display: grid; gap: 6px; }
.audio-cell label { display: grid; gap: 2px; color: rgba(0,0,0,.58); }
.audio-cell audio { width: 92px; height: 28px; }
.timeline-cell { display: grid; gap: 4px; min-width: 150px; }
.timeline-cell label { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 5px; color: rgba(0,0,0,.58); }
.timeline-cell input:disabled { cursor: not-allowed; opacity: .45; }
.muted { color: rgba(0,0,0,.5); }
.empty-row { text-align: center !important; padding: 30px !important; color: rgba(0,0,0,.56); }
</style>
