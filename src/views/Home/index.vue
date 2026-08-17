<template>
  <div class="w-full h-full flex flex-col">
    <div
      class="w-full h-[40px] relative border-b"
      :class="isMac ? 'title-bar' : 'window-drag'"
      @mousedown="handleTitleBarMouseDown"
      @dblclick="handleTitleBarDoubleClick"
    >
      <div class="window-control-bar-no-drag-mask" @mousedown.stop @dblclick.stop />
    </div>

    <div class="project-bar flex items-center gap-2 border-b px-3 py-2">
      <v-btn
        class="project-create"
        prepend-icon="mdi-file-plus-outline"
        color="primary"
        variant="flat"
        size="small"
        :disabled="Boolean(mediaStore.busyAction) || projectSwitching"
        @click="newProject()"
      >
        新建项目
      </v-btn>
      <v-btn
        icon="mdi-folder-plus-outline"
        variant="text"
        size="small"
        title="打开已有项目目录"
        aria-label="打开已有项目目录"
        :disabled="Boolean(mediaStore.busyAction) || projectSwitching"
        @click="openProjectDirectory"
      />
      <v-autocomplete
        class="project-select"
        :model-value="mediaStore.runId"
        :items="projects"
        item-title="name"
        item-value="projectId"
        density="compact"
        color="primary"
        variant="outlined"
        hide-details
        aria-label="选择项目"
        :disabled="Boolean(mediaStore.busyAction) || projectSwitching"
        @update:model-value="switchProject"
      />
      <template v-if="renameOpen">
        <v-text-field
          v-model="projectNameDraft"
          class="project-rename-input"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          aria-label="项目名称"
          @keyup.enter="commitProjectRename"
          @keyup.esc="cancelProjectRename"
        />
        <v-btn
          icon="mdi-check"
          color="primary"
          variant="text"
          size="small"
          title="确认项目名称"
          @click="commitProjectRename"
        />
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          title="取消重命名"
          @click="cancelProjectRename"
        />
      </template>
      <v-btn
        v-else
        icon="mdi-pencil-outline"
        variant="text"
        size="small"
        title="重命名项目"
        :disabled="!mediaStore.runId || projectSwitching"
        @click="startProjectRename"
      />
      <v-select
        class="episode-select"
        :model-value="mediaStore.episodeId"
        :items="currentProject?.episodes || []"
        item-title="title"
        item-value="episodeId"
        density="compact"
        color="primary"
        variant="outlined"
        hide-details
        aria-label="选择剧集"
        :disabled="!currentProject || Boolean(mediaStore.busyAction) || projectSwitching"
        @update:model-value="switchEpisode"
      />
      <v-btn
        class="episode-create"
        prepend-icon="mdi-plus"
        color="primary"
        variant="tonal"
        size="small"
        :disabled="!mediaStore.runId || Boolean(mediaStore.busyAction) || projectSwitching"
        @click="newEpisode"
      >
        新建集
      </v-btn>
      <v-btn
        icon="mdi-folder-open-outline"
        variant="text"
        size="small"
        title="在访达中显示"
        :disabled="!mediaStore.runId"
        @click="showCurrentProject"
      />
      <v-btn-toggle
        v-if="isVideoTranslation"
        :model-value="mediaStore.workspaceView"
        mandatory
        density="compact"
        color="success"
        :disabled="Boolean(mediaStore.busyAction) || projectSwitching"
        aria-label="视频翻译工作台"
        @update:model-value="selectTranslationWorkspace"
      >
        <v-btn value="script" size="small">字幕工作台</v-btn>
        <v-btn value="seed-voice" size="small" :disabled="!translationReviewReady"
          >配音工作台</v-btn
        >
        <v-btn value="dubbing" size="small" :disabled="!translationFinalWorkspaceReady"
          >成片工作台</v-btn
        >
      </v-btn-toggle>
      <template v-if="isDubbingWorkspace">
        <v-btn
          :icon="dubbingRightOpen ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left'"
          variant="text"
          size="small"
          :color="dubbingRightOpen ? 'primary' : undefined"
          :title="dubbingRightOpen ? '收起右侧后期操作' : '展开右侧后期操作'"
          @click="dubbingRightOpen = !dubbingRightOpen"
        />
      </template>
      <span v-if="currentProject?.wikiPending" class="text-caption text-warning">
        Wiki 待同步
      </span>
      <v-btn
        v-if="currentProject?.wikiPending"
        size="small"
        variant="text"
        prepend-icon="mdi-refresh"
        @click="rebuildWiki"
        >重建 Wiki</v-btn
      >
      <v-spacer />
      <v-btn
        icon="mdi-cog-outline"
        variant="text"
        size="small"
        title="生成设置"
        aria-label="生成设置"
        @click="textGenerateRef?.openConfig()"
      />
      <v-btn
        icon
        variant="text"
        size="small"
        title="当前项目任务"
        :disabled="!mediaStore.runId"
        @click="taskDrawerOpen = !taskDrawerOpen"
      >
        <v-badge :content="activeTaskCount" :model-value="activeTaskCount > 0" color="success">
          <v-icon>mdi-progress-clock</v-icon>
        </v-badge>
      </v-btn>
    </div>

    <div v-if="taskDrawerOpen" class="task-drawer-backdrop" @click="taskDrawerOpen = false" />
    <aside v-if="taskDrawerOpen" class="task-drawer" @keydown.esc="taskDrawerOpen = false">
      <div class="task-drawer-heading">
        <strong>当前项目任务</strong>
        <v-btn icon="mdi-close" size="small" variant="text" @click="taskDrawerOpen = false" />
      </div>
      <div v-if="!mediaStore.cloudTasks.length" class="task-empty">当前项目还没有媒体任务</div>
      <div v-else class="task-list">
        <article v-for="task in orderedTasks" :key="task.id" class="task-item">
          <div class="task-title">
            <strong>{{ taskKindLabel(task.kind) }} · {{ task.targetLabel }}</strong>
            <v-chip size="x-small" :color="taskStatusColor(task.status)" variant="tonal">
              {{ taskStatusLabel(task) }}
            </v-chip>
          </div>
          <small v-if="task.error" class="task-error">{{ task.error }}</small>
          <div class="task-actions">
            <v-btn
              v-if="task.status === 'generating' || task.status === 'downloading'"
              size="small"
              variant="tonal"
              color="error"
              @click="stopTask(task)"
              >{{ task.status === 'downloading' ? '停止下载' : '停止等待' }}</v-btn
            >
            <v-btn
              v-else-if="canResumeTask(task)"
              size="small"
              variant="tonal"
              color="primary"
              @click="resumeTask(task)"
              >{{ task.resultUrl ? '继续下载' : '继续查询' }}</v-btn
            >
            <v-btn
              v-else-if="task.status === 'failed' || task.status === 'stopped'"
              size="small"
              variant="tonal"
              color="primary"
              @click="retryTask(task)"
              >重新生成</v-btn
            >
            <v-btn
              v-if="
                task.status !== 'success' &&
                task.status !== 'generating' &&
                task.status !== 'downloading'
              "
              size="small"
              variant="text"
              @click="abandonTask(task)"
              >放弃</v-btn
            >
          </div>
        </article>
      </div>
    </aside>

    <div
      class="workspace-grid w-full h-0 min-h-0 flex-1 grid gap-3 py-3 px-3"
      :class="{
        'dubbing-workspace-mode': isDubbingWorkspace && !isVideoTranslation,
        'translation-workspace-mode': isVideoTranslation,
        'translation-voice-mode': isTranslationVoiceWorkspace,
        'translation-dubbing-mode': isTranslationSubtitleWorkspace,
        'left-collapsed': !isVideoTranslation && !leftPanelVisible,
        'right-collapsed': !isVideoTranslation && !rightPanelVisible,
      }"
    >
      <TextGenerate
        ref="textGenerateRef"
        v-show="!isVideoTranslation && leftPanelVisible"
        @import-markdown="importMarkdown"
      />
      <template v-if="isVideoTranslation">
        <template v-if="isTranslationVoiceWorkspace">
          <VideoManage
            translation-mode
            :selected-seed-role-ids="selectedSeedRoleIds"
            @upload-seed-reference="uploadTranslationSeedReference"
            @generate-seed-role-prompt="generateTranslationSeedRolePrompt"
            @generate-seed-reference="generateTranslationSeedReference"
            @confirm-seed-voice="confirmTranslationSeedVoice"
            @unconfirm-seed-voice="unconfirmTranslationSeedVoice"
            @edit-seed-role-prompt="editTranslationSeedRolePrompt"
            @edit-seed-global-prompt="editTranslationSeedGlobalPrompt"
            @update-selected-seed-roles="selectedSeedRoleIds = $event"
            @select-translation-voice-version="selectTranslationVoiceVersion"
          />
          <div class="inspector-column min-w-0 min-h-0 open">
            <VideoRender
              translation-mode
              :translation-final-ready="translationFinalWorkspaceReady"
              :selected-seed-role-ids="selectedSeedRoleIds"
              @generate-all-seed-role-prompts="generateAllTranslationSeedRolePrompts"
              @generate-all-seed-references="generateAllTranslationSeedReferences"
              @generate-global-seed-prompt="arrangeTranslationVoice"
              @generate-global-seed-audio="generateTranslationVoice"
              @generate-grouped-seed-audio="generateTranslationGroupedVoice"
              @edit-grouped-prompt="editTranslationGroupedPrompt"
              @open-translation-subtitles="openTranslationSubtitleWorkspace"
              @request-revision="requestRevision"
              @cancel="cancelWorkflow"
            />
          </div>
        </template>
        <template v-else>
          <VideoTranslationSidebar
            v-if="!isTranslationSubtitleWorkspace"
            :show-roles="!isTranslationSubtitleWorkspace"
            @extract-script-characters="extractTranslationScriptCharacters"
            @delete-role="deleteTranslationRole"
          />
          <VideoTranslationWorkspace
            ref="translationWorkspaceRef"
            :selected-cue-id="selectedTranslationCueId"
            :show-roles="!isTranslationSubtitleWorkspace"
            @select-cue="selectedTranslationCueId = $event"
            @playhead="translationPlayheadMs = $event"
            @text-cursor="(cueId, offset) => (translationTextCursor = { cueId, offset })"
          />
          <VideoTranslationInspector
            :selected-cue-id="selectedTranslationCueId"
            :playhead-ms="translationPlayheadMs"
            :text-cursor-offset="
              translationTextCursor.cueId === selectedTranslationCueId
                ? translationTextCursor.offset
                : 0
            "
            @action="runTranslationAction"
            @select-cue="selectedTranslationCueId = $event"
            @focus-cue="translationWorkspaceRef?.focusSourceCue($event)"
            @cancel="cancelWorkflow"
          />
        </template>
      </template>
      <template v-else>
        <VideoManage
          :selected-seed-role-ids="selectedSeedRoleIds"
          @edit-script="editScript"
          @markdown-saved="reloadStoryboardMarkdown"
          @upload-asset-reference="uploadAssetReference"
          @update-edit-point="updateEditingPoint"
          @update-chinese-subtitle="updateChineseSubtitle"
          @generate-seed-voice="generateSeedVoice"
          @generate-seed-role-prompt="generateSeedRolePrompt"
          @generate-seed-reference="generateSeedReference"
          @update-selected-seed-roles="selectedSeedRoleIds = $event"
          @generate-seed-prompt="generateSeedPrompt"
          @generate-seed-voice-script="generateSeedVoiceScript"
          @save-seed-director-draft="saveSeedDirectorDraft"
          @arrange-seed-track="arrangeSeedTrack"
          @generate-seed-track="generateSeedTrack"
          @generate-shot-plan="generateShotPlan"
        />
        <v-btn
          v-if="!isDubbingWorkspace && !isFinalWorkspace"
          class="inspector-toggle"
          :icon="inspectorOpen ? 'mdi-close' : 'mdi-tune-variant'"
          :aria-label="inspectorOpen ? '关闭检查器' : '打开检查器'"
          size="small"
          @click="inspectorOpen = !inspectorOpen"
        />
        <div
          v-show="rightPanelVisible"
          class="inspector-column min-w-0 min-h-0"
          :class="{ open: isDubbingWorkspace ? dubbingRightOpen : inspectorOpen }"
        >
          <VideoRender
            :selected-seed-role-ids="selectedSeedRoleIds"
            @generate-script="generateScript"
            @approve-script="approveScript"
            @generate-project-director="generateProjectDirector"
            @confirm-project-director="confirmProjectDirector"
            @generate-all-seed-role-prompts="generateAllSeedRolePrompts"
            @generate-all-seed-references="generateAllSeedReferences"
            @arrange-seed-track="arrangeSeedTrack"
            @generate-seed-prompt="generateSeedPrompt"
            @generate-seed-voice-script="generateSeedVoiceScript"
            @save-seed-director-draft="saveSeedDirectorDraft"
            @generate-seed-track="generateSeedTrack"
            @edit-script-mode="mediaStore.scriptEditing = true"
            @generate-shot-plan="generateShotPlan"
            @prepare-assets="prepareAssetPrompts"
            @search-assets="searchAssets"
            @generate-assets="generateAssets"
            @generate-storyboards="generateStoryboards"
            @generate-videos="generateVideos"
            @generate-srt="generateMaterialSrts"
            @generate-editing-timeline="generateEditingTimeline"
            @generate-chinese-voice="generateChineseVoice"
            @translate-subtitles="translateAllSubtitles"
            @generate-english-voice="generateEnglishVoice"
            @separate-source-audio="separateSourceAudio"
            @remove-original-vocal="removeOriginalVocal"
            @mix-background-audio="mixBackgroundAudio"
            @burn-voice-and-subtitles="burnVoiceAndSubtitles"
            @compose="burnVoiceAndSubtitles"
            @cancel="cancelWorkflow"
            @retry-image="retryImage"
            @retry-video="retryVideo"
            @request-revision="requestRevision"
            @apply-revision="applyRevision"
            @cancel-revision="mediaStore.revisionProposal = null"
            @undo-revision="undoRevision"
            @open-final="showFinal"
            @export-final="exportFinal"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import VideoRender from './components/VideoRender.vue'
import VideoTranslationSidebar from './components/VideoTranslationSidebar.vue'
import VideoTranslationWorkspace from './components/VideoTranslationWorkspace.vue'
import VideoTranslationInspector from './components/VideoTranslationInspector.vue'
import { useMediaTaskStore, type WorkspaceView } from '@/store'
import {
  createRunId,
  hashScript,
  parseStoryboardPlan,
  parseRevisionProposal,
  parseVoiceDesign,
  expectedShotCount,
  unfinishedSegments,
  buildGrokSequences,
  grokReferenceGuide,
  grokStoryboardBoardInstruction,
  isCombinedVideoModel,
  videoSoundInstruction,
  videoPromptWithSound,
  VISUAL_STYLES,
  assetReferenceSearchQuery,
  type GrokSequence,
  type StoryboardSegment,
} from '@/runtime/videoWorkflow'
import {
  confirmProjectDirectorDraft,
  parseProjectDirectorDraft,
  productionRouteMarkdown,
  projectDirectorAssets,
  projectDirectorMarkdown,
} from '@/runtime/projectDirector'
import {
  assetGenerationChanged,
  assetVersionMatches,
  isLegacyStoryboardMarkdown,
  mergeStoryboardMedia,
  parseStoryboardMarkdown,
  withProjectDesign,
} from '@/runtime/storyboardMarkdown'
import { deserializeMediaTask, serializeMediaTask } from '@/runtime/mediaPersistence'
import {
  adoptEditingPoint,
  buildEditingTimeline,
  episodeVoiceTasks,
} from '@/runtime/editingTimeline'
import { uniqueTranscriptInputs } from '@/runtime/materialTranscript'
import {
  detectScriptLanguage,
  planSeedAudioArrangement,
  seedLinesFromScript,
} from '@/runtime/seedAudio'
import {
  autoGroupVideoTranslationCues,
  bindTranslationRoleToScriptCharacter,
  buildVideoTranslationSeedRolePrompt,
  compactVideoTranslationVoiceIdentity,
  createVideoTranslationState,
  invalidateVideoTranslation,
  matchScriptCharacterForRole,
  mergeScriptCharacters,
  planVideoTranslationDialogueBlocks,
  planVideoTranslationGroupedDialogueBlocks,
  scriptCharacterOptions,
  videoTranslationRoleVoiceLanguageMatches,
  videoTranslationRoleVoiceReady,
  videoTranslationDubbingGroups,
  validateVideoTranslationDialoguePrompt,
  validateVideoTranslationGroupedPrompt,
  type ScriptCharacter,
  type ScriptCharacterDraft,
  type VideoTranslationAction,
  type VideoTranslationVoiceVersion,
  type TranslationRole,
} from '@/runtime/videoTranslation'
import type {
  AssetRole,
  AssetVersion,
  PendingCloudTask,
  ProjectManifest,
  ReferenceAsset,
} from '~/electron/types'

const mediaStore = useMediaTaskStore()
const toast = useToast()
const { t } = useTranslation()
const isMac = window.electron.platform === 'darwin'
const inspectorOpen = ref(false)
const dubbingRightOpen = ref(true)
const taskDrawerOpen = ref(false)
const textGenerateRef = ref<InstanceType<typeof TextGenerate> | null>(null)
const translationWorkspaceRef = ref<InstanceType<typeof VideoTranslationWorkspace> | null>(null)
const selectedTranslationCueId = ref('')
const translationPlayheadMs = ref(0)
const translationTextCursor = ref({ cueId: '', offset: 0 })
const selectedSeedRoleIds = ref<string[]>([])
const projects = ref<ProjectManifest[]>([])
const projectSwitching = ref(false)
const renameOpen = ref(false)
const projectNameDraft = ref('')
const currentProject = computed(() =>
  projects.value.find((project) => project.projectId === mediaStore.runId),
)
const isDubbingWorkspace = computed(() => mediaStore.workspaceView === 'dubbing')
const isFinalWorkspace = computed(() => mediaStore.workspaceView === 'final')
const isVideoTranslation = computed(() => true)
const isTranslationVoiceWorkspace = computed(
  () => isVideoTranslation.value && mediaStore.workspaceView === 'seed-voice',
)
const isTranslationSubtitleWorkspace = computed(
  () => isVideoTranslation.value && mediaStore.workspaceView === 'dubbing',
)
const translationReviewReady = computed(() => mediaStore.videoTranslation?.reviewStatus === 'ready')
const translationFinalWorkspaceReady = computed(() => {
  const state = mediaStore.videoTranslation
  const version = state?.voiceVersions.find((item) => item.versionId === state.activeVoiceVersionId)
  const roleById = new Map(
    mediaStore.videoTranslationRoles.map((role) => [role.translationRoleId, role]),
  )
  const cueIds = new Set(state?.cues.map((cue) => cue.cueId) || [])
  const versionCueIds = new Set(version?.blocks?.flatMap((block) => block.cueIds) || [])
  const referencesReady = version?.blocks?.every((block) =>
    block.references.every((reference) => {
      const role = roleById.get(reference.translationRoleId)
      return (
        role?.voiceProfileId === reference.voiceProfileId &&
        videoTranslationRoleVoiceReady(role, state?.targetLanguage || '')
      )
    }),
  )
  return Boolean(
    state?.finalScriptId &&
      state.scriptHash &&
      version &&
      version.route === 'grouped' &&
      version.finalScriptId === state.finalScriptId &&
      version.scriptHash === state.scriptHash &&
      version.blocks?.length &&
      versionCueIds.size === cueIds.size &&
      [...cueIds].every((cueId) => versionCueIds.has(cueId)) &&
      referencesReady,
  )
})
const seedRoleIds = computed(() => {
  if (isTranslationVoiceWorkspace.value) {
    const speaking = new Set(
      mediaStore.videoTranslation?.cues.map((cue) => cue.translationRoleId).filter(Boolean) || [],
    )
    return mediaStore.videoTranslationRoles
      .filter((role) => speaking.has(role.translationRoleId))
      .map((role) => role.translationRoleId)
  }
  return mediaStore.referenceAssets
    .filter((asset) => asset.role === 'character')
    .map((asset) => asset.id)
})
function defaultSelectedSeedRoleIds() {
  const ids = seedRoleIds.value
  const missingPrompts = ids.filter((id) => !mediaStore.seedAudioRolePrompts[id]?.trim())
  return missingPrompts.length ? missingPrompts : ids
}
watch(
  () => mediaStore.videoTranslation,
  (state) => {
    if (!state) mediaStore.selectWorkspaceEntry('video-translate')
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => [isTranslationVoiceWorkspace.value, mediaStore.runId, mediaStore.episodeId],
  ([active]) => {
    if (active) void loadTranslationVoiceVersions()
  },
  { immediate: true },
)
watch(
  () => mediaStore.seedVoiceTab,
  (tab) => {
    if (tab !== 'grouped' || !isTranslationVoiceWorkspace.value) return
    const state = translationState()
    const groups = videoTranslationDubbingGroups(state.cues)
    if (!groups.some((group) => group.groupId === mediaStore.selectedAssetId))
      mediaStore.selectedAssetId = groups[0]?.groupId
  },
)
watch(
  () => [seedRoleIds.value.join(','), mediaStore.seedVoiceTab, mediaStore.workspaceView],
  () => {
    const valid = new Set(seedRoleIds.value)
    selectedSeedRoleIds.value = selectedSeedRoleIds.value.filter((id) => valid.has(id))
    if (
      mediaStore.workspaceView === 'seed-voice' &&
      mediaStore.seedVoiceTab === 'roles' &&
      !selectedSeedRoleIds.value.length
    )
      selectedSeedRoleIds.value = defaultSelectedSeedRoleIds()
  },
  { immediate: true },
)
const leftPanelVisible = computed(() => mediaStore.workspaceView === 'script')
const rightPanelVisible = computed(
  () => !isFinalWorkspace.value && (!isDubbingWorkspace.value || dubbingRightOpen.value),
)
const activeTaskCount = computed(
  () =>
    mediaStore.cloudTasks.filter((task) =>
      ['queued', 'generating', 'downloading'].includes(task.status || ''),
    ).length,
)
const orderedTasks = computed(() =>
  [...mediaStore.cloudTasks].sort((a, b) =>
    String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
  ),
)
let subtitleSaveTimer: ReturnType<typeof setTimeout> | undefined

async function refreshCloudTasks(runId = mediaStore.runId) {
  if (!runId) {
    mediaStore.cloudTasks = []
    return
  }
  const tasks = await window.electron.cloud.listTasks(runId)
  if (mediaStore.runId !== runId) return
  if (JSON.stringify(mediaStore.cloudTasks) === JSON.stringify(tasks)) return
  mediaStore.cloudTasks = tasks
  syncCompletedTasks(tasks)
}

function syncCompletedTasks(tasks: PendingCloudTask[]) {
  for (const task of tasks) {
    if (task.kind === 'asset') {
      const asset = mediaStore.referenceAssets.find((item) => item.id === task.targetId)
      if (!asset) continue
      if (task.status !== 'success') {
        asset.status =
          task.status === 'generating' || task.status === 'downloading' ? 'generating' : 'failed'
        continue
      }
      if (asset.versions.some((version) => version.relativePath === task.outputPath)) continue
      const version: AssetVersion = {
        id: `version-${crypto.randomUUID()}`,
        source: 'generated',
        relativePath: task.outputPath,
        designFingerprint: designFingerprint(asset),
        createdAt: task.finishedAt || task.updatedAt || task.createdAt,
      }
      asset.versions.push(version)
      mediaStore.adoptAssetVersion(asset.id, version.id)
      continue
    }
    const segment = mediaStore.segments.find((item) => String(item.index) === task.targetId)
    if (!segment) continue
    if (task.kind === 'storyboard') {
      segment.imageStatus =
        task.status === 'success'
          ? 'success'
          : task.status === 'generating' || task.status === 'downloading'
            ? 'running'
            : task.status === 'stopped'
              ? 'cancelled'
              : 'failed'
      if (task.status === 'success') segment.imagePath = task.outputPath
      if (task.error) segment.error = task.error
    } else if (task.kind === 'video') {
      segment.videoStatus =
        task.status === 'success'
          ? 'success'
          : task.status === 'generating' || task.status === 'downloading'
            ? 'running'
            : task.status === 'stopped'
              ? 'cancelled'
              : 'failed'
      if (task.status === 'success') segment.videoPath = task.outputPath
      if (task.error) segment.error = task.error
    }
  }
}

function taskKindLabel(kind: PendingCloudTask['kind']) {
  return {
    voice: '配音',
    dubbing: '分组配音',
    asset: '资产图',
    storyboard: '分镜图',
    video: '视频',
    'frame-calibration': '画面识别人物',
  }[kind]
}

function taskStatusLabel(task: PendingCloudTask) {
  if (task.status === 'stopped')
    return task.resumeFrom === 'downloading' ? '等待继续下载' : '已停止等待'
  if (task.status === 'failed') return task.resumeFrom === 'downloading' ? '下载失败' : '生成失败'
  return (
    {
      queued: '排队中',
      generating: '生成中',
      downloading: '下载中',
      success: '已完成',
    }[task.status as 'queued' | 'generating' | 'downloading' | 'success'] || '生成失败'
  )
}

function taskStatusColor(status: PendingCloudTask['status']) {
  return status === 'success'
    ? 'success'
    : status === 'failed'
      ? 'error'
      : status === 'stopped'
        ? 'warning'
        : 'primary'
}

function canResumeTask(task: PendingCloudTask) {
  return (
    ['failed', 'stopped'].includes(task.status || '') && Boolean(task.resultUrl || task.pollRoute)
  )
}

function taskErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error|CanceledError):\s*/,
    '',
  )
}

async function stopTask(task: PendingCloudTask) {
  await window.electron.cloud.stopTask(mediaStore.runId, task.id)
  await refreshCloudTasks()
  toast.warning(
    task.status === 'downloading'
      ? '已停止本地下载，可稍后继续。'
      : '已停止本地等待；云端任务可能仍在执行并产生费用。',
  )
}

async function resumeTask(task: PendingCloudTask) {
  try {
    await window.electron.cloud.resumeTask(mediaStore.runId, task.id)
  } catch (error) {
    toast.error(taskErrorMessage(error))
  } finally {
    await refreshCloudTasks()
  }
}

async function abandonTask(task: PendingCloudTask) {
  await window.electron.cloud.abandonTask(mediaStore.runId, task.id)
  const segment = mediaStore.segments.find((item) => String(item.index) === task.targetId)
  if (segment && task.kind === 'storyboard') mediaStore.invalidateShot(segment.index, 'image')
  if (segment && task.kind === 'video') mediaStore.invalidateShot(segment.index, 'video')
  if (task.kind === 'asset') {
    const asset = mediaStore.referenceAssets.find((item) => item.id === task.targetId)
    if (asset)
      asset.status = mediaStore.currentGeneratedAssetVersion(asset.id)
        ? 'approved'
        : asset.versions.some((version) => version.source !== 'generated')
          ? 'ready'
          : 'design-ready'
  }
  await refreshCloudTasks()
  if (mediaStore.cloudTasks.every((item) => item.status === 'success')) taskDrawerOpen.value = false
}

async function retryTask(task: PendingCloudTask) {
  try {
    if (task.kind === 'dubbing' && task.targetId) {
      await generateTranslationGroupedVoice([task.targetId])
    } else if (task.kind === 'asset') {
      const asset = mediaStore.referenceAssets.find((item) => item.id === task.targetId)
      if (asset) await generateAssetVersion(asset)
    } else {
      const segment = mediaStore.segments.find((item) => String(item.index) === task.targetId)
      if (segment && task.kind === 'storyboard') await retryImage(segment.index)
      if (segment && task.kind === 'video') await retryVideo(segment.index)
    }
  } catch (error) {
    toast.error(taskErrorMessage(error))
  } finally {
    await refreshCloudTasks()
  }
}

async function refreshProjects() {
  projects.value = await window.electron.cloud.listProjects()
}

function currentProjectRegistered() {
  return projects.value.some((project) => project.projectId === mediaStore.runId)
}

async function saveCurrentProject() {
  clearTimeout(persistTimer)
  if (mediaStore.runId && currentProjectRegistered())
    await window.electron.cloud.saveState(
      mediaStore.runId,
      mediaStore.episodeId,
      serializeMediaTask(mediaStore.$state),
    )
}

async function newProject(showToast = true) {
  if (mediaStore.busyAction || projectSwitching.value) return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    mediaStore.reset()
    mediaStore.runId = createRunId()
    const manifest = await window.electron.cloud.createProject(
      mediaStore.runId,
      serializeMediaTask(mediaStore.$state),
    )
    if (!manifest) {
      mediaStore.reset()
      return
    }
    await refreshProjects()
    inspectorOpen.value = false
    taskDrawerOpen.value = false
    await refreshCloudTasks()
    if (showToast) toast.success('已创建新项目')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    projectSwitching.value = false
  }
}

async function openProjectDirectory() {
  if (mediaStore.busyAction || projectSwitching.value) return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    const manifest = await window.electron.cloud.openProjectDirectory()
    if (!manifest) return
    const state = await window.electron.cloud.loadProject(
      manifest.projectId,
      manifest.lastOpenedEpisodeId,
    )
    mediaStore.reset()
    mediaStore.$patch(deserializeMediaTask(state))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    inspectorOpen.value = false
    taskDrawerOpen.value = false
    await refreshProjects()
    await refreshCloudTasks(manifest.projectId)
    toast.success(`已打开项目：${manifest.name}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    projectSwitching.value = false
  }
}

async function switchProject(projectId: string | null) {
  if (
    !projectId ||
    projectId === mediaStore.runId ||
    projectSwitching.value ||
    mediaStore.busyAction
  )
    return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    const episodeId = projects.value.find(
      (project) => project.projectId === projectId,
    )?.lastOpenedEpisodeId
    if (!episodeId) throw new Error('项目没有可打开的剧集')
    const state = await window.electron.cloud.loadProject(projectId, episodeId)
    mediaStore.reset()
    mediaStore.$patch(deserializeMediaTask(state))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    inspectorOpen.value = false
    await refreshProjects()
    taskDrawerOpen.value = false
    await refreshCloudTasks(projectId)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    projectSwitching.value = false
  }
}

function startProjectRename() {
  const current = currentProject.value
  if (!current) return
  projectNameDraft.value = current.name
  renameOpen.value = true
}

function cancelProjectRename() {
  renameOpen.value = false
  projectNameDraft.value = ''
}

async function commitProjectRename() {
  const current = currentProject.value
  const name = projectNameDraft.value.trim()
  if (!current || !name || name === current.name) {
    cancelProjectRename()
    return
  }
  try {
    await window.electron.cloud.renameProject(current.projectId, name)
    await refreshProjects()
    cancelProjectRename()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function switchEpisode(episodeId: string | null) {
  if (
    !episodeId ||
    episodeId === mediaStore.episodeId ||
    projectSwitching.value ||
    mediaStore.busyAction
  )
    return
  const projectId = mediaStore.runId
  if (!projectId) return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    const state = await window.electron.cloud.loadProject(projectId, episodeId)
    mediaStore.reset()
    mediaStore.$patch(deserializeMediaTask(state))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    await refreshProjects()
    await refreshCloudTasks(projectId)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    projectSwitching.value = false
  }
}

async function newEpisode() {
  if (!mediaStore.runId || projectSwitching.value || mediaStore.busyAction) return
  const projectId = mediaStore.runId
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    mediaStore.reset()
    mediaStore.runId = projectId
    const manifest = await window.electron.cloud.createEpisode(
      projectId,
      serializeMediaTask(mediaStore.$state),
    )
    const state = await window.electron.cloud.loadProject(projectId, manifest.lastOpenedEpisodeId)
    mediaStore.$patch(deserializeMediaTask(state))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    inspectorOpen.value = false
    taskDrawerOpen.value = false
    await refreshProjects()
    await refreshCloudTasks(projectId)
    toast.success(`已创建${manifest.episodes.at(-1)?.title || '新集'}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    projectSwitching.value = false
  }
}

async function showCurrentProject() {
  if (mediaStore.runId) await window.electron.cloud.showProject(mediaStore.runId)
}

async function rebuildWiki() {
  try {
    await saveCurrentProject()
    await refreshProjects()
    if (currentProject.value?.wikiPending) throw new Error('Wiki 重建失败')
    toast.success('Wiki 已重建')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function importMarkdown() {
  if (!mediaStore.runId) await newProject(false)
  if (!mediaStore.runId) return
  try {
    const imported = await window.electron.cloud.importMarkdown(mediaStore.runId)
    if (!imported) return
    mediaStore.request = imported.content
    mediaStore.rawImports.push(imported)
    toast.success(`已导入 ${imported.originalName}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function generateScript() {
  await runAction('script', async () => {
    if (!mediaStore.runId) throw new Error('项目尚未创建')
    await window.electron.cloud.saveRawSubmission(mediaStore.runId, mediaStore.request)
    if (mediaStore.approvedScript) {
      mediaStore.archiveCurrent()
      mediaStore.invalidateFrom('script')
      mediaStore.approvedScript = ''
      mediaStore.scriptHash = ''
    }
    mediaStore.script = await window.electron.cloud.generateScript({
      request: mediaStore.request.trim(),
      verifiedFacts: mediaStore.request.trim(),
      targetDuration: mediaStore.targetDuration,
      ratio: mediaStore.ratio as '9:16' | '16:9',
      styleId: mediaStore.styleId,
      hasCoreReference: Boolean(mediaStore.coreReference),
      textModel: mediaStore.textModel,
    })
    mediaStore.stage = 'script-generated'
    mediaStore.scriptEditing = true
    mediaStore.selectView('script')
  })
}

function editScript(value: string) {
  if (mediaStore.approvedScript && value !== mediaStore.approvedScript) {
    mediaStore.archiveCurrent()
    mediaStore.invalidateFrom('script')
    mediaStore.approvedScript = ''
    mediaStore.scriptHash = ''
    mediaStore.stage = 'script-generated'
    toast.info(t('workflow.script.changed'))
  }
  mediaStore.script = value
}

async function approveScript() {
  await runAction('approve', async () => {
    const approved = mediaStore.script.trim()
    mediaStore.runId ||= createRunId()
    const current = await window.electron.cloud
      .readMarkdown(mediaStore.runId, `wiki/文稿/${mediaStore.episodeId}/确认文稿.md`)
      .catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      `wiki/文稿/${mediaStore.episodeId}/确认文稿.md`,
      `# 确认文稿\n\n${approved}`,
      current?.revision,
    )
    mediaStore.invalidateFrom('script')
    mediaStore.approvedScript = approved
    mediaStore.scriptHash = await hashScript(approved)
    mediaStore.stage = 'script-approved'
    mediaStore.scriptEditing = false
    mediaStore.selectStep('assets')
    toast.success(t('workflow.script.approved'))
  })
}

function selectedVisualStyle() {
  return VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt || ''
}

async function buildProjectDirectorDraft(instruction = '') {
  const raw = await window.electron.cloud.runSkill(
    'jc-film-style',
    JSON.stringify({
      mode: 'app-director',
      rawRequest: mediaStore.request,
      approvedScript: mediaStore.approvedScript,
      project: {
        styleId: mediaStore.styleId,
        visualStyle: selectedVisualStyle(),
        aspectRatio: mediaStore.ratio,
        targetDuration: mediaStore.targetDuration,
      },
      currentPlan: mediaStore.projectDirectorDraft || mediaStore.projectDirectorPlan,
      instruction,
    }),
    mediaStore.runId,
    mediaStore.textModel,
  )
  return parseProjectDirectorDraft(raw, mediaStore.ratio, selectedVisualStyle())
}

async function generateProjectDirector() {
  await runAction('project-director', async () => {
    if (!mediaStore.approvedScript) throw new Error('请先确认文稿')
    mediaStore.projectDirectorDraft = await buildProjectDirectorDraft()
    mediaStore.selectView('director')
  })
}

function clearSeedDownstream() {
  mediaStore.seedAudioGlobalPrompt = ''
  mediaStore.seedAudioDirectorDraftPath = ''
  mediaStore.seedAudioArrangementPath = ''
  mediaStore.seedAudioTrackPath = ''
  mediaStore.seedAudioDialogueTimelinePath = ''
  mediaStore.seedAudioSrtPath = ''
  mediaStore.seedAudioDuration = 0
  mediaStore.voicePath = ''
  mediaStore.voiceDuration = 0
  mediaStore.finalPath = ''
}

function seedScriptLanguage() {
  return detectScriptLanguage(mediaStore.approvedScript)
}

function seedRoleAsset(speakerId: string) {
  const asset = mediaStore.referenceAssets.find(
    (item) => item.id === speakerId && item.role === 'character',
  )
  if (!asset) throw new Error('没有找到项目角色')
  return asset
}

async function saveSeedRolePrompt(speakerId: string, prompt: string) {
  const asset = seedRoleAsset(speakerId)
  mediaStore.seedAudioRolePrompts[speakerId] = prompt
  const voicePath = `wiki/声音/角色/${speakerId}-音色提示词.md`
  const current = await window.electron.cloud
    .readMarkdown(mediaStore.runId, voicePath)
    .catch(() => null)
  await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    voicePath,
    `---\nentityType: seed-voice-prompt\nspeakerId: ${speakerId}\nlanguage: ${seedScriptLanguage()}\nstatus: ready\n---\n\n# ${asset.label} 音色提示词\n\n${prompt}\n`,
    current?.revision,
  )
  clearSeedDownstream()
}

async function generateSeedRolePromptCore(speakerId: string) {
  if (mediaStore.audioProductionRoute !== 'seed-full-track')
    throw new Error('请先选择豆包整段声音轨')
  const asset = seedRoleAsset(speakerId)
  const language = seedScriptLanguage()
  const names = [asset.label, ...(asset.aliases || [])]
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const sample =
    mediaStore.approvedScript.match(new RegExp(`(?:${names})[：:]\\s*([^\\n]+)`))?.[1] ||
    (language === 'en'
      ? 'Everything is ready. Let us begin when you are prepared.'
      : '今天的安排已经确认了，准备好以后我们就开始。')
  const design = await window.electron.cloud.runSkill(
    'jc-voice-design',
    JSON.stringify({
      text: sample,
      character: asset,
      language,
      requirement: `只设计该角色唯一稳定基准音；示例台词必须使用${language === 'en' ? '英文' : '中文'}`,
    }),
    mediaStore.runId,
    mediaStore.textModel,
  )
  const promptResult = await window.electron.cloud.runSkill(
    'jc-doubao-seed-audio',
    JSON.stringify({
      mode: 'voice-profile',
      language,
      durationMs: 10000,
      character: asset,
      voiceDesign: design.voicePrompt,
      exampleLine: sample,
      approvedScript: mediaStore.approvedScript,
    }),
    mediaStore.runId,
    mediaStore.textModel,
  )
  const prompt = String(promptResult?.text_prompt || '').trim()
  if (!prompt) throw new Error('Seed 音色提示词为空')
  await saveSeedRolePrompt(speakerId, prompt)
  return asset.label
}

async function generateSeedRolePrompt(speakerId: string) {
  await runAction('generate-seed-role-prompt', async () => {
    const label = await generateSeedRolePromptCore(speakerId)
    toast.success(`${label} 音色提示词已生成`)
  })
}

async function generateAllSeedRolePrompts(selectedIds: string[] = []) {
  await runAction('generate-seed-role-prompts', async () => {
    const selected = new Set(selectedIds)
    const targets = mediaStore.referenceAssets.filter(
      (asset) =>
        asset.role === 'character' &&
        (selected.size ? selected.has(asset.id) : !mediaStore.seedAudioRolePrompts[asset.id]?.trim()),
    )
    const result = await runBatchByLimit(targets, 4, async (asset) => {
      await generateSeedRolePromptCore(asset.id)
    })
    if (result.failures.length)
      throw new Error(
        `已生成 ${result.successCount} 个角色音色提示词，${result.failures.length} 个失败：${result.failures[0]}`,
      )
    toast.success(
      targets.length ? `已生成 ${targets.length} 个角色音色提示词` : '所有角色音色提示词均已存在',
    )
  })
}

async function registerSeedReference(speakerId: string, sourceAudioPath: string) {
  const asset = seedRoleAsset(speakerId)
  const prompt = mediaStore.seedAudioRolePrompts[speakerId]?.trim()
  if (!prompt) throw new Error('请先生成并确认角色音色提示词')
  return window.electron.cloud.registerSeedVoiceProfile({
    projectId: mediaStore.runId,
    episodeId: mediaStore.episodeId,
    speakerId,
    displayName: `${asset.label} Seed 音色`,
    sourceAudioPath,
    voiceDesignPrompt: prompt,
    language: seedScriptLanguage(),
  })
}

async function generateSeedReferenceCore(speakerId: string) {
  if (mediaStore.audioProductionRoute !== 'seed-full-track')
    throw new Error('请先选择豆包整段声音轨')
  const asset = seedRoleAsset(speakerId)
  const prompt = mediaStore.seedAudioRolePrompts[speakerId]?.trim()
  if (!prompt) throw new Error('请先生成并确认角色音色提示词')
  const promptPath = `wiki/声音/角色/${speakerId}-音色提示词.md`
  const promptDocument = await window.electron.cloud
    .readMarkdown(mediaStore.runId, promptPath)
    .catch(() => null)
  await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    promptPath,
    `---\nentityType: seed-voice-prompt\nspeakerId: ${speakerId}\nlanguage: ${seedScriptLanguage()}\nstatus: ready\n---\n\n# ${asset.label} 音色提示词\n\n${prompt}\n`,
    promptDocument?.revision,
  )
  const audio = await window.electron.cloud.generateSeedAudio({
    runId: mediaStore.runId,
    episodeId: mediaStore.episodeId,
    mode: 'voice-profile',
    durationMs: 10000,
    prompt,
    language: seedScriptLanguage(),
    outputName: `voice-${speakerId}-${Date.now()}`,
  })
  const profile = await registerSeedReference(speakerId, audio.path)
  clearSeedDownstream()
  mediaStore.seedAudioVoicePath = profile.referenceAudioPath
  return asset.label
}

async function generateAllSeedReferences(selectedIds: string[] = []) {
  await runAction('generate-seed-references', async () => {
    const selected = new Set(selectedIds)
    const missing: string[] = []
    for (const asset of mediaStore.referenceAssets.filter((item) => item.role === 'character')) {
      if (selected.size && !selected.has(asset.id)) continue
      const binding = await window.electron.cloud
        .readMarkdown(mediaStore.runId, `wiki/声音/角色/${asset.id}.md`)
        .catch(() => null)
      if (selected.size || !binding?.content.match(/^voiceProfileId:\s*["']?([^"'\s]+)["']?\s*$/m))
        missing.push(asset.id)
    }
    const result = await runBatchByLimit(missing, 2, async (speakerId) => {
      await generateSeedReferenceCore(speakerId)
    })
    if (result.failures.length)
      throw new Error(
        `已生成并绑定 ${result.successCount} 个角色参考音，${result.failures.length} 个失败：${result.failures[0]}`,
      )
    toast.success(
      missing.length ? `已生成并绑定 ${missing.length} 个角色参考音` : '所有角色参考音均已绑定',
    )
  })
}

async function generateSeedReference(speakerId: string) {
  await runAction('generate-seed-reference', async () => {
    const label = await generateSeedReferenceCore(speakerId)
    toast.success(`${label} Seed 参考音已生成并绑定`)
  })
}

async function generateSeedVoice(speakerId: string) {
  await generateSeedRolePrompt(speakerId)
  await generateSeedReference(speakerId)
}

async function currentSeedArrangement() {
  if (!mediaStore.projectDirectorPlan) throw new Error('请先确认项目总监方案')
  const characters = mediaStore.projectDirectorPlan.assets
    .filter((asset) => asset.role === 'character')
    .map((asset) => ({ id: asset.id, label: asset.label, aliases: asset.aliases }))
  const lines = seedLinesFromScript(mediaStore.approvedScript, characters)
  const speakerIds = [...new Set(lines.map((line) => line.speakerId).filter(Boolean) as string[])]
  const references = await window.electron.cloud.resolveProjectSeedReferences(
    mediaStore.runId,
    speakerIds,
  )
  const planned = planSeedAudioArrangement({
    segmentId: mediaStore.episodeId,
    startMs: 0,
    endMs: mediaStore.targetDuration * 1000,
    lines,
    references,
  })
  return {
    lines,
    arrangement: {
      ...planned,
      projectId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      sourceScriptHash: await hashScript(mediaStore.approvedScript),
      voiceBindingHash: await hashScript(
        JSON.stringify(references.map((item) => [item.speakerId, item.voiceProfileId])),
      ),
      createdAt: new Date().toISOString(),
      segments: [
        {
          segmentId: mediaStore.episodeId,
          startMs: 0,
          endMs: mediaStore.targetDuration * 1000,
          lines,
        },
      ],
      referenceMap: Object.fromEntries(
        references.map((item, index) => [
          item.speakerId,
          {
            voiceProfileId: item.voiceProfileId,
            referenceIndex: index + 1,
          },
        ]),
      ),
      status: 'ready',
      blockers: [],
    },
  }
}

async function arrangeSeedTrack() {
  await runAction('arrange-seed-track', async () => {
    if (mediaStore.audioProductionRoute !== 'seed-full-track')
      throw new Error('请先选择豆包整段声音轨')
    const { arrangement } = await currentSeedArrangement()
    mediaStore.seedAudioArrangementPath = await window.electron.cloud.writeSeedAudioArrangement(
      mediaStore.runId,
      mediaStore.episodeId,
      arrangement,
    )
    toast.success(`整段配音安排已生成，共 ${arrangement.tasks.length} 个任务`)
  })
}

async function generateSeedPrompt() {
  await runAction('generate-seed-prompt', async () => {
    if (mediaStore.audioProductionRoute !== 'seed-full-track')
      throw new Error('请先选择豆包整段声音轨')
    if (!mediaStore.seedAudioArrangementPath) throw new Error('请先点击整段配音安排')
    const { arrangement } = await currentSeedArrangement()
    mediaStore.seedAudioGlobalPrompt = [
      '# 全局声音安排',
      '',
      `本集按确认文稿生成完整声音轨，共 ${arrangement.tasks.length} 个连续任务。`,
      `角色参考音：${arrangement.references.map((reference) => `${reference.label || reference.speakerId}=${reference.voiceProfileId}`).join('；')}`,
      '',
      ...arrangement.tasks.map(
        (task) =>
          `- ${task.taskId}：${task.startMs}ms-${task.endMs}ms；角色 ${task.speakerIds.join('、') || '旁白'}；${task.includeMusicAndEffects ? '包含音乐、环境声和动作音效' : '只生成补充人声，不重复生成音乐和音效'}`,
      ),
    ].join('\n')
    mediaStore.seedAudioDirectorDraftPath = ''
    toast.success('全局声音提示词已生成，请继续生成豆包语音稿')
  })
}

async function generateSeedVoiceScript() {
  await runAction('generate-seed-voice-script', async () => {
    if (!mediaStore.seedAudioArrangementPath) throw new Error('请先点击整段配音安排')
    if (!mediaStore.seedAudioGlobalPrompt.trim()) throw new Error('请先生成全局声音提示词')
    const { arrangement } = await currentSeedArrangement()
    const prompts: string[] = []
    for (const task of arrangement.tasks) {
      const result = await window.electron.cloud.runSkill(
        'jc-doubao-seed-audio',
        JSON.stringify({
          mode: task.mode,
          language: seedScriptLanguage(),
          durationMs: task.endMs - task.startMs,
          globalVoicePlan: mediaStore.seedAudioGlobalPrompt,
          arrangement: task,
          references: task.references.map((reference, index) => ({
            speakerId: reference.speakerId,
            referenceIndex: index + 1,
            label: reference.label,
          })),
          voiceDesigns: Object.fromEntries(
            task.references.map((reference) => [
              reference.speakerId,
              reference.voiceDesignPrompt || '',
            ]),
          ),
          segments: task.lines,
          approvedScript: mediaStore.approvedScript,
          projectDirector: mediaStore.projectDirectorPlan,
        }),
        mediaStore.runId,
        mediaStore.textModel,
      )
      const prompt = String(result?.text_prompt || '').trim()
      if (!prompt) throw new Error(`${task.taskId} 没有生成 Seed Audio 提示词`)
      prompts.push(`## ${task.taskId}\n\n${prompt}`)
    }
    mediaStore.seedAudioGlobalPrompt = prompts.join('\n\n')
    await persistSeedDirectorDraft()
    toast.success('豆包语音稿已生成，可直接编辑后生成声音轨')
  })
}

async function persistSeedDirectorDraft() {
  if (!mediaStore.seedAudioGlobalPrompt.trim()) throw new Error('声音导演稿不能为空')
  const draftPath = `wiki/声音/${mediaStore.episodeId}/声音导演稿.md`
  const current = await window.electron.cloud
    .readMarkdown(mediaStore.runId, draftPath)
    .catch(() => null)
  const written = await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    draftPath,
    `---\nentityType: seed-audio-director-draft\nepisodeId: ${mediaStore.episodeId}\nstatus: ready\n---\n\n# 声音导演稿\n\n${mediaStore.seedAudioGlobalPrompt.trim()}\n`,
    current?.revision,
  )
  mediaStore.seedAudioDirectorDraftPath = written.path
}

async function saveSeedDirectorDraft() {
  await runAction('save-seed-director-draft', persistSeedDirectorDraft)
}

async function generateSeedTrack() {
  await runAction('generate-seed-track', async () => {
    if (mediaStore.audioProductionRoute !== 'seed-full-track')
      throw new Error('请先选择豆包整段声音轨')
    if (!mediaStore.seedAudioArrangementPath) throw new Error('请先点击整段配音安排')
    if (!mediaStore.seedAudioDirectorDraftPath) throw new Error('请先生成并保存声音导演稿')
    const { arrangement, lines } = await currentSeedArrangement()
    const savedDraft = await window.electron.cloud.readMarkdown(
      mediaStore.runId,
      mediaStore.seedAudioDirectorDraftPath,
    )
    const savedPrompt = savedDraft.content
      .replace(/^---[\s\S]*?---\s*/m, '')
      .replace(/^#\s*声音导演稿\s*/m, '')
      .trim()
    if (!savedPrompt) throw new Error('声音导演稿正文为空')
    const generated: Array<{ path: string; duration: number }> = []
    for (const task of arrangement.tasks) {
      generated.push(
        await window.electron.cloud.generateSeedAudio({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          mode: task.mode,
          durationMs: task.endMs - task.startMs,
          prompt: savedPrompt,
          language: seedScriptLanguage(),
          references: task.references,
          outputName: task.taskId,
        }),
      )
    }
    mediaStore.seedAudioTrackPath = await window.electron.cloud.mixSeedAudioTracks(
      mediaStore.runId,
      mediaStore.episodeId,
      generated.map((item) => item.path),
      mediaStore.targetDuration * 1000,
    )
    mediaStore.seedAudioDuration = Math.max(...generated.map((item) => item.duration))
    const transcript = await window.electron.cloud.generateMaterialTranscript({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      mediaId: 'seed-audio-track',
      videoPath: mediaStore.seedAudioTrackPath,
    })
    const timeline = await window.electron.cloud.writeSeedDialogueTimeline(
      mediaStore.runId,
      mediaStore.episodeId,
      lines,
      transcript.transcript,
    )
    mediaStore.seedAudioDialogueTimelinePath = timeline.timelinePath
    mediaStore.seedAudioSrtPath = timeline.srtPath
    mediaStore.voicePath = mediaStore.seedAudioTrackPath
    mediaStore.voiceDuration = mediaStore.seedAudioDuration
    toast.success('完整声音轨、Faster-Whisper 时间轴和 SRT 已生成')
  })
}

async function confirmProjectDirector() {
  await runAction('project-director-confirm', async () => {
    const draft = mediaStore.projectDirectorDraft
    if (!draft) throw new Error('请先生成项目总监方案')
    if (
      mediaStore.projectDirectorPlan &&
      !window.confirm('确认新方案会保留仍在清单中的资产，并清空后续分镜、媒体和成片，是否继续？')
    )
      return
    const previousState = JSON.parse(JSON.stringify(mediaStore.$state))
    const confirmed = confirmProjectDirectorDraft(draft, mediaStore.referenceAssets)
    try {
      captureUndo('project-director')
      const path = `wiki/项目总监/${mediaStore.episodeId}.md`
      const current = await window.electron.cloud
        .readMarkdown(mediaStore.runId, path)
        .catch(() => null)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        path,
        `---\nentityType: project-director\nentityId: ${mediaStore.episodeId}\nstatus: confirmed\nmanagedBy: short-video-factory\ngeneratedBySkill: jc-film-style\nsourceDocument: wiki/文稿/${mediaStore.episodeId}/确认文稿.md\n---\n\n${projectDirectorMarkdown(confirmed.plan, mediaStore.episodeId)}`,
        current?.revision,
      )
      const routePath = `wiki/项目总监/${mediaStore.episodeId}-制作路线.md`
      const currentRoute = await window.electron.cloud
        .readMarkdown(mediaStore.runId, routePath)
        .catch(() => null)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        routePath,
        `---\nentityType: production-route\nentityId: ${mediaStore.episodeId}\nstatus: confirmed\nmanagedBy: short-video-factory\nsourceDocument: wiki/项目总监/${mediaStore.episodeId}.md\n---\n\n${productionRouteMarkdown(confirmed.plan, mediaStore.audioProductionRoute, mediaStore.episodeId)}`,
        currentRoute?.revision,
      )
      await writeAssetDocuments(confirmed.assets)
      mediaStore.confirmProjectDirector(confirmed.plan, confirmed.assets)
      mediaStore.selectView('director')
      toast.success('项目总监方案已确认')
    } catch (error) {
      mediaStore.$patch(previousState)
      throw error
    }
  })
}

async function runAction(name: string, action: () => Promise<void>) {
  if (mediaStore.busyAction) return
  mediaStore.cancelRequested = false
  mediaStore.busyAction = name
  mediaStore.error = ''
  mediaStore.progressText = ''
  try {
    await action()
  } catch (error) {
    if (mediaStore.cancelRequested) return
    const message = (error instanceof Error ? error.message : String(error)).replace(
      /^Error invoking remote method '[^']+': Error:\s*/,
      '',
    )
    mediaStore.error = /system cpu overloaded|cpu.*threshold/i.test(message)
      ? '云端当前繁忙，本次内容尚未生成，请稍后重试。'
      : /云端请求失败\s*\(524\)|\b524\b/.test(message)
        ? '当前模型响应超时，内容尚未生成。请重试或切换其他文本模型。'
        : message
    toast.error(mediaStore.error)
  } finally {
    mediaStore.progressText = ''
    mediaStore.busyAction = ''
  }
}

function translationState() {
  if (!mediaStore.videoTranslation) mediaStore.videoTranslation = createVideoTranslationState()
  return mediaStore.videoTranslation
}

type TranslationStatusKey =
  | 'speakerStatus'
  | 'frameCalibrationStatus'
  | 'calibrationStatus'
  | 'translationStatus'
  | 'reviewStatus'
  | 'arrangementStatus'
  | 'voiceStatus'
  | 'separationStatus'
  | 'mixStatus'
  | 'finalStatus'

async function runTranslationStep(
  action: VideoTranslationAction,
  status: TranslationStatusKey,
  work: (state: NonNullable<typeof mediaStore.videoTranslation>) => Promise<void>,
) {
  await runAction(action, async () => {
    const state = translationState()
    state[status] = 'running'
    try {
      await work(state)
      state[status] = 'ready'
    } catch (error) {
      state[status] = mediaStore.cancelRequested ? 'stale' : 'failed'
      throw error
    }
  })
}

async function runTranslationAction(action: VideoTranslationAction) {
  if (!mediaStore.runId) {
    toast.warning('请先新建或打开项目，再上传视频')
    return
  }
  if (action === 'upload-video') return uploadTranslationVideo()
  if (action === 'upload-final-master') return uploadTranslationFinalMaster()
  if (action === 'get-subtitles') return getTranslationSubtitles()
  if (action === 'auto-group-dubbing') return autoGroupTranslationDubbing()
  if (action === 'identify-visual-people') return identifyVisualPeople()
  if (action === 'calibrate-subtitles') return calibrateTranslationSubtitles()
  if (action === 'translate-all-subtitles') return translateVideoSubtitles()
  if (action === 'open-voice-workspace') return openTranslationVoiceWorkspace()
  if (action === 'arrange-doubao-voice') return arrangeTranslationVoice()
  if (action === 'generate-target-voice') return generateTranslationVoice()
  if (action === 'timestamp-target-dialogue') return timestampTranslationDialogue()
  if (action === 'separate-source-audio') return separateTranslationAudio()
  if (action === 'mix-background-audio') return mixTranslationAudio()
  return burnTranslationVideo()
}

async function uploadTranslationVideo() {
  const current = translationState()
  if (current.sourceVideoPath && !window.confirm('更换视频会使本集翻译下游失效，是否继续？')) return
  await runAction('upload-video', async () => {
    const result = await window.electron.cloud.selectVideoTranslationSource(
      mediaStore.runId,
      mediaStore.episodeId,
    )
    if (!result) return
    const next = createVideoTranslationState()
    next.sourceLanguage = current.sourceLanguage
    next.targetLanguage = current.targetLanguage
    next.subtitleSourceMode = current.subtitleSourceMode || 'plain-video'
    next.sourceVideoPath = result.sourceVideoPath
    next.sourceFingerprint = result.sourceFingerprint
    next.durationMs = result.durationMs
    next.hasAudio = result.hasAudio
    mediaStore.videoTranslation = next
    mediaStore.seedAudioGlobalPrompt = ''
    mediaStore.seedAudioTrackPath = ''
    mediaStore.seedVoiceTab = 'roles'
    mediaStore.selectView('script')
    selectedTranslationCueId.value = ''
    toast.success('翻译原片已归档')
  })
}

async function getTranslationSubtitles() {
  const state = translationState()
  if (state.subtitleSourceMode === 'import-srt') return importTranslationSrt()
  if (state.subtitleSourceMode === 'subtitled-video') return ocrTranslationSubtitles()
  if (!state.hasAudio) {
    toast.warning('当前视频没有可识别音轨，请选择“导入 SRT”或“上传有字幕视频”。')
    return
  }
  return reverseTranslationVideo()
}

async function autoGroupTranslationDubbing() {
  await runAction('auto-group-dubbing', async () => {
    const state = translationState()
    state.cues = autoGroupVideoTranslationCues(
      state.cues,
      () => `dubbing-${crypto.randomUUID()}`,
    )
    mediaStore.invalidateTranslation('dubbing-group')
    const groupCount = videoTranslationDubbingGroups(state.cues).filter(
      (group) => group.cueIds.length > 1,
    ).length
    toast.success(groupCount ? `已关联 ${groupCount} 个配音分组` : '没有需要关联的连续同角色字幕')
  })
}

async function ocrTranslationSubtitles() {
  await runAction('get-subtitles', async () => {
    const state = translationState()
    if (!state.sourceVideoPath) throw new Error('请先上传视频')
    state.speakerStatus = 'running'
    try {
      const result = await window.electron.cloud.ocrVideoTranslationSubtitles({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        videoPath: state.sourceVideoPath,
        durationMs: state.durationMs,
      })
      state.cues = result.speakers.map((speaker) => ({
        cueId: speaker.cueId,
        startMs: speaker.startMs,
        endMs: speaker.endMs,
        recognizedText: speaker.recognizedText,
        sourceText: speaker.correctedText,
        subtitleSourceKind: 'video-ocr',
        translatedText: '',
        performanceDirection: speaker.performanceDirection,
        translationRoleId: speaker.proposedRoleId,
        proposedName: speaker.proposedName,
        confidence: speaker.confidence,
        evidence: speaker.evidence,
        needsReview: speaker.needsReview,
      }))
      Object.assign(state, invalidateVideoTranslation(state, 'source-dialogue'))
      state.speakerStatus = 'ready'
      state.frameCalibrationStatus = 'idle'
      state.calibrationStatus = 'idle'
      state.calibrationApplied = true
      selectedTranslationCueId.value = state.cues[0]?.cueId || ''
      mediaStore.selectView('script')
      await autoIdentifyVisualPeople(state)
      toast.success('字幕已获取')
    } catch (error) {
      state.speakerStatus = 'failed'
      throw error
    }
  })
}

async function importTranslationSrt() {
  await runAction('get-subtitles', async () => {
    const state = translationState()
    if (!state.sourceVideoPath) throw new Error('请先上传视频')
    state.speakerStatus = 'running'
    try {
      const result = await window.electron.cloud.importVideoTranslationSrt(
        mediaStore.runId,
        mediaStore.episodeId,
        state.durationMs,
      )
      if (!result) {
        state.speakerStatus = state.cues.length ? 'ready' : 'idle'
        return
      }
      state.cues = result.cues.map((cue) => ({
        cueId: cue.cueId,
        startMs: cue.startMs,
        endMs: cue.endMs,
        recognizedText: cue.text,
        sourceText: cue.text,
        subtitleSourceKind: 'imported-srt',
        subtitleSourcePath: result.srtPath,
        translatedText: '',
        needsReview: false,
      }))
      state.calibrationStatus = 'idle'
      state.frameCalibrationStatus = 'idle'
      state.speakerStatus = 'ready'
      state.calibrationApplied = true
      Object.assign(state, invalidateVideoTranslation(state, 'source-dialogue'))
      state.speakerStatus = 'ready'
      state.calibrationStatus = 'idle'
      state.frameCalibrationStatus = 'idle'
      selectedTranslationCueId.value = state.cues[0]?.cueId || ''
      await autoIdentifyVisualPeople(state)
      toast.success('字幕已获取')
    } catch (error) {
      state.speakerStatus = 'failed'
      throw error
    }
  })
}

async function uploadTranslationFinalMaster() {
  const state = translationState()
  if (!state.sourceVideoPath) throw new Error('请先上传视频')
  if (
    state.finalMasterVideoPath &&
    !window.confirm('更换无字幕成片母版会使分离、混音和成片失效，是否继续？')
  )
    return
  await runAction('upload-final-master', async () => {
    const result = await window.electron.cloud.selectVideoTranslationFinalMaster(
      mediaStore.runId,
      mediaStore.episodeId,
      state.sourceVideoPath!,
    )
    if (!result) return
    state.finalMasterVideoPath = result.finalMasterVideoPath
    state.finalMasterFingerprint = result.finalMasterFingerprint
    Object.assign(state, invalidateVideoTranslation(state, 'final-master-video'))
    toast.success('无字幕成片母版已归档，字幕和配音保持不变')
  })
}

async function reverseTranslationVideo() {
  await runAction('get-subtitles', async () => {
    const state = translationState()
    if (!state.sourceVideoPath) throw new Error('请先上传视频')
    state.speakerStatus = 'running'
    try {
      const result = await window.electron.cloud.identifyVideoTranslationSpeakers({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        videoPath: state.sourceVideoPath,
        durationMs: state.durationMs,
      })
      state.cues = result.speakers.map((speaker) => ({
        cueId: speaker.cueId,
        startMs: speaker.startMs,
        endMs: speaker.endMs,
        recognizedText: speaker.recognizedText,
        sourceText: speaker.correctedText,
        subtitleSourceKind: 'audio-asr',
        translatedText: '',
        performanceDirection: speaker.performanceDirection,
        translationRoleId: speaker.proposedRoleId,
        proposedName: speaker.proposedName,
        confidence: speaker.confidence,
        evidence: speaker.evidence,
        ocrText: speaker.ocrText,
        needsReview: speaker.needsReview,
        suspectedMissing: speaker.suspectedMissing,
        speakerCluster: speaker.speakerCluster,
        emotion: speaker.emotion,
        audioEvent: speaker.audioEvent,
      }))
      Object.assign(state, invalidateVideoTranslation(state, 'source-dialogue'))
      state.speakerStatus = 'ready'
      state.frameCalibrationStatus = 'idle'
      state.calibrationStatus = 'idle'
      state.calibrationApplied = false
      selectedTranslationCueId.value = state.cues[0]?.cueId || ''
      mediaStore.selectView('script')
      await autoIdentifyVisualPeople(state)
      toast.success('字幕已获取')
    } catch (error) {
      state.speakerStatus = 'failed'
      throw error
    }
  })
}

async function calibrateTranslationSubtitles() {
  await runTranslationStep('calibrate-subtitles', 'calibrationStatus', async (state) => {
    const result = await window.electron.cloud.calibrateVideoTranslationSubtitles({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      textModel: mediaStore.textModel,
      cues: state.cues.map((cue) => ({
        cueId: cue.cueId,
        text: cue.recognizedText || cue.sourceText,
        speakerCluster: cue.speakerCluster,
        emotion: cue.emotion,
      })),
    })
    const byId = new Map(result.subtitles.map((subtitle) => [subtitle.cueId, subtitle.text]))
    state.cues.forEach((cue) => {
      cue.calibrationSuggestion = byId.get(cue.cueId) || ''
      cue.calibrationBackupText = undefined
    })
    state.calibrationApplied = false
    toast.success('语义校准建议已生成，请对照后应用')
  })
}

async function identifyVisualPeople() {
  await runTranslationStep('identify-visual-people', 'frameCalibrationStatus', async (state) => {
    await recognizeVisualPeople(state)
    toast.success('人物已识别')
  })
}

async function autoIdentifyVisualPeople(state: NonNullable<typeof mediaStore.videoTranslation>) {
  if (!state.sourceVideoPath || !state.cues.length) return
  try {
    state.frameCalibrationStatus = 'running'
    await recognizeVisualPeople(state)
  } catch (error) {
    state.frameCalibrationStatus = 'failed'
    toast.warning(
      `字幕已获取，人物识别稍后可重试：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function runBatchByLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const failures: string[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      try {
        await worker(item)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
  })
  await Promise.all(workers)
  return { successCount: items.length - failures.length, failures }
}

async function recognizeVisualPeople(state: NonNullable<typeof mediaStore.videoTranslation>) {
  if (!state.sourceVideoPath) throw new Error('请先上传视频')
  const result = await window.electron.cloud.calibrateVideoTranslationFrames({
    runId: mediaStore.runId,
    episodeId: mediaStore.episodeId,
    videoPath: state.sourceVideoPath,
    textModel: mediaStore.textModel,
    cues: state.cues.map((cue) => ({
      cueId: cue.cueId,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.recognizedText || cue.sourceText,
    })),
  })
  const byId = new Map(result.subtitles.map((subtitle) => [subtitle.cueId, subtitle]))
  const visualRoleByPerson = new Map(
    result.persons.map((person) => {
      const scriptCharacter = matchScriptCharacterForVisualPerson(
        person.visualPersonId,
        result.subtitles,
        state,
      )
      if (scriptCharacter) {
        const role = ensureScriptCharacterRole(scriptCharacter)
        return [person.visualPersonId, role.translationRoleId] as const
      }
      const roleId = `visual-${mediaStore.episodeId}-${person.visualPersonId}`
      let role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === roleId)
      if (!role) {
        role = {
          translationRoleId: roleId,
          visualPersonId: person.visualPersonId,
          displayName: visualPersonLabel(person.visualPersonId),
          aliases: [],
          sourceEpisodeIds: [mediaStore.episodeId],
          status: 'confirmed',
        }
        mediaStore.videoTranslationRoles.push(role)
      }
      return [person.visualPersonId, role.translationRoleId] as const
    }),
  )
  state.cues.forEach((cue) => {
    const suggestion = byId.get(cue.cueId)
    cue.framePath = suggestion?.framePath
    cue.visiblePersonIds = suggestion?.visiblePersonIds
    cue.translationRoleId =
      suggestion?.visiblePersonIds?.length === 1
        ? visualRoleByPerson.get(suggestion.visiblePersonIds[0])
        : undefined
  })
  state.frameCalibrationStatus = 'ready'
}

function visualPersonLabel(personId: string) {
  return `画面人物 ${Number(personId.match(/\d+$/)?.[0] || 0)}`
}

function ensureScriptCharacterRole(character: ScriptCharacter) {
  const roleId = `script-role-${character.scriptCharacterId}`
  let role = mediaStore.videoTranslationRoles.find(
    (item) => item.scriptCharacterId === character.scriptCharacterId || item.translationRoleId === roleId,
  )
  if (!role) {
    role = {
      translationRoleId: roleId,
      scriptCharacterId: character.scriptCharacterId,
      displayName: character.displayName,
      aliases: [...character.aliases],
      description: character.description,
      sourceEpisodeIds: [mediaStore.episodeId],
      status: 'confirmed',
    }
    mediaStore.videoTranslationRoles.push(role)
  } else {
    role.scriptCharacterId = character.scriptCharacterId
    role.displayName = character.displayName
    role.aliases = [...new Set([...role.aliases, ...character.aliases])]
    role.description = character.description || role.description
  }
  return role
}

function syncScriptCharacterRoles() {
  scriptCharacterOptions(mediaStore.scriptCharacters).forEach(ensureScriptCharacterRole)
}

function matchScriptCharacterForVisualPerson(
  visualPersonId: string,
  subtitles: Array<{ cueId: string; visiblePersonIds?: string[] }>,
  state: NonNullable<typeof mediaStore.videoTranslation>,
) {
  const cueIds = new Set(
    subtitles
      .filter((subtitle) =>
        subtitle.visiblePersonIds?.length === 1 && subtitle.visiblePersonIds[0] === visualPersonId,
      )
      .map((subtitle) => subtitle.cueId),
  )
  const text = state.cues
    .filter((cue) => cueIds.has(cue.cueId))
    .flatMap((cue) => [cue.sourceText, cue.recognizedText, cue.proposedName || ''])
    .join('\n')
    .replace(/\s+/g, '')
    .toLowerCase()
  const matches = mediaStore.scriptCharacters.filter((character) =>
    [character.displayName, ...character.aliases]
      .map((name) => name.trim().replace(/\s+/g, '').toLowerCase())
      .filter(Boolean)
      .some((name) => text.includes(name)),
  )
  return matches.length === 1 ? matches[0] : undefined
}

async function extractTranslationScriptCharacters(pastedText = '') {
  await runAction('extract-script-characters', async () => {
    const document = pastedText.trim()
      ? {
          path: `.raw/视频翻译/${mediaStore.episodeId}/剧本角色/粘贴文本.txt`,
          originalName: '粘贴文本',
          content: pastedText.trim(),
        }
      : await window.electron.cloud.selectVideoTranslationScriptDocument(
          mediaStore.runId,
          mediaStore.episodeId,
        )
    if (!document) return
    const result = await window.electron.cloud.extractVideoTranslationScriptCharacters({
        episodeId: mediaStore.episodeId,
        originalName: document.originalName,
        content: document.content.slice(0, 300_000),
        runId: mediaStore.runId,
        textModel: mediaStore.textModel,
      })
    const drafts = (Array.isArray(result?.characters) ? result.characters : []).map(
      (item: any): ScriptCharacterDraft => ({
        displayName: String(item?.displayName || '').trim(),
        aliases: Array.isArray(item?.aliases) ? item.aliases.map(String) : [],
        description: String(item?.description || '').trim(),
        evidence: String(item?.evidence || '').trim(),
      }),
    )
    if (!drafts.length) throw new Error('没有从文档中提取到可绑定角色')
    mediaStore.scriptCharacters = mergeScriptCharacters(
      mediaStore.scriptCharacters,
      drafts,
      document.path,
    )
    syncScriptCharacterRoles()
    autoBindScriptCharactersToRoles()
    await writeScriptCharactersWiki(document.originalName)
    toast.success(`已提取 ${drafts.length} 个剧本角色`)
  })
}

function autoBindScriptCharactersToRoles() {
  const state = translationState()
  mediaStore.videoTranslationRoles = mediaStore.videoTranslationRoles.map((role) => {
    if (role.scriptCharacterId) return role
    const matched = matchScriptCharacterForRole(role, mediaStore.scriptCharacters, state.cues)
    return matched ? bindTranslationRoleToScriptCharacter(role, matched) : role
  })
}

async function writeScriptCharactersWiki(sourceName: string) {
  const path = 'wiki/翻译/剧本角色.md'
  const current = await window.electron.cloud.readMarkdown(mediaStore.runId, path).catch(() => null)
  const rows = scriptCharacterOptions(mediaStore.scriptCharacters).map(
    (character) =>
      `- ${character.displayName}${character.aliases.length ? `（别名：${character.aliases.join('、')}）` : ''}：${character.description || '暂无明确身份'}${character.evidence ? `；证据：${character.evidence}` : ''}`,
  )
  await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    path,
    `# 剧本角色\n\n来源：${sourceName}\n\n${rows.join('\n') || '- 暂无'}\n`,
    current?.revision,
  )
}

async function translateVideoSubtitles() {
  await runAction('translate-all-subtitles', async () => {
    const state = translationState()
    const previousStatus = state.translationStatus
    const dubbingGroupByCue = new Map(
      state.cues.map((cue) => [cue.cueId, cue.dubbingGroupId] as const),
    )
    state.translationStatus = 'running'
    try {
      const roleById = new Map(
        mediaStore.videoTranslationRoles.map((role) => [role.translationRoleId, role.displayName]),
      )
      const result = await window.electron.cloud.translateVideoSubtitles({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        textModel: mediaStore.textModel,
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        subtitles: state.cues.map((cue) => ({
          cueId: cue.cueId,
          startMs: cue.startMs,
          endMs: cue.endMs,
          translationRoleId: cue.translationRoleId || '',
          roleName: cue.translationRoleId
            ? roleById.get(cue.translationRoleId) || ''
            : cue.proposedName || cue.speakerCluster || '',
          performanceDirection: cue.performanceDirection || '',
          text: cue.sourceText,
        })),
      })
      const byId = new Map(result.subtitles.map((subtitle) => [subtitle.cueId, subtitle.text]))
      const next = invalidateVideoTranslation(state, 'translation')
      next.cues.forEach((cue) => {
        cue.translatedText = byId.get(cue.cueId) || ''
        cue.dubbingGroupId = dubbingGroupByCue.get(cue.cueId)
      })
      next.translationStatus = 'ready'
      Object.assign(state, next)
      toast.success('目标语言字幕已生成，请人工校对')
    } catch (error) {
      state.translationStatus = previousStatus
      throw error
    }
  })
}

async function confirmTranslationDialogue() {
  await runTranslationStep('open-voice-workspace', 'reviewStatus', async (state) => {
    const used = new Set(state.cues.map((cue) => cue.translationRoleId))
    const roles = mediaStore.videoTranslationRoles.map((role) => ({
      ...role,
      aliases: [...role.aliases],
      sourceEpisodeIds: used.has(role.translationRoleId)
        ? [...new Set([...role.sourceEpisodeIds, mediaStore.episodeId])]
        : [...role.sourceEpisodeIds],
    }))
    const frozen = await window.electron.cloud.confirmVideoTranslation(
      mediaStore.runId,
      mediaStore.episodeId,
      state.sourceFingerprint || '',
      state.sourceLanguage,
      state.targetLanguage,
      JSON.parse(JSON.stringify(state.cues)),
      JSON.parse(JSON.stringify(roles)),
      state.durationMs,
    )
    state.finalScriptId = frozen.finalScriptId
    state.scriptHash = frozen.scriptHash
    state.finalScriptMarkdown = frozen.markdown
    mediaStore.videoTranslationRoles = roles
    toast.success('翻译剧本已保存')
  })
}

async function openTranslationVoiceWorkspace() {
  await confirmTranslationDialogue()
  const state = translationState()
  if (state.reviewStatus !== 'ready') return
  await loadTranslationVoiceVersions()
  mediaStore.seedVoiceTab = 'roles'
  mediaStore.selectedAssetId = state.cues.find((cue) => cue.translationRoleId)?.translationRoleId
  mediaStore.selectView('seed-voice')
}

function openTranslationSubtitleWorkspace() {
  const state = translationState()
  if (!translationFinalWorkspaceReady.value) throw new Error('请先选择完整的人工试听配音版本')
  mediaStore.seedAudioTrackPath = activeTranslationVoiceVersion(state)?.previewPath || ''
  mediaStore.selectView('dubbing')
}

function selectTranslationWorkspace(view: WorkspaceView) {
  if (!['script', 'seed-voice', 'dubbing'].includes(view)) return
  if (view === 'dubbing') return openTranslationSubtitleWorkspace()
  if (view === 'seed-voice') {
    const state = translationState()
    void loadTranslationVoiceVersions()
    const speakingRoleIds = new Set(state.cues.map((cue) => cue.translationRoleId).filter(Boolean))
    if (!speakingRoleIds.has(mediaStore.selectedAssetId))
      mediaStore.selectedAssetId = state.cues.find(
        (cue) => cue.translationRoleId,
      )?.translationRoleId
  }
  mediaStore.selectView(view)
}

function activeTranslationVoiceVersion(state: NonNullable<typeof mediaStore.videoTranslation>) {
  return state.voiceVersions.find((version) => version.versionId === state.activeVoiceVersionId)
}

function applyTranslationVoiceVersion(
  state: NonNullable<typeof mediaStore.videoTranslation>,
  version: VideoTranslationVoiceVersion,
) {
  const changed = Boolean(
    state.activeVoiceVersionId && state.activeVoiceVersionId !== version.versionId,
  )
  state.activeVoiceVersionId = version.versionId
  state.targetVoicePath = undefined
  state.dubDialogueTimestampPath = undefined
  state.dubDialogueTimestampHash = undefined
  state.voiceStatus = 'ready'
  mediaStore.seedAudioTrackPath = version.previewPath
  if (!changed) return
  if (state.mixStatus === 'ready') state.mixStatus = 'stale'
  if (state.finalStatus === 'ready') state.finalStatus = 'stale'
  state.mixedPath = undefined
  state.finalVideoPath = undefined
}

async function loadTranslationVoiceVersions() {
  if (!mediaStore.runId || !mediaStore.videoTranslation) return
  const state = mediaStore.videoTranslation
  const versions = await window.electron.cloud.listVideoTranslationVoiceVersions(
    mediaStore.runId,
    mediaStore.episodeId,
    state.targetLanguage,
  )
  state.voiceVersions = versions
  const active = versions.find((version) => version.versionId === state.activeVoiceVersionId)
  if (active) applyTranslationVoiceVersion(state, active)
  else mediaStore.seedAudioTrackPath = ''
}

function selectTranslationVoiceVersion(versionId: string) {
  const state = translationState()
  const version = state.voiceVersions.find((item) => item.versionId === versionId)
  if (version) applyTranslationVoiceVersion(state, version)
}

function translationRole(speakerId: string) {
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === speakerId)
  if (!role) throw new Error('没有找到翻译角色')
  return role
}

function speakingTranslationRoles() {
  const ids = new Set(
    translationState()
      .cues.map((cue) => cue.translationRoleId)
      .filter(Boolean),
  )
  return mediaStore.videoTranslationRoles.filter((role) => ids.has(role.translationRoleId))
}

async function deleteTranslationRole(speakerId: string) {
  await runAction('delete-translation-role', async () => {
    const role = translationRole(speakerId)
    const remaining = JSON.parse(
      JSON.stringify(
        mediaStore.videoTranslationRoles.filter((item) => item.translationRoleId !== speakerId),
      ),
    ) as TranslationRole[]
    await window.electron.cloud.deleteVideoTranslationRole(
      mediaStore.runId,
      mediaStore.episodeId,
      speakerId,
      remaining,
    )
    translationState().cues.forEach((cue) => {
      if (cue.translationRoleId !== speakerId) return
      cue.translationRoleId = undefined
      cue.needsReview = true
    })
    mediaStore.videoTranslationRoles = remaining
    delete mediaStore.seedAudioRolePrompts[speakerId]
    if (mediaStore.selectedAssetId === speakerId)
      mediaStore.selectedAssetId = remaining[0]?.translationRoleId
    mediaStore.invalidateTranslation('role-binding')
    toast.success(`已删除角色 ${role.displayName}`)
  })
}

function translationVoiceLanguage() {
  return translationState().targetLanguage
}

function invalidateTranslationSeedPrompt() {
  const state = translationState()
  state.seedPromptPath = undefined
  state.seedPromptText = undefined
  state.seedPromptGeneratedBySkill = false
  mediaStore.seedAudioArrangementPath = ''
  mediaStore.seedAudioGlobalPrompt = ''
  mediaStore.invalidateTranslation('voice-prompt')
}

function editTranslationSeedRolePrompt(speakerId: string, prompt: string) {
  mediaStore.seedAudioRolePrompts[speakerId] = prompt
  const role = translationRole(speakerId)
  role.voiceIdentityText = prompt
  role.voiceConfirmedAt = undefined
  invalidateTranslationSeedPrompt()
}

function editTranslationSeedGlobalPrompt(prompt: string) {
  const state = translationState()
  const next = invalidateVideoTranslation(state, 'voice-prompt')
  next.seedPromptText = prompt
  mediaStore.videoTranslation = next
  mediaStore.seedAudioGlobalPrompt = prompt
}

async function saveTranslationSeedRolePrompt(speakerId: string, prompt: string) {
  const role = translationRole(speakerId)
  mediaStore.seedAudioRolePrompts[speakerId] = prompt
  role.voiceIdentityText = prompt
  role.voiceConfirmedAt = undefined
  const promptPath = `wiki/翻译/声音/${speakerId}-音色提示词.md`
  const current = await window.electron.cloud
    .readMarkdown(mediaStore.runId, promptPath)
    .catch(() => null)
  await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    promptPath,
    `---\nentityType: seed-voice-prompt\ntranslationRoleId: ${speakerId}\nlanguage: ${translationVoiceLanguage()}\nstatus: ready\n---\n\n# ${role.displayName} 音色提示词\n\n${prompt}\n`,
    current?.revision,
  )
  invalidateTranslationSeedPrompt()
}

async function generateTranslationSeedRolePromptCore(speakerId: string) {
  const state = translationState()
  const role = translationRole(speakerId)
  const roleLines = state.cues
    .filter((cue) => cue.translationRoleId === speakerId)
    .map((cue) => cue.translatedText.trim())
    .filter(Boolean)
  const approvedScript = roleLines.join('\n')
  const sample =
    approvedScript ||
    (translationVoiceLanguage() === 'en'
      ? 'Everything is ready. Let us begin when you are prepared.'
      : '今天的安排已经确认了，准备好以后我们就开始。')
  const prompt = buildVideoTranslationSeedRolePrompt({
    role,
    cues: state.cues,
    language: translationVoiceLanguage(),
    fallbackLine: sample,
  })
  if (!prompt) throw new Error('角色音色提示词为空')
  await saveTranslationSeedRolePrompt(speakerId, prompt)
}

async function generateTranslationSeedRolePrompt(speakerId: string) {
  await runAction('generate-seed-role-prompt', async () => {
    await generateTranslationSeedRolePromptCore(speakerId)
    toast.success(`${translationRole(speakerId).displayName} 角色提示词已生成`)
  })
}

async function generateAllTranslationSeedRolePrompts(selectedIds: string[] = []) {
  await runAction('generate-seed-role-prompts', async () => {
    const selected = new Set(selectedIds)
    const targets = speakingTranslationRoles().filter(
      (role) =>
        (selected.size
          ? selected.has(role.translationRoleId)
          : !mediaStore.seedAudioRolePrompts[role.translationRoleId]?.trim()),
    )
    const result = await runBatchByLimit(targets, 4, (role) =>
      generateTranslationSeedRolePromptCore(role.translationRoleId),
    )
    if (result.failures.length)
      throw new Error(
        `已生成 ${result.successCount} 个角色提示词，${result.failures.length} 个失败：${result.failures[0]}`,
      )
    toast.success(targets.length ? `已生成 ${targets.length} 个角色提示词` : '角色提示词已齐全')
  })
}

async function registerTranslationSeedReference(
  speakerId: string,
  sourceAudioPath: string,
  displayName: string,
) {
  const role = translationRole(speakerId)
  const profile = await window.electron.cloud.registerSeedVoiceProfile({
    projectId: mediaStore.runId,
    episodeId: mediaStore.episodeId,
    speakerId,
    displayName,
    sourceAudioPath,
    voiceDesignPrompt: mediaStore.seedAudioRolePrompts[speakerId]?.trim() || '',
    language: translationVoiceLanguage(),
    workflow: 'video-translation',
  })
  role.voiceProfileId = profile.voiceProfileId
  role.voiceLanguage = translationVoiceLanguage()
  role.voiceConfirmedAt = undefined
  mediaStore.invalidateTranslation('voice-binding')
  mediaStore.seedAudioVoicePath = profile.referenceAudioPath
  return profile
}

async function confirmTranslationSeedVoice(speakerId: string) {
  await runAction('confirm-seed-voice', async () => {
    const role = translationRole(speakerId)
    const identity = mediaStore.seedAudioRolePrompts[speakerId]?.trim()
    if (!identity) throw new Error(`请先确认 ${role.displayName} 的角色声音身份`)
    if (!role.voiceProfileId) throw new Error(`请先为 ${role.displayName} 选择参考音`)
    const confirmedRole = JSON.parse(
      JSON.stringify({
        ...role,
        voiceIdentityText: identity,
        voiceLanguage: translationVoiceLanguage(),
        voiceConfirmedAt: new Date().toISOString(),
      }),
    )
    await window.electron.cloud.bindVideoTranslationVoice(mediaStore.runId, confirmedRole)
    Object.assign(role, confirmedRole)
    invalidateTranslationSeedPrompt()
    toast.success(`${role.displayName} 的角色声音已确认`)
  })
}

async function unconfirmTranslationSeedVoice(speakerId: string) {
  await runAction('unconfirm-seed-voice', async () => {
    const role = translationRole(speakerId)
    role.voiceConfirmedAt = undefined
    const voicePath = `wiki/翻译/声音/${speakerId}.md`
    const current = await window.electron.cloud
      .readMarkdown(mediaStore.runId, voicePath)
      .catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      voicePath,
      `---\ntranslationRoleId: ${speakerId}\nvoiceProfileId: ${role.voiceProfileId || ''}${role.voiceLanguage ? `\nvoiceLanguage: ${role.voiceLanguage}` : ''}\nstatus: ready\n---\n\n# ${role.displayName}的角色声音\n\n${role.voiceIdentityText?.trim() || ''}\n`,
      current?.revision,
    )
    invalidateTranslationSeedPrompt()
    toast.success(`${role.displayName} 已取消确认，可重新生成或更换参考音`)
  })
}

async function generateTranslationSeedReferenceCore(speakerId: string) {
  const role = translationRole(speakerId)
  const prompt = mediaStore.seedAudioRolePrompts[speakerId]?.trim()
  if (!prompt) throw new Error(`请先生成 ${role.displayName} 的角色提示词`)
  const audio = await window.electron.cloud.generateSeedAudio({
    runId: mediaStore.runId,
    episodeId: mediaStore.episodeId,
    workflow: 'video-translation',
    targetLanguage: translationState().targetLanguage,
    mode: 'voice-profile',
    durationMs: 10000,
    prompt,
    language: translationVoiceLanguage(),
    outputName: `voice-${speakerId}-${Date.now()}`,
  })
  await registerTranslationSeedReference(speakerId, audio.path, `${role.displayName} Seed 音色`)
}

async function generateAllTranslationSeedReferences(selectedIds: string[] = []) {
  await runAction('generate-seed-references', async () => {
    const language = translationVoiceLanguage()
    const selected = new Set(selectedIds)
    const targets = speakingTranslationRoles().filter(
      (role) =>
        selected.size
          ? selected.has(role.translationRoleId)
          : !role.voiceProfileId ||
            !videoTranslationRoleVoiceLanguageMatches(role, language),
    )
    const result = await runBatchByLimit(targets, 1, (role) =>
      generateTranslationSeedReferenceCore(role.translationRoleId),
    )
    if (result.failures.length)
      throw new Error(
        `已生成并绑定 ${result.successCount} 个参考音，${result.failures.length} 个失败：${result.failures[0]}`,
      )
    toast.success(targets.length ? `已生成并绑定 ${targets.length} 个参考音` : '角色参考音已齐全')
  })
}

async function generateTranslationSeedReference(speakerId: string) {
  await runAction('generate-seed-reference', async () => {
    await generateTranslationSeedReferenceCore(speakerId)
    toast.success(`${translationRole(speakerId).displayName} 参考音已生成并绑定`)
  })
}

async function uploadTranslationSeedReference(speakerId: string) {
  await runAction('upload-seed-reference', async () => {
    const selected = await window.electron.cloud.selectSeedReferenceAudio(
      mediaStore.runId,
      mediaStore.episodeId,
      speakerId,
      'video-translation',
    )
    if (!selected) return
    const role = translationRole(speakerId)
    await registerTranslationSeedReference(
      speakerId,
      selected.path,
      `${role.displayName} · ${selected.displayName}`,
    )
    toast.success(`${role.displayName} 参考音已上传并设为当前参考音`)
  })
}

async function currentTranslationSeedPlan() {
  const state = translationState()
  const roleIds = new Set(
    state.cues.map((cue) => cue.translationRoleId).filter(Boolean) as string[],
  )
  const roles = mediaStore.videoTranslationRoles.filter((role) =>
    roleIds.has(role.translationRoleId),
  )
  const resolvedReferences = await window.electron.cloud.resolveSeedVoiceProfiles(
    roles.map((role) => ({
      speakerId: role.translationRoleId,
      voiceProfileId: role.voiceProfileId || '',
    })),
  )
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const references = resolvedReferences.map((reference) => ({
    ...reference,
    label: roleById.get(reference.speakerId)?.displayName || reference.speakerId,
    voiceDesignPrompt:
      mediaStore.seedAudioRolePrompts[reference.speakerId]?.trim() ||
      reference.voiceDesignPrompt ||
      '',
  }))
  return planVideoTranslationDialogueBlocks(
    mediaStore.episodeId,
    state.durationMs,
    state.targetLanguage,
    state.cues,
    roles,
    references,
    state.finalScriptId || '',
    state.scriptHash || '',
  )
}

function invalidateTranslationGroupedVoice(state: NonNullable<typeof mediaStore.videoTranslation>) {
  const active = activeTranslationVoiceVersion(state)
  state.groupedVoicePrompts = undefined
  if (active?.route !== 'grouped') return
  state.activeVoiceVersionId = undefined
  state.targetVoicePath = undefined
  state.dubDialogueTimestampPath = undefined
  state.dubDialogueTimestampHash = undefined
  state.voiceStatus = 'stale'
  if (state.mixStatus === 'ready') state.mixStatus = 'stale'
  if (state.finalStatus === 'ready') state.finalStatus = 'stale'
}

function editTranslationGroupedPrompt(groupId: string, prompt: string) {
  const state = translationState()
  state.groupedVoicePrompts = { ...(state.groupedVoicePrompts || {}), [groupId]: prompt }
  const active = activeTranslationVoiceVersion(state)
  if (active?.route !== 'grouped') return
  state.activeVoiceVersionId = undefined
  state.targetVoicePath = undefined
  state.dubDialogueTimestampPath = undefined
  state.dubDialogueTimestampHash = undefined
  if (state.mixStatus === 'ready') state.mixStatus = 'stale'
  if (state.finalStatus === 'ready') state.finalStatus = 'stale'
}

async function saveTranslationSeedGlobalPrompt(prompt: string) {
  if (!prompt) throw new Error('全局配音提示词不能为空')
  const state = translationState()
  const plan = await currentTranslationSeedPlan()
  const saved = await window.electron.cloud.writeVideoTranslationSeedPlan(
    mediaStore.runId,
    mediaStore.episodeId,
    state.targetLanguage,
    plan.arrangement,
    prompt,
  )
  const next = invalidateVideoTranslation(state, 'voice-prompt')
  next.arrangementStatus = state.arrangementStatus
  next.seedArrangementPath = saved.arrangementPath
  next.seedPromptPath = saved.promptPath
  next.seedPromptText = prompt
  next.seedPromptGeneratedBySkill = true
  mediaStore.videoTranslation = next
  mediaStore.seedAudioArrangementPath = saved.arrangementPath
  mediaStore.seedAudioGlobalPrompt = prompt
}

async function generateAndSaveTranslationGlobalPrompt(
  state: NonNullable<typeof mediaStore.videoTranslation>,
) {
  const plan = await currentTranslationSeedPlan()
  const prompt = await generateTranslationSeedPrompt(state, plan)
  const saved = await window.electron.cloud.writeVideoTranslationSeedPlan(
    mediaStore.runId,
    mediaStore.episodeId,
    state.targetLanguage,
    plan.arrangement,
    prompt,
  )
  state.seedArrangementPath = saved.arrangementPath
  state.seedPromptPath = saved.promptPath
  state.seedPromptText = prompt
  state.seedPromptGeneratedBySkill = true
  state.arrangementStatus = 'ready'
  mediaStore.seedAudioArrangementPath = saved.arrangementPath
  mediaStore.seedAudioGlobalPrompt = prompt
  invalidateTranslationGroupedVoice(state)
  return { plan, prompt }
}

async function generateTranslationSeedPrompt(
  state: NonNullable<typeof mediaStore.videoTranslation>,
  plan: ReturnType<typeof planVideoTranslationDialogueBlocks>,
) {
  const roleById = new Map(
    mediaStore.videoTranslationRoles.map((role) => [role.translationRoleId, role]),
  )
  const sections = new Array<string>(plan.arrangement.blocks.length)
  if (!state.finalScriptId || !state.scriptHash) throw new Error('最终时间戳剧本尚未冻结')
  let completed = 0
  const failures: string[] = []
  let cursor = 0
  mediaStore.progressText = `正在生成全局声音基底 0/${plan.arrangement.blocks.length}（3 个并发）`
  const generateBlockPrompt = async (
    block: (typeof plan.arrangement.blocks)[number],
    blockIndex: number,
  ) => {
    const references = block.references.map((reference, index) => ({
      translationRoleId: reference.speakerId,
      roleName:
        reference.label || roleById.get(reference.speakerId)?.displayName || reference.speakerId,
      voiceProfileId: reference.voiceProfileId,
      voiceIdentityText: compactVideoTranslationVoiceIdentity(
        roleById.get(reference.speakerId)?.voiceIdentityText ||
          reference.voiceDesignPrompt ||
          '',
      ),
      referenceIndex: index + 1,
    }))
    const skillInput = {
      finalScript: {
        finalScriptId: state.finalScriptId,
        scriptHash: state.scriptHash,
        targetLanguage: state.targetLanguage,
        cues: state.cues.map((cue) => ({
          cueId: cue.cueId,
          translationRoleId: cue.translationRoleId,
          roleName: roleById.get(cue.translationRoleId || '')?.displayName || '',
          startMs: cue.startMs,
          endMs: cue.endMs,
          performanceDirection: cue.performanceDirection || '',
          translatedText: cue.translatedText,
        })),
      },
      currentCueIds: block.cueIds,
      references,
    }
    let prompt = ''
    let correction = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await window.electron.cloud.runSkill(
        'jc-luyinpeng',
        JSON.stringify({
          ...skillInput,
          ...(correction
            ? { correction: `上次输出未通过产品校验：${correction}。请只重写合格的最终提示词。` }
            : {}),
        }),
        mediaStore.runId,
        mediaStore.textModel,
      )
      prompt = String(result?.text_prompt || '').trim()
      try {
        if (!prompt) throw new Error(`${block.blockId} 的全局配音提示词为空`)
        validateVideoTranslationDialoguePrompt(prompt, block)
        correction = ''
        break
      } catch (error) {
        correction = error instanceof Error ? error.message : String(error)
      }
    }
    if (correction) throw new Error(correction)
    sections[blockIndex] = `## ${block.blockId}\n\n${prompt}`
    completed += 1
    mediaStore.progressText = `全局声音基底已完成 ${completed}/${plan.arrangement.blocks.length}`
  }
  await Promise.all(
    Array.from({ length: Math.min(3, plan.arrangement.blocks.length) }, async () => {
      while (cursor < plan.arrangement.blocks.length) {
        const blockIndex = cursor++
        const block = plan.arrangement.blocks[blockIndex]
        try {
          await generateBlockPrompt(block, blockIndex)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${block.blockId}：${message}`)
          mediaStore.progressText = `全局声音基底已完成 ${completed}/${plan.arrangement.blocks.length}，失败 ${failures.length} 个`
        }
      }
    }),
  )
  if (failures.length)
    throw new Error(
      `已生成 ${completed}/${plan.arrangement.blocks.length} 个全局声音基底，失败 ${failures.length} 个：${failures[0]}`,
    )
  return ['# 全局配音提示词', '', ...sections].join('\n\n').trim()
}

async function generateTranslationGroupedPrompts(
  state: NonNullable<typeof mediaStore.videoTranslation>,
  globalPlan: ReturnType<typeof planVideoTranslationDialogueBlocks>,
  globalPrompt: string,
  existingPrompts: Record<string, string> = {},
) {
  const roleById = new Map(
    mediaStore.videoTranslationRoles.map((role) => [role.translationRoleId, role]),
  )
  const base = planVideoTranslationGroupedDialogueBlocks(
    globalPrompt,
    globalPlan.arrangement,
    state.cues,
    mediaStore.videoTranslationRoles,
    globalPlan.arrangement.blocks.flatMap((block) => block.references),
  )
  const prompts: Record<string, string> = { ...existingPrompts }
  if (!state.finalScriptId || !state.scriptHash) throw new Error('最终时间戳剧本尚未冻结')
  let prunedInvalidPrompt = false
  for (const block of base.arrangement.blocks) {
    const prompt = prompts[block.blockId]?.trim()
    if (!prompt) continue
    try {
      validateVideoTranslationGroupedPrompt(prompt, block)
    } catch {
      delete prompts[block.blockId]
      prunedInvalidPrompt = true
    }
  }
  if (prunedInvalidPrompt) state.groupedVoicePrompts = { ...prompts }
  const targets = base.arrangement.blocks.filter((block) => !prompts[block.blockId]?.trim())
  let completed = base.arrangement.blocks.length - targets.length
  const failures: string[] = []
  if (targets.length)
    mediaStore.progressText = `正在生成分组提示词 ${completed}/${base.arrangement.blocks.length}（3 个并发）`
  let cursor = 0
  const generateBlockPrompt = async (block: (typeof base.arrangement.blocks)[number]) => {
    const references = block.references.map((reference, index) => ({
      translationRoleId: reference.speakerId,
      roleName:
        reference.label || roleById.get(reference.speakerId)?.displayName || reference.speakerId,
      voiceProfileId: reference.voiceProfileId,
      voiceIdentityText: compactVideoTranslationVoiceIdentity(
        roleById.get(reference.speakerId)?.voiceIdentityText ||
          reference.voiceDesignPrompt ||
          '',
      ),
      referenceIndex: index + 1,
    }))
    const skillInput = {
      finalScript: {
        finalScriptId: state.finalScriptId,
        scriptHash: state.scriptHash,
        targetLanguage: state.targetLanguage,
        cues: state.cues.map((cue) => ({
          cueId: cue.cueId,
          translationRoleId: cue.translationRoleId,
          roleName: roleById.get(cue.translationRoleId || '')?.displayName || '',
          startMs: cue.startMs,
          endMs: cue.endMs,
          performanceDirection: cue.performanceDirection || '',
          translatedText: cue.translatedText,
        })),
      },
      currentCueIds: block.cueIds,
      references,
      globalVoicePrompt: globalPrompt,
    }
    let prompt = ''
    let correction = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await window.electron.cloud.runSkill(
        'jc-luyinpeng',
        JSON.stringify({
          ...skillInput,
          ...(correction
            ? { correction: `上次输出未通过产品校验：${correction}。请基于全局配音提示词，只重写当前分组的合格最终提示词。` }
            : {}),
        }),
        mediaStore.runId,
        mediaStore.textModel,
      )
      prompt = String(result?.text_prompt || '').trim()
      try {
        if (!prompt) throw new Error(`${block.blockId} 的分组克隆提示词为空`)
        validateVideoTranslationGroupedPrompt(prompt, block)
        correction = ''
        break
      } catch (error) {
        correction = error instanceof Error ? error.message : String(error)
      }
    }
    if (correction) throw new Error(correction)
    prompts[block.blockId] = prompt
    state.groupedVoicePrompts = { ...(state.groupedVoicePrompts || {}), [block.blockId]: prompt }
    completed += 1
    mediaStore.progressText = `分组提示词已完成 ${completed}/${base.arrangement.blocks.length}`
  }
  await Promise.all(
    Array.from({ length: Math.min(3, targets.length) }, async () => {
      while (cursor < targets.length) {
        const block = targets[cursor++]
        try {
          await generateBlockPrompt(block)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${block.blockId}：${message}`)
          mediaStore.progressText = `分组提示词已完成 ${completed}/${base.arrangement.blocks.length}，失败 ${failures.length} 个`
        }
      }
    }),
  )
  if (failures.length)
    throw new Error(
      `已生成 ${completed}/${base.arrangement.blocks.length} 个分组提示词，失败 ${failures.length} 个：${failures[0]}`,
    )
  return planVideoTranslationGroupedDialogueBlocks(
    globalPrompt,
    globalPlan.arrangement,
    state.cues,
    mediaStore.videoTranslationRoles,
    globalPlan.arrangement.blocks.flatMap((block) => block.references),
    prompts,
  )
}

async function arrangeTranslationVoice() {
  await runTranslationStep('arrange-doubao-voice', 'arrangementStatus', async (state) => {
    const { plan } = await generateAndSaveTranslationGlobalPrompt(state)
    toast.success(`全局配音提示词已生成，共 ${plan.arrangement.blocks.length} 段`)
  })
}

async function generateTranslationVoice() {
  await runTranslationStep('generate-target-voice', 'voiceStatus', async (state) => {
    const plan = await currentTranslationSeedPlan()
    const saved = await window.electron.cloud.writeVideoTranslationSeedPlan(
      mediaStore.runId,
      mediaStore.episodeId,
      state.targetLanguage,
      plan.arrangement,
      mediaStore.seedAudioGlobalPrompt || state.seedPromptText || '',
    )
    state.seedArrangementPath = saved.arrangementPath
    state.seedPromptPath = saved.promptPath
    state.seedPromptText = mediaStore.seedAudioGlobalPrompt || state.seedPromptText
    const version = await window.electron.cloud.generateVideoTranslationTargetVoice(
      mediaStore.runId,
      mediaStore.episodeId,
      state.targetLanguage,
    )
    state.voiceVersions = [
      ...state.voiceVersions.filter((item) => item.versionId !== version.versionId),
      version,
    ]
    applyTranslationVoiceVersion(state, version)
    mediaStore.seedAudioArrangementPath = saved.arrangementPath
    toast.success('新的全局配音版本已生成并设为当前使用版本')
  })
}

async function generateTranslationGroupedVoice(regenerateBlockIds: string[] = []) {
  await runAction('generate-grouped-voice', async () => {
    const state = translationState()
    let globalPlan = await currentTranslationSeedPlan()
    let globalPrompt = mediaStore.seedAudioGlobalPrompt || state.seedPromptText || ''
    if (!globalPrompt.trim()) {
      const generated = await generateAndSaveTranslationGlobalPrompt(state)
      globalPlan = generated.plan
      globalPrompt = generated.prompt
    } else {
      mediaStore.seedAudioGlobalPrompt = globalPrompt
    }
    const groupIds = videoTranslationDubbingGroups(state.cues).map((group) => group.groupId)
    const existingPrompts = state.groupedVoicePrompts || {}
    const plan = await generateTranslationGroupedPrompts(
      state,
      globalPlan,
      globalPrompt,
      existingPrompts,
    )
    state.groupedVoicePrompts = plan.prompts
    const reusedAllPrompts = groupIds.every(
      (groupId) =>
        existingPrompts[groupId]?.trim() && existingPrompts[groupId] === plan.prompts[groupId],
    )
    mediaStore.progressText = reusedAllPrompts
      ? '分组提示词已存在，正在检查并补生成缺失音频'
      : '分组提示词已完成，正在启动分组音频生成'
    await window.electron.cloud.writeVideoTranslationGroupedPlan(
      mediaStore.runId,
      mediaStore.episodeId,
      state.targetLanguage,
      plan.arrangement,
      plan.promptMarkdown,
    )
    try {
      const version = await window.electron.cloud.generateVideoTranslationGroupedVoice(
        mediaStore.runId,
        mediaStore.episodeId,
        state.targetLanguage,
        regenerateBlockIds,
      )
      state.voiceVersions = [
        ...state.voiceVersions.filter((item) => item.versionId !== version.versionId),
        version,
      ]
      applyTranslationVoiceVersion(state, version)
      toast.success('分组克隆已全部生成并设为当前使用版本')
    } finally {
      await refreshCloudTasks()
    }
  })
}

function applyTranslationAudio(
  state: NonNullable<typeof mediaStore.videoTranslation>,
  record: import('@/runtime/productionContract').AudioProcessingRecord,
) {
  state.vocalPath = record.vocalPath
  state.instrumentPath = record.instrumentPath
  state.mixedPath = record.mixedAudioPath
  state.originalVocalRemoved = Boolean(record.originalVocalRemoved)
  state.finalVideoPath = undefined
}

async function separateTranslationAudio() {
  await runTranslationStep('separate-source-audio', 'separationStatus', async (state) => {
    applyTranslationAudio(
      state,
      await window.electron.cloud.separateSourceAudio({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        pictureMasterPath: state.finalMasterVideoPath || state.sourceVideoPath!,
        workflow: 'video-translation',
        targetLanguage: state.targetLanguage,
      }),
    )
    toast.success('原人声和背景声已分离')
  })
}

async function timestampTranslationDialogue() {
  await runAction('timestamp-target-dialogue', async () => {
    const state = translationState()
    const version = state.voiceVersions.find(
      (item) => item.versionId === state.activeVoiceVersionId,
    )
    if (!version || !state.finalScriptId || !state.scriptHash)
      throw new Error('请先选择与当前最终剧本一致的完整配音版本')
    const result = await window.electron.cloud.generateVideoTranslationDialogueTimestamps({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      targetLanguage: state.targetLanguage,
      finalScriptId: state.finalScriptId,
      scriptHash: state.scriptHash,
      voiceVersionId: version.versionId,
    })
    state.dubDialogueTimestampPath = result.path
    state.dubDialogueTimestampHash = result.hash
    state.targetVoicePath = result.targetVoicePath
    state.mixStatus = 'stale'
    state.finalStatus = 'stale'
    toast.success('配音对白时间戳已生成')
  })
}

async function mixTranslationAudio() {
  await runTranslationStep('mix-background-audio', 'mixStatus', async (state) => {
    applyTranslationAudio(
      state,
      await window.electron.cloud.mixBackgroundAudio({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        vocalPath: state.vocalPath!,
        instrumentPath: state.instrumentPath!,
        voiceFile: state.targetVoicePath!,
        workflow: 'video-translation',
        targetLanguage: state.targetLanguage,
      }),
    )
    state.finalStatus = 'stale'
    toast.success('背景声和目标语言配音已混合')
  })
}

async function burnTranslationVideo() {
  await runTranslationStep('burn-subtitles-and-voice', 'finalStatus', async (state) => {
    state.finalVideoPath = await window.electron.cloud.composeVideoTranslation({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      sourceVideoPath: state.finalMasterVideoPath || state.sourceVideoPath!,
      mixedAudioPath: state.mixedPath!,
      targetLanguage: state.targetLanguage,
      finalScriptId: state.finalScriptId!,
      scriptHash: state.scriptHash!,
      voiceVersionId: state.activeVoiceVersionId!,
      dubDialogueTimestampHash: state.dubDialogueTimestampHash!,
    })
    toast.success('视频翻译成片已生成')
  })
}

async function generateShotPlan() {
  await runAction('shot-plan', async () => {
    if (!mediaStore.confirmedProductionRoute || !mediaStore.projectDirectorPlan)
      throw new Error('请先确认项目总监方案')
    if (!mediaStore.assetPlanningComplete) throw new Error('请先准备角色、场景和道具资产提示词')
    if (!mediaStore.allRequiredAssetsApproved) throw new Error('请先确认全部必需资产')
    if (
      mediaStore.audioProductionRoute === 'seed-full-track' &&
      !mediaStore.seedAudioDialogueTimelinePath
    )
      throw new Error('请先生成完整声音轨和声音时间轴')
    const referenceShotCount =
      mediaStore.shotPace === 'auto'
        ? undefined
        : expectedShotCount(
            mediaStore.voiceDuration || mediaStore.targetDuration,
            mediaStore.shotPace,
          )
    const skillInput = {
      script: mediaStore.approvedScript,
      targetDuration: mediaStore.targetDuration,
      ...(mediaStore.voiceDuration ? { actualDuration: mediaStore.voiceDuration } : {}),
      shotPace: mediaStore.shotPace,
      ratio: mediaStore.ratio,
      style: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId),
      projectDirector: mediaStore.projectDirectorPlan,
      ...(mediaStore.audioProductionRoute === 'seed-full-track'
        ? {
            audioProductionRoute: mediaStore.audioProductionRoute,
            dialogueTimelinePath: mediaStore.seedAudioDialogueTimelinePath,
            dialogueSrtPath: mediaStore.seedAudioSrtPath,
          }
        : {}),
    }
    const previousState = JSON.parse(JSON.stringify(mediaStore.$state))
    const transactionId = await window.electron.cloud.beginStoryboardUpdate(
      mediaStore.runId,
      mediaStore.episodeId,
    )
    try {
      const result = await window.electron.cloud.runWikiSkill(
        'jc-script-storyboard',
        `${JSON.stringify({ ...skillInput, referenceShotCount }, null, 2)}\n\n读取 wiki/项目总监/${mediaStore.episodeId}.md、wiki/文稿/${mediaStore.episodeId}/确认文稿.md${mediaStore.audioProductionRoute === 'seed-full-track' ? `、${mediaStore.seedAudioDialogueTimelinePath} 和 ${mediaStore.seedAudioSrtPath}` : ''} 和已确认资产页面。Seed 路线必须以声音时间轴安排镜头。把导演总览和单镜写入 wiki/分镜/${mediaStore.episodeId}/；只能绑定现有资产 ID，不得创建或修改资产。`,
        mediaStore.runId,
        mediaStore.episodeId,
        mediaStore.textModel,
      )
      await reloadStoryboardMarkdown(result.writtenPaths)
      await window.electron.cloud.commitStoryboardUpdate(
        mediaStore.runId,
        mediaStore.episodeId,
        transactionId,
        result.writtenPaths,
      )
    } catch (error) {
      await window.electron.cloud.rollbackStoryboardUpdate(
        mediaStore.runId,
        mediaStore.episodeId,
        transactionId,
      )
      mediaStore.$patch(previousState)
      throw error
    }
    mediaStore.stage = 'shot-plan-ready'
    mediaStore.selectView('storyboard')
  })
}

async function reloadStoryboardMarkdown(runPaths?: string[]) {
  let upstreamChanged = false
  const scriptDocument = await window.electron.cloud
    .readMarkdown(mediaStore.runId, `wiki/文稿/${mediaStore.episodeId}/确认文稿.md`)
    .catch(() => null)
  if (scriptDocument) {
    const body = scriptDocument.content
      .replace(/^---\n[\s\S]*?\n---\n?/, '')
      .replace(/^# 确认文稿\s*/m, '')
      .trim()
    if (body) {
      if (body !== mediaStore.approvedScript) {
        mediaStore.archiveCurrent()
        mediaStore.invalidateFrom('script')
        mediaStore.scriptHash = await hashScript(body)
        mediaStore.stage = 'script-approved'
        upstreamChanged = true
      }
      mediaStore.script = body
      mediaStore.approvedScript = body
    }
  }
  if (upstreamChanged) return
  const paths = await window.electron.cloud.listMarkdown(mediaStore.runId)
  const selectedPaths = runPaths ? new Set(runPaths) : null
  const directorAssetIds = new Set(
    mediaStore.projectDirectorPlan?.assets.map((asset) => asset.id) || [],
  )
  const documents = await Promise.all(
    paths
      .filter(
        (value) =>
          (value.startsWith('wiki/资产/') &&
            directorAssetIds.has(value.split('/').pop()!.replace(/\.md$/, ''))) ||
          ((!selectedPaths || selectedPaths.has(value)) &&
            (value === `wiki/分镜/${mediaStore.episodeId}/导演总览.md` ||
              value.startsWith(`wiki/分镜/${mediaStore.episodeId}/镜头/`))),
      )
      .map((value) => window.electron.cloud.readMarkdown(mediaStore.runId, value)),
  )
  const director = documents.find(
    (document) => document.path === `wiki/分镜/${mediaStore.episodeId}/导演总览.md`,
  )
  if (!director) return
  if (isLegacyStoryboardMarkdown(director.content)) return
  const parsed = parseStoryboardMarkdown(
    director,
    documents.filter((document) =>
      document.path.startsWith(`wiki/分镜/${mediaStore.episodeId}/镜头/`),
    ),
    documents.filter((document) => document.path.startsWith('wiki/资产/')),
    mediaStore.approvedScript,
    mediaStore.voiceDuration || mediaStore.targetDuration,
    mediaStore.shotPace,
    !(
      mediaStore.confirmedProductionRoute === 'drama' &&
      mediaStore.audioProductionRoute === 'post-dub'
    ),
  )
  const plan = parsed.plan
  const directorPlan = mediaStore.projectDirectorPlan
  if (
    directorPlan &&
    ![directorPlan.direction.director, directorPlan.direction.referenceWork].every((value) =>
      plan.creativeIdentity.includes(value),
    )
  )
    throw new Error('导演分镜没有继承项目总监确定的导演与参考作品')
  const oldVisualAnchor = mediaStore.visualAnchor
  const existingById = new Map(mediaStore.referenceAssets.map((asset) => [asset.id, asset]))
  const changedAssetIds = new Set<string>()
  const referenceAssets: ReferenceAsset[] = projectDirectorAssets(
    mediaStore.projectDirectorPlan,
    parsed.assets,
  ).map((asset) => {
    const existing = existingById.get(asset.id)
    if (!existing) return asset
    if (assetGenerationChanged(asset, existing)) {
      changedAssetIds.add(asset.id)
      return {
        ...asset,
        status: asset.design ? 'design-ready' : 'planned',
        versions: existing.versions,
        referenceRevision: existing.referenceRevision,
        rejectedReferencePinIds: existing.rejectedReferencePinIds,
      }
    }
    const recoveredVersion = [...existing.versions]
      .reverse()
      .find((version) => assetVersionMatches(asset, version))
    const activeVersionId = existing.activeVersionId || recoveredVersion?.id
    return {
      ...asset,
      status: activeVersionId ? 'approved' : existing.status,
      versions: existing.versions,
      activeVersionId,
      pendingVersionId: existing.pendingVersionId,
      referenceRevision: existing.referenceRevision,
      rejectedReferencePinIds: existing.rejectedReferencePinIds,
    }
  })
  mediaStore.resolvedPace = plan.resolvedPace
  mediaStore.creativeIdentity = plan.creativeIdentity
  mediaStore.sceneReference = plan.sceneReference
  mediaStore.rhythmArchive = plan.rhythmArchive
  mediaStore.distributionIntent = plan.distributionIntent
  mediaStore.referenceShotCount = plan.referenceShotCount
  mediaStore.finalShotCount = plan.finalShotCount
  mediaStore.shotCountRationale = plan.shotCountRationale
  mediaStore.visualAnchor = plan.visualAnchor
  mediaStore.segments = mergeStoryboardMedia(
    plan.segments,
    mediaStore.segments,
    oldVisualAnchor !== plan.visualAnchor,
  )
  if (changedAssetIds.size) {
    mediaStore.segments.forEach((segment) => {
      if (!segment.referenceAssetIds.some((id) => changedAssetIds.has(id))) return
      segment.imagePath = ''
      segment.imageStatus = 'pending'
      segment.videoPath = ''
      segment.videoStatus = 'pending'
      segment.transcriptStatus = 'pending'
      segment.transcriptMediaId = undefined
      segment.transcriptJsonPath = undefined
      segment.transcriptSrtPath = undefined
      segment.transcriptError = ''
      segment.editingStatus = 'pending'
      segment.editingAnalysis = undefined
      segment.editingError = ''
      segment.error = ''
    })
    mediaStore.editingTimelinePath = ''
    mediaStore.pictureMasterPath = ''
    mediaStore.invalidateAudioProcessing()
  }
  mediaStore.referenceAssets = referenceAssets.map((asset) => {
    const existing = existingById.get(asset.id)
    return {
      ...asset,
      generatedBySkill: existing?.generatedBySkill,
      sourceDocument: existing?.sourceDocument || asset.sourceDocument,
      design: withProjectDesign(
        asset.design || existing?.design,
        VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt || '',
        mediaStore.ratio,
      ),
      searchQuery: asset.searchQuery || existing?.searchQuery,
    }
  })
  if (mediaStore.segments.length) mediaStore.stage = 'shot-plan-ready'
}

function assetSkill(asset: ReferenceAsset) {
  return asset.role === 'character'
    ? 'jc-character-prompt'
    : asset.role === 'scene'
      ? 'jc-scene-prompt'
      : 'jc-prop-prompt'
}

function assetFolder(role: AssetRole) {
  return { character: '角色', scene: '场景', prop: '道具' }[role]
}

function assetMarkdown(asset: ReferenceAsset) {
  return `---
entityType: asset
entityId: ${asset.id}
assetRole: ${asset.role}
status: ${asset.status}
managedBy: short-video-factory
generatedBySkill: ${asset.generatedBySkill}
sourceDocument: wiki/项目总监/${mediaStore.episodeId}.md
---

# ${asset.label}

- 项目总监：[[../../项目总监/${mediaStore.episodeId}]]

## 说明

${asset.description}

叙事职责：${asset.storyFunction || '未记录'}

来源依据：${asset.evidence || `[[../../文稿/${mediaStore.episodeId}/确认文稿]]`}

## 身份特征

${asset.identityTraits.map((value) => `- ${value}`).join('\n') || '- 无'}

## 风格要求

${asset.styleRequirements.map((value) => `- ${value}`).join('\n') || '- 服从项目视觉风格'}

## 资产设计 JSON

\`\`\`json
${JSON.stringify(asset.design || {}, null, 2)}
\`\`\`

## 参考图搜索词

${asset.searchQuery || '未生成'}

## 被引用

等待导演分镜绑定。`
}

function currentProjectDesign(design: ReferenceAsset['design']) {
  return withProjectDesign(
    design,
    VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt || '',
    mediaStore.ratio,
  )
}

function completeAssetDesign(
  role: AssetRole,
  input: Record<string, any>,
  label: string,
  description: string,
) {
  const design = JSON.parse(JSON.stringify(input || {})) as Record<string, any>
  if (role === 'scene') {
    design.scene = {
      name: label,
      episode: '本集',
      timeOfDay: '未记录',
      era: '现代',
      location: '未记录',
      type: '室内',
      function: description,
      medium: '漫剧',
      genre: '剧情',
      visualStyle: '韩漫',
      ...design.scene,
    }
    design.space = {
      shape: '结构清晰、具有纵深的空间',
      size: '中等',
      zones: [],
      furnitureLayout: '功能分区明确',
      ...design.space,
    }
    design.surfaces = {
      walls: '韩漫风格墙面',
      floor: '整洁地面',
      ceiling: '标准层高、基础灯具',
      ...design.surfaces,
    }
    design.objectDensity ||= '适中'
    design.landmarks ||= []
    design.lighting = {
      naturalLight: [],
      artificialLight: [],
      dominantSource: '环境主光',
      colorPalette: { primary: '冷色', secondary: '中性色', accent: '暗红' },
      ...design.lighting,
    }
    design.onImageText ||= {
      name: { text: label, position: '左上角', style: '中号字' },
      subtitle: { text: '本集场景', position: '名称下方', style: '小号字' },
      labels: [],
    }
    design.views = { masterShot: '空镜全景、展示空间全貌', alternateAngles: [], ...design.views }
    design.background ||= '自然环境空场景'
    design.presentationLighting ||= '均匀柔光、无人物、无戏剧阴影'
    design.layout ||= '主镜头大图与关键区域特写'
    design.noHumans = true
  } else if (role === 'prop') {
    design.project ||= {}
    design.prop = {
      name: label,
      category: '日常用品',
      owner: '未指定',
      era: '现代',
      medium: '漫剧',
      genre: '剧情',
      visualStyle: '韩漫',
      ...design.prop,
    }
    design.shape = {
      silhouette: `${label} 的清晰轮廓`,
      components: [],
      proportion: { length: '未记录', width: '未记录', thickness: '未记录' },
      ...design.shape,
    }
    design.material = {
      primary: '常见材质',
      secondary: [],
      surface: '整洁',
      color: '符合项目风格',
      texture: '细腻材质纹理',
      ...design.material,
    }
    design.wearAndTear = { level: '轻微使用', details: [], ...design.wearAndTear }
    design.markings ||= []
    design.decorations ||= []
    design.onImageText ||= {
      name: { text: label, position: '左上角', style: '中号字' },
      subtitle: { text: '道具设定', position: '名称下方', style: '小号字' },
      labels: [],
    }
    design.closeups ||= []
    design.views = {
      front: '正面展示整体形状',
      side: '侧面展示厚度',
      back: '背面展示结构',
      top: '俯视展示顶部细节',
      detailCloseup: '关键特征特写',
      ...design.views,
    }
    design.background ||= '纯色中性灰'
    design.lighting ||= '均匀柔光、无戏剧阴影'
    design.layout ||= '正面大图、多角度小图和特写标注'
  }
  return design
}

function parseRuntimeAsset(asset: ReferenceAsset, value: any): ReferenceAsset {
  if (String(value?.assetId) !== asset.id) throw new Error(`${asset.label} 的资产 ID 被修改`)
  const design = completeAssetDesign(
    asset.role,
    currentProjectDesign(value?.design),
    asset.label,
    asset.description,
  )
  const searchQuery = String(value?.searchQuery || '').trim()
  if (!validAssetDesign(asset.role, design)) throw new Error(`${asset.label} 缺少完整资产设计 JSON`)
  if (
    !searchQuery ||
    searchQuery.length > 160 ||
    !validAssetSearchQuery(asset.role, design, searchQuery)
  )
    throw new Error(
      `${asset.label} 的参考图搜索词必须使用现实电影、电视剧或广告参考，不得包含项目画风`,
    )
  return {
    ...asset,
    design,
    searchQuery,
    status: 'design-ready',
    generatedBySkill: assetSkill(asset),
    sourceDocument: `wiki/项目总监/${mediaStore.episodeId}.md`,
  }
}

async function writeAssetDocuments(assets: ReferenceAsset[]) {
  await Promise.all(
    assets.map(async (asset) => {
      const relativePath = `wiki/资产/${assetFolder(asset.role)}/${asset.id}.md`
      const current = await window.electron.cloud
        .readMarkdown(mediaStore.runId, relativePath)
        .catch(() => null)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        relativePath,
        assetMarkdown(asset),
        current?.revision,
      )
    }),
  )
}

async function prepareAssetPrompts() {
  await runAction('asset-prompts', async () => {
    if (!mediaStore.confirmedProductionRoute || !mediaStore.projectDirectorPlan)
      throw new Error('请先确认项目总监方案')
    const pending = mediaStore.referenceAssets.filter((asset) => !asset.design)
    if (!pending.length) return
    const results = await Promise.allSettled(
      pending.map(async (asset) => {
        const skill = assetSkill(asset)
        const result = await window.electron.cloud.runSkill(
          skill,
          JSON.stringify({
            mode: 'app-runtime',
            asset,
            projectStyle: {
              id: mediaStore.styleId,
              prompt: selectedVisualStyle(),
              ratio: mediaStore.ratio,
              projectDirector: mediaStore.projectDirectorPlan,
            },
          }),
          mediaStore.runId,
          mediaStore.textModel,
        )
        const planned = parseRuntimeAsset(asset, result)
        await writeAssetDocuments([planned])
        return planned
      }),
    )
    const failures: string[] = []
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failures.push(
          `${pending[index].label}：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        )
        return
      }
      const target = mediaStore.referenceAssets.findIndex((asset) => asset.id === result.value.id)
      if (target >= 0) mediaStore.referenceAssets[target] = result.value
    })
    if (!failures.length) mediaStore.assetPlanCompletedRoles = ['character', 'scene', 'prop']
    mediaStore.stage = 'script-approved'
    mediaStore.selectView('assets')
    if (failures.length) throw new Error(failures.join('\n'))
  })
}

function validPropDesign(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    [
      'prop',
      'shape',
      'material',
      'wearAndTear',
      'markings',
      'decorations',
      'onImageText',
      'closeups',
      'views',
      'background',
      'lighting',
      'layout',
    ].every((key) => key in (value as Record<string, unknown>))
  )
}

function validAssetDesign(role: AssetRole, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const project = (value as Record<string, any>).project
  if (!project?.visualStyle || !project?.aspectRatio) return false
  const keys = {
    character: [
      'character',
      'personality',
      'face',
      'body',
      'clothing',
      'views',
      'background',
      'lighting',
      'layout',
    ],
    scene: [
      'scene',
      'space',
      'surfaces',
      'landmarks',
      'lighting',
      'views',
      'background',
      'presentationLighting',
      'layout',
      'noHumans',
    ],
    prop: [],
  }[role]
  return role === 'prop'
    ? validPropDesign(value)
    : keys.every((key) => key in (value as Record<string, unknown>))
}

function validAssetSearchQuery(role: AssetRole, _design: Record<string, any>, query: string) {
  const value = query.toLowerCase()
  if (
    /webtoon|manhwa|manga|anime|animation|concept art|background art|character sheet|key visual/i.test(
      value,
    )
  )
    return false
  return {
    character: /film character portrait|movie character still|cast portrait|full body/.test(value),
    scene:
      /(film|movie|television|tv|commercial) still/.test(value) && /wide|establishing/.test(value),
    prop: /movie prop|film prop|product commercial|commercial still|product reference|close up/.test(
      value,
    ),
  }[role]
}

function designFingerprint(asset: ReferenceAsset) {
  return JSON.stringify(asset.design || {})
}

async function searchAssets() {
  await runAction('asset-search', async () => {
    const pending = mediaStore.referenceAssets.filter(
      (asset) =>
        asset.searchQuery &&
        !asset.versions.some(
          (version) => version.source === 'upload' || version.source === 'search',
        ),
    )
    if (!pending.length) throw new Error('没有待搜索的资产参考图')
    const failures: string[] = []
    for (const asset of pending) {
      try {
        const version = await window.electron.cloud.searchAssetImage(
          mediaStore.runId,
          asset.id,
          assetReferenceSearchQuery(asset.searchQuery!, asset.role, mediaStore.styleId),
          [...(asset.rejectedReferencePinIds || [])].map(String),
        )
        asset.versions.push(version)
        asset.referenceRevision = (asset.referenceRevision || 0) + 1
        asset.status = 'ready'
      } catch (error) {
        failures.push(`${asset.label}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failures.length) throw new Error(failures.join('\n'))
  })
}

async function uploadAssetReference(assetId: string) {
  const asset = mediaStore.referenceAssets.find((item) => item.id === assetId)
  if (!asset) return
  const version = await window.electron.cloud.selectAssetImage(mediaStore.runId, asset.id)
  if (!version) return
  asset.versions.push(version)
  asset.referenceRevision = (asset.referenceRevision || 0) + 1
  asset.status = 'ready'
}

async function generateAssetVersion(asset: ReferenceAsset) {
  const runId = mediaStore.runId
  asset.design = currentProjectDesign(asset.design)
  asset.status = 'generating'
  try {
    const references = asset.versions.filter((version) => version.source !== 'generated')
    const relativePath = await window.electron.cloud.generateAsset({
      runId,
      assetId: asset.id,
      assetLabel: asset.label,
      role: asset.role,
      design: JSON.parse(JSON.stringify(asset.design)),
      referencePaths: references.map((version) => version.relativePath),
    })
    const version: AssetVersion = {
      id: `version-${crypto.randomUUID()}`,
      source: 'generated',
      relativePath,
      designFingerprint: designFingerprint(asset),
      referenceRevision: asset.referenceRevision || 0,
      derivedFromVersionId: references[0]?.id,
      createdAt: new Date().toISOString(),
    }
    if (mediaStore.runId !== runId) return
    asset.versions.push(version)
    mediaStore.adoptAssetVersion(asset.id, version.id)
  } catch (error) {
    asset.status = 'failed'
    throw error
  }
}

async function generateAssets() {
  try {
    const pending = mediaStore.referenceAssets.filter(
      (asset) =>
        asset.design && !asset.versions.some((version) => assetVersionMatches(asset, version)),
    )
    if (!pending.length) throw new Error('没有待生成资产')
    await pool(pending, pending.length, generateAssetVersion)
    if (mediaStore.allRequiredAssetsApproved) mediaStore.stage = 'assets-ready'
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    await refreshCloudTasks()
  }
}

function grokSequenceAssets(sequence: GrokSequence) {
  return sequence.referenceAssetIds.map((assetId) => {
    const asset = mediaStore.referenceAssets.find((item) => item.id === assetId)
    const relativePath = mediaStore.currentAssetVersion(assetId)?.relativePath
    if (!asset || !relativePath) throw new Error('Grok 序列绑定资产缺少当前版本')
    return { asset, relativePath }
  })
}

async function generateStoryboards() {
  try {
    if (!mediaStore.segments.length) throw new Error(t('workflow.messages.shotPlanFirst'))
    validateShotPlan()
    if (!mediaStore.allRequiredAssetsApproved) throw new Error('请先确认全部必需资产')
    const grokSequences = isCombinedVideoModel(mediaStore.videoModel)
      ? buildGrokSequences(mediaStore.segments, mediaStore.videoModel)
      : []
    grokSequences.forEach((sequence) => {
      const leader = sequence.segments[0]
      if (leader.imageStatus === 'success' && leader.imagePath)
        sequence.segments.forEach((segment) => {
          segment.imagePath = leader.imagePath
          segment.imageStatus = 'success'
        })
    })
    const pendingImages: any[] = isCombinedVideoModel(mediaStore.videoModel)
      ? grokSequences.filter((sequence) => sequence.segments[0].imageStatus !== 'success')
      : unfinishedSegments(mediaStore.segments, 'image')
    if (
      pendingImages.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '图片', count: pendingImages.length }),
      )
    )
      return
    if (isCombinedVideoModel(mediaStore.videoModel)) {
      await pool(pendingImages, pendingImages.length, async (sequence) => {
        const leader = sequence.segments[0]
        const references = grokSequenceAssets(sequence)
        const prompt =
          sequence.segments
            .map(
              (segment: StoryboardSegment) =>
                `第${segment.index}镜（${segment.playDuration.toFixed(1)}秒）：${segment.storyboardImagePrompt}`,
            )
            .join('\n') +
          `\n\n${grokStoryboardBoardInstruction(sequence.segments.length)}` +
          `\n\n${grokReferenceGuide(
            references.map(({ asset }) => asset),
            false,
          )}` +
          `\n\n${t('workflow.messages.visualAnchor')}：${mediaStore.visualAnchor}`
        leader.imageStatus = 'running'
        leader.imagePath = await window.electron.cloud.generateStoryboard({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          index: leader.index,
          prompt,
          ratio: mediaStore.ratio,
          referencePaths: references.map(({ relativePath }) => relativePath),
        })
        sequence.segments.forEach((segment: StoryboardSegment) => {
          segment.imagePath = leader.imagePath
          segment.imageStatus = 'success'
        })
      })
    } else await pool(pendingImages, pendingImages.length, generateImage)
    if (!mediaStore.allImagesReady) {
      const errors = [
        ...new Set(
          pendingImages.flatMap((item) => ('error' in item ? [item.error] : [])).filter(Boolean),
        ),
      ]
      throw new Error(errors.join('\n') || t('workflow.messages.imagePartial'))
    }
    mediaStore.stage = 'storyboards-ready'
    mediaStore.mediaFilter = 'storyboards'
    mediaStore.selectView('media')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    await refreshCloudTasks()
  }
}

async function generateVideos() {
  try {
    validateShotPlan()
    const grokSequences = isCombinedVideoModel(mediaStore.videoModel)
      ? buildGrokSequences(mediaStore.segments, mediaStore.videoModel)
      : []
    grokSequences.forEach((sequence) => {
      const leader = sequence.segments[0]
      if (leader.videoStatus === 'success' && leader.videoPath)
        sequence.segments.forEach((segment) => {
          segment.videoPath = leader.videoPath
          segment.videoStatus = 'success'
        })
    })
    const pendingVideos: any[] = isCombinedVideoModel(mediaStore.videoModel)
      ? grokSequences.filter((sequence) => sequence.segments[0].videoStatus !== 'success')
      : unfinishedSegments(mediaStore.segments, 'video')
    if (
      pendingVideos.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '视频', count: pendingVideos.length }),
      )
    )
      return
    if (isCombinedVideoModel(mediaStore.videoModel)) {
      await pool(pendingVideos, pendingVideos.length, async (sequence) => {
        const leader = sequence.segments[0]
        if (leader.videoStatus !== 'success' || !leader.videoPath) {
          const references = grokSequenceAssets(sequence)
          const timedPrompt =
            sequence.segments
              .map((segment: StoryboardSegment, index: number) => {
                const start = sequence.segments
                  .slice(0, index)
                  .reduce((sum: number, item: StoryboardSegment) => sum + item.playDuration, 0)
                return `[${start.toFixed(1)}-${(start + segment.playDuration).toFixed(1)}秒] ${videoPromptWithSound(segment)}`
              })
              .join('\n') +
            '\n连续完成以上时间段，按导演要求切换景别和机位；保持角色、场景、道具连续，不要输出分镜板、边框、拼贴或分屏。' +
            `\n\n${grokReferenceGuide(
              references.map(({ asset }) => asset),
              true,
            )}`
          await generateVideo(
            leader,
            references.map(({ relativePath }) => relativePath),
            timedPrompt,
            sequence.generationDuration,
          )
          sequence.segments.forEach((segment: StoryboardSegment) => {
            segment.videoPath = leader.videoPath
            segment.videoStatus = 'success'
            segment.transcriptStatus = 'pending'
            segment.transcriptMediaId = undefined
            segment.transcriptJsonPath = undefined
            segment.transcriptSrtPath = undefined
            segment.transcriptError = ''
            segment.editingStatus = 'pending'
            segment.editingAnalysis = undefined
            segment.editingError = ''
          })
        }
      })
    } else await pool(pendingVideos, pendingVideos.length, generateVideo)
    if (!mediaStore.allVideosReady) {
      const errors = [...new Set(pendingVideos.map((item) => item.error).filter(Boolean))]
      throw new Error(errors.join('\n') || t('workflow.messages.videoPartial'))
    }
    mediaStore.stage = 'videos-ready'
    mediaStore.mediaFilter = 'videos'
    mediaStore.selectView('media')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    await refreshCloudTasks()
  }
}

async function generateMaterialSrts() {
  await runAction('generate-srt', async () => {
    if (!mediaStore.allVideosReady) throw new Error('请先完成全部视频素材')
    const inputs = uniqueTranscriptInputs(mediaStore.segments)
    const failures: string[] = []
    for (const input of inputs) {
      const targets = mediaStore.segments.filter((segment) =>
        input.segmentIndexes.includes(segment.index),
      )
      if (
        targets.every(
          (segment) =>
            segment.transcriptStatus === 'ready' && segment.transcriptMediaId === input.mediaId,
        )
      )
        continue
      targets.forEach((segment) => {
        segment.transcriptStatus = 'running'
        segment.transcriptError = ''
      })
      try {
        const result = await window.electron.cloud.generateMaterialTranscript({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          mediaId: input.mediaId,
          videoPath: input.videoPath,
        })
        targets.forEach((segment) => {
          segment.transcriptStatus = 'ready'
          segment.transcriptMediaId = input.mediaId
          segment.transcriptJsonPath = result.transcriptJsonPath
          segment.transcriptSrtPath = result.transcriptSrtPath
          segment.transcriptError = ''
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        targets.forEach((segment) => {
          segment.transcriptStatus = 'failed'
          segment.transcriptError = message
        })
        failures.push(`${input.mediaId}: ${message}`)
      }
    }
    if (!mediaStore.allTranscriptsReady)
      throw new Error(failures.join('\n') || '部分素材 SRT 生成失败')
    toast.success('全部素材 SRT 已生成')
  })
}

async function generateEditingTimeline() {
  await runAction('generate-editing-timeline', async () => {
    if (!mediaStore.allTranscriptsReady) throw new Error('请先完成全部素材 SRT')
    const inputs = uniqueTranscriptInputs(mediaStore.segments)
    const failures: string[] = []
    for (const input of inputs) {
      const targets = mediaStore.segments.filter((segment) =>
        input.segmentIndexes.includes(segment.index),
      )
      if (targets.every((segment) => segment.editingStatus === 'ready' && segment.editingAnalysis))
        continue
      const evidence = targets[0]
      if (!evidence.transcriptJsonPath || !evidence.transcriptSrtPath)
        throw new Error(`${input.mediaId} 缺少素材 SRT 产物`)
      targets.forEach((segment) => {
        segment.editingStatus = 'running'
        segment.editingError = ''
      })
      try {
        const result = await window.electron.cloud.analyzeMaterialVideo({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          mediaId: input.mediaId,
          videoPath: input.videoPath,
          transcriptJsonPath: evidence.transcriptJsonPath,
          transcriptSrtPath: evidence.transcriptSrtPath,
          approvedScript: mediaStore.approvedScript,
          shots: targets.map((segment) => ({
            shotId: `shot-${String(segment.index).padStart(3, '0')}`,
            script: segment.script,
            soundType:
              segment.soundType || (segment.timelineType === 'dialogue' ? 'onscreen' : 'none'),
            speakerId: segment.speakerId || segment.dialogueCharacter,
            dialogueText: segment.dialogueText,
            dialogueEmotion: segment.dialogueEmotion,
            startState: segment.startState,
            actionProgression: segment.actionProgression,
            endState: segment.endState,
            videoPrompt: segment.videoPrompt,
          })),
        })
        targets.forEach((segment) => {
          const shotId = `shot-${String(segment.index).padStart(3, '0')}`
          const analysis = result.analyses.find((item) => item.shotId === shotId)
          if (!analysis) throw new Error(`镜头 ${segment.index} 缺少 Gemini 分析结果`)
          segment.editingAnalysis = analysis
          segment.editingStatus = 'ready'
          segment.editingError = ''
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        targets.forEach((segment) => {
          segment.editingStatus = 'failed'
          segment.editingError = message
        })
        failures.push(`${input.mediaId}: ${message}`)
      }
    }
    if (
      !mediaStore.segments.every(
        (segment) => segment.editingStatus === 'ready' && segment.editingAnalysis,
      )
    )
      throw new Error(failures.join('\n') || '部分素材剪辑分析失败')
    const timeline = buildEditingTimeline(
      mediaStore.segments.map((segment) => segment.editingAnalysis!),
      mediaStore.confirmedProductionRoute || 'drama',
    )
    mediaStore.editingTimelinePath = await window.electron.cloud.writeEditingTimeline(
      mediaStore.runId,
      mediaStore.episodeId,
      timeline,
    )
    mediaStore.pictureMasterPath = ''
    mediaStore.invalidateAudioProcessing()
    toast.success('剪辑时间轴已生成')
  })
}

function validateShotPlan() {
  parseStoryboardPlan(
    {
      creativeIdentity: mediaStore.creativeIdentity,
      sceneReference: mediaStore.sceneReference,
      rhythmArchive: mediaStore.rhythmArchive,
      distributionIntent: mediaStore.distributionIntent,
      resolvedPace: mediaStore.resolvedPace,
      referenceShotCount: mediaStore.referenceShotCount,
      finalShotCount: mediaStore.finalShotCount,
      shotCountRationale: mediaStore.shotCountRationale,
      visualAnchor: mediaStore.visualAnchor,
      segments: mediaStore.segments,
    },
    mediaStore.approvedScript,
    mediaStore.voiceDuration || mediaStore.targetDuration,
    mediaStore.shotPace,
    !(
      mediaStore.confirmedProductionRoute === 'drama' &&
      mediaStore.audioProductionRoute === 'post-dub'
    ),
  )
}

function currentEditingTimeline() {
  return buildEditingTimeline(
    mediaStore.segments.map((segment) => {
      if (!segment.editingAnalysis) throw new Error(`镜头 ${segment.index} 尚未完成剪辑分析`)
      return segment.editingAnalysis
    }),
    mediaStore.confirmedProductionRoute || 'drama',
  )
}

function invalidateGeneratedDialogue(keepStems = false) {
  mediaStore.voicePath = ''
  mediaStore.englishVoicePath = ''
  mediaStore.voiceDuration = 0
  mediaStore.pictureMasterPath = ''
  mediaStore.invalidateAudioProcessing(keepStems)
  for (const segment of mediaStore.segments) {
    segment.chineseVoicePath = ''
    segment.chineseVoiceDuration = 0
    segment.englishVoicePath = ''
    segment.englishVoiceDuration = 0
  }
}

function subtitleTasks(language: 'zh' | 'en') {
  const timeline = currentEditingTimeline()
  const segments = mediaStore.segments.map((segment) => {
    const text = language === 'zh' ? segment.dialogueText : segment.englishDialogueText
    return text?.trim()
      ? { ...segment, dialogueText: text }
      : { ...segment, soundType: 'none' as const }
  })
  return episodeVoiceTasks(timeline, segments)
}

async function persistSubtitles(language: 'zh' | 'en') {
  const tasks = subtitleTasks(language)
  return window.electron.cloud.writeEpisodeSubtitles(
    mediaStore.runId,
    mediaStore.episodeId,
    language,
    tasks.map((task) => ({
      shotId: task.shotId,
      startMs: task.startMs,
      endMs: task.endMs,
      text: task.text,
    })),
  )
}

async function updateEditingPoint(index: number, startMs: number, endMs: number) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment?.editingAnalysis) return
  try {
    const shotId = `shot-${String(index).padStart(3, '0')}`
    const timeline = adoptEditingPoint(currentEditingTimeline(), shotId, startMs, endMs)
    const shot = timeline.shots.find((item) => item.shotId === shotId)!
    Object.assign(segment.editingAnalysis, {
      adoptedStartMs: shot.adoptedStartMs,
      adoptedEndMs: shot.adoptedEndMs,
      adoptedBy: shot.adoptedBy,
      revision: shot.revision,
    })
    mediaStore.editingTimelinePath = await window.electron.cloud.writeEditingTimeline(
      mediaStore.runId,
      mediaStore.episodeId,
      currentEditingTimeline(),
    )
    invalidateGeneratedDialogue()
    await Promise.all([persistSubtitles('zh'), persistSubtitles('en')])
  } catch (error) {
    mediaStore.error = error instanceof Error ? error.message : String(error)
    toast.error(mediaStore.error)
  }
}

function updateChineseSubtitle(index: number, text: string) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  segment.dialogueText = text
  if (segment.editingAnalysis?.dialogue) segment.editingAnalysis.dialogue.text = text
  segment.englishDialogueText = ''
  invalidateGeneratedDialogue(true)
  clearTimeout(subtitleSaveTimer)
  subtitleSaveTimer = setTimeout(async () => {
    try {
      mediaStore.editingTimelinePath = await window.electron.cloud.writeEditingTimeline(
        mediaStore.runId,
        mediaStore.episodeId,
        currentEditingTimeline(),
      )
      await Promise.all([persistSubtitles('zh'), persistSubtitles('en')])
    } catch (error) {
      mediaStore.error = error instanceof Error ? error.message : String(error)
    }
  }, 400)
}

function applyVoiceClips(
  language: 'zh' | 'en',
  clips: Array<{ shotId: string; path: string; duration: number }>,
) {
  for (const clip of clips) {
    const index = Number(clip.shotId.match(/(\d+)$/)?.[1])
    const segment = mediaStore.segments.find((item) => item.index === index)
    if (!segment) continue
    if (language === 'zh') {
      segment.chineseVoicePath = clip.path
      segment.chineseVoiceDuration = clip.duration
    } else {
      segment.englishVoicePath = clip.path
      segment.englishVoiceDuration = clip.duration
    }
  }
}

async function generateChineseVoice() {
  await runAction('generate-chinese-voice', async () => {
    mediaStore.setOutputLanguage('zh')
    const tasks = episodeVoiceTasks(currentEditingTimeline(), mediaStore.segments)
    const result = await window.electron.cloud.generateEpisodeVoice({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      language: 'zh',
      tasks,
    })
    applyVoiceClips('zh', result.clips)
    mediaStore.voicePath = result.path
    mediaStore.voiceDuration = result.duration
    mediaStore.invalidateAudioProcessing(true)
    await persistSubtitles('zh')
    toast.success('中文配音已生成')
  })
}

async function translateAllSubtitles() {
  await runAction('translate-subtitles', async () => {
    const tasks = episodeVoiceTasks(currentEditingTimeline(), mediaStore.segments)
    const translated = await window.electron.cloud.translateSubtitles({
      runId: mediaStore.runId,
      textModel: mediaStore.textModel,
      subtitles: tasks.map((task) => ({ shotId: task.shotId, text: task.text })),
    })
    for (const item of translated) {
      const index = Number(item.shotId.match(/(\d+)$/)?.[1])
      const segment = mediaStore.segments.find((candidate) => candidate.index === index)
      if (segment) segment.englishDialogueText = item.text
    }
    mediaStore.segments.forEach((segment) => {
      segment.englishVoicePath = ''
      segment.englishVoiceDuration = 0
    })
    mediaStore.englishVoicePath = ''
    mediaStore.invalidateAudioProcessing(true)
    await persistSubtitles('en')
    toast.success('英文字幕已生成')
  })
}

async function generateEnglishVoice() {
  await runAction('generate-english-voice', async () => {
    mediaStore.setOutputLanguage('en')
    const timeline = currentEditingTimeline()
    const tasks = episodeVoiceTasks(
      timeline,
      mediaStore.segments.map((segment) => ({
        ...segment,
        dialogueText: segment.englishDialogueText,
      })),
    )
    const result = await window.electron.cloud.generateEpisodeVoice({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      language: 'en',
      tasks,
    })
    applyVoiceClips('en', result.clips)
    mediaStore.englishVoicePath = result.path
    mediaStore.invalidateAudioProcessing(true)
    await persistSubtitles('en')
    toast.success('英语配音已生成')
  })
}

async function ensurePictureMaster() {
  const timeline = currentEditingTimeline()
  if (!mediaStore.pictureMasterPath)
    mediaStore.pictureMasterPath = await window.electron.cloud.composePictureMaster({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      ratio: mediaStore.ratio,
      timeline,
    })
  return timeline
}

function applyAudioProcessing(
  record: import('@/runtime/productionContract').AudioProcessingRecord,
) {
  mediaStore.vocalPath = record.vocalPath || ''
  mediaStore.instrumentPath = record.instrumentPath || ''
  mediaStore.mixedAudioPath = record.mixedAudioPath || ''
  mediaStore.originalVocalRemoved = Boolean(record.originalVocalRemoved)
  mediaStore.audioProcessingStatus = record.status === 'failed' ? 'failed' : 'ready'
  mediaStore.finalPath = ''
}

async function separateSourceAudio() {
  await runAction('separate-source-audio', async () => {
    mediaStore.setAudioMode('replace-preserve-ambience')
    mediaStore.audioProcessingStatus = 'running'
    try {
      await ensurePictureMaster()
      applyAudioProcessing(
        await window.electron.cloud.separateSourceAudio({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          pictureMasterPath:
            mediaStore.audioProductionRoute === 'seed-full-track'
              ? mediaStore.seedAudioTrackPath
              : mediaStore.pictureMasterPath,
        }),
      )
      toast.success('原人声和背景声已分离')
    } catch (error) {
      mediaStore.audioProcessingStatus = 'failed'
      throw error
    }
  })
}

async function removeOriginalVocal() {
  await runAction('remove-original-vocal', async () => {
    applyAudioProcessing(
      await window.electron.cloud.removeOriginalVocal({
        runId: mediaStore.runId,
        episodeId: mediaStore.episodeId,
        vocalPath: mediaStore.vocalPath,
        instrumentPath: mediaStore.instrumentPath,
      }),
    )
    toast.success('最终音轨已排除原人声')
  })
}

async function mixBackgroundAudio() {
  await runAction('mix-background-audio', async () => {
    mediaStore.audioProcessingStatus = 'running'
    try {
      const voiceFile =
        mediaStore.audioProductionRoute === 'seed-full-track' && mediaStore.outputLanguage === 'zh'
          ? mediaStore.vocalPath
          : mediaStore.outputLanguage === 'zh'
            ? mediaStore.voicePath
            : mediaStore.englishVoicePath
      applyAudioProcessing(
        await window.electron.cloud.mixBackgroundAudio({
          runId: mediaStore.runId,
          episodeId: mediaStore.episodeId,
          vocalPath: mediaStore.vocalPath,
          instrumentPath: mediaStore.instrumentPath,
          voiceFile,
        }),
      )
      toast.success('配音与背景声已混合')
    } catch (error) {
      mediaStore.audioProcessingStatus = 'failed'
      throw error
    }
  })
}

async function burnVoiceAndSubtitles() {
  await runAction('burn-voice-and-subtitles', async () => {
    if (!mediaStore.allVideosReady) throw new Error(t('workflow.messages.assetsIncomplete'))
    const timeline = await ensurePictureMaster()
    const tasks = mediaStore.hasSoundSegments ? subtitleTasks(mediaStore.outputLanguage) : []
    const subtitleCues = tasks.map((task) => ({
      start: task.startMs / 1000,
      end: task.endMs / 1000,
      text: task.text,
    }))
    const audioMode = !mediaStore.hasSoundSegments
      ? 'keep-original'
      : mediaStore.instrumentPath
        ? 'replace-preserve-ambience'
        : 'replace-all'
    mediaStore.audioMode = audioMode
    const selectedVoice =
      mediaStore.outputLanguage === 'zh' ? mediaStore.voicePath : mediaStore.englishVoicePath
    const finalAudio =
      audioMode === 'replace-preserve-ambience' ? mediaStore.mixedAudioPath : selectedVoice
    mediaStore.finalPath = await window.electron.cloud.composeVideo({
      runId: mediaStore.runId,
      episodeId: mediaStore.episodeId,
      videoFiles: [mediaStore.pictureMasterPath],
      playDurations: [
        timeline.shots.at(-1)?.outputEndMs ? timeline.shots.at(-1)!.outputEndMs / 1000 : 0,
      ],
      voiceFile: finalAudio || undefined,
      audioMode,
      ratio: mediaStore.ratio,
      subtitleCues,
    })
    mediaStore.stage = 'completed'
    mediaStore.selectView('final')
    toast.success(t('workflow.messages.composed'))
  })
}

async function generateImage(segment: StoryboardSegment) {
  const runId = mediaStore.runId
  segment.imageStatus = 'running'
  segment.error = ''
  try {
    const referencePaths = segment.referenceAssetIds.map((assetId) => {
      return mediaStore.currentAssetVersion(assetId)?.relativePath
    })
    if (referencePaths.some((item) => !item)) throw new Error('镜头绑定资产缺少当前版本')
    segment.imagePath = await window.electron.cloud.generateStoryboard({
      runId,
      episodeId: mediaStore.episodeId,
      index: segment.index,
      prompt: `${segment.storyboardImagePrompt}\n\n${t('workflow.messages.visualAnchor')}：${mediaStore.visualAnchor}`,
      ratio: mediaStore.ratio,
      referencePaths: referencePaths as string[],
    })
    if (mediaStore.runId !== runId) return
    segment.imageStatus = 'success'
  } catch (error) {
    segment.imageStatus = 'failed'
    segment.error = error instanceof Error ? error.message : String(error)
  }
}

async function requestRevision(
  targetType:
    | 'script'
    | 'project-director'
    | 'voice-plan'
    | 'seed-role-prompt'
    | 'seed-global-prompt'
    | 'asset-prompt'
    | 'shot'
    | 'image'
    | 'video',
  targetId: string,
  instruction: string,
) {
  await runAction('revision', async () => {
    if (targetType === 'project-director') {
      captureUndo('project-director')
      mediaStore.projectDirectorDraft = await buildProjectDirectorDraft(instruction)
      return
    }
    if (targetType === 'asset-prompt') {
      const asset = mediaStore.referenceAssets.find((item) => item.id === targetId)
      if (!asset) throw new Error('当前资产不存在')
      const raw = await window.electron.cloud.runSkill(
        assetSkill(asset),
        JSON.stringify({
          mode: 'app-revise',
          asset,
          currentDesign: asset.design,
          instruction,
          projectStyle: {
            id: mediaStore.styleId,
            prompt: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt,
            visualAnchor: mediaStore.visualAnchor,
            ratio: mediaStore.ratio,
          },
        }),
        mediaStore.runId,
        mediaStore.textModel,
      )
      const revisedDesign = {
        ...(raw?.design || {}),
        project: {
          visualStyle: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt,
          aspectRatio: mediaStore.ratio,
        },
      }
      const revisedSearchQuery = String(raw?.searchQuery || '').trim()
      if (
        String(raw?.assetId) !== asset.id ||
        !validAssetDesign(asset.role, revisedDesign) ||
        !revisedSearchQuery ||
        revisedSearchQuery.length > 160 ||
        !validAssetSearchQuery(asset.role, revisedDesign, revisedSearchQuery)
      )
        throw new Error(`${asset.label} 的修改提示词合同无效`)
      captureUndo('asset-prompt')
      const generationChanged = JSON.stringify(revisedDesign) !== JSON.stringify(asset.design)
      asset.design = revisedDesign
      asset.searchQuery = revisedSearchQuery
      asset.status = 'design-ready'
      if (generationChanged) {
        asset.activeVersionId = undefined
        asset.pendingVersionId = undefined
        mediaStore.segments
          .filter((segment) => segment.referenceAssetIds.includes(asset.id))
          .forEach((segment) => mediaStore.invalidateShot(segment.index, 'image'))
      }
      await writeAssetDocuments([asset])
      return
    }
    const segment = mediaStore.segments.find((item) => item.index === Number(targetId))
    const translationGlobalPlan =
      targetType === 'seed-global-prompt' && isVideoTranslation.value
        ? await currentTranslationSeedPlan()
        : undefined
    const current =
      targetType === 'script'
        ? mediaStore.script
        : targetType === 'voice-plan'
          ? mediaStore.voicePlan?.voicePrompt
          : targetType === 'seed-role-prompt'
            ? mediaStore.seedAudioRolePrompts[targetId]
            : targetType === 'seed-global-prompt'
              ? mediaStore.seedAudioGlobalPrompt
              : targetType === 'shot'
                ? segment && stripMedia(segment)
                : targetType === 'image'
                  ? segment?.storyboardImagePrompt
                  : segment?.videoPrompt
    if (current == null) throw new Error('当前对象不存在')
    const translationSeedRole =
      targetType === 'seed-role-prompt' && isVideoTranslation.value
        ? translationRole(targetId)
        : undefined
    const seedRoleScript = translationSeedRole
      ? translationState()
          .cues.filter((cue) => cue.translationRoleId === targetId)
          .map((cue) => cue.translatedText.trim())
          .filter(Boolean)
          .join('\n')
      : mediaStore.approvedScript
    const revisionCharacter = translationSeedRole
      ? {
          id: translationSeedRole.translationRoleId,
          label: translationSeedRole.displayName,
          aliases: translationSeedRole.aliases,
          description: translationSeedRole.description || '',
        }
      : targetType === 'seed-role-prompt'
        ? seedRoleAsset(targetId)
        : undefined
    const request = {
      targetType,
      targetId,
      instruction,
      current,
      locks:
        targetType === 'script'
          ? { targetDuration: mediaStore.targetDuration, verifiedFacts: mediaStore.request }
          : targetType === 'voice-plan'
            ? {
                text: mediaStore.approvedScript,
                order: ['人设', '音色特征', '风格', '情感', '节奏'],
              }
            : targetType === 'seed-role-prompt'
              ? {
                  speakerId: targetId,
                  language: translationSeedRole ? translationVoiceLanguage() : seedScriptLanguage(),
                  approvedScript: seedRoleScript,
                }
              : targetType === 'seed-global-prompt'
                ? {
                    targetLanguage: translationState().targetLanguage,
                    preserveConfirmedDialogueExactly: true,
                    preserveDialogueOrder: true,
                    preserveReferenceMappings: true,
                    noTimestamps: true,
                    noExtraDialogueOrAudioEvents: true,
                  }
                : {
                    index: segment?.index,
                    script: segment?.script,
                    playDuration: segment?.playDuration,
                    generationDuration: segment?.generationDuration,
                    finalShotCount: mediaStore.finalShotCount,
                    styleId: mediaStore.styleId,
                    referenceAssetIds: segment?.referenceAssetIds,
                  },
      context:
        targetType === 'seed-role-prompt'
          ? { character: revisionCharacter, approvedScript: seedRoleScript }
          : targetType === 'seed-global-prompt'
            ? {
                targetLanguage: translationState().targetLanguage,
                confirmedTranslationCues: translationState().cues.map((cue) => ({
                  speakerId: cue.translationRoleId,
                  text: cue.translatedText,
                })),
                rolePrompts: mediaStore.videoTranslationRoles.map((role) => ({
                  speakerId: role.translationRoleId,
                  label: role.displayName,
                  prompt: mediaStore.seedAudioRolePrompts[role.translationRoleId] || '',
                })),
                referenceMappings: translationGlobalPlan!.arrangement.blocks.map((block) => ({
                  blockId: block.blockId,
                  references: block.references.map((reference, index) => ({
                    speakerId: reference.speakerId,
                    label: reference.label,
                    reference: `@音频${index + 1}`,
                  })),
                })),
              }
            : segment
              ? {
                  creativeIdentity: mediaStore.creativeIdentity,
                  sceneReference: mediaStore.sceneReference,
                  visualAnchor: mediaStore.visualAnchor,
                  previous: stripMedia(mediaStore.segments[segment.index - 2]),
                  next: stripMedia(mediaStore.segments[segment.index]),
                }
              : { request: mediaStore.request },
    }
    const raw = await window.electron.cloud.runSkill(
      'jc-context-revision',
      JSON.stringify(request),
      mediaStore.runId,
      mediaStore.textModel,
    )
    const proposal = parseRevisionProposal(raw, targetType, targetId)
    if (proposal.requiresReplan) {
      throw new Error(proposal.reason || '这项修改需要返回上游步骤重新生成')
    }
    if (targetType !== 'shot' && !String(proposal.revised || '').trim()) {
      throw new Error('AI 修改提案不能为空')
    }
    if (targetType === 'shot') validateShotRevision(segment!, proposal.revised)
    if (targetType === 'voice-plan')
      parseVoiceDesign(
        { text: mediaStore.approvedScript, voicePrompt: proposal.revised },
        mediaStore.approvedScript,
      )
    if (targetType === 'seed-global-prompt') {
      const revised = String(proposal.revised).trim()
      for (const block of translationGlobalPlan!.arrangement.blocks) {
        const heading = `## ${block.blockId}`
        const start = revised.indexOf(heading)
        if (start < 0) throw new Error(`AI 修改结果缺少 ${block.blockId}`)
        const bodyStart = start + heading.length
        const next = revised.indexOf('\n## ', bodyStart)
        validateVideoTranslationDialoguePrompt(
          revised.slice(bodyStart, next < 0 ? undefined : next).trim(),
          block,
        )
      }
    }
    if (
      targetType === 'video' &&
      !['单一连续镜头', '无切镜'].every((rule) => String(proposal.revised).includes(rule))
    ) {
      throw new Error('视频修改提案不符合单镜头合同')
    }
    if (targetType === 'image' || targetType === 'video') {
      const label = targetType === 'image' ? '1 张图片' : '1 条视频'
      if (!window.confirm(`将付费生成${label}的修改版本。旧版本会保留，是否继续？`)) return
      if (!segment) throw new Error('目标镜头不存在')
      const revisionIndex = Date.now()
      const prompt = String(proposal.revised).trim()
      const path =
        targetType === 'image'
          ? await window.electron.cloud.generateStoryboard({
              runId: mediaStore.runId,
              episodeId: mediaStore.episodeId,
              index: revisionIndex,
              prompt: `${prompt}\n\n${t('workflow.messages.visualAnchor')}：${mediaStore.visualAnchor}`,
              ratio: mediaStore.ratio,
              referencePaths: segment.imagePath
                ? [segment.imagePath]
                : segment.referenceAssetIds
                    .map((assetId) => {
                      const asset = mediaStore.referenceAssets.find((item) => item.id === assetId)
                      return asset?.versions.find((version) => version.id === asset.activeVersionId)
                        ?.relativePath
                    })
                    .filter((item): item is string => Boolean(item)),
            })
          : await window.electron.cloud.generateVideo({
              runId: mediaStore.runId,
              episodeId: mediaStore.episodeId,
              index: revisionIndex,
              model: mediaStore.videoModel,
              prompt: `${prompt}\n\n${videoSoundInstruction(segment)}`,
              ratio: mediaStore.ratio,
              generationDuration: segment.generationDuration,
              imagePath: segment.imagePath!,
            })
      proposal.revised = { prompt, path }
    }
    mediaStore.revisionProposal = proposal
    await applyRevision()
  })
}

function stripMedia(segment?: StoryboardSegment) {
  if (!segment) return null
  const {
    imagePath,
    videoPath,
    imageStatus,
    videoStatus,
    error,
    imageVersions,
    videoVersions,
    ...document
  } = segment
  return document
}

function validateShotRevision(current: StoryboardSegment, revised: any) {
  const candidate = mediaStore.segments.map((segment) =>
    segment.index === current.index
      ? {
          ...segment,
          ...revised,
          index: current.index,
          script: current.script,
          playDuration: current.playDuration,
          generationDuration: current.generationDuration,
          referenceAssetIds: current.referenceAssetIds,
          coreReferenceVisible: current.coreReferenceVisible,
        }
      : segment,
  )
  parseStoryboardPlan(
    {
      creativeIdentity: mediaStore.creativeIdentity,
      sceneReference: mediaStore.sceneReference,
      rhythmArchive: mediaStore.rhythmArchive,
      distributionIntent: mediaStore.distributionIntent,
      resolvedPace: mediaStore.resolvedPace,
      referenceShotCount: mediaStore.referenceShotCount,
      finalShotCount: mediaStore.finalShotCount,
      shotCountRationale: mediaStore.shotCountRationale,
      visualAnchor: mediaStore.visualAnchor,
      segments: candidate,
    },
    mediaStore.approvedScript,
    mediaStore.voiceDuration || mediaStore.targetDuration,
    mediaStore.shotPace,
    !(
      mediaStore.confirmedProductionRoute === 'drama' &&
      mediaStore.audioProductionRoute === 'post-dub'
    ),
  )
}

function shotMarkdown(segment: StoryboardSegment) {
  const assetLinks = segment.referenceAssetIds.map((id) => {
    const asset = mediaStore.referenceAssets.find((item) => item.id === id)
    if (!asset) throw new Error(`镜头 ${segment.index} 引用了不存在的资产 ${id}`)
    return `[[资产/${assetFolder(asset.role)}/${asset.id}|${asset.label}]]`
  })
  return `---
entityType: shot
entityId: shot-${String(segment.index).padStart(3, '0')}
shotIndex: ${segment.index}
status: draft
managedBy: short-video-factory
---

# 镜头 ${String(segment.index).padStart(2, '0')}

## 镜头参数

- 叙事作用：${segment.storyBeat}
- 镜头职责：${segment.shotRole}
- 剪辑处理：${segment.editTreatment}
- 播放时长：${segment.playDuration} 秒
- 生成时长：${segment.generationDuration} 秒
- 景别：${segment.shotSize}
- 机位：${segment.cameraAngle}
- 运镜：${segment.cameraMovement}
- 资产：${assetLinks.join('、') || '无'}

## 对应原文

${segment.script}

## 声音与时间轴

- 类型：${segment.timelineType === 'dialogue' ? '对白' : '无对白动作'}
- 对白角色：${segment.dialogueCharacter}
- 对应台词：${segment.timelineType === 'dialogue' ? segment.dialogueText || segment.script : '无'}
- 声音情绪：${segment.dialogueEmotion}
- 情绪强度：${segment.emotionIntensity}
- 语速：${segment.speechRate}
- 停顿/重音：${segment.pauseEmphasis}
- 对白时长：${segment.dialogueDuration || 0} 秒
- 动作节拍：${segment.startState} → ${segment.actionProgression} → ${segment.endState}
- 环境音/动作音：${segment.soundDesign}
- 口型/动作配合：${segment.lipSyncRequired ? '需要口型同步' : '不适用'}

## 起始状态

${segment.startState}

## 动作过程

${segment.actionProgression}

## 结束状态

${segment.endState}

## 画面提示词

${segment.storyboardImagePrompt}

## 视频提示词

${segment.videoPrompt}`
}

async function writeShotDocument(segment: StoryboardSegment) {
  const relativePath = `wiki/分镜/${mediaStore.episodeId}/镜头/shot-${String(segment.index).padStart(3, '0')}.md`
  const current = await window.electron.cloud.readMarkdown(mediaStore.runId, relativePath)
  await window.electron.cloud.writeMarkdown(
    mediaStore.runId,
    relativePath,
    shotMarkdown(segment),
    current.revision,
  )
}

async function applyRevision() {
  const proposal = mediaStore.revisionProposal
  if (!proposal) return
  const segment = mediaStore.segments.find((item) => item.index === Number(proposal.targetId))
  if (proposal.targetType === 'script') {
    captureUndo('script')
    editScript(String(proposal.revised))
  } else if (proposal.targetType === 'voice-plan' && mediaStore.voicePlan) {
    captureUndo('voice-plan')
    mediaStore.setVoicePrompt(String(proposal.revised))
  } else if (proposal.targetType === 'seed-role-prompt') {
    captureUndo('seed-role-prompt')
    if (isVideoTranslation.value)
      await saveTranslationSeedRolePrompt(proposal.targetId, String(proposal.revised).trim())
    else await saveSeedRolePrompt(proposal.targetId, String(proposal.revised).trim())
  } else if (proposal.targetType === 'seed-global-prompt') {
    captureUndo('seed-global-prompt')
    await saveTranslationSeedGlobalPrompt(String(proposal.revised).trim())
  } else if (proposal.targetType === 'shot' && segment) {
    captureUndo('shot')
    Object.assign(segment, proposal.revised, {
      index: segment.index,
      script: segment.script,
      playDuration: segment.playDuration,
      generationDuration: segment.generationDuration,
      referenceAssetIds: segment.referenceAssetIds,
      coreReferenceVisible: segment.coreReferenceVisible,
    })
    mediaStore.invalidateShot(segment.index, 'image')
    await writeShotDocument(segment)
  } else if (proposal.targetType === 'image' && segment) {
    if (segment.imagePath) segment.imageVersions?.push(segment.imagePath)
    segment.storyboardImagePrompt = proposal.revised.prompt
    segment.imagePath = proposal.revised.path
    segment.imageStatus = 'success'
    mediaStore.invalidateShot(segment.index, 'video')
  } else if (proposal.targetType === 'video' && segment) {
    if (segment.videoPath) segment.videoVersions?.push(segment.videoPath)
    segment.videoPrompt = proposal.revised.prompt
    segment.videoPath = proposal.revised.path
    segment.videoStatus = 'success'
    segment.transcriptStatus = 'pending'
    segment.transcriptMediaId = undefined
    segment.transcriptJsonPath = undefined
    segment.transcriptSrtPath = undefined
    segment.transcriptError = ''
    segment.editingStatus = 'pending'
    segment.editingAnalysis = undefined
    segment.editingError = ''
    mediaStore.editingTimelinePath = ''
    mediaStore.pictureMasterPath = ''
    mediaStore.invalidateAudioProcessing()
    mediaStore.stage = mediaStore.allVideosReady ? 'videos-ready' : 'storyboards-ready'
  }
  mediaStore.revisionProposal = null
}

function captureUndo(
  targetType:
    | 'script'
    | 'project-director'
    | 'voice-plan'
    | 'seed-role-prompt'
    | 'seed-global-prompt'
    | 'asset-prompt'
    | 'shot',
) {
  const value = JSON.parse(JSON.stringify(mediaStore.$state))
  value.revisionProposal = null
  value.revisionUndo = null
  mediaStore.revisionUndo = { targetType, value }
}

async function undoRevision() {
  const undo = mediaStore.revisionUndo
  if (!undo) return
  mediaStore.$patch(undo.value)
  mediaStore.revisionUndo = null
  if (undo.targetType === 'asset-prompt') {
    const asset = mediaStore.referenceAssets.find((item) => item.id === mediaStore.selectedAssetId)
    if (asset) await writeAssetDocuments([asset])
  } else if (undo.targetType === 'seed-global-prompt') {
    const state = translationState()
    const plan = await currentTranslationSeedPlan()
    const saved = await window.electron.cloud.writeVideoTranslationSeedPlan(
      mediaStore.runId,
      mediaStore.episodeId,
      state.targetLanguage,
      plan.arrangement,
      mediaStore.seedAudioGlobalPrompt,
    )
    state.seedArrangementPath = saved.arrangementPath
    state.seedPromptPath = saved.promptPath
    state.seedPromptText = mediaStore.seedAudioGlobalPrompt
    mediaStore.seedAudioArrangementPath = saved.arrangementPath
  } else if (undo.targetType === 'project-director' && mediaStore.projectDirectorPlan) {
    const path = `wiki/项目总监/${mediaStore.episodeId}.md`
    const current = await window.electron.cloud
      .readMarkdown(mediaStore.runId, path)
      .catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      path,
      projectDirectorMarkdown(mediaStore.projectDirectorPlan, mediaStore.episodeId),
      current?.revision,
    )
    const routePath = `wiki/项目总监/${mediaStore.episodeId}-制作路线.md`
    const currentRoute = await window.electron.cloud
      .readMarkdown(mediaStore.runId, routePath)
      .catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      routePath,
      productionRouteMarkdown(
        mediaStore.projectDirectorPlan,
        mediaStore.audioProductionRoute,
        mediaStore.episodeId,
      ),
      currentRoute?.revision,
    )
    await writeAssetDocuments(mediaStore.referenceAssets)
  }
}

function showFinal() {
  if (mediaStore.finalPath) window.electron.cloud.showMedia(mediaStore.runId, mediaStore.finalPath)
}
async function exportFinal() {
  if (mediaStore.finalPath)
    await window.electron.cloud.exportMedia(mediaStore.runId, mediaStore.finalPath)
}

async function generateVideo(
  segment: StoryboardSegment,
  imagePaths: string[] = [],
  prompt = videoPromptWithSound(segment),
  generationDuration = segment.generationDuration,
) {
  if (!segment.imagePath) return
  const runId = mediaStore.runId
  segment.videoStatus = 'running'
  segment.transcriptStatus = 'pending'
  segment.transcriptMediaId = undefined
  segment.transcriptJsonPath = undefined
  segment.transcriptSrtPath = undefined
  segment.transcriptError = ''
  segment.editingStatus = 'pending'
  segment.editingAnalysis = undefined
  segment.editingError = ''
  segment.error = ''
  try {
    segment.videoPath = await window.electron.cloud.generateVideo({
      runId,
      episodeId: mediaStore.episodeId,
      index: segment.index,
      model: mediaStore.videoModel,
      prompt,
      ratio: mediaStore.ratio,
      generationDuration,
      imagePath: segment.imagePath,
      imagePaths,
    })
    if (mediaStore.runId !== runId) return
    segment.videoStatus = 'success'
  } catch (error) {
    segment.videoStatus = 'failed'
    segment.error = error instanceof Error ? error.message : String(error)
  }
}

async function retryImage(index: number) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  try {
    await generateImage(segment)
    if (segment.imageStatus !== 'success')
      throw new Error(segment.error || t('workflow.messages.imageFailed'))
    segment.videoPath = ''
    segment.videoStatus = 'pending'
    segment.transcriptStatus = 'pending'
    segment.transcriptMediaId = undefined
    segment.transcriptJsonPath = undefined
    segment.transcriptSrtPath = undefined
    segment.transcriptError = ''
    segment.editingStatus = 'pending'
    segment.editingAnalysis = undefined
    segment.editingError = ''
    mediaStore.editingTimelinePath = ''
    mediaStore.pictureMasterPath = ''
    mediaStore.invalidateAudioProcessing()
    if (mediaStore.allImagesReady) mediaStore.stage = 'storyboards-ready'
  } finally {
    await refreshCloudTasks()
  }
}

async function retryVideo(index: number) {
  const segment = mediaStore.segments.find((item) => item.index === index)
  if (!segment) return
  try {
    await generateVideo(segment)
    if (segment.videoStatus !== 'success')
      throw new Error(segment.error || t('workflow.messages.videoFailed'))
    mediaStore.editingTimelinePath = ''
    mediaStore.pictureMasterPath = ''
    mediaStore.invalidateAudioProcessing()
    if (mediaStore.allVideosReady) mediaStore.stage = 'videos-ready'
  } finally {
    await refreshCloudTasks()
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0
  const failures: unknown[] = []
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && !mediaStore.cancelRequested) {
        const item = items[next++]
        try {
          await worker(item)
        } catch (error) {
          failures.push(error)
        }
      }
    }),
  )
  if (failures.length)
    throw new Error(
      failures.map((error) => (error instanceof Error ? error.message : String(error))).join('\n'),
    )
}

async function cancelWorkflow() {
  if (!mediaStore.runId || !mediaStore.busyAction) return
  mediaStore.cancelRequested = true
  await window.electron.cloud.cancelRun(mediaStore.runId)
  mediaStore.segments.forEach((segment) => {
    if (segment.imageStatus === 'running') segment.imageStatus = 'cancelled'
    if (segment.videoStatus === 'running') segment.videoStatus = 'cancelled'
  })
  toast.warning(t('workflow.messages.cancelled'))
}

async function restoreWorkflow() {
  projectSwitching.value = true
  try {
    await refreshProjects()
    if (!projects.value.length) {
      projectSwitching.value = false
      await newProject(false)
      return
    }
    const lastOpened = await window.electron.cloud.getLastOpenedProject()
    const projectId = projects.value.some((project) => project.projectId === lastOpened)
      ? lastOpened!
      : projects.value.some((project) => project.projectId === mediaStore.runId)
        ? mediaStore.runId
        : projects.value[0].projectId
    const episodeId = projects.value.find(
      (project) => project.projectId === projectId,
    )?.lastOpenedEpisodeId
    if (!episodeId) throw new Error('项目没有可打开的剧集')
    const saved = await window.electron.cloud.loadProject(projectId, episodeId)
    mediaStore.reset()
    mediaStore.$patch(deserializeMediaTask(saved))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    await refreshCloudTasks(projectId)
  } catch (error) {
    toast.warning(
      `上次项目无法恢复，已打开空白项目：${error instanceof Error ? error.message : String(error)}`,
    )
    projectSwitching.value = false
    await newProject(false)
  } finally {
    projectSwitching.value = false
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => mediaStore.audioProductionRoute,
  async () => {
    if (projectSwitching.value || !mediaStore.runId || !mediaStore.projectDirectorPlan) return
    const routePath = `wiki/项目总监/${mediaStore.episodeId}-制作路线.md`
    try {
      const current = await window.electron.cloud.readMarkdown(mediaStore.runId, routePath)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        routePath,
        `---\nentityType: production-route\nentityId: ${mediaStore.episodeId}\nstatus: confirmed\nmanagedBy: short-video-factory\nsourceDocument: wiki/项目总监/${mediaStore.episodeId}.md\n---\n\n${productionRouteMarkdown(mediaStore.projectDirectorPlan, mediaStore.audioProductionRoute, mediaStore.episodeId)}`,
        current.revision,
      )
    } catch (error) {
      toast.error(
        `声音路线 Wiki 同步失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  },
)
watch(isDubbingWorkspace, (active) => {
  if (!active) return
  dubbingRightOpen.value = true
})
watch(
  () => [mediaStore.episodeId, mediaStore.videoTranslation?.sourceFingerprint],
  () => {
    selectedTranslationCueId.value = mediaStore.videoTranslation?.cues[0]?.cueId || ''
  },
)
watch(
  () => mediaStore.$state,
  () => {
    clearTimeout(persistTimer)
    if (!mediaStore.runId || projectSwitching.value || !currentProjectRegistered()) return
    persistTimer = setTimeout(() => {
      void window.electron.cloud.saveState(
        mediaStore.runId,
        mediaStore.episodeId,
        serializeMediaTask(mediaStore.$state),
      )
    }, 100)
  },
  { deep: true },
)

let taskRefreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await restoreWorkflow()
  window.addEventListener('keydown', closeTaskDrawer)
  taskRefreshTimer = setInterval(() => void refreshCloudTasks(), 1_000)
})

let dragState: {
  startMouseX: number
  startMouseY: number
  startClientX: number
  startWindowX: number
  startWindowY: number
  dragging: boolean
  preparing: boolean
} | null = null

function clearTitleBarDragListeners() {
  window.removeEventListener('mousemove', handleTitleBarMouseMove)
  window.removeEventListener('mouseup', handleTitleBarMouseUp)
}

async function handleTitleBarMouseMove(event: MouseEvent) {
  if (!isMac || !dragState) return
  const deltaX = event.screenX - dragState.startMouseX
  const deltaY = event.screenY - dragState.startMouseY
  if (!dragState.dragging && Math.hypot(deltaX, deltaY) < 2) return
  if (!dragState.dragging) {
    if (dragState.preparing) return
    dragState.preparing = true
    const dragInfo = await window.electron.prepareWindowDrag()
    if (!dragState || !dragInfo) return
    let initialX = dragInfo.bounds.x
    let initialY = dragInfo.bounds.y
    if (dragInfo.wasMaximized) {
      initialX =
        event.screenX - dragInfo.bounds.width * (dragState.startClientX / window.innerWidth)
      initialY = Math.max(0, event.screenY - 20)
      window.electron.setWindowPosition(initialX, initialY)
    }
    dragState.startMouseX = event.screenX
    dragState.startMouseY = event.screenY
    dragState.startWindowX = initialX
    dragState.startWindowY = initialY
  }
  dragState.dragging = true
  window.electron.setWindowPosition(
    dragState.startWindowX + event.screenX - dragState.startMouseX,
    dragState.startWindowY + event.screenY - dragState.startMouseY,
  )
}

function handleTitleBarMouseUp() {
  dragState = null
  clearTitleBarDragListeners()
}

async function handleTitleBarMouseDown(event: MouseEvent) {
  if (!isMac || event.button !== 0 || event.detail > 1) return
  const bounds = await window.electron.getWindowBounds()
  if (!bounds) return
  dragState = {
    startMouseX: event.screenX,
    startMouseY: event.screenY,
    startClientX: event.clientX,
    startWindowX: bounds.x,
    startWindowY: bounds.y,
    dragging: false,
    preparing: false,
  }
  clearTitleBarDragListeners()
  window.addEventListener('mousemove', handleTitleBarMouseMove)
  window.addEventListener('mouseup', handleTitleBarMouseUp)
}

function handleTitleBarDoubleClick() {
  if (isMac) window.electron.toggleWindowMaximize()
}

function closeTaskDrawer(event: KeyboardEvent) {
  if (event.key === 'Escape') taskDrawerOpen.value = false
}

onBeforeUnmount(() => {
  clearTimeout(persistTimer)
  clearTimeout(subtitleSaveTimer)
  clearInterval(taskRefreshTimer)
  window.removeEventListener('keydown', closeTaskDrawer)
  clearTitleBarDragListeners()
})
</script>

<style scoped>
.title-bar {
  user-select: none;
}
.project-bar {
  min-height: 48px;
}
.project-create,
.project-select {
  height: 40px;
}
.project-select {
  max-width: 360px;
}
.episode-select {
  width: 150px;
}
.project-rename-input {
  width: 220px;
}
.episode-create {
  white-space: nowrap;
}
.episode-select :deep(.v-field),
.project-rename-input :deep(.v-field) {
  height: 40px;
}
.project-select :deep(.v-field) {
  height: 40px;
  color: rgb(var(--v-theme-primary));
}
.task-drawer-heading {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.task-drawer-backdrop {
  position: fixed;
  z-index: 29;
  inset: 40px 0 0;
  background: rgba(0, 0, 0, 0.18);
}
.task-drawer {
  position: fixed;
  z-index: 30;
  top: 40px;
  right: 0;
  bottom: 0;
  width: min(340px, 92vw);
  overflow-y: auto;
  background: rgb(var(--v-theme-surface));
  border-left: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.14);
}
.task-empty {
  padding: 24px 14px;
  color: rgba(0, 0, 0, 0.58);
  font-size: 13px;
  text-align: center;
}
.task-list {
  display: grid;
  gap: 8px;
  padding: 10px;
}
.task-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}
.task-title,
.task-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.task-title strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.task-error {
  color: rgb(var(--v-theme-error));
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.task-actions {
  justify-content: flex-end;
}
.workspace-grid {
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(250px, 0.82fr) minmax(420px, 1.55fr) minmax(300px, 1fr);
}
.workspace-grid.translation-workspace-mode {
  grid-template-columns: minmax(210px, 0.52fr) minmax(620px, 1.8fr) minmax(310px, 0.72fr);
}
.workspace-grid.translation-voice-mode {
  grid-template-columns: minmax(720px, 1fr) minmax(300px, 0.42fr);
}
.workspace-grid.translation-dubbing-mode {
  grid-template-columns: minmax(0, 1fr) minmax(310px, 0.42fr);
}
.workspace-grid.left-collapsed {
  grid-template-columns: minmax(520px, 1fr) minmax(300px, 0.52fr);
}
.workspace-grid.dubbing-workspace-mode.left-collapsed {
  grid-template-columns: minmax(720px, 1fr) minmax(300px, 0.42fr);
}
.workspace-grid.left-collapsed.right-collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.inspector-toggle {
  display: none;
}
@media (max-width: 1080px) {
  .workspace-grid {
    grid-template-columns: minmax(230px, 0.75fr) minmax(360px, 1.35fr);
  }
  .workspace-grid.left-collapsed,
  .workspace-grid.left-collapsed.right-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .workspace-grid.translation-workspace-mode {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }
  .workspace-grid.translation-workspace-mode > * {
    min-height: 360px;
  }
  .inspector-toggle {
    display: inline-grid;
    position: fixed;
    z-index: 21;
    top: 48px;
    right: 12px;
  }
  .inspector-column {
    position: fixed;
    z-index: 20;
    top: 52px;
    right: 12px;
    bottom: 12px;
    width: min(360px, calc(100vw - 24px));
    transform: translateX(calc(100% + 24px));
    transition: transform 160ms ease;
    pointer-events: none;
  }
  .inspector-column.open {
    transform: none;
    pointer-events: auto;
  }
  .workspace-grid.translation-voice-mode {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 0.42fr);
    overflow: hidden;
  }
  .workspace-grid.translation-voice-mode > * {
    min-height: 0;
  }
  .workspace-grid.translation-voice-mode .inspector-column {
    position: static;
    width: auto;
    transform: none;
    pointer-events: auto;
  }
}
</style>
