<template>
  <v-sheet class="h-full min-h-0 p-3 flex flex-col" border rounded>
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="text-subtitle-1 font-weight-medium">{{ t('workflow.library.title') }}</div>
      <v-chip size="small" variant="tonal" title="veo-3.1-generate-preview">Veo 3.1</v-chip>
    </div>

    <v-btn-toggle v-model="filter" mandatory density="compact" class="library-filters mb-2">
      <v-btn v-for="item in filters" :key="item.value" :value="item.value" size="small">
        {{ item.title }}
      </v-btn>
    </v-btn-toggle>

    <div v-if="!hasVisibleAssets" class="flex-1 grid place-items-center text-medium-emphasis text-body-2 text-center px-6">
      {{ t('workflow.library.empty') }}
    </div>
    <div v-else class="min-h-0 flex-1 overflow-y-auto pr-1">
      <div v-if="voiceVisible" class="voice-row mb-2">
        <v-icon size="20">mdi-waveform</v-icon>
        <div class="voice-label">{{ t('workflow.library.voice') }}<small>{{ mediaStore.voiceDuration.toFixed(1) }}s</small></div>
        <audio controls :src="fileUrl(mediaStore.voicePath)" />
      </div>
      <div v-if="visibleAssets.length" class="asset-grid">
        <button
          v-for="asset in visibleAssets"
          :key="asset.id"
          type="button"
          class="asset-tile"
          @click="selected = asset"
        >
          <img v-if="asset.path && (asset.kind === 'reference' || asset.kind === 'storyboard')" :src="fileUrl(asset.path)" :alt="asset.title" />
          <video v-else-if="asset.path && (asset.kind === 'video' || asset.kind === 'final')" :src="fileUrl(asset.path)" muted preload="metadata" />
          <div v-else class="asset-placeholder"><v-icon size="28">{{ asset.kind === 'storyboard' ? 'mdi-image-outline' : 'mdi-video-outline' }}</v-icon></div>
          <div class="asset-meta"><strong>{{ asset.title }}</strong><small>{{ statusText(asset.status) }}</small></div>
          <v-icon v-if="asset.error" class="asset-error" color="error" size="18">mdi-alert-circle</v-icon>
        </button>
      </div>
    </div>

    <v-dialog :model-value="Boolean(selected)" max-width="820" @update:model-value="!$event && (selected = null)">
      <v-card v-if="selected" :title="selected.title">
        <template #append>
          <v-btn icon="mdi-close" variant="text" :title="t('common.buttons.close')" @click="selected = null" />
        </template>
        <v-card-text class="preview-body">
          <img v-if="selected.path && (selected.kind === 'reference' || selected.kind === 'storyboard')" :src="fileUrl(selected.path)" :alt="selected.title" class="preview-media" />
          <video v-else-if="selected.path && (selected.kind === 'video' || selected.kind === 'final')" :src="fileUrl(selected.path)" class="preview-media" controls autoplay preload="metadata" />
          <div v-else class="preview-placeholder"><v-icon size="48">mdi-alert-circle-outline</v-icon><span>{{ statusText(selected.status) }}</span></div>

          <div v-if="selected.segment" class="text-body-2">{{ selected.segment.script }}</div>
          <details v-if="selected.segment?.storyboardImagePrompt">
            <summary>{{ t('workflow.library.storyboardPrompt') }}</summary>
            <div class="prompt-text">{{ selected.segment.storyboardImagePrompt }}</div>
          </details>
          <details v-if="selected.segment?.videoPrompt">
            <summary>{{ t('workflow.library.videoPrompt') }}</summary>
            <div class="prompt-text">{{ selected.segment.videoPrompt }}</div>
          </details>
          <div v-if="selected.error" class="text-error text-body-2">{{ selected.error }}</div>
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="selected.kind === 'storyboard'" variant="tonal" :disabled="Boolean(mediaStore.busyAction)" @click="retryImage(selected.segment!.index)">
            {{ t('workflow.library.regenerateStoryboard') }}
          </v-btn>
          <v-btn v-if="selected.kind === 'video'" variant="tonal" :disabled="Boolean(mediaStore.busyAction)" @click="retryVideo(selected.segment!.index)">
            {{ t('workflow.library.regenerateVideo') }}
          </v-btn>
          <v-spacer />
          <v-btn v-if="selected.kind === 'final'" prepend-icon="mdi-folder-open-outline" variant="tonal" @click="showFinal">{{ t('workflow.library.show') }}</v-btn>
          <v-btn v-if="selected.kind === 'final'" prepend-icon="mdi-download" color="primary" variant="tonal" @click="exportFinal">{{ t('workflow.library.export') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import { useMediaTaskStore } from '@/store'
import type { StoryboardSegment } from '@/runtime/videoWorkflow'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'

type AssetKind = 'reference' | 'voice' | 'storyboard' | 'video' | 'final'
type AssetStatus = StoryboardSegment['imageStatus'] | StoryboardSegment['videoStatus'] | 'success'
type Asset = { id: string; kind: Exclude<AssetKind, 'voice'>; title: string; path?: string; status: AssetStatus; segment?: StoryboardSegment; error?: string }

const emit = defineEmits<{ retryImage: [index: number]; retryVideo: [index: number] }>()
const mediaStore = useMediaTaskStore()
const toast = useToast()
const { t } = useTranslation()
const filter = ref<'all' | AssetKind>('all')
const selected = ref<Asset | null>(null)
const filters = computed(() => [
  { value: 'all', title: t('workflow.library.all') },
  { value: 'reference', title: t('workflow.library.reference') },
  { value: 'voice', title: t('workflow.library.voice') },
  { value: 'storyboard', title: t('workflow.library.storyboards') },
  { value: 'video', title: t('workflow.library.videos') },
  { value: 'final', title: t('workflow.library.final') },
])
const assets = computed<Asset[]>(() => {
  const items: Asset[] = []
  if (mediaStore.finalPath) items.push({ id: 'final', kind: 'final', title: t('workflow.library.final'), path: mediaStore.finalPath, status: 'success' })
  if (mediaStore.coreReference) items.push({ id: mediaStore.coreReference.id, kind: 'reference', title: mediaStore.coreReference.label, path: mediaStore.coreReference.relativePath, status: 'success' })
  for (const segment of mediaStore.segments) {
    items.push({ id: `image-${segment.index}`, kind: 'storyboard', title: t('workflow.library.storyboardNumber', { index: segment.index }), path: segment.imagePath, status: segment.imageStatus, segment, error: segment.imageStatus === 'failed' ? segment.error : undefined })
    if (segment.videoPath || segment.videoStatus === 'running' || segment.videoStatus === 'failed' || segment.videoStatus === 'success') items.push({ id: `video-${segment.index}`, kind: 'video', title: `${t('workflow.library.videoNumber', { index: segment.index })} · ${segment.playDuration.toFixed(1)}s`, path: segment.videoPath, status: segment.videoStatus, segment, error: segment.videoStatus === 'failed' ? segment.error : undefined })
  }
  return items
})
const visibleAssets = computed(() => filter.value === 'all' ? assets.value : assets.value.filter((asset) => asset.kind === filter.value))
const voiceVisible = computed(() => Boolean(mediaStore.voicePath) && (filter.value === 'all' || filter.value === 'voice'))
const hasVisibleAssets = computed(() => voiceVisible.value || visibleAssets.value.length > 0)

function fileUrl(filePath: string) {
  return managedMediaUrl(mediaStore.runId, filePath)
}
function statusText(status: AssetStatus) {
  if (status === 'success') return t('workflow.library.ready')
  if (status === 'running') return t('workflow.library.running')
  if (status === 'failed') return t('workflow.library.failed')
  if (status === 'cancelled') return t('workflow.library.cancelled')
  return t('workflow.library.waiting')
}
function retryImage(index: number) { selected.value = null; emit('retryImage', index) }
function retryVideo(index: number) { selected.value = null; emit('retryVideo', index) }
async function exportFinal() {
  if (!mediaStore.finalPath) return
  const output = await window.electron.cloud.exportMedia(mediaStore.runId, mediaStore.finalPath)
  if (output) toast.success(t('workflow.library.exported', { path: output }))
}
function showFinal() { if (mediaStore.finalPath) window.electron.cloud.showMedia(mediaStore.runId, mediaStore.finalPath) }
</script>

<style scoped>
.library-filters { max-width: 100%; overflow-x: auto; flex: none; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); align-content: start; gap: 8px; }
.asset-tile { position: relative; min-width: 0; padding: 0; overflow: hidden; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 6px; background: transparent; text-align: left; }
.asset-tile img, .asset-tile video, .asset-placeholder { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: grid; place-items: center; background: #171717; color: white; }
.asset-meta { padding: 6px 8px; min-width: 0; }
.asset-meta strong, .asset-meta small { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-meta small { margin-top: 2px; color: rgba(0, 0, 0, 0.58); }
.asset-error { position: absolute; top: 5px; right: 5px; }
.voice-row { min-height: 48px; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 6px; }
.voice-label { min-width: 78px; font-size: 12px; font-weight: 600; }
.voice-label small { display: block; font-weight: 400; color: rgba(0, 0, 0, 0.58); }
.voice-row audio { flex: 1; min-width: 0; height: 32px; }
.preview-body { display: flex; flex-direction: column; gap: 12px; max-height: 72vh; overflow-y: auto; }
.preview-media { width: 100%; max-height: 54vh; object-fit: contain; background: #111; border-radius: 4px; }
.preview-placeholder { min-height: 220px; display: grid; place-items: center; align-content: center; gap: 8px; background: rgba(0, 0, 0, 0.04); }
.prompt-text { margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: rgba(0, 0, 0, 0.68); }
</style>
