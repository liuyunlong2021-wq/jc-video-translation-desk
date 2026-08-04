<template>
  <v-sheet class="inspector h-full min-h-0 flex flex-col" border rounded>
    <div class="stage-progress" aria-label="创作进度">
      <button
        v-for="item in stages"
        :key="item.key"
        type="button"
        :class="{ done: item.done, current: item.current }"
        :disabled="!item.enabled"
        @click="mediaStore.selectStep(item.key)"
      >
        <v-icon size="13">{{ item.done ? 'mdi-check-circle' : 'mdi-circle-outline' }}</v-icon
        ><span>{{ item.label }}</span>
      </button>
    </div>

    <div class="inspector-scroll">
      <div v-if="revisionTarget" class="revision-input">
        <v-textarea
          v-model="revisionInstruction"
          autofocus
          rows="12"
          no-resize
          hide-details
          variant="plain"
          label="修改意见"
          placeholder="描述你希望 AI 怎么修改当前内容"
          @keydown.meta.enter.prevent="sendRevision"
          @keydown.ctrl.enter.prevent="sendRevision"
        />
        <div class="revision-actions">
          <v-btn
            color="primary"
            size="small"
            :loading="mediaStore.busyAction === 'revision'"
            :disabled="!revisionInstruction.trim()"
            @click="sendRevision"
            >确认修改</v-btn
          >
        </div>
      </div>
      <div v-else-if="mediaStore.workflowStep === 'voice'" class="voice-controls">
        <strong>后期处理</strong>
        <small>工作台中的动作将在后续 TDD 接入真实引擎。</small>
        <v-btn
          v-for="action in dubbingActions"
          :key="action.label"
          block
          variant="tonal"
          size="small"
          :prepend-icon="action.icon"
          disabled
          :title="action.label + '（后续接入）'"
        >{{ action.label }}</v-btn>
      </div>
      <div v-else class="operation-empty" />
      <div v-if="mediaStore.error" class="text-error text-body-2">{{ displayError }}</div>
    </div>

    <div
      v-if="mediaStore.workflowStep === 'assets' && mediaStore.workspaceView !== 'director'"
      class="action-bar asset-actions"
    >
      <v-btn
        color="primary"
        prepend-icon="mdi-text-box-edit-outline"
        :loading="mediaStore.busyAction === 'asset-prompts'"
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.apiConfigured || !mediaStore.confirmedProductionRoute || mediaStore.assetPlanningComplete"
        :title="!mediaStore.confirmedProductionRoute ? '请先确认项目总监方案' : undefined"
        @click="$emit('prepareAssets')"
        >生成资产设计 JSON</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-image-search-outline"
        :loading="mediaStore.busyAction === 'asset-search'"
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.referenceAssets.some((asset) => asset.searchQuery)"
        @click="$emit('searchAssets')"
        >搜索下载参考图</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-image-multiple-outline"
        :loading="mediaStore.busyAction === 'assets'"
        :disabled="Boolean(mediaStore.busyAction) || !pendingAssets.length"
        @click="$emit('generateAssets')"
        >生成资产图</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-movie-edit-outline"
        :loading="mediaStore.busyAction === 'shot-plan'"
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.apiConfigured || !mediaStore.allRequiredAssetsApproved"
        @click="$emit('generateShotPlan')"
        >转分镜</v-btn
      >
    </div>
    <div v-else-if="mediaStore.workflowStep !== 'voice'" class="action-bar">
      <v-btn
        v-if="secondaryAction"
        variant="tonal"
        :prepend-icon="secondaryAction.icon"
        :disabled="Boolean(mediaStore.busyAction)"
        @click="runSecondary"
        >{{ secondaryAction.label }}</v-btn
      >
      <v-btn
        class="primary-action"
        color="primary"
        :prepend-icon="primaryAction.icon"
        :loading="mediaStore.busyAction === primaryAction.key"
        :disabled="!primaryAction.enabled || Boolean(mediaStore.revisionProposal)"
        @click="runPrimary"
        >{{ primaryAction.label }}</v-btn
      >
      <v-btn
        v-if="canStop"
        icon="mdi-stop-circle-outline"
        color="error"
        variant="tonal"
        title="停止当前任务"
        @click="$emit('cancel')"
      />
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMediaTaskStore } from '@/store'
import type { WorkspaceView } from '@/store/mediaTask'
import { buildGrokSequences, unfinishedSegments, type RevisionTargetType } from '@/runtime/videoWorkflow'
import { assetVersionMatches } from '@/runtime/storyboardMarkdown'

const emit = defineEmits([
  'generateScript',
  'approveScript',
  'generateProjectDirector',
  'confirmProjectDirector',
  'editScriptMode',
  'generateShotPlan',
  'prepareAssets',
  'searchAssets',
  'generateAssets',
  'generateStoryboards',
  'generateVideos',
  'generateSrt',
  'generateEditingTimeline',
  'compose',
  'cancel',
  'retryImage',
  'retryVideo',
  'requestRevision',
  'openFinal',
  'exportFinal',
])
const mediaStore = useMediaTaskStore()
const revisionInstruction = ref('')
const selectedShot = computed(() =>
  mediaStore.segments.find((item) => item.index === mediaStore.selectedShotIndex),
)
const selectedReferenceAsset = computed(() =>
  mediaStore.referenceAssets.find((asset) => asset.id === mediaStore.selectedAssetId),
)
const selectedAsset = computed(() => {
  const id = mediaStore.selectedAssetId
  if (!id) return null
  if (mediaStore.coreReference?.id === id)
    return {
      kind: 'image',
      title: mediaStore.coreReference.label,
      path: mediaStore.coreReference.relativePath,
      status: '已完成',
    }
  const match = /^(image|video)-(\d+)$/.exec(id)
  if (!match) return null
  const segment = mediaStore.segments.find((item) => item.index === Number(match[2]))
  if (!segment) return null
  const image = match[1] === 'image'
  return {
    kind: match[1],
    title: `${image ? '分镜图' : '视频'} ${segment.index}`,
    path: image ? segment.imagePath : segment.videoPath,
    status: image
      ? segment.imageStatus
      : segment.videoStatus === 'success'
        ? segment.editingStatus === 'ready'
          ? 'success'
          : segment.editingStatus === 'running'
            ? 'running'
            : segment.editingStatus === 'failed'
              ? 'failed'
              : 'pending'
        : segment.videoStatus,
    error: image ? segment.error : segment.editingError || segment.error,
    editingFailed: !image && segment.videoStatus === 'success' && segment.editingStatus === 'failed',
    index: segment.index,
  }
})
const revisionTarget = computed<{ type: RevisionTargetType; id: string } | null>(() => {
  if (mediaStore.workspaceView === 'director' && (mediaStore.projectDirectorDraft || mediaStore.projectDirectorPlan))
    return { type: 'project-director', id: 'project-director' }
  if (mediaStore.workflowStep === 'script') {
    if (mediaStore.script) return { type: 'script', id: 'script' }
  }
  if (mediaStore.workflowStep === 'assets' && selectedReferenceAsset.value)
    return { type: 'asset-prompt', id: selectedReferenceAsset.value.id }
  if (mediaStore.workflowStep === 'shots' && selectedShot.value)
    return { type: 'shot', id: String(selectedShot.value.index) }
  if (mediaStore.workspaceView === 'media' && selectedAsset.value?.index)
    return {
      type: selectedAsset.value.kind as 'image' | 'video',
      id: String(selectedAsset.value.index),
    }
  return null
})
const pendingAssets = computed(() =>
  mediaStore.referenceAssets.filter(
    (asset) => asset.design && !asset.versions.some((version) => assetVersionMatches(asset, version)),
  ),
)
const grokSequences = computed(() =>
  mediaStore.videoModel === 'rh-grok-image-video' ? buildGrokSequences(mediaStore.segments) : [],
)
const imagePending = computed(() =>
  mediaStore.videoModel === 'rh-grok-image-video'
    ? grokSequences.value.filter((sequence) => sequence.segments[0].imageStatus !== 'success').map((sequence) => sequence.segments[0])
    : unfinishedSegments(mediaStore.segments, 'image'),
)
const videoPending = computed(() =>
  mediaStore.videoModel === 'rh-grok-image-video'
    ? grokSequences.value
        .filter((sequence) => sequence.segments[0].videoStatus !== 'success')
        .map((sequence) => sequence.segments[0])
    : unfinishedSegments(mediaStore.segments, 'video'),
)
const secondaryAction = computed(() => {
  if (mediaStore.workspaceView === 'director' && mediaStore.projectDirectorDraft)
    return { key: 'regenerate-director', label: '重新生成', icon: 'mdi-refresh' }
  if (
    mediaStore.workflowStep === 'images' &&
    selectedAsset.value?.index &&
    selectedAsset.value.status === 'failed'
  )
    return { key: 'retry-image', label: '重新生成本图', icon: 'mdi-refresh' }
  if (
    mediaStore.workflowStep === 'videos' &&
    selectedAsset.value?.index &&
    selectedAsset.value.status === 'failed'
  )
    return {
      key: 'retry-video',
      label: selectedAsset.value.editingFailed ? '重试剪辑分析' : '重新生成本镜',
      icon: 'mdi-refresh',
    }
  if (mediaStore.workflowStep === 'final' && mediaStore.finalPath)
    return { key: 'export', label: '导出成片', icon: 'mdi-export-variant' }
  return null
})
const primaryAction = computed(() => {
  const idle = !mediaStore.busyAction
  if (mediaStore.workspaceView === 'director') {
    if (mediaStore.projectDirectorDraft)
      return { key: 'confirm-director', label: '确认项目总监方案', icon: 'mdi-check-circle-outline', enabled: idle }
    if (!mediaStore.projectDirectorPlan)
      return { key: 'project-director', label: '生成项目总监方案', icon: 'mdi-account-tie-outline', enabled: idle && mediaStore.apiConfigured && Boolean(mediaStore.approvedScript) }
    return { key: 'asset-prompts', label: '生成资产设计 JSON', icon: 'mdi-text-box-edit-outline', enabled: idle && mediaStore.apiConfigured }
  }
  if (mediaStore.workflowStep === 'script') {
    if (!mediaStore.script)
      return { key: 'script', label: '生成文稿', icon: 'mdi-auto-fix', enabled: idle && mediaStore.apiConfigured && Boolean(mediaStore.request.trim()) }
    if (!mediaStore.approvedScript)
      return { key: 'approve', label: '确认并进入项目总监', icon: 'mdi-arrow-right-circle-outline', enabled: idle && Boolean(mediaStore.script.trim()) }
    return { key: 'next-director', label: '进入项目总监', icon: 'mdi-arrow-right-circle-outline', enabled: idle }
  }
  if (!mediaStore.script)
    return {
      key: 'script',
      label: '生成文稿',
      icon: 'mdi-auto-fix',
      enabled: idle && mediaStore.apiConfigured && Boolean(mediaStore.request.trim()),
    }
  if (!mediaStore.approvedScript)
    return {
      key: 'approve',
      label: '确认文稿',
      icon: 'mdi-check-circle-outline',
      enabled: idle && Boolean(mediaStore.script.trim()),
    }
  if (mediaStore.workflowStep === 'voice') {
    if (!mediaStore.finalPath)
      return { key: 'open-dubbing', label: '返回配音字幕工作台', icon: 'mdi-subtitles-outline', enabled: idle }
    return { key: 'open', label: '打开成片', icon: 'mdi-folder-open-outline', enabled: idle }
  }
  if (mediaStore.workflowStep === 'assets') {
    if (!mediaStore.assetPlanningComplete)
      return {
        key: 'asset-prompts',
        label: '生成资产设计 JSON',
        icon: 'mdi-text-box-edit-outline',
        enabled: idle && mediaStore.apiConfigured,
      }
    if (pendingAssets.value.length)
      return {
        key: 'assets',
        label: `生成 ${pendingAssets.value.length} 张资产图`,
        icon: 'mdi-image-multiple-outline',
        enabled: idle && mediaStore.apiConfigured,
      }
    if (!mediaStore.segments.length)
      return { key: 'shot-plan', label: '转分镜', icon: 'mdi-movie-edit-outline', enabled: idle && mediaStore.apiConfigured }
  }
  if (mediaStore.workflowStep === 'shots' && !mediaStore.segments.length)
    return {
      key: 'shot-plan',
      label: !mediaStore.assetPlanningComplete
        ? '请先准备资产'
        : !mediaStore.allRequiredAssetsApproved
          ? '请先生成资产图'
          : '转分镜',
      icon: 'mdi-movie-edit-outline',
      enabled: idle && mediaStore.apiConfigured && mediaStore.assetPlanningComplete && mediaStore.allRequiredAssetsApproved,
    }
  if (imagePending.value.length)
    return {
      key: 'storyboards',
      label: `${imagePending.value.some((item) => item.imageStatus === 'failed') ? '重试' : '生成'} ${imagePending.value.length} 张分镜图`,
      icon: 'mdi-image-plus-outline',
      enabled: idle && mediaStore.apiConfigured,
    }
  if (videoPending.value.length)
    return {
      key: 'videos',
      label: `${videoPending.value.some((item) => item.videoStatus === 'failed') ? '重试' : '生成'} ${videoPending.value.length} 条视频`,
      icon: 'mdi-video-plus-outline',
      enabled: idle && mediaStore.apiConfigured,
    }
  if (!mediaStore.allTranscriptsReady)
    return {
      key: 'generate-srt',
      label: '生成 SRT',
      icon: 'mdi-subtitles-outline',
      enabled: idle && mediaStore.allVideosReady,
    }
  if (!mediaStore.allEditingReady)
    return {
      key: 'generate-editing-timeline',
      label: '生成剪辑时间轴',
      icon: 'mdi-timeline-clock-outline',
      enabled: idle && mediaStore.allTranscriptsReady && mediaStore.apiConfigured,
    }
  if (!mediaStore.finalPath)
    return { key: 'open-dubbing', label: '进入配音字幕工作台', icon: 'mdi-subtitles-outline', enabled: idle }
  return { key: 'open', label: '打开成片', icon: 'mdi-folder-open-outline', enabled: idle }
})
const canStop = computed(() =>
  [
    'shot-plan',
    'asset-prompts',
    'project-director',
    'compose',
    'resume',
    'voice',
    'generate-editing-timeline',
  ].includes(mediaStore.busyAction),
)
const displayError = computed(() =>
  /system cpu overloaded|cpu.*threshold/i.test(mediaStore.error)
    ? '云端当前繁忙，本次内容尚未生成，请稍后重试。'
    : /云端请求失败\s*\(524\)|\b524\b/.test(mediaStore.error)
      ? '当前模型响应超时，内容尚未生成。请重试或切换其他文本模型。'
      : mediaStore.error.replace(/^Error invoking remote method '[^']+': Error:\s*/, ''),
)
const stages = computed(
  () =>
    [
      {
        key: 'script',
        label: '文稿',
        view: 'script',
        done: Boolean(mediaStore.approvedScript),
        enabled: true,
        current: mediaStore.workflowStep === 'script',
      },
      {
        key: 'assets',
        label: '资产',
        view: 'assets',
        done: mediaStore.assetPlanningComplete && mediaStore.allRequiredAssetsApproved,
        enabled: Boolean(mediaStore.approvedScript),
        current: mediaStore.workflowStep === 'assets',
      },
      {
        key: 'shots',
        label: '分镜',
        view: 'storyboard',
        done: Boolean(mediaStore.segments.length),
        enabled: mediaStore.assetPlanningComplete && mediaStore.allRequiredAssetsApproved,
        current: mediaStore.workflowStep === 'shots',
      },
      {
        key: 'images',
        label: '分镜图',
        view: 'media',
        done: mediaStore.allImagesReady,
        enabled: mediaStore.allRequiredAssetsApproved,
        current: mediaStore.workflowStep === 'images',
      },
      {
        key: 'videos',
        label: '视频',
        view: 'media',
        done: mediaStore.allVideosReady,
        enabled: mediaStore.allImagesReady,
        current: mediaStore.workflowStep === 'videos',
      },
      {
        key: 'voice',
        label: '配音字幕',
        view: 'dubbing',
        done: mediaStore.voiceReady,
        enabled: mediaStore.allVideosReady,
        current: mediaStore.workflowStep === 'voice',
      },
      {
        key: 'final',
        label: '成片',
        view: 'final',
        done: Boolean(mediaStore.finalPath),
        enabled: mediaStore.allEditingReady && mediaStore.voiceReady,
        current: mediaStore.workflowStep === 'final',
      },
    ] as {
      key: import('@/store/mediaTask').WorkflowStep
      label: string
      view: WorkspaceView
      done: boolean
      enabled: boolean
      current: boolean
    }[],
)
function sendRevision() {
  if (!revisionTarget.value || !revisionInstruction.value.trim()) return
  emit(
    'requestRevision',
    revisionTarget.value.type,
    revisionTarget.value.id,
    revisionInstruction.value.trim(),
  )
  revisionInstruction.value = ''
}
const dubbingActions = [
  { label: '重选剪辑点', icon: 'mdi-timeline-edit-outline' },
  { label: '生成中文配音', icon: 'mdi-microphone-plus' },
  { label: '翻译所有字幕', icon: 'mdi-translate' },
  { label: '生成英语配音', icon: 'mdi-microphone-plus' },
  { label: '分离原人声和背景声', icon: 'mdi-account-voice-off-outline' },
  { label: '去除原人声', icon: 'mdi-volume-off' },
  { label: '混回背景声、环境声和动作音', icon: 'mdi-music-note-plus' },
  { label: '烧录配音和字幕', icon: 'mdi-movie-open-plus' },
]
function runPrimary() {
  if (primaryAction.value.key === 'next-director') {
    mediaStore.selectView('director')
    return
  }
  if (primaryAction.value.key === 'next-assets') {
    mediaStore.selectStep('assets')
    return
  }
  if (primaryAction.value.key === 'open-dubbing') {
    mediaStore.selectStep('voice')
    return
  }
  const event = {
    script: 'generateScript',
    approve: 'approveScript',
    'project-director': 'generateProjectDirector',
    'confirm-director': 'confirmProjectDirector',
    'shot-plan': 'generateShotPlan',
    'asset-prompts': 'prepareAssets',
    assets: 'generateAssets',
    storyboards: 'generateStoryboards',
    videos: 'generateVideos',
    'generate-srt': 'generateSrt',
    'generate-editing-timeline': 'generateEditingTimeline',
    compose: 'compose',
    open: 'openFinal',
  }[primaryAction.value.key]
  if (event) emit(event as any)
}
function runSecondary() {
  if (secondaryAction.value?.key === 'regenerate-director') emit('generateProjectDirector')
  else if (secondaryAction.value?.key === 'retry-image') emit('retryImage', selectedAsset.value!.index)
  else if (secondaryAction.value?.key === 'retry-video') emit('retryVideo', selectedAsset.value!.index)
  else if (secondaryAction.value?.key === 'export') emit('exportFinal')
}
</script>

<style scoped>
.inspector {
  overflow: hidden;
}
.stage-progress {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  flex: none;
  padding: 7px 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.stage-progress button {
  min-width: 0;
  padding: 3px 1px;
  border: 0;
  background: transparent;
  color: rgba(0, 0, 0, 0.42);
  font-size: 10px;
}
.stage-progress button span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stage-progress button.done {
  color: #157a35;
}
.stage-progress button.current {
  font-weight: 700;
  color: #0f5f29;
}
.inspector-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.revision-input {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  border: 1px solid rgba(21, 122, 53, 0.3);
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.revision-input :deep(.v-field__input) {
  min-height: 100%;
  padding: 16px;
  align-content: flex-start;
}
.revision-input :deep(.v-label) {
  margin-left: 16px;
}
.revision-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.revision-actions {
  padding: 0 10px 10px;
}
.operation-empty { flex: 1; }
.voice-controls { display: grid; gap: 10px; align-content: start; }
.voice-controls .v-btn-toggle { display: grid; grid-template-columns: 1fr; height: auto; }
.voice-controls .v-btn { justify-content: flex-start; }
.voice-controls small { color: rgba(0,0,0,.58); line-height: 1.6; }
.action-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 10px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
}
.action-bar .v-btn:not(.v-btn--icon) {
  min-height: 42px;
}
.action-bar .primary-action { flex: 1; }
.asset-actions {
  display: grid;
  grid-template-columns: 1fr;
}
.asset-actions .v-btn {
  width: 100%;
}
</style>
