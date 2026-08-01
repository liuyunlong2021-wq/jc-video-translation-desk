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
      <div v-else class="operation-empty" />
      <div v-if="mediaStore.error" class="text-error text-body-2">{{ displayError }}</div>
    </div>

    <div v-if="mediaStore.workflowStep === 'assets'" class="action-bar asset-actions">
      <v-btn
        color="primary"
        prepend-icon="mdi-text-box-edit-outline"
        :loading="mediaStore.busyAction === 'asset-prompts'"
        :disabled="Boolean(mediaStore.busyAction)"
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
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.referenceAssets.some((asset) => asset.design)"
        @click="$emit('generateAssets')"
        >生成资产图</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-arrow-right-circle-outline"
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.allRequiredAssetsApproved"
        @click="mediaStore.selectStep('shots')"
        >进入分镜</v-btn
      >
    </div>
    <div v-else class="action-bar">
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
import { unfinishedSegments, type RevisionTargetType } from '@/runtime/videoWorkflow'
import { assetVersionMatches } from '@/runtime/storyboardMarkdown'

const emit = defineEmits([
  'generateScript',
  'approveScript',
  'editScriptMode',
  'generateVoicePlan',
  'generateVoice',
  'generateShotPlan',
  'prepareAssets',
  'searchAssets',
  'generateAssets',
  'generateStoryboards',
  'generateVideos',
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
  if (id === 'voice')
    return { kind: 'audio', title: '统一配音', path: mediaStore.voicePath, status: '已完成' }
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
    status: image ? segment.imageStatus : segment.videoStatus,
    error: segment.error,
    index: segment.index,
  }
})
const revisionTarget = computed<{ type: RevisionTargetType; id: string } | null>(() => {
  if (mediaStore.workflowStep === 'script') {
    if (mediaStore.script) return { type: 'script', id: 'script' }
  }
  if (mediaStore.workflowStep === 'voice' && mediaStore.voicePlan)
    return { type: 'voice-plan', id: 'voice-plan' }
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
const imagePending = computed(() => unfinishedSegments(mediaStore.segments, 'image'))
const videoPending = computed(() => unfinishedSegments(mediaStore.segments, 'video'))
const secondaryAction = computed(() => {
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
    return { key: 'retry-video', label: '重新生成本镜', icon: 'mdi-refresh' }
  if (mediaStore.workflowStep === 'final' && mediaStore.finalPath)
    return { key: 'export', label: '导出成片', icon: 'mdi-export-variant' }
  return null
})
const primaryAction = computed(() => {
  const idle = !mediaStore.busyAction
  if (mediaStore.workflowStep === 'script') {
    if (!mediaStore.script)
      return { key: 'script', label: '生成文稿', icon: 'mdi-auto-fix', enabled: idle && mediaStore.apiConfigured && Boolean(mediaStore.request.trim()) }
    return { key: 'approve', label: '确认并进入配音', icon: 'mdi-arrow-right-circle-outline', enabled: idle && Boolean(mediaStore.script.trim()) }
  }
  if (mediaStore.workflowStep === 'voice') {
    if (!mediaStore.voicePlan)
      return { key: 'voice-plan', label: '生成声音方案', icon: 'mdi-account-voice', enabled: idle && mediaStore.apiConfigured }
    return { key: 'next-assets', label: '进入资产', icon: 'mdi-arrow-right-circle-outline', enabled: idle }
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
  if (mediaStore.workflowStep === 'assets') {
    if (!mediaStore.assetPlanningComplete)
      return {
        key: 'asset-prompts',
        label: '生成资产设计 JSON',
        icon: 'mdi-text-box-edit-outline',
        enabled: idle && mediaStore.apiConfigured,
      }
    const pendingAssets = mediaStore.referenceAssets.filter(
      (asset) =>
        !asset.versions.some((version) => assetVersionMatches(asset, version)),
    )
    if (pendingAssets.length)
      return {
        key: 'assets',
        label: `生成 ${pendingAssets.length} 张资产图`,
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
  if (!mediaStore.voicePlan)
    return {
      key: 'voice-plan',
      label: '生成声音方案',
      icon: 'mdi-account-voice',
      enabled: idle && mediaStore.apiConfigured,
    }
  if (!mediaStore.voicePath)
    return {
      key: 'voice',
      label: '生成配音',
      icon: 'mdi-waveform',
      enabled: idle && (mediaStore.voiceEngine === 'local' || mediaStore.apiConfigured),
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
  if (!mediaStore.finalPath)
    return {
      key: 'compose',
      label: '合成视频',
      icon: 'mdi-movie-open-plus',
      enabled: idle && Boolean(mediaStore.voicePath),
    }
  return { key: 'open', label: '打开成片', icon: 'mdi-folder-open-outline', enabled: idle }
})
const canStop = computed(() =>
  [
    'voice-plan',
    'voice',
    'shot-plan',
    'asset-prompts',
    'compose',
    'resume',
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
        key: 'voice',
        label: '配音',
        view: 'script',
        done: Boolean(mediaStore.voicePath),
        enabled: Boolean(mediaStore.approvedScript),
        current: mediaStore.workflowStep === 'voice',
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
        enabled: Boolean(mediaStore.voicePath) && mediaStore.allRequiredAssetsApproved,
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
        key: 'final',
        label: '成片',
        view: 'final',
        done: Boolean(mediaStore.finalPath),
        enabled: mediaStore.allVideosReady,
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
function runPrimary() {
  if (primaryAction.value.key === 'next-assets') {
    mediaStore.selectStep('assets')
    return
  }
  const event = {
    script: 'generateScript',
    approve: 'approveScript',
    'voice-plan': 'generateVoicePlan',
    voice: 'generateVoice',
    'shot-plan': 'generateShotPlan',
    'asset-prompts': 'prepareAssets',
    assets: 'generateAssets',
    storyboards: 'generateStoryboards',
    videos: 'generateVideos',
    compose: 'compose',
    open: 'openFinal',
  }[primaryAction.value.key]
  if (event) emit(event as any)
}
function runSecondary() {
  if (secondaryAction.value?.key === 'retry-image') emit('retryImage', selectedAsset.value!.index)
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
