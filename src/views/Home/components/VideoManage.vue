<template>
  <v-sheet class="workspace h-full min-h-0 flex flex-col" border rounded>
    <v-tabs
      :model-value="mediaStore.workspaceView"
      class="workspace-tabs"
      density="compact"
      grow
      @update:model-value="mediaStore.selectView($event)"
    >
      <v-tab value="script">文稿/配音</v-tab>
      <v-tab v-if="mediaStore.approvedScript" value="director">项目总监</v-tab>
      <v-tab value="assets">资产</v-tab>
      <v-tab value="storyboard">分镜</v-tab>
      <v-tab value="media">分镜图/视频</v-tab>
      <v-tab value="final">成片</v-tab>
    </v-tabs>

    <div class="workspace-body">
      <section v-if="mediaStore.workspaceView === 'script'" class="document-view">
        <WikiDocument
          v-if="mediaStore.approvedScript"
          :project-id="mediaStore.runId"
          path="wiki/文稿/确认文稿.md"
          @navigate="openWikiLink"
          @saved="$emit('markdownSaved')"
        />
        <template v-else>
        <div class="document-heading">
          <div>
            <h2>正式文稿</h2>
            <p>{{ scriptMeta }}</p>
          </div>
          <v-chip
            size="small"
            :color="mediaStore.approvedScript ? 'success' : 'warning'"
            variant="tonal"
          >
            {{ mediaStore.approvedScript ? '已确认' : mediaStore.script ? '草稿' : '待生成' }}
          </v-chip>
        </div>
        <v-textarea
          :model-value="mediaStore.script"
          class="script-editor"
          label="唯一正式文稿"
          variant="outlined"
          hide-details
          no-resize
          :readonly="Boolean(mediaStore.approvedScript) && !mediaStore.scriptEditing"
          :disabled="Boolean(mediaStore.busyAction)"
          @update:model-value="$emit('editScript', $event)"
        />
        </template>
        <div v-if="mediaStore.approvedScript" class="voice-section">
          <span>声音来源</span>
          <v-btn-toggle
            :model-value="mediaStore.voiceSource"
            mandatory
            density="compact"
            color="primary"
            @update:model-value="mediaStore.setVoiceSource($event)"
          >
            <v-btn value="design" size="small">设计声音</v-btn>
            <v-btn value="clone" size="small">克隆音色包</v-btn>
          </v-btn-toggle>
          <small>正式配音在分镜时间轴确定后生成。</small>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'director'" class="document-view">
        <article
          v-if="mediaStore.projectDirectorDraft"
          class="director-draft markdown-body"
          @click="openDraftLink"
          v-html="directorDraftHtml"
        />
        <WikiDocument
          v-else-if="mediaStore.projectDirectorPlan"
          :project-id="mediaStore.runId"
          path="wiki/项目/项目总监.md"
          @navigate="openWikiLink"
          @saved="$emit('markdownSaved')"
        />
        <div v-else class="empty-state">
          <v-icon size="42">mdi-account-tie-outline</v-icon>
          <span>确认文稿后，在右栏生成项目总监方案。</span>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'storyboard'" class="document-view">
        <WikiDocument
          v-if="mediaStore.segments.length"
          :project-id="mediaStore.runId"
          :path="wikiPath"
          :parent-path="wikiPath !== 'wiki/分镜/导演总览.md' ? 'wiki/分镜/导演总览.md' : undefined"
          parent-label="返回分镜总表"
          @navigate="wikiPath = $event"
          @saved="$emit('markdownSaved')"
        />
        <div v-else class="empty-state">
          <v-icon size="42">mdi-movie-edit-outline</v-icon>
          <span>资产准备完成后点击“转分镜”，导演文档会显示在这里；本集配音在分镜完成后生成。</span>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'assets'" class="asset-workspace">
        <div v-if="!mediaStore.referenceAssets.length" class="empty-state">
          确认文稿后，角色、场景和道具资产会显示在这里。
        </div>
        <div v-else class="asset-document-layout">
          <div class="planned-assets">
          <article
            v-for="speakerId in narratorIds"
            :key="speakerId"
            class="planned-asset narrator-asset"
            :class="{ selected: mediaStore.selectedAssetId === speakerId }"
            @click="mediaStore.selectAsset(speakerId)"
          >
            <div class="asset-placeholder"><v-icon size="28">mdi-microphone-outline</v-icon></div>
            <div class="planned-asset-copy">
              <div class="asset-title">
                <strong>旁白声音</strong>
                <v-icon
                  size="17"
                  :color="voiceBindings[speakerId] ? 'success' : 'grey'"
                  :title="voiceBindings[speakerId] ? '已绑定声音' : '未绑定声音'"
                >mdi-account-voice</v-icon>
                <v-chip size="x-small" variant="tonal">{{ speakerId }}</v-chip>
              </div>
              <small>{{ voiceBindings[speakerId] ? '音色包已绑定' : '等待绑定音色包' }}</small>
            </div>
          </article>
          <article
            v-for="asset in mediaStore.referenceAssets"
            :key="asset.id"
            class="planned-asset"
            :class="{ selected: mediaStore.selectedAssetId === asset.id }"
            @click="mediaStore.selectAsset(asset.id)"
          >
            <img
              v-if="activeVersion(asset)?.relativePath"
              :src="fileUrl(activeVersion(asset)!.relativePath)"
              :alt="asset.label"
              title="点击放大预览"
              @click.stop="previewAssetVersion(asset)"
            />
            <div v-else class="asset-placeholder"><v-icon size="28">mdi-image-outline</v-icon></div>
            <div class="planned-asset-copy">
              <div class="asset-title">
                <strong>{{ asset.label }}</strong>
                <v-icon
                  v-if="asset.role === 'character'"
                  size="17"
                  :color="voiceBindings[asset.id] ? 'success' : 'grey'"
                  :title="voiceBindings[asset.id] ? '已绑定声音' : '未绑定声音'"
                >mdi-account-voice</v-icon>
                <v-chip size="x-small" variant="tonal">{{ roleLabelAsset(asset.role) }}</v-chip>
                <v-chip
                  size="x-small"
                  :color="asset.status === 'approved' ? 'success' : 'grey'"
                  variant="tonal"
                  >{{ assetStatus(asset.status) }}</v-chip
                >
              </div>
              <p>{{ asset.description }}</p>
              <small v-if="asset.versions.some((version) => version.source !== 'generated')" class="source-note">
                已有参考图，生成时将转换为项目风格
              </small>
              <small>引用镜头：{{ assetShotNumbers(asset.id) || '无' }}</small>
              <div class="asset-reference-row" @click.stop>
                <button
                  v-for="version in referenceVersions(asset)"
                  :key="version.id"
                  type="button"
                  class="asset-reference"
                  title="预览参考图"
                  @click="previewVersion(asset, version)"
                >
                  <img :src="fileUrl(version.relativePath)" alt="参考图" />
                  <v-icon
                    class="reference-remove"
                    size="14"
                    title="删除参考图"
                    @click.stop="removeReferenceVersion(asset, version.id)"
                    >mdi-close-circle</v-icon
                  >
                </button>
                <v-btn
                  icon="mdi-plus"
                  size="small"
                  variant="tonal"
                  color="primary"
                  title="添加参考图"
                  aria-label="添加参考图"
                  @click="$emit('uploadAssetReference', asset.id)"
                />
              </div>
              <div v-if="generatedVersions(asset).length" class="asset-version-row" @click.stop>
                <v-select
                  :model-value="asset.activeVersionId"
                  :items="
                    generatedVersions(asset).map((version, index) => ({
                      title: `AI 版本 ${index + 1}`,
                      value: version.id,
                    }))
                  "
                  density="compact"
                  hide-details
                  label="当前版本"
                  @update:model-value="selectAssetVersion(asset, $event)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  size="small"
                  variant="text"
                  color="error"
                  title="删除当前资产图"
                  aria-label="删除当前资产图"
                  @click="removeGeneratedVersion(asset)"
                />
              </div>
            </div>
          </article>
          </div>
          <div class="asset-inspector">
            <div v-if="selectedSpeakerId" class="voice-binding">
              <strong>{{ selectedSpeakerLabel }} · {{ boundVoiceName || '未绑定音色包' }}</strong>
              <v-select
                v-model="selectedVoiceProfileId"
                :items="voiceProfiles"
                item-title="displayName"
                item-value="voiceProfileId"
                density="compact"
                hide-details
                label="音色包"
              />
              <v-btn size="small" variant="tonal" :disabled="!boundVoiceId" @click="openBoundVoice">打开文件夹</v-btn>
              <v-btn size="small" color="primary" :disabled="!selectedVoiceProfileId" @click="bindSelectedVoice">更换</v-btn>
            </div>
            <WikiDocument
              v-if="selectedAssetWikiPath"
              :project-id="mediaStore.runId"
              :path="selectedAssetWikiPath"
              @navigate="openWikiLink"
              @saved="$emit('markdownSaved')"
            />
          </div>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'media'" class="media-view">
        <v-btn-toggle
          :model-value="mediaStore.mediaFilter"
          mandatory
          density="compact"
          class="media-filters"
          @update:model-value="mediaStore.mediaFilter = $event"
        >
          <v-btn v-for="item in filters" :key="item.value" :value="item.value" size="small">{{
            item.title
          }}</v-btn>
        </v-btn-toggle>
        <div v-if="!visibleAssets.length" class="empty-state">暂时没有这一类素材</div>
        <div v-else class="asset-grid">
          <button
            v-for="asset in visibleAssets"
            :key="asset.id"
            type="button"
            class="asset-tile"
            @click="previewMediaAsset(asset)"
          >
            <v-icon
              v-if="asset.path && (asset.kind === 'storyboard' || asset.kind === 'video')"
              class="media-remove"
              size="18"
              role="button"
              tabindex="0"
              title="删除当前结果"
              aria-label="删除当前结果"
              @click.stop="removeGeneratedMedia(asset)"
              @keydown.enter.prevent.stop="removeGeneratedMedia(asset)"
              >mdi-delete-outline</v-icon
            >
            <img
              v-if="asset.path && ['reference', 'storyboard'].includes(asset.kind)"
              :src="fileUrl(asset.path)"
              :alt="asset.title"
            />
            <video
              v-else-if="asset.path && asset.kind === 'video'"
              :src="fileUrl(asset.path)"
              muted
              preload="metadata"
            />
            <div v-else class="asset-placeholder">
              <v-icon size="26">{{
                asset.kind === 'audio'
                  ? 'mdi-waveform'
                  : asset.kind === 'storyboard'
                    ? 'mdi-image-outline'
                    : 'mdi-video-outline'
              }}</v-icon>
            </div>
            <div class="asset-meta">
              <strong>{{ asset.title }}</strong
              ><small>{{ asset.detail || statusText(asset.status) }}</small>
            </div>
          </button>
          <button
            v-if="mediaStore.finalPath && mediaStore.mediaFilter === 'all'"
            type="button"
            class="asset-tile"
            @click="previewAsset = finalAsset"
          >
            <video :src="fileUrl(mediaStore.finalPath)" muted preload="metadata" />
            <div class="asset-meta"><strong>最终成片</strong><small>打开成片视图</small></div>
          </button>
        </div>
      </section>

      <section v-else class="final-view">
        <div v-if="mediaStore.workflowStep === 'voice'" class="voice-timeline">
          <div class="document-heading">
            <div><h2>本集配音</h2><p>{{ voiceTasks.length }} 条声音任务</p></div>
            <v-chip size="small" :color="mediaStore.voiceReady ? 'success' : 'warning'" variant="tonal">
              {{ mediaStore.voiceReady ? '已就绪' : '待处理' }}
            </v-chip>
          </div>
          <article v-for="task in voiceTasks" :key="task.index" class="voice-task">
            <strong>镜头 {{ task.index }} · {{ task.speakerId }}</strong>
            <span>{{ task.dialogueText }}</span>
            <small>{{ task.dialogueEmotion || '自然' }} · {{ voiceTaskWindow(task) }}</small>
          </article>
          <div v-if="!voiceTasks.length" class="empty-state">本集没有对白或旁白，无需生成配音。</div>
        </div>
        <template v-if="mediaStore.finalPath || mediaStore.pictureMasterPath">
          <video :src="fileUrl(mediaStore.finalPath || mediaStore.pictureMasterPath)" controls preload="metadata" />
          <div class="final-meta">
            {{ mediaStore.finalPath ? '最终成片' : '画面母版' }} · {{ mediaStore.ratio }} · {{ videoModelLabel }}
          </div>
        </template>
        <div v-else class="empty-state">
          <v-icon size="42">mdi-movie-open-outline</v-icon>
          <span>所有单镜视频完成后即可合成。</span>
        </div>
      </section>
    </div>

    <v-dialog
      :model-value="Boolean(previewAsset)"
      max-width="860"
      @update:model-value="!$event && (previewAsset = null)"
    >
      <v-card v-if="previewAsset" :title="previewAsset.title">
        <template #append
          ><v-btn icon="mdi-close" variant="text" title="关闭" @click="previewAsset = null"
        /></template>
        <v-card-text class="preview-body">
          <img
            v-if="previewAsset.path && ['reference', 'storyboard'].includes(previewAsset.kind)"
            :src="fileUrl(previewAsset.path)"
            :alt="previewAsset.title"
          />
          <video
            v-else-if="previewAsset.path && previewAsset.kind === 'video'"
            :src="fileUrl(previewAsset.path)"
            controls
            autoplay
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import { buildGrokSequences, type StoryboardSegment } from '@/runtime/videoWorkflow'
import type {
  AssetRole,
  AssetStatus as ReferenceAssetStatus,
  AssetVersion,
  ReferenceAsset,
} from '~/electron/types'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'
import { renderMarkdown, resolveWikiLink } from '@/runtime/markdown'
import { projectDirectorMarkdown } from '@/runtime/projectDirector'
import WikiDocument from './WikiDocument.vue'
import type { VoiceProfile } from '~/electron/voice-library'

type AssetStatus = StoryboardSegment['imageStatus'] | StoryboardSegment['videoStatus'] | 'success'
type Asset = {
  id: string
  kind: 'reference' | 'audio' | 'storyboard' | 'video'
  title: string
  path?: string
  status: AssetStatus
  detail?: string
  index?: number
}

defineEmits<{
  editScript: [value: string]
  markdownSaved: []
  uploadAssetReference: [assetId: string]
}>()
const mediaStore = useMediaTaskStore()
const previewAsset = ref<Asset | null>(null)
const wikiPath = ref('wiki/分镜/导演总览.md')
const voiceProfiles = ref<VoiceProfile[]>([])
const voiceBindings = ref<Record<string, string>>({})
const selectedVoiceProfileId = ref('')
const narratorIds = computed(() => mediaStore.requiredSpeakerIds.filter((id) => id.startsWith('narrator-')))
const selectedCharacter = computed(() => mediaStore.referenceAssets.find((asset) => asset.id === mediaStore.selectedAssetId && asset.role === 'character'))
const selectedSpeakerId = computed(() => selectedCharacter.value?.id || narratorIds.value.find((id) => id === mediaStore.selectedAssetId) || '')
const selectedSpeakerLabel = computed(() => selectedCharacter.value?.label || (selectedSpeakerId.value ? '旁白声音' : ''))
const boundVoiceId = computed(() => selectedSpeakerId.value ? voiceBindings.value[selectedSpeakerId.value] : '')
const boundVoiceName = computed(() => voiceProfiles.value.find((profile) => profile.voiceProfileId === boundVoiceId.value)?.displayName || '')
const selectedAssetWikiPath = computed(() => {
  const asset = mediaStore.referenceAssets.find((item) => item.id === mediaStore.selectedAssetId)
  if (!asset) return ''
  if (asset.sourceDocument?.startsWith('wiki/资产/')) return asset.sourceDocument
  const folder = { character: '角色', scene: '场景', prop: '道具' }[asset.role]
  return `wiki/资产/${folder}/${asset.id}.md`
})
const filters = [
  { value: 'all', title: '全部' },
  { value: 'references', title: '参考资产' },
  { value: 'audio', title: '音频' },
  { value: 'storyboards', title: '分镜图' },
  { value: 'videos', title: '视频' },
]
onMounted(async () => {
  voiceProfiles.value = await window.electron.cloud.listVoiceProfiles()
  await loadVoiceBindings()
})
watch(() => mediaStore.runId, loadVoiceBindings)
watch(() => mediaStore.referenceAssets.map((asset) => asset.id).join(','), loadVoiceBindings)
watch(() => mediaStore.requiredSpeakerIds.join(','), loadVoiceBindings)
watch(boundVoiceId, (value) => { selectedVoiceProfileId.value = value || '' }, { immediate: true })

async function loadVoiceBindings() {
  const bindings: Record<string, string> = {}
  const speakerIds = [...new Set([
    ...mediaStore.referenceAssets.filter((asset) => asset.role === 'character').map((asset) => asset.id),
    ...narratorIds.value,
  ])]
  await Promise.all(speakerIds.map(async (speakerId) => {
    const document = await window.electron.cloud.readMarkdown(mediaStore.runId, `wiki/声音/角色/${speakerId}.md`).catch(() => null)
    const id = document?.content.match(/^voiceProfileId:\s*([^\s]+)$/m)?.[1]
    if (id) bindings[speakerId] = id
  }))
  voiceBindings.value = bindings
}

async function bindSelectedVoice() {
  if (!selectedSpeakerId.value || !selectedVoiceProfileId.value) return
  await window.electron.cloud.bindProjectVoice(mediaStore.runId, selectedSpeakerId.value, selectedVoiceProfileId.value)
  voiceBindings.value = { ...voiceBindings.value, [selectedSpeakerId.value]: selectedVoiceProfileId.value }
}

function openBoundVoice() {
  if (boundVoiceId.value) void window.electron.cloud.openVoicePack(boundVoiceId.value)
}
const scriptMeta = computed(
  () =>
    `${mediaStore.script.replace(/\s/g, '').length} 字 · 目标 ${mediaStore.targetDuration} 秒${mediaStore.voiceDuration ? ` · 配音 ${mediaStore.voiceDuration.toFixed(1)} 秒` : ''}`,
)
const voiceTasks = computed(() => mediaStore.segments.filter((segment) => segment.soundType && segment.soundType !== 'none'))
function voiceTaskWindow(segment: StoryboardSegment) {
  const dialogue = segment.editingAnalysis?.dialogue
  if (dialogue) return `${(dialogue.outputStartMs / 1000).toFixed(1)}-${(dialogue.outputEndMs / 1000).toFixed(1)} 秒`
  return `预计 ${segment.dialogueDuration || segment.playDuration} 秒`
}
const directorDraftHtml = computed(() =>
  mediaStore.projectDirectorDraft
    ? renderMarkdown(
        projectDirectorMarkdown(mediaStore.projectDirectorDraft),
        mediaStore.runId,
        'wiki/项目/项目总监.md',
      )
    : '',
)
const assets = computed<Asset[]>(() => {
  const items: Asset[] = []
  const grokSequences = mediaStore.videoModel === 'rh-grok-image-video'
    ? buildGrokSequences(mediaStore.segments)
    : []
  const grokByLeader = new Map(grokSequences.map((sequence) => [sequence.segments[0].index, sequence]))
  if (mediaStore.coreReference)
    items.push({
      id: mediaStore.coreReference.id,
      kind: 'reference',
      title: mediaStore.coreReference.label,
      path: mediaStore.coreReference.relativePath,
      status: 'success',
    })
  for (const asset of mediaStore.referenceAssets) {
    const version = generatedVersions(asset).find((item) => item.id === asset.activeVersionId)
      || generatedVersions(asset).at(-1)
    if (version)
      items.push({
        id: `asset-${asset.id}`,
        kind: 'reference',
        title: asset.label,
        path: version.relativePath,
        status: 'success',
      })
  }
  if (mediaStore.voicePath)
    items.push({
      id: 'voice',
      kind: 'audio',
      title: `统一配音 · ${mediaStore.voiceDuration.toFixed(1)}s`,
      path: mediaStore.voicePath,
      status: 'success',
    })
  for (const segment of mediaStore.segments) {
    const sequence = grokByLeader.get(segment.index)
    if (mediaStore.videoModel === 'rh-grok-image-video' && !sequence) continue
    const range = sequence && sequence.segments.length > 1
      ? `${sequence.segments[0].index}-${sequence.segments.at(-1)!.index}`
      : String(segment.index)
    items.push({
      id: `image-${segment.index}`,
      kind: 'storyboard',
      title: `分镜图 ${range}`,
      path: segment.imagePath,
      status: segment.imageStatus,
      detail: sequence ? `包含 ${sequence.segments.length} 个镜头` : undefined,
      index: segment.index,
    })
    if (segment.videoPath || segment.videoStatus)
      items.push({
        id: `video-${segment.index}`,
        kind: 'video',
        title: `视频 ${range} · ${(sequence ? sequence.segments.reduce((sum, item) => sum + item.playDuration, 0) : segment.playDuration).toFixed(1)}s`,
        path: segment.videoPath,
        status:
          segment.videoStatus !== 'success'
            ? segment.videoStatus
            : segment.editingStatus === 'ready'
              ? 'success'
              : segment.editingStatus === 'running'
                ? 'running'
                : segment.editingStatus === 'failed'
                  ? 'failed'
                  : 'pending',
        detail: editingLabel(segment),
        index: segment.index,
      })
  }
  return items
})
function editingLabel(segment: StoryboardSegment) {
  if (segment.videoStatus !== 'success') return statusText(segment.videoStatus)
  if (segment.editingStatus === 'running') return 'Gemini 分析中'
  if (segment.editingStatus === 'failed') return '剪辑分析失败'
  const analysis = segment.editingAnalysis
  if (!analysis) return '等待剪辑分析'
  if (analysis.needsReview) return '完整保留 · 需检查'
  return `采用 ${(analysis.trimStartMs / 1000).toFixed(1)}-${(analysis.trimEndMs / 1000).toFixed(1)} 秒`
}
const finalAsset = computed<Asset>(() => ({
  id: 'final',
  kind: 'video',
  title: '最终成片',
  path: mediaStore.finalPath,
  status: 'success',
}))
const videoModelLabel = computed(() => ({
  'veo-3.1-generate-preview': 'Veo 3.1',
  'veo-3.0-generate-001': 'Veo 3.0',
  'rh-grok-image-video': 'Grok Video',
}[mediaStore.videoModel]))
const visibleAssets = computed(() => {
  if (mediaStore.mediaFilter === 'all') return assets.value
  const kind = {
    references: 'reference',
    audio: 'audio',
    storyboards: 'storyboard',
    videos: 'video',
  }[mediaStore.mediaFilter]
  return assets.value.filter((asset) => kind === asset.kind)
})
function fileUrl(path: string) {
  return managedMediaUrl(mediaStore.runId, path)
}
function statusText(status: AssetStatus) {
  return status === 'success'
    ? '已完成'
    : status === 'running'
      ? '生成中'
      : status === 'failed'
        ? '失败'
        : status === 'cancelled'
          ? '已停止'
          : '待生成'
}
function activeVersion(asset: ReferenceAsset) {
  return asset.versions.find((version) => version.id === asset.activeVersionId) || referenceVersions(asset).at(-1)
}
function referenceVersions(asset: ReferenceAsset) {
  return asset.versions.filter((version) => version.source !== 'generated')
}
function generatedVersions(asset: ReferenceAsset) {
  return asset.versions.filter((version) => version.source === 'generated')
}
function previewAssetVersion(asset: ReferenceAsset) {
  const version = activeVersion(asset)
  if (!version) return
  previewAsset.value = {
    id: version.id,
    kind: 'reference',
    title: asset.label,
    path: version.relativePath,
    status: 'success',
  }
}
function previewVersion(asset: ReferenceAsset, version: AssetVersion) {
  previewAsset.value = {
    id: version.id,
    kind: 'reference',
    title: asset.label,
    path: version.relativePath,
    status: 'success',
  }
}
function selectAssetVersion(asset: ReferenceAsset, versionId: string) {
  const version = asset.versions.find((item) => item.id === versionId)
  if (version?.source === 'generated') {
    mediaStore.adoptAssetVersion(asset.id, version.id)
    return
  }
  asset.pendingVersionId = versionId
  asset.status = 'ready'
}
function removeReferenceVersion(asset: ReferenceAsset, versionId: string) {
  mediaStore.removeAssetReferenceVersion(asset.id, versionId)
}
function removeGeneratedVersion(asset: ReferenceAsset) {
  const version = generatedVersions(asset).find((item) => item.id === asset.activeVersionId)
    || generatedVersions(asset).at(-1)
  if (version) mediaStore.removeGeneratedAssetVersion(asset.id, version.id)
}
function removeGeneratedMedia(asset: Asset) {
  if (!asset.index || (asset.kind !== 'storyboard' && asset.kind !== 'video')) return
  mediaStore.invalidateShot(asset.index, asset.kind === 'storyboard' ? 'image' : 'video')
  previewAsset.value = null
}
function assetShotNumbers(assetId: string) {
  return mediaStore.segments
    .filter((shot) => shot.referenceAssetIds.includes(assetId))
    .map((shot) => shot.index)
    .join('、')
}
function assetStatus(status: ReferenceAssetStatus) {
  return {
    planned: '待准备',
    'design-ready': '设计就绪',
    generating: '生成中',
    ready: '参考图就绪',
    failed: '失败',
    approved: '资产图就绪',
  }[status]
}
function roleLabelAsset(role: AssetRole) {
  return { character: '角色', scene: '场景', prop: '道具' }[role]
}
function openWikiLink(path: string) {
  if (path === 'wiki/项目/项目总监.md') {
    mediaStore.selectView('director')
    return
  }
  const shot = path.match(/shot-(\d+)\.md$/)
  if (shot) {
    mediaStore.selectView('storyboard')
    mediaStore.selectShot(Number(shot[1]))
    wikiPath.value = path
    return
  }
  const asset = mediaStore.referenceAssets.find((item) => path.endsWith(`/${item.id}.md`))
  if (asset) mediaStore.selectAsset(asset.id)
}
function openDraftLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href') || ''
  if (!href.startsWith('wiki:')) return
  event.preventDefault()
  openWikiLink(resolveWikiLink('wiki/项目/项目总监.md', href.slice(5)))
}
function previewMediaAsset(asset: Asset) {
  mediaStore.selectedAssetId = asset.id
  previewAsset.value = asset
}
</script>

<style scoped>
.workspace {
  overflow: hidden;
}
.workspace-tabs {
  flex: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.workspace-body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.asset-document-layout { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(260px, 38%) minmax(0, 1fr); }
.asset-document-layout .planned-assets { overflow: auto; border-right: 1px solid rgba(0,0,0,.1); }
.asset-inspector { min-width: 0; min-height: 0; overflow: auto; }
.voice-binding { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 10px; border-bottom: 1px solid rgba(0,0,0,.1); }
.voice-binding strong { grid-column: 1 / -1; }
.voice-section { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,.1); }
.voice-section > span { font-weight: 600; }
.voice-section small { color: rgba(0,0,0,.55); }
.voice-timeline { display: grid; gap: 8px; margin-bottom: 14px; }
.voice-task { display: grid; gap: 3px; padding: 9px 10px; border: 1px solid rgba(0,0,0,.12); border-radius: 6px; }
.voice-task small { color: rgba(0,0,0,.55); }
.document-view,
.asset-workspace,
.media-view,
.final-view {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.document-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.director-draft { min-height: 0; overflow: auto; padding: 6px 10px 36px; line-height: 1.75; }
.director-draft :deep(h1) { font-size: 24px; margin: 0 0 20px; }
.director-draft :deep(h2) { font-size: 18px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #dfe5e0; }
.asset-workspace {
  height: 100%;
  overflow: hidden;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.planned-assets {
  display: grid;
  gap: 8px;
}
.planned-asset {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 9px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  cursor: pointer;
}
.planned-asset.selected {
  border-color: #157a35;
}
.planned-asset > img,
.planned-asset > .asset-placeholder {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
}
.planned-asset-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.planned-asset-copy p {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.55;
}
.asset-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.asset-title { flex-wrap: wrap; }
.asset-title strong { min-width: 0; overflow-wrap: anywhere; line-height: 1.4; }
.source-note {
  color: #157a35;
  line-height: 1.45;
}
.asset-version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 4px;
  align-items: center;
}
.asset-reference-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.asset-reference { position: relative; width: 38px; height: 38px; padding: 0; border: 1px solid rgba(0,0,0,.12); border-radius: 4px; overflow: visible; background: #fff; }
.asset-reference img { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
.reference-remove { position: absolute; top: -6px; right: -6px; color: #c62828; background: #fff; border-radius: 50%; }
.document-heading,
.director-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  letter-spacing: 0;
}
p {
  margin: 3px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}
.script-editor {
  min-height: 280px;
  flex: 1;
}
.script-editor :deep(.v-input__control),
.script-editor :deep(.v-field),
.script-editor :deep(.v-field__field) {
  min-height: 0;
  height: 100%;
}
.voice-section {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 2px solid rgba(21, 122, 53, 0.18);
}
.voice-plan-copy {
  padding: 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.035);
  font-size: 12px;
  line-height: 1.65;
}
.voice-player {
  min-height: 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}
.voice-player audio {
  width: 100%;
  height: 32px;
}
.storyboard-document {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.director-details {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
}
.director-details summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.director-details dl {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 7px 10px;
  margin: 10px 0 2px;
  font-size: 12px;
}
.director-details dt {
  font-weight: 600;
}
.director-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.rhythm-strip {
  display: flex;
  gap: 2px;
  height: 34px;
}
.rhythm-block {
  min-width: 20px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 10px;
  color: #15351f;
  background: #dbe9df;
}
.rhythm-block.role-hook {
  background: #b9d9c1;
}
.rhythm-block.role-payoff {
  background: #a8cdb2;
}
.rhythm-block.selected {
  border-color: #157a35;
  box-shadow: inset 0 0 0 1px #157a35;
}
.shot-list {
  display: grid;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.shot-row {
  display: grid;
  grid-template-columns: 28px 46px minmax(120px, 1fr) 92px 120px;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  background: transparent;
  text-align: left;
}
.shot-row:hover,
.shot-row.selected {
  background: rgba(21, 122, 53, 0.07);
}
.shot-row.selected {
  box-shadow: inset 3px 0 #157a35;
}
.duration,
.shot-tag,
.shot-camera {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.62);
}
.shot-copy {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 12px;
}
.shot-camera {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.media-filters {
  max-width: 100%;
  overflow-x: auto;
  flex: none;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  align-content: start;
  gap: 8px;
}
.asset-tile {
  position: relative;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  background: transparent;
  text-align: left;
}
.media-remove { position: absolute; top: 5px; right: 5px; z-index: 1; padding: 4px; box-sizing: content-box; color: #fff; background: rgba(0,0,0,.58); border-radius: 50%; }
.asset-tile.selected {
  border-color: #157a35;
  box-shadow: 0 0 0 1px #157a35;
}
.asset-tile img,
.asset-tile video,
.asset-placeholder {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: #171717;
  color: #fff;
}
.asset-meta {
  padding: 6px 8px;
}
.asset-meta strong,
.asset-meta small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.asset-meta small {
  color: rgba(0, 0, 0, 0.58);
}
.final-view {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}
.final-view video {
  width: 100%;
  max-height: calc(100vh - 190px);
  background: #111;
}
.final-meta {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.62);
}
.empty-state {
  min-height: 240px;
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
  color: rgba(0, 0, 0, 0.58);
  font-size: 13px;
}
.preview-body {
  display: grid;
  place-items: center;
}
.preview-body img,
.preview-body video {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
.preview-body audio {
  width: 100%;
}
@media (max-width: 1120px) {
  .shot-row {
    grid-template-columns: 26px 42px minmax(100px, 1fr) 84px;
  }
  .shot-camera {
    display: none;
  }
}
</style>
