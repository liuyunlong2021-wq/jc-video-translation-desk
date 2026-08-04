<template>
  <section
    class="dubbing-workspace"
    :class="mediaStore.ratio === '9:16' ? 'portrait-layout' : 'landscape-layout'"
    aria-label="配音字幕工作台"
  >
    <div class="dubbing-preview">
      <div class="dubbing-heading">
        <div><h2>配音字幕工作台</h2><p>按剪辑时间轴逐素材核对画面、角色和字幕。</p></div>
        <v-chip size="small" :color="mediaStore.allEditingReady ? 'success' : 'warning'" variant="tonal">
          {{ mediaStore.allEditingReady ? '时间轴已就绪' : '等待时间轴' }}
        </v-chip>
      </div>
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
              <label>起点 <input type="range" min="0" :max="durationFor(segment)" step="0.1" :value="rangeFor(segment).start" :disabled="!mediaStore.allEditingReady" @input.stop="updateRange(segment.index, 'start', $event)" /></label>
              <label>终点 <input type="range" min="0" :max="durationFor(segment)" step="0.1" :value="rangeFor(segment).end" :disabled="!mediaStore.allEditingReady" @input.stop="updateRange(segment.index, 'end', $event)" /></label>
            </td>
            <td><video v-if="segment.videoPath" :src="fileUrl(segment.videoPath)" muted preload="metadata" /><span v-else class="muted">待生成</span></td>
            <td>{{ segment.speakerId || '无角色' }}</td>
            <td><span class="muted">待生成配音</span></td>
            <td>{{ segment.dialogueText || '无台词' }}</td>
            <td><span class="muted">待翻译</span></td>
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

const mediaStore = useMediaTaskStore()
const selectedIndex = ref(mediaStore.segments[0]?.index)
const sourcePreview = ref<HTMLVideoElement>()
const ranges = ref<Record<number, { start: number; end: number }>>({})
function durationFor(segment: StoryboardSegment) { return Math.max(0.1, (segment.editingAnalysis?.sourceDurationMs || segment.generationDuration * 1000) / 1000) }
function rangeFor(segment: StoryboardSegment) {
  if (ranges.value[segment.index]) return ranges.value[segment.index]
  const duration = durationFor(segment)
  const analysis = segment.editingAnalysis
  const next = { start: Math.max(0, Math.min(duration, (analysis?.trimStartMs || 0) / 1000)), end: Math.max(0.1, Math.min(duration, (analysis?.trimEndMs || duration * 1000) / 1000)) }
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
function fileUrl(path: string) { return managedMediaUrl(mediaStore.runId, path) }
</script>

<style scoped>
.dubbing-workspace { display: grid; gap: 14px; height: 100%; min-height: 0; overflow: hidden; padding: 14px; }
.dubbing-workspace.portrait-layout { grid-template-columns: minmax(230px, 28%) minmax(0, 1fr); }
.dubbing-workspace.landscape-layout { grid-template-columns: minmax(320px, 38%) minmax(0, 1fr); }
.dubbing-preview { min-width: 0; min-height: 0; display: grid; gap: 8px; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; }
.dubbing-heading { display: flex; justify-content: space-between; gap: 10px; }
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
.timeline-cell { display: grid; gap: 4px; min-width: 150px; }
.timeline-cell label { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 5px; color: rgba(0,0,0,.58); }
.timeline-cell input:disabled { cursor: not-allowed; opacity: .45; }
.muted { color: rgba(0,0,0,.5); }
.empty-row { text-align: center !important; padding: 30px !important; color: rgba(0,0,0,.56); }
</style>
