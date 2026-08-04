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
      <v-btn
        icon="mdi-pencil-outline"
        variant="text"
        size="small"
        title="重命名项目"
        :disabled="!mediaStore.runId || projectSwitching"
        @click="renameCurrentProject"
      />
      <v-btn
        icon="mdi-folder-open-outline"
        variant="text"
        size="small"
        title="在访达中显示"
        :disabled="!mediaStore.runId"
        @click="showCurrentProject"
      />
      <template v-if="isDubbingWorkspace">
        <v-btn
          :icon="dubbingLeftOpen ? 'mdi-chevron-double-left' : 'mdi-chevron-double-right'"
          variant="text"
          size="small"
          :color="dubbingLeftOpen ? 'primary' : undefined"
          :title="dubbingLeftOpen ? '收起左侧项目设置' : '展开左侧项目设置'"
          @click="dubbingLeftOpen = !dubbingLeftOpen"
        />
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
              v-if="task.status !== 'success' && task.status !== 'generating' && task.status !== 'downloading'"
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
        'dubbing-workspace-mode': isDubbingWorkspace,
        'left-collapsed': !leftPanelVisible,
        'right-collapsed': !rightPanelVisible,
      }"
    >
      <TextGenerate v-show="leftPanelVisible" @import-markdown="importMarkdown" />
      <VideoManage
        @edit-script="editScript"
        @markdown-saved="reloadStoryboardMarkdown"
        @upload-asset-reference="uploadAssetReference"
      />
      <v-btn
        v-if="!isDubbingWorkspace"
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
          @generate-script="generateScript"
          @approve-script="approveScript"
          @generate-project-director="generateProjectDirector"
          @confirm-project-director="confirmProjectDirector"
          @edit-script-mode="mediaStore.scriptEditing = true"
          @generate-shot-plan="generateShotPlan"
          @prepare-assets="prepareAssetPrompts"
          @search-assets="searchAssets"
          @generate-assets="generateAssets"
          @generate-storyboards="generateStoryboards"
          @generate-videos="generateVideos"
          @generate-srt="generateMaterialSrts"
          @generate-editing-timeline="generateEditingTimeline"
          @compose="composeVideo"
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
import { useMediaTaskStore } from '@/store'
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
import { assetGenerationChanged, assetVersionMatches, isLegacyStoryboardMarkdown, mergeStoryboardMedia, parseStoryboardMarkdown, withProjectDesign } from '@/runtime/storyboardMarkdown'
import { deserializeMediaTask, serializeMediaTask } from '@/runtime/mediaPersistence'
import { buildEditingTimeline, episodeVoiceTasks } from '@/runtime/editingTimeline'
import { uniqueTranscriptInputs } from '@/runtime/materialTranscript'
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
const dubbingLeftOpen = ref(false)
const dubbingRightOpen = ref(true)
const taskDrawerOpen = ref(false)
const projects = ref<ProjectManifest[]>([])
const projectSwitching = ref(false)
const currentProject = computed(() =>
  projects.value.find((project) => project.projectId === mediaStore.runId),
)
const isDubbingWorkspace = computed(() => mediaStore.workspaceView === 'dubbing')
const leftPanelVisible = computed(() => !isDubbingWorkspace.value || dubbingLeftOpen.value)
const rightPanelVisible = computed(() => !isDubbingWorkspace.value || dubbingRightOpen.value)
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
        asset.status = task.status === 'generating' || task.status === 'downloading' ? 'generating' : 'failed'
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
  return { voice: '配音', asset: '资产图', storyboard: '分镜图', video: '视频' }[kind]
}

function taskStatusLabel(task: PendingCloudTask) {
  if (task.status === 'stopped') return task.resumeFrom === 'downloading' ? '等待继续下载' : '已停止等待'
  if (task.status === 'failed') return task.resumeFrom === 'downloading' ? '下载失败' : '生成失败'
  return {
    queued: '排队中',
    generating: '生成中',
    downloading: '下载中',
    success: '已完成',
  }[task.status as 'queued' | 'generating' | 'downloading' | 'success'] || '生成失败'
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
  return ['failed', 'stopped'].includes(task.status || '') && Boolean(task.resultUrl || task.pollRoute)
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
    if (task.kind === 'asset') {
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

async function saveCurrentProject() {
  clearTimeout(persistTimer)
  if (mediaStore.runId)
    await window.electron.cloud.saveState(mediaStore.runId, serializeMediaTask(mediaStore.$state))
}

async function newProject(showToast = true) {
  if (mediaStore.busyAction || projectSwitching.value) return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    mediaStore.reset()
    mediaStore.runId = createRunId()
    await window.electron.cloud.createProject(
      mediaStore.runId,
      serializeMediaTask(mediaStore.$state),
    )
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

async function switchProject(projectId: string | null) {
  if (
    !projectId ||
    projectId === mediaStore.runId ||
    projectSwitching.value ||
    mediaStore.busyAction
  ) return
  projectSwitching.value = true
  try {
    await saveCurrentProject()
    const state = await window.electron.cloud.loadProject(projectId)
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

async function renameCurrentProject() {
  const current = currentProject.value
  if (!current) return
  const name = window.prompt('项目名称', current.name)?.trim()
  if (!name || name === current.name) return
  try {
    await window.electron.cloud.renameProject(current.projectId, name)
    await refreshProjects()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
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
    const current = await window.electron.cloud.readMarkdown(
      mediaStore.runId,
      'wiki/文稿/确认文稿.md',
    ).catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      'wiki/文稿/确认文稿.md',
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

async function confirmProjectDirector() {
  await runAction('project-director-confirm', async () => {
    const draft = mediaStore.projectDirectorDraft
    if (!draft) throw new Error('请先生成项目总监方案')
    if (
      mediaStore.projectDirectorPlan &&
      !window.confirm('确认新方案会保留仍在清单中的资产，并清空后续分镜、媒体和成片，是否继续？')
    ) return
    const previousState = JSON.parse(JSON.stringify(mediaStore.$state))
    const confirmed = confirmProjectDirectorDraft(
      draft,
      mediaStore.referenceAssets,
    )
    try {
      captureUndo('project-director')
      const path = 'wiki/项目/项目总监.md'
      const current = await window.electron.cloud.readMarkdown(mediaStore.runId, path).catch(() => null)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        path,
        `---\nentityType: project-director\nentityId: project-director\nstatus: confirmed\nmanagedBy: short-video-factory\ngeneratedBySkill: jc-film-style\nsourceDocument: wiki/文稿/确认文稿.md\n---\n\n${projectDirectorMarkdown(confirmed.plan)}`,
        current?.revision,
      )
      const routePath = 'wiki/项目/制作路线.md'
      const currentRoute = await window.electron.cloud.readMarkdown(mediaStore.runId, routePath).catch(() => null)
      await window.electron.cloud.writeMarkdown(
        mediaStore.runId,
        routePath,
        `---\nentityType: production-route\nentityId: production-route\nstatus: confirmed\nmanagedBy: short-video-factory\nsourceDocument: wiki/项目/项目总监.md\n---\n\n${productionRouteMarkdown(confirmed.plan)}`,
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
  try {
    await action()
  } catch (error) {
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
    mediaStore.busyAction = ''
  }
}

async function generateShotPlan() {
  await runAction('shot-plan', async () => {
    if (!mediaStore.confirmedProductionRoute || !mediaStore.projectDirectorPlan)
      throw new Error('请先确认项目总监方案')
    if (!mediaStore.assetPlanningComplete) throw new Error('请先准备角色、场景和道具资产提示词')
    if (!mediaStore.allRequiredAssetsApproved) throw new Error('请先确认全部必需资产')
    const referenceShotCount =
      mediaStore.shotPace === 'auto'
        ? undefined
        : expectedShotCount(mediaStore.voiceDuration || mediaStore.targetDuration, mediaStore.shotPace)
    const skillInput = {
      script: mediaStore.approvedScript,
      targetDuration: mediaStore.targetDuration,
      ...(mediaStore.voiceDuration ? { actualDuration: mediaStore.voiceDuration } : {}),
      shotPace: mediaStore.shotPace,
      ratio: mediaStore.ratio,
      style: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId),
      projectDirector: mediaStore.projectDirectorPlan,
    }
    const previousState = JSON.parse(JSON.stringify(mediaStore.$state))
    const transactionId = await window.electron.cloud.beginStoryboardUpdate(mediaStore.runId)
    try {
      const result = await window.electron.cloud.runWikiSkill(
        'jc-script-storyboard',
        `${JSON.stringify({ ...skillInput, referenceShotCount }, null, 2)}\n\n读取 wiki/项目/项目总监.md、wiki/文稿/确认文稿.md 和已确认资产页面。严格继承项目总监确定的导演与作品，按 Skill 的 Markdown 合同写入导演总览和每个单镜；只能绑定现有资产 ID，不得创建或修改资产。`,
        mediaStore.runId,
        mediaStore.textModel,
      )
      await reloadStoryboardMarkdown(result.writtenPaths)
      await window.electron.cloud.commitStoryboardUpdate(
        mediaStore.runId,
        transactionId,
        result.writtenPaths,
      )
    } catch (error) {
      await window.electron.cloud.rollbackStoryboardUpdate(mediaStore.runId, transactionId)
      mediaStore.$patch(previousState)
      throw error
    }
    mediaStore.stage = 'shot-plan-ready'
    mediaStore.selectView('storyboard')
  })
}

async function reloadStoryboardMarkdown(runPaths?: string[]) {
    let upstreamChanged = false
    const scriptDocument = await window.electron.cloud.readMarkdown(
      mediaStore.runId,
      'wiki/文稿/确认文稿.md',
    ).catch(() => null)
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
    const directorAssetIds = new Set(mediaStore.projectDirectorPlan?.assets.map((asset) => asset.id) || [])
    const documents = await Promise.all(
      paths
        .filter((value) =>
          (value.startsWith('wiki/资产/') && directorAssetIds.has(value.split('/').pop()!.replace(/\.md$/, ''))) ||
          ((!selectedPaths || selectedPaths.has(value)) &&
            (value === 'wiki/分镜/导演总览.md' || value.startsWith('wiki/分镜/镜头/'))),
        )
        .map((value) => window.electron.cloud.readMarkdown(mediaStore.runId, value)),
    )
    const director = documents.find((document) => document.path === 'wiki/分镜/导演总览.md')
    if (!director) return
    if (isLegacyStoryboardMarkdown(director.content)) return
    const parsed = parseStoryboardMarkdown(
      director,
      documents.filter((document) => document.path.startsWith('wiki/分镜/镜头/')),
      documents.filter((document) => document.path.startsWith('wiki/资产/')),
      mediaStore.approvedScript,
      mediaStore.voiceDuration || mediaStore.targetDuration,
      mediaStore.shotPace,
    )
    const plan = parsed.plan
    const directorPlan = mediaStore.projectDirectorPlan
    if (
      directorPlan &&
      ![directorPlan.direction.director, directorPlan.direction.referenceWork].every((value) =>
        plan.creativeIdentity.includes(value),
      )
    ) throw new Error('导演分镜没有继承项目总监确定的导演与参考作品')
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
      mediaStore.finalPath = ''
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
sourceDocument: wiki/项目/项目总监.md
---

# ${asset.label}

- 项目总监：[[../../项目/项目总监]]

## 说明

${asset.description}

叙事职责：${asset.storyFunction || '未记录'}

来源依据：${asset.evidence || '[[../../文稿/确认文稿]]'}

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

function completeAssetDesign(role: AssetRole, input: Record<string, any>, label: string, description: string) {
  const design = JSON.parse(JSON.stringify(input || {})) as Record<string, any>
  if (role === 'scene') {
    design.scene = { name: label, episode: '本集', timeOfDay: '未记录', era: '现代', location: '未记录', type: '室内', function: description, medium: '漫剧', genre: '剧情', visualStyle: '韩漫', ...design.scene }
    design.space = { shape: '结构清晰、具有纵深的空间', size: '中等', zones: [], furnitureLayout: '功能分区明确', ...design.space }
    design.surfaces = { walls: '韩漫风格墙面', floor: '整洁地面', ceiling: '标准层高、基础灯具', ...design.surfaces }
    design.objectDensity ||= '适中'
    design.landmarks ||= []
    design.lighting = { naturalLight: [], artificialLight: [], dominantSource: '环境主光', colorPalette: { primary: '冷色', secondary: '中性色', accent: '暗红' }, ...design.lighting }
    design.onImageText ||= { name: { text: label, position: '左上角', style: '中号字' }, subtitle: { text: '本集场景', position: '名称下方', style: '小号字' }, labels: [] }
    design.views = { masterShot: '空镜全景、展示空间全貌', alternateAngles: [], ...design.views }
    design.background ||= '自然环境空场景'
    design.presentationLighting ||= '均匀柔光、无人物、无戏剧阴影'
    design.layout ||= '主镜头大图与关键区域特写'
    design.noHumans = true
  } else if (role === 'prop') {
    design.project ||= {}
    design.prop = { name: label, category: '日常用品', owner: '未指定', era: '现代', medium: '漫剧', genre: '剧情', visualStyle: '韩漫', ...design.prop }
    design.shape = { silhouette: `${label} 的清晰轮廓`, components: [], proportion: { length: '未记录', width: '未记录', thickness: '未记录' }, ...design.shape }
    design.material = { primary: '常见材质', secondary: [], surface: '整洁', color: '符合项目风格', texture: '细腻材质纹理', ...design.material }
    design.wearAndTear = { level: '轻微使用', details: [], ...design.wearAndTear }
    design.markings ||= []
    design.decorations ||= []
    design.onImageText ||= { name: { text: label, position: '左上角', style: '中号字' }, subtitle: { text: '道具设定', position: '名称下方', style: '小号字' }, labels: [] }
    design.closeups ||= []
    design.views = { front: '正面展示整体形状', side: '侧面展示厚度', back: '背面展示结构', top: '俯视展示顶部细节', detailCloseup: '关键特征特写', ...design.views }
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
  if (!searchQuery || searchQuery.length > 160 || !validAssetSearchQuery(asset.role, design, searchQuery))
    throw new Error(`${asset.label} 的参考图搜索词必须使用现实电影、电视剧或广告参考，不得包含项目画风`)
  return {
    ...asset,
    design,
    searchQuery,
    status: 'design-ready',
    generatedBySkill: assetSkill(asset),
    sourceDocument: 'wiki/项目/项目总监.md',
  }
}

async function writeAssetDocuments(assets: ReferenceAsset[]) {
  await Promise.all(
    assets.map(async (asset) => {
      const relativePath = `wiki/资产/${assetFolder(asset.role)}/${asset.id}.md`
      const current = await window.electron.cloud.readMarkdown(mediaStore.runId, relativePath).catch(() => null)
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
        failures.push(`${pending[index].label}：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
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
    character: ['character', 'personality', 'face', 'body', 'clothing', 'views', 'background', 'lighting', 'layout'],
    scene: ['scene', 'space', 'surfaces', 'landmarks', 'lighting', 'views', 'background', 'presentationLighting', 'layout', 'noHumans'],
    prop: [],
  }[role]
  return role === 'prop'
    ? validPropDesign(value)
    : keys.every((key) => key in (value as Record<string, unknown>))
}

function validAssetSearchQuery(role: AssetRole, _design: Record<string, any>, query: string) {
  const value = query.toLowerCase()
  if (/webtoon|manhwa|manga|anime|animation|concept art|background art|character sheet|key visual/i.test(value))
    return false
  return {
    character: /film character portrait|movie character still|cast portrait|full body/.test(value),
    scene: /(film|movie|television|tv|commercial) still/.test(value) && /wide|establishing/.test(value),
    prop: /movie prop|film prop|product commercial|commercial still|product reference|close up/.test(value),
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
        !asset.versions.some((version) => version.source === 'upload' || version.source === 'search'),
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
        asset.design &&
        !asset.versions.some((version) => assetVersionMatches(asset, version)),
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
    const relativePath = mediaStore.currentGeneratedAssetVersion(assetId)?.relativePath
    if (!asset || !relativePath) throw new Error('Grok 序列绑定资产缺少当前版本')
    return { asset, relativePath }
  })
}

async function generateStoryboards() {
  try {
    if (!mediaStore.segments.length) throw new Error(t('workflow.messages.shotPlanFirst'))
    validateShotPlan()
    if (!mediaStore.allRequiredAssetsApproved) throw new Error('请先确认全部必需资产')
    const grokSequences = mediaStore.videoModel === 'rh-grok-image-video' ? buildGrokSequences(mediaStore.segments) : []
    grokSequences.forEach((sequence) => {
      const leader = sequence.segments[0]
      if (leader.imageStatus === 'success' && leader.imagePath)
        sequence.segments.forEach((segment) => { segment.imagePath = leader.imagePath; segment.imageStatus = 'success' })
    })
    const pendingImages: any[] = mediaStore.videoModel === 'rh-grok-image-video'
      ? grokSequences.filter((sequence) => sequence.segments[0].imageStatus !== 'success')
      : unfinishedSegments(mediaStore.segments, 'image')
    if (
      pendingImages.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '图片', count: pendingImages.length }),
      )
    )
      return
    if (mediaStore.videoModel === 'rh-grok-image-video') {
      await pool(pendingImages, pendingImages.length, async (sequence) => {
        const leader = sequence.segments[0]
        const references = grokSequenceAssets(sequence)
        const prompt = sequence.segments.map((segment: StoryboardSegment) => `第${segment.index}镜（${segment.playDuration.toFixed(1)}秒）：${segment.storyboardImagePrompt}`).join('\n')
          + `\n\n${grokStoryboardBoardInstruction(sequence.segments.length)}`
          + `\n\n${grokReferenceGuide(references.map(({ asset }) => asset), false)}`
          + `\n\n${t('workflow.messages.visualAnchor')}：${mediaStore.visualAnchor}`
        leader.imageStatus = 'running'
        leader.imagePath = await window.electron.cloud.generateStoryboard({ runId: mediaStore.runId, index: leader.index, prompt, ratio: mediaStore.ratio, referencePaths: references.map(({ relativePath }) => relativePath) })
        sequence.segments.forEach((segment: StoryboardSegment) => { segment.imagePath = leader.imagePath; segment.imageStatus = 'success' })
      })
    } else await pool(pendingImages, pendingImages.length, generateImage)
    if (!mediaStore.allImagesReady) {
      const errors = [...new Set(pendingImages.flatMap((item) => 'error' in item ? [item.error] : []).filter(Boolean))]
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
    const grokSequences = mediaStore.videoModel === 'rh-grok-image-video' ? buildGrokSequences(mediaStore.segments) : []
    grokSequences.forEach((sequence) => {
      const leader = sequence.segments[0]
      if (leader.videoStatus === 'success' && leader.videoPath)
        sequence.segments.forEach((segment) => { segment.videoPath = leader.videoPath; segment.videoStatus = 'success' })
    })
    const pendingVideos: any[] = mediaStore.videoModel === 'rh-grok-image-video'
      ? grokSequences.filter((sequence) => sequence.segments[0].videoStatus !== 'success')
      : unfinishedSegments(mediaStore.segments, 'video')
    if (
      pendingVideos.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '视频', count: pendingVideos.length }),
      )
    )
      return
    if (mediaStore.videoModel === 'rh-grok-image-video') {
      await pool(pendingVideos, pendingVideos.length, async (sequence) => {
        const leader = sequence.segments[0]
        if (leader.videoStatus !== 'success' || !leader.videoPath) {
          const references = grokSequenceAssets(sequence)
          const timedPrompt = sequence.segments.map((segment: StoryboardSegment, index: number) => {
            const start = sequence.segments.slice(0, index).reduce((sum: number, item: StoryboardSegment) => sum + item.playDuration, 0)
            return `[${start.toFixed(1)}-${(start + segment.playDuration).toFixed(1)}秒] ${videoPromptWithSound(segment)}`
          }).join('\n')
            + '\n连续完成以上时间段，按导演要求切换景别和机位；保持角色、场景、道具连续，不要输出分镜板、边框、拼贴或分屏。'
            + `\n\n${grokReferenceGuide(references.map(({ asset }) => asset), true)}`
          await generateVideo(leader, references.map(({ relativePath }) => relativePath), timedPrompt, sequence.generationDuration)
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
      const targets = mediaStore.segments.filter((segment) => input.segmentIndexes.includes(segment.index))
      if (targets.every((segment) => segment.transcriptStatus === 'ready' && segment.transcriptMediaId === input.mediaId))
        continue
      targets.forEach((segment) => {
        segment.transcriptStatus = 'running'
        segment.transcriptError = ''
      })
      try {
        const result = await window.electron.cloud.generateMaterialTranscript({
          runId: mediaStore.runId,
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
      const targets = mediaStore.segments.filter((segment) => input.segmentIndexes.includes(segment.index))
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
          mediaId: input.mediaId,
          videoPath: input.videoPath,
          transcriptJsonPath: evidence.transcriptJsonPath,
          transcriptSrtPath: evidence.transcriptSrtPath,
          approvedScript: mediaStore.approvedScript,
          shots: targets.map((segment) => ({
            shotId: `shot-${String(segment.index).padStart(3, '0')}`,
            script: segment.script,
            soundType: segment.soundType || (segment.timelineType === 'dialogue' ? 'onscreen' : 'none'),
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
    if (!mediaStore.segments.every((segment) => segment.editingStatus === 'ready' && segment.editingAnalysis))
      throw new Error(failures.join('\n') || '部分素材剪辑分析失败')
    const timeline = buildEditingTimeline(
      mediaStore.segments.map((segment) => segment.editingAnalysis!),
      mediaStore.confirmedProductionRoute || 'drama',
    )
    mediaStore.editingTimelinePath = await window.electron.cloud.writeEditingTimeline(mediaStore.runId, timeline)
    mediaStore.pictureMasterPath = ''
    mediaStore.finalPath = ''
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

async function ensurePictureMaster() {
  const timeline = currentEditingTimeline()
  if (!mediaStore.pictureMasterPath)
    mediaStore.pictureMasterPath = await window.electron.cloud.composePictureMaster({
      runId: mediaStore.runId,
      ratio: mediaStore.ratio,
      timeline,
    })
  return timeline
}

async function composeVideo() {
  await runAction('compose', async () => {
    if (!mediaStore.allVideosReady)
      throw new Error(t('workflow.messages.assetsIncomplete'))
    const timeline = await ensurePictureMaster()
    if (mediaStore.workflowStep !== 'final' && !mediaStore.voiceReady) {
      mediaStore.selectStep('voice')
      toast.success('画面母版已生成')
      return
    }
    if (mediaStore.audioMode === 'replace-preserve-ambience' && mediaStore.segments.some((segment) => segment.soundType === 'onscreen'))
      throw new Error('当前人声分离模型尚未安装；含画面内对白时请选择“仅配音”或“保留原声”')
    const tasks = mediaStore.hasSoundSegments ? episodeVoiceTasks(timeline, mediaStore.segments) : []
    const subtitleTasks = mediaStore.audioMode === 'keep-original'
      ? tasks.filter((task) => mediaStore.segments.find((segment) => `shot-${String(segment.index).padStart(3, '0')}` === task.shotId)?.soundType === 'onscreen')
      : tasks
    const subtitleCues = subtitleTasks.map((task) => ({ start: task.startMs / 1000, end: task.endMs / 1000, text: task.text }))
    const subtitleMarkdown = `# 本集字幕\n\n${subtitleCues.length ? subtitleCues.map((cue, index) => `${index + 1}. ${cue.text}（${cue.start.toFixed(2)}-${cue.end.toFixed(2)} 秒）`).join('\\n') : '本集无对白字幕。'}`
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      'wiki/字幕/episode-001.srt.md',
      subtitleMarkdown,
      (await window.electron.cloud.readMarkdown(mediaStore.runId, 'wiki/字幕/episode-001.srt.md').catch(() => null))?.revision,
    )
    mediaStore.finalPath = await window.electron.cloud.composeVideo({
      runId: mediaStore.runId,
      videoFiles: [mediaStore.pictureMasterPath],
      playDurations: [timeline.shots.at(-1)?.outputEndMs ? timeline.shots.at(-1)!.outputEndMs / 1000 : 0],
      voiceFile: mediaStore.voicePath || undefined,
      audioMode: mediaStore.hasSoundSegments ? mediaStore.audioMode : 'keep-original',
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
      return mediaStore.currentGeneratedAssetVersion(assetId)?.relativePath
    })
    if (referencePaths.some((item) => !item)) throw new Error('镜头绑定资产缺少当前版本')
    segment.imagePath = await window.electron.cloud.generateStoryboard({
      runId,
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
  targetType: 'script' | 'project-director' | 'voice-plan' | 'asset-prompt' | 'shot' | 'image' | 'video',
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
    const current =
      targetType === 'script'
        ? mediaStore.script
        : targetType === 'voice-plan'
          ? mediaStore.voicePlan?.voicePrompt
          : targetType === 'shot'
            ? segment && stripMedia(segment)
            : targetType === 'image'
              ? segment?.storyboardImagePrompt
              : segment?.videoPrompt
    if (current == null) throw new Error('当前对象不存在')
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
            : {
                index: segment?.index,
                script: segment?.script,
                playDuration: segment?.playDuration,
                generationDuration: segment?.generationDuration,
                finalShotCount: mediaStore.finalShotCount,
                styleId: mediaStore.styleId,
                referenceAssetIds: segment?.referenceAssetIds,
              },
      context: segment
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
    if (
      targetType === 'video' &&
      !['单一连续镜头', '无切镜', '无背景音乐'].every((rule) =>
        String(proposal.revised).includes(rule),
      )
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
  const relativePath = `wiki/分镜/镜头/shot-${String(segment.index).padStart(3, '0')}.md`
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
    mediaStore.finalPath = ''
    mediaStore.stage = mediaStore.allVideosReady ? 'videos-ready' : 'storyboards-ready'
  }
  mediaStore.revisionProposal = null
}

function captureUndo(targetType: 'script' | 'project-director' | 'voice-plan' | 'asset-prompt' | 'shot') {
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
  } else if (undo.targetType === 'project-director' && mediaStore.projectDirectorPlan) {
    const path = 'wiki/项目/项目总监.md'
    const current = await window.electron.cloud.readMarkdown(mediaStore.runId, path).catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      path,
      projectDirectorMarkdown(mediaStore.projectDirectorPlan),
      current?.revision,
    )
    const routePath = 'wiki/项目/制作路线.md'
    const currentRoute = await window.electron.cloud.readMarkdown(mediaStore.runId, routePath).catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      routePath,
      productionRouteMarkdown(mediaStore.projectDirectorPlan),
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
    mediaStore.finalPath = ''
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
    mediaStore.finalPath = ''
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
    throw new Error(failures.map((error) => error instanceof Error ? error.message : String(error)).join('\n'))
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
    const saved = await window.electron.cloud.loadProject(projectId)
    mediaStore.reset()
    mediaStore.$patch(deserializeMediaTask(saved))
    mediaStore.busyAction = ''
    mediaStore.cancelRequested = false
    mediaStore.error = ''
    await refreshCloudTasks(projectId)
  } finally {
    projectSwitching.value = false
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
watch(isDubbingWorkspace, (active) => {
  if (!active) return
  dubbingLeftOpen.value = false
  dubbingRightOpen.value = true
})
watch(
  () => mediaStore.$state,
  () => {
    clearTimeout(persistTimer)
    if (!mediaStore.runId || projectSwitching.value) return
    persistTimer = setTimeout(() => {
      void window.electron.cloud.saveState(mediaStore.runId, serializeMediaTask(mediaStore.$state))
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
.workspace-grid.dubbing-workspace-mode.left-collapsed {
  grid-template-columns: minmax(720px, 1fr) minmax(300px, .42fr);
}
.workspace-grid.dubbing-workspace-mode.right-collapsed:not(.left-collapsed) {
  grid-template-columns: minmax(250px, .35fr) minmax(720px, 1fr);
}
.workspace-grid.dubbing-workspace-mode.left-collapsed.right-collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.inspector-toggle {
  display: none;
}
@media (max-width: 1080px) {
  .workspace-grid {
    grid-template-columns: minmax(230px, 0.75fr) minmax(360px, 1.35fr);
  }
  .workspace-grid.dubbing-workspace-mode.left-collapsed,
  .workspace-grid.dubbing-workspace-mode.left-collapsed.right-collapsed {
    grid-template-columns: minmax(0, 1fr);
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
}
</style>
