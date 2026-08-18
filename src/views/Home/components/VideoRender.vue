<template>
  <v-sheet class="inspector h-full min-h-0 flex flex-col" border rounded>
    <div class="inspector-scroll">
      <div
        v-if="revisionTarget"
        class="revision-input"
        :class="{ compact: mediaStore.workspaceView === 'seed-voice' }"
      >
        <v-textarea
          v-model="revisionInstruction"
          autofocus
          :rows="mediaStore.workspaceView === 'seed-voice' ? 5 : 12"
          no-resize
          hide-details
          variant="plain"
          :label="
            mediaStore.workspaceView === 'seed-voice'
              ? mediaStore.seedVoiceTab === 'roles'
                ? '修改角色音色提示词'
                : '修改全局配音提示词'
              : '修改意见'
          "
          :placeholder="
            mediaStore.workspaceView === 'seed-voice'
              ? mediaStore.seedVoiceTab === 'roles'
                ? '描述你希望 AI 怎么修改当前角色的音色提示词'
                : '描述你希望 AI 怎么修改当前全局配音提示词'
              : '描述你希望 AI 怎么修改当前内容'
          "
          @update:model-value="revisionFeedback = null"
          @keydown.meta.enter.prevent="sendRevision"
          @keydown.ctrl.enter.prevent="sendRevision"
        />
        <div v-if="mediaStore.busyAction === 'revision'" class="revision-feedback pending">
          <v-progress-circular indeterminate size="16" width="2" />
          <span>AI 正在修改当前内容，请稍候…</span>
        </div>
        <div v-else-if="revisionFeedback" class="revision-feedback" :class="revisionFeedback.type">
          {{ revisionFeedback.text }}
        </div>
        <div class="revision-actions">
          <v-btn
            color="primary"
            size="small"
            :loading="mediaStore.busyAction === 'revision'"
            :disabled="Boolean(mediaStore.busyAction) || !revisionInstruction.trim()"
            @click="sendRevision"
            >确认修改</v-btn
          >
        </div>
      </div>
      <div v-if="mediaStore.workspaceView === 'seed-voice'" class="seed-voice-controls">
        <template v-if="mediaStore.seedVoiceTab === 'roles'">
          <strong>角色配音</strong>
          <small v-if="selectedSeedCharacter"
            >当前角色：{{ selectedSeedCharacter.label }}。在中栏查看和编辑提示词。</small
          >
          <small v-else>先在中栏选择一个角色。</small>
          <v-btn
            color="success"
            prepend-icon="mdi-text-box-edit-outline"
            :loading="mediaStore.busyAction === 'generate-seed-role-prompts'"
            :disabled="
              Boolean(mediaStore.busyAction) ||
              !mediaStore.apiConfigured ||
              !props.selectedSeedRoleIds.length
            "
            :title="!mediaStore.apiConfigured ? '请先在生成设置中配置韭菜盒子 API Key' : undefined"
            block
            @click="$emit('generateAllSeedRolePrompts', props.selectedSeedRoleIds)"
            >生成所选角色提示词</v-btn
          >
          <v-btn
            color="success"
            prepend-icon="mdi-waveform"
            :loading="mediaStore.busyAction === 'generate-seed-references'"
            :disabled="
              Boolean(mediaStore.busyAction) ||
              !mediaStore.apiConfigured ||
              !props.selectedSeedRoleIds.length ||
              !selectedSeedRolePromptsReady
            "
            :title="
              !mediaStore.apiConfigured
                ? '请先在生成设置中配置韭菜盒子 API Key'
                : !selectedSeedRolePromptsReady
                  ? '请先生成所选角色提示词'
                  : undefined
            "
            block
            @click="$emit('generateAllSeedReferences', props.selectedSeedRoleIds)"
            >按提示词生成所选参考音</v-btn
          >
        </template>
        <template v-else-if="mediaStore.seedVoiceTab === 'global' && !translationMode">
          <strong>全局配音</strong>
          <small v-if="globalSeedDisabledReason" class="text-warning">{{
            globalSeedDisabledReason
          }}</small>
          <v-btn
            color="success"
            prepend-icon="mdi-text-box-edit-outline"
            :loading="mediaStore.busyAction === 'arrange-doubao-voice'"
            :disabled="
              Boolean(mediaStore.busyAction) ||
              !mediaStore.apiConfigured ||
              !allTranslationVoicesConfirmed
            "
            block
            @click="$emit('generateGlobalSeedPrompt')"
            >生成全局配音提示词</v-btn
          >
          <v-btn
            color="success"
            prepend-icon="mdi-waveform"
            :loading="mediaStore.busyAction === 'generate-target-voice'"
            :disabled="
              Boolean(mediaStore.busyAction) ||
              !mediaStore.apiConfigured ||
              !mediaStore.seedAudioGlobalPrompt.trim()
            "
            block
            @click="$emit('generateGlobalSeedAudio')"
            >生成全局配音</v-btn
          >
          <v-btn
            color="success"
            prepend-icon="mdi-movie-edit-outline"
            :loading="mediaStore.busyAction === 'shot-plan'"
            :disabled="Boolean(mediaStore.busyAction) || !mediaStore.seedAudioDialogueTimelinePath"
            block
            @click="$emit('generateShotPlan')"
            >生成分镜提示词</v-btn
          >
        </template>
        <template v-else>
          <strong>配音提示词</strong>
          <small>先生成全局配音提示词，再生成分组配音提示词，然后按选中配音组生成音频。</small>
          <small v-if="translationMode && !allTranslationVoicesConfirmed" class="text-warning">
            {{ missingTranslationVoiceReason }}
          </small>
          <div class="translation-prompt-panels">
            <v-textarea
              :model-value="globalPromptDraft"
              rows="5"
              no-resize
              hide-details
              variant="outlined"
              label="全局配音提示词"
              placeholder="先生成或粘贴全局配音提示词。"
              @update:model-value="emit('editSeedGlobalPrompt', String($event || ''))"
            />
            <v-textarea
              :model-value="selectedGroupedPrompt"
              rows="7"
              no-resize
              hide-details
              variant="outlined"
              :label="groupedPromptTitle"
              :placeholder="translationPromptPlaceholder"
              :disabled="!groupedPromptReady"
              @update:model-value="emitGroupedPromptUpdate(String($event || ''))"
            />
          </div>
          <v-alert
            v-if="
              translationMode &&
              currentProgressText &&
              mediaStore.busyAction === 'generate-grouped-voice'
            "
            type="info"
            density="compact"
            variant="tonal"
          >
            <v-progress-linear indeterminate class="mb-2" />
            {{ currentProgressText }}
          </v-alert>
          <div class="seed-voice-bottom-actions">
            <v-btn
              color="success"
              prepend-icon="mdi-text-box-edit-outline"
              :loading="mediaStore.busyAction === 'arrange-doubao-voice'"
              :disabled="
                Boolean(mediaStore.busyAction) ||
                !mediaStore.apiConfigured ||
                !allTranslationVoicesConfirmed
              "
              block
              @click="$emit('generateGlobalSeedPrompt')"
              >生成全局配音提示词</v-btn
            >
            <v-btn
              color="primary"
              prepend-icon="mdi-text-box-edit-outline"
              :loading="mediaStore.busyAction === 'generate-grouped-prompt-draft'"
              :disabled="
                Boolean(mediaStore.busyAction) ||
                !mediaStore.apiConfigured ||
                !allTranslationVoicesConfirmed
              "
              block
              @click="$emit('generateGroupedSeedPrompt')"
              >生成分组配音提示词</v-btn
            >
            <div class="seed-voice-action-divider" />
            <v-btn
              color="success"
              prepend-icon="mdi-waveform"
              :loading="mediaStore.busyAction === 'generate-grouped-voice'"
              :disabled="
                Boolean(mediaStore.busyAction) ||
                !mediaStore.apiConfigured ||
                !allTranslationVoicesConfirmed ||
                !groupedPromptReady
              "
              block
              @click="$emit('generateGroupedSeedAudio', [...props.selectedTranslationGroupIds])"
              >生成配音</v-btn
            >
            <v-btn
              color="success"
              prepend-icon="mdi-subtitles-outline"
              :disabled="Boolean(mediaStore.busyAction) || !props.translationFinalReady"
              :title="!props.translationFinalReady ? '请先生成完整的配音版本' : undefined"
              block
              @click="$emit('openTranslationSubtitles')"
              >进入成片工作台</v-btn
            >
          </div>
        </template>
      </div>
      <div v-else-if="mediaStore.workflowStep === 'voice'" class="voice-controls">
        <strong>后期处理</strong>
        <small>按当前剪辑点处理音频、配音和字幕。</small>
        <v-btn
          v-for="action in dubbingActions"
          :key="action.key"
          class="dubbing-action"
          block
          :variant="
            action.key === nextDubbingActionKey ? 'flat' : action.done ? 'tonal' : 'outlined'
          "
          :color="action.enabled || action.done ? 'primary' : undefined"
          :prepend-icon="action.done ? 'mdi-check-circle-outline' : action.icon"
          :loading="mediaStore.busyAction === action.key"
          :disabled="Boolean(mediaStore.busyAction) || !action.enabled"
          :title="action.enabled ? action.label : action.title"
          @click="action.event && emit(action.event)"
          >{{ action.label }}</v-btn
        >
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
        :disabled="
          Boolean(mediaStore.busyAction) ||
          !mediaStore.apiConfigured ||
          !mediaStore.confirmedProductionRoute ||
          mediaStore.assetPlanningComplete
        "
        :title="!mediaStore.confirmedProductionRoute ? '请先确认项目总监方案' : undefined"
        @click="$emit('prepareAssets')"
        >生成资产设计 JSON</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-image-search-outline"
        :loading="mediaStore.busyAction === 'asset-search'"
        :disabled="
          Boolean(mediaStore.busyAction) ||
          !mediaStore.referenceAssets.some((asset) => asset.searchQuery)
        "
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
        :disabled="Boolean(mediaStore.busyAction) || !mediaStore.allRequiredAssetsApproved"
        @click="openNextFromAssets"
        >{{ mediaStore.audioProductionRoute === 'seed-full-track' ? '全局配音' : '转分镜' }}</v-btn
      >
    </div>
    <div
      v-else-if="
        mediaStore.workflowStep !== 'voice' &&
        mediaStore.workspaceView !== 'final' &&
        mediaStore.workspaceView !== 'seed-voice'
      "
      class="action-bar"
    >
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import {
  buildGrokSequences,
  isCombinedVideoModel,
  unfinishedSegments,
  type RevisionTargetType,
} from '@/runtime/videoWorkflow'
import { assetVersionMatches } from '@/runtime/storyboardMarkdown'
import {
  videoTranslationDubbingGroups,
  videoTranslationRoleVoiceLanguageMatches,
  videoTranslationRoleVoiceReady,
} from '@/runtime/videoTranslation'

const props = withDefaults(
  defineProps<{
    translationMode?: boolean
    translationFinalReady?: boolean
    selectedSeedRoleIds?: string[]
    selectedTranslationGroupIds?: string[]
  }>(),
  {
    translationMode: false,
    translationFinalReady: false,
    selectedSeedRoleIds: () => [],
    selectedTranslationGroupIds: () => [],
  },
)
const { translationMode } = props
const emit = defineEmits([
  'generateScript',
  'approveScript',
  'generateProjectDirector',
  'confirmProjectDirector',
  'generateAllSeedRolePrompts',
  'generateAllSeedReferences',
  'arrangeSeedTrack',
  'generateSeedPrompt',
  'generateSeedVoiceScript',
  'saveSeedDirectorDraft',
  'generateSeedTrack',
  'generateGlobalSeedPrompt',
  'generateGlobalSeedAudio',
  'generateGroupedSeedPrompt',
  'generateGroupedSeedAudio',
  'editGroupedPrompt',
  'editSeedGlobalPrompt',
  'openTranslationSubtitles',
  'editScriptMode',
  'generateShotPlan',
  'prepareAssets',
  'searchAssets',
  'generateAssets',
  'generateStoryboards',
  'generateVideos',
  'generateSrt',
  'generateEditingTimeline',
  'generateChineseVoice',
  'translateSubtitles',
  'generateEnglishVoice',
  'separateSourceAudio',
  'removeOriginalVocal',
  'mixBackgroundAudio',
  'burnVoiceAndSubtitles',
  'compose',
  'cancel',
  'retryImage',
  'retryVideo',
  'requestRevision',
  'openFinal',
  'exportFinal',
])
const mediaStore = useMediaTaskStore()
const backendProgressText = ref('')
const currentProgressText = computed(
  () => backendProgressText.value || mediaStore.progressText,
)
const revisionInstruction = ref('')
const revisionPending = ref(false)
const revisionFeedback = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const selectedShot = computed(() =>
  mediaStore.segments.find((item) => item.index === mediaStore.selectedShotIndex),
)
const selectedReferenceAsset = computed(() =>
  mediaStore.referenceAssets.find((asset) => asset.id === mediaStore.selectedAssetId),
)
const seedCharacters = computed(() =>
  translationMode
    ? mediaStore.videoTranslationRoles
        .filter((role) =>
          mediaStore.videoTranslation?.cues.some(
            (cue) => cue.translationRoleId === role.translationRoleId,
          ),
        )
        .map((role) => ({
          id: role.translationRoleId,
          label: role.displayName,
        }))
    : mediaStore.referenceAssets.filter((asset) => asset.role === 'character'),
)
const selectedSeedCharacter = computed(() =>
  mediaStore.workspaceView === 'seed-voice' && mediaStore.seedVoiceTab === 'roles'
    ? seedCharacters.value.find((asset) => asset.id === mediaStore.selectedAssetId)
    : undefined,
)
const translationGroups = computed(() =>
  mediaStore.videoTranslation
    ? videoTranslationDubbingGroups(mediaStore.videoTranslation.cues)
    : [],
)
const selectedTranslationGroupIndex = computed(() =>
  translationGroups.value.findIndex((group) => group.groupId === mediaStore.selectedAssetId),
)
const selectedTranslationGroup = computed(() =>
  selectedTranslationGroupIndex.value < 0
    ? undefined
    : translationGroups.value[selectedTranslationGroupIndex.value],
)
const promptDisplayGroup = computed(
  () =>
    selectedTranslationGroup.value ||
    translationGroups.value.find((group) =>
      Boolean(mediaStore.videoTranslation?.groupedVoicePrompts?.[group.groupId]?.trim()),
    ) ||
    translationGroups.value[0],
)
const groupedPromptReady = computed(
  () =>
    translationGroups.value.length > 0 &&
    translationGroups.value.every((group) =>
      Boolean(mediaStore.videoTranslation?.groupedVoicePrompts?.[group.groupId]?.trim()),
    ),
)
const globalPromptDraft = computed(
  () => mediaStore.seedAudioGlobalPrompt || mediaStore.videoTranslation?.seedPromptText || '',
)
const selectedGroupedPrompt = computed(() =>
  groupedPromptReady.value && promptDisplayGroup.value
    ? mediaStore.videoTranslation?.groupedVoicePrompts?.[promptDisplayGroup.value.groupId] || ''
    : '',
)
function translationGroupLabel(groupId: string) {
  const index = translationGroups.value.findIndex((group) => group.groupId === groupId)
  return index < 0 ? groupId : `组 ${index + 1}`
}
const groupedPromptTitle = computed(() =>
  groupedPromptReady.value && promptDisplayGroup.value
    ? `${translationGroupLabel(promptDisplayGroup.value.groupId)} 分组配音稿`
    : '全局配音提示词',
)
const translationPromptPlaceholder = computed(() =>
  groupedPromptReady.value
    ? '这里显示当前分组配音稿，可先试听确认后再进入成片工作台。'
    : '生成分组配音提示词后，这里会按当前选中的配音组显示。',
)
function emitGroupedPromptUpdate(prompt: string) {
  if (promptDisplayGroup.value) {
    emit('editGroupedPrompt', promptDisplayGroup.value.groupId, prompt)
  }
}
const selectedSeedRolePromptsReady = computed(
  () =>
    props.selectedSeedRoleIds.length > 0 &&
    props.selectedSeedRoleIds.every((id) => Boolean(mediaStore.seedAudioRolePrompts[id]?.trim())),
)
const allTranslationVoicesConfirmed = computed(
  () =>
    !translationMode ||
    seedCharacters.value.every((asset) => {
      const role = mediaStore.videoTranslationRoles.find(
        (item) => item.translationRoleId === asset.id,
      )
      return videoTranslationRoleVoiceReady(
        role,
        mediaStore.videoTranslation?.targetLanguage || '',
      )
    }),
)
const missingTranslationVoiceReason = computed(() => {
  if (!allTranslationVoicesConfirmed.value) {
    const asset = seedCharacters.value.find((item) => {
      const role = mediaStore.videoTranslationRoles.find(
        (candidate) => candidate.translationRoleId === item.id,
      )
      return !videoTranslationRoleVoiceReady(
        role,
        mediaStore.videoTranslation?.targetLanguage || '',
      )
    })
    const role = mediaStore.videoTranslationRoles.find(
      (item) => item.translationRoleId === asset?.id,
    )
    const missing = !role?.voiceProfileId
      ? '参考音'
      : !videoTranslationRoleVoiceLanguageMatches(
            role,
            mediaStore.videoTranslation?.targetLanguage || '',
          )
        ? '当前目标语言参考音'
        : !role.voiceIdentityText?.trim()
          ? '角色声音身份'
          : '人工确认'
    return `${asset?.label || '角色'}还缺：${missing}。`
  }
  return ''
})
const globalSeedDisabledReason = computed(() => {
  if (missingTranslationVoiceReason.value) return missingTranslationVoiceReason.value
  if (!mediaStore.seedAudioGlobalPrompt.trim()) return '下一步：生成全局配音提示词。'
  if (!mediaStore.seedAudioTrackPath) return '下一步：生成全局配音。'
  return ''
})

let stopTranslationProgress: (() => void) | undefined
onMounted(() => {
  if (!translationMode) return
  stopTranslationProgress = window.electron.cloud.onVideoTranslationProgress((progress) => {
    if (progress.runId === mediaStore.runId && progress.episodeId === mediaStore.episodeId)
      backendProgressText.value = progress.message
  })
})
onBeforeUnmount(() => stopTranslationProgress?.())
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
    editingFailed:
      !image && segment.videoStatus === 'success' && segment.editingStatus === 'failed',
    index: segment.index,
  }
})
const revisionTarget = computed<{ type: RevisionTargetType; id: string } | null>(() => {
  if (
    mediaStore.workspaceView === 'director' &&
    (mediaStore.projectDirectorDraft || mediaStore.projectDirectorPlan)
  )
    return { type: 'project-director', id: 'project-director' }
  if (selectedSeedCharacter.value)
    return { type: 'seed-role-prompt', id: selectedSeedCharacter.value.id }
  if (
    translationMode &&
    mediaStore.workspaceView === 'seed-voice' &&
    mediaStore.seedVoiceTab === 'global' &&
    mediaStore.seedAudioGlobalPrompt.trim()
  )
    return { type: 'seed-global-prompt', id: 'seed-global-prompt' }
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
    (asset) =>
      asset.design && !asset.versions.some((version) => assetVersionMatches(asset, version)),
  ),
)
const grokSequences = computed(() =>
  isCombinedVideoModel(mediaStore.videoModel)
    ? buildGrokSequences(mediaStore.segments, mediaStore.videoModel)
    : [],
)
const imagePending = computed(() =>
  isCombinedVideoModel(mediaStore.videoModel)
    ? grokSequences.value
        .filter((sequence) => sequence.segments[0].imageStatus !== 'success')
        .map((sequence) => sequence.segments[0])
    : unfinishedSegments(mediaStore.segments, 'image'),
)
const videoPending = computed(() =>
  isCombinedVideoModel(mediaStore.videoModel)
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
  if (mediaStore.workspaceView === 'final')
    return {
      key: 'open',
      label: '打开成片',
      icon: 'mdi-folder-open-outline',
      enabled: idle && Boolean(mediaStore.finalPath),
    }
  if (mediaStore.workspaceView === 'director') {
    if (mediaStore.projectDirectorDraft)
      return {
        key: 'confirm-director',
        label: '确认项目总监方案',
        icon: 'mdi-check-circle-outline',
        enabled: idle,
      }
    if (!mediaStore.projectDirectorPlan)
      return {
        key: 'project-director',
        label: '生成项目总监方案',
        icon: 'mdi-account-tie-outline',
        enabled: idle && mediaStore.apiConfigured && Boolean(mediaStore.approvedScript),
      }
    return {
      key: 'asset-prompts',
      label: '生成资产设计 JSON',
      icon: 'mdi-text-box-edit-outline',
      enabled: idle && mediaStore.apiConfigured,
    }
  }
  if (mediaStore.workflowStep === 'seed-voice')
    return {
      key: 'shot-plan',
      label: '生成分镜提示词',
      icon: 'mdi-movie-edit-outline',
      enabled:
        idle && Boolean(mediaStore.seedAudioDialogueTimelinePath) && mediaStore.apiConfigured,
    }
  if (mediaStore.workflowStep === 'script') {
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
        label: '确认并进入项目总监',
        icon: 'mdi-arrow-right-circle-outline',
        enabled: idle && Boolean(mediaStore.script.trim()),
      }
    return {
      key: 'next-director',
      label: '进入项目总监',
      icon: 'mdi-arrow-right-circle-outline',
      enabled: idle,
    }
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
      return {
        key: 'open-dubbing',
        label: '返回配音字幕工作台',
        icon: 'mdi-subtitles-outline',
        enabled: idle,
      }
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
      return {
        key: 'shot-plan',
        label: '转分镜',
        icon: 'mdi-movie-edit-outline',
        enabled: idle && mediaStore.apiConfigured,
      }
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
      enabled:
        idle &&
        mediaStore.apiConfigured &&
        mediaStore.assetPlanningComplete &&
        mediaStore.allRequiredAssetsApproved,
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
    return {
      key: 'open-dubbing',
      label: '进入配音字幕工作台',
      icon: 'mdi-subtitles-outline',
      enabled: idle,
    }
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
    'generate-chinese-voice',
    'translate-subtitles',
    'generate-english-voice',
    'separate-source-audio',
    'mix-background-audio',
    'burn-voice-and-subtitles',
  ].includes(mediaStore.busyAction),
)
const displayError = computed(() =>
  /未按顺序逐行保留全部确认台词|未按顺序逐字保留确认台词/.test(mediaStore.error)
    ? '人工确认稿已变化，请重新生成全局配音提示词。'
    : /system cpu overloaded|cpu.*threshold/i.test(mediaStore.error)
    ? '云端当前繁忙，本次内容尚未生成，请稍后重试。'
    : /云端请求失败\s*\(524\)|\b524\b/.test(mediaStore.error)
      ? '当前模型响应超时，内容尚未生成。请重试或切换其他文本模型。'
      : mediaStore.error.replace(/^Error invoking remote method '[^']+': Error:\s*/, ''),
)
watch(
  () => mediaStore.busyAction,
  (current, previous) => {
    if (current === 'generate-grouped-voice' || previous === 'generate-grouped-voice')
      backendProgressText.value = ''
    if (!revisionPending.value || previous !== 'revision' || current === 'revision') return
    revisionPending.value = false
    if (mediaStore.error) {
      revisionFeedback.value = {
        type: 'error',
        text: `修改失败：${displayError.value || '请重试。'}`,
      }
      return
    }
    revisionInstruction.value = ''
    revisionFeedback.value = { type: 'success', text: 'AI 修改已完成，结果已更新。' }
  },
)
function sendRevision() {
  if (!revisionTarget.value || !revisionInstruction.value.trim()) return
  if (mediaStore.busyAction) {
    revisionFeedback.value = { type: 'error', text: '当前有其他任务正在执行，请稍后再试。' }
    return
  }
  revisionPending.value = true
  revisionFeedback.value = null
  emit(
    'requestRevision',
    revisionTarget.value.type,
    revisionTarget.value.id,
    revisionInstruction.value.trim(),
  )
  if (mediaStore.busyAction !== 'revision') {
    revisionPending.value = false
    revisionFeedback.value = { type: 'error', text: '修改任务未能启动，请重试。' }
  }
}
type DubbingAction = {
  key: string
  label: string
  icon: string
  event?:
    | 'generateChineseVoice'
    | 'translateSubtitles'
    | 'generateEnglishVoice'
    | 'separateSourceAudio'
    | 'removeOriginalVocal'
    | 'mixBackgroundAudio'
    | 'burnVoiceAndSubtitles'
  enabled: boolean
  title: string
  done: boolean
}
const dubbingActions = computed<DubbingAction[]>(() => {
  const soundSegments = mediaStore.segments.filter(
    (segment) => segment.soundType && segment.soundType !== 'none',
  )
  const selectedVoice =
    mediaStore.outputLanguage === 'zh' ? mediaStore.voicePath : mediaStore.englishVoicePath
  const subtitlesReady =
    mediaStore.outputLanguage === 'zh'
      ? soundSegments.every((segment) => segment.dialogueText?.trim())
      : soundSegments.every((segment) => segment.englishDialogueText?.trim())
  const translated =
    soundSegments.length > 0 &&
    soundSegments.every((segment) => segment.englishDialogueText?.trim())
  const canBurn =
    mediaStore.allEditingReady &&
    subtitlesReady &&
    (!soundSegments.length ||
      (mediaStore.instrumentPath ? Boolean(mediaStore.mixedAudioPath) : Boolean(selectedVoice)))
  return [
    {
      key: 'generate-chinese-voice',
      label: '生成中文配音',
      icon: 'mdi-microphone-plus',
      event: 'generateChineseVoice',
      enabled: mediaStore.allEditingReady && soundSegments.length > 0 && !mediaStore.voicePath,
      title: '请先完成剪辑时间轴和台词',
      done: Boolean(mediaStore.voicePath),
    },
    {
      key: 'translate-subtitles',
      label: '翻译所有字幕',
      icon: 'mdi-translate',
      event: 'translateSubtitles',
      enabled:
        mediaStore.allEditingReady &&
        mediaStore.apiConfigured &&
        soundSegments.some((segment) => segment.dialogueText?.trim()) &&
        !translated,
      title: '请先完成时间轴、中文字幕和 API 配置',
      done: translated,
    },
    {
      key: 'generate-english-voice',
      label: '生成英语配音',
      icon: 'mdi-microphone-plus',
      event: 'generateEnglishVoice',
      enabled: mediaStore.allEditingReady && translated && !mediaStore.englishVoicePath,
      title: '请先翻译全部字幕',
      done: Boolean(mediaStore.englishVoicePath),
    },
    {
      key: 'separate-source-audio',
      label:
        mediaStore.audioProductionRoute === 'seed-full-track'
          ? '分离完整声音轨的人声和背景声'
          : '分离原人声和背景声',
      icon: 'mdi-account-voice-off-outline',
      event: 'separateSourceAudio',
      enabled: mediaStore.allEditingReady && !mediaStore.instrumentPath,
      title: '请先完成剪辑时间轴',
      done: Boolean(mediaStore.vocalPath && mediaStore.instrumentPath),
    },
    {
      key: 'remove-original-vocal',
      label: '去除原人声',
      icon: 'mdi-volume-off',
      event: 'removeOriginalVocal',
      enabled:
        Boolean(mediaStore.vocalPath && mediaStore.instrumentPath) &&
        !mediaStore.originalVocalRemoved,
      title: '请先分离原人声和背景声',
      done: mediaStore.originalVocalRemoved,
    },
    {
      key: 'mix-background-audio',
      label: '混回背景声、环境声和动作音',
      icon: 'mdi-music-note-plus',
      event: 'mixBackgroundAudio',
      enabled:
        mediaStore.originalVocalRemoved && Boolean(selectedVoice) && !mediaStore.mixedAudioPath,
      title: '请先去除原人声并生成配音',
      done: Boolean(mediaStore.mixedAudioPath),
    },
    {
      key: 'burn-voice-and-subtitles',
      label: '烧录配音和字幕',
      icon: 'mdi-movie-open-plus',
      event: 'burnVoiceAndSubtitles',
      enabled: canBurn && !mediaStore.finalPath,
      title: '请先完成配音、字幕和已开始的音频处理',
      done: Boolean(mediaStore.finalPath),
    },
  ]
})
const nextDubbingActionKey = computed(
  () => dubbingActions.value.find((action) => action.enabled && !action.done)?.key,
)
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
    'arrange-seed-track': 'arrangeSeedTrack',
    'generate-seed-track': 'generateSeedTrack',
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
function openNextFromAssets() {
  if (mediaStore.audioProductionRoute === 'seed-full-track') {
    const first = seedCharacters.value[0]
    if (first) mediaStore.selectedAssetId = first.id
    mediaStore.selectView('seed-voice')
    return
  }
  emit('generateShotPlan')
}
function runSecondary() {
  if (secondaryAction.value?.key === 'regenerate-director') emit('generateProjectDirector')
  else if (secondaryAction.value?.key === 'retry-image')
    emit('retryImage', selectedAsset.value!.index)
  else if (secondaryAction.value?.key === 'retry-video')
    emit('retryVideo', selectedAsset.value!.index)
  else if (secondaryAction.value?.key === 'export') emit('exportFinal')
}
</script>

<style scoped>
.inspector {
  overflow: hidden;
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
  grid-template-rows: minmax(0, 1fr) auto auto;
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
.revision-input.compact {
  flex: none;
  min-height: 190px;
}
.revision-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.revision-actions {
  padding: 0 10px 10px;
}
.revision-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}
.revision-feedback.pending {
  color: rgb(var(--v-theme-primary));
}
.revision-feedback.success {
  color: rgb(var(--v-theme-success));
}
.revision-feedback.error {
  color: rgb(var(--v-theme-error));
}
.operation-empty {
  flex: 1;
}
.voice-controls,
.seed-voice-controls {
  display: grid;
  gap: 10px;
  align-content: start;
}
.seed-voice-controls {
  min-height: 100%;
}
.seed-voice-controls:has(.translation-prompt-panels) {
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  align-content: stretch;
}
.translation-prompt-panels {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(150px, 0.85fr) minmax(210px, 1.15fr);
  gap: 12px;
}
.translation-prompt-panels .v-input {
  min-height: 0;
}
.translation-prompt-panels :deep(textarea) {
  line-height: 1.7;
}
.seed-voice-bottom-actions {
  align-self: end;
  display: grid;
  gap: 10px;
  padding-top: 6px;
}
.seed-voice-action-divider {
  height: 1px;
  margin: 2px 0;
  background: rgba(0, 0, 0, 0.12);
}
.seed-voice-controls .v-btn {
  min-height: 42px;
  justify-content: flex-start;
  border-radius: 6px;
  letter-spacing: 0;
}
.voice-controls .dubbing-action {
  min-height: 44px;
  justify-content: flex-start;
  border-radius: 6px;
  letter-spacing: 0;
}
.voice-controls small,
.seed-voice-controls small {
  color: rgba(0, 0, 0, 0.58);
  line-height: 1.6;
}
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
.action-bar .primary-action {
  flex: 1;
}
.asset-actions {
  display: grid;
  grid-template-columns: 1fr;
}
.asset-actions .v-btn {
  width: 100%;
}
</style>
