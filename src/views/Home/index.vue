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

    <div class="workspace-grid w-full h-0 min-h-0 flex-1 grid gap-3 py-3 px-3">
      <TextGenerate @import-markdown="importMarkdown" />
      <VideoManage
        @edit-script="editScript"
        @markdown-saved="reloadStoryboardMarkdown"
        @upload-asset-reference="uploadAssetReference"
      />
      <v-btn
        class="inspector-toggle"
        :icon="inspectorOpen ? 'mdi-close' : 'mdi-tune-variant'"
        :aria-label="inspectorOpen ? '关闭检查器' : '打开检查器'"
        size="small"
        @click="inspectorOpen = !inspectorOpen"
      />
      <div class="inspector-column min-w-0 min-h-0" :class="{ open: inspectorOpen }">
        <VideoRender
          @generate-script="generateScript"
          @approve-script="approveScript"
          @edit-script-mode="mediaStore.scriptEditing = true"
          @generate-voice-plan="generateVoicePlan"
          @generate-voice="generateVoice"
          @generate-shot-plan="generateShotPlan"
          @prepare-assets="prepareAssetPrompts"
          @search-assets="searchAssets"
          @generate-assets="generateAssets"
          @generate-storyboards="generateStoryboards"
          @generate-videos="generateVideos"
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
  VISUAL_STYLES,
  assetReferenceSearchQuery,
  type StoryboardSegment,
} from '@/runtime/videoWorkflow'
import { assetGenerationChanged, assetVersionMatches, isLegacyStoryboardMarkdown, mergeStoryboardMedia, parseStoryboardMarkdown, withProjectDesign } from '@/runtime/storyboardMarkdown'
import { deserializeMediaTask, serializeMediaTask } from '@/runtime/mediaPersistence'
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
const taskDrawerOpen = ref(false)
const projects = ref<ProjectManifest[]>([])
const projectSwitching = ref(false)
const currentProject = computed(() =>
  projects.value.find((project) => project.projectId === mediaStore.runId),
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
    mediaStore.selectStep('voice')
    toast.success(t('workflow.script.approved'))
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

async function generateVoicePlan() {
  await runAction('voice-plan', async () => {
    mediaStore.invalidateFrom('script')
    const raw = await window.electron.cloud.runSkill(
      'jc-voice-design',
      JSON.stringify({ text: mediaStore.approvedScript }),
      mediaStore.runId,
      mediaStore.textModel,
    )
    mediaStore.voicePlan = parseVoiceDesign(raw, mediaStore.approvedScript)
    const current = await window.electron.cloud.readMarkdown(
      mediaStore.runId,
      'wiki/声音/配音设计.md',
    ).catch(() => null)
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      'wiki/声音/配音设计.md',
      `# 配音设计\n\n${mediaStore.voicePlan.voicePrompt}\n\n## 配音正文\n\n${mediaStore.voicePlan.text}`,
      current?.revision,
    )
    mediaStore.stage = 'voice-plan-ready'
    mediaStore.selectView('script')
  })
}

async function generateVoice() {
  await runAction('voice', async () => {
    if (!mediaStore.voicePlan) throw new Error(t('workflow.messages.voicePlanFirst'))
    if (mediaStore.segments.length) mediaStore.finalPath = ''
    else mediaStore.invalidateFrom('voice')
    mediaStore.voicePath = ''
    mediaStore.voiceDuration = 0
    const result = await window.electron.cloud.generateVoice(
      mediaStore.runId,
      mediaStore.voicePlan.text,
      episodeVoicePrompt(),
      mediaStore.voiceEngine,
    )
    mediaStore.voicePath = result.path
    mediaStore.voiceDuration = result.duration
    mediaStore.stage = 'voice-ready'
    mediaStore.selectView('script')
  })
}

function episodeVoicePrompt() {
  if (!mediaStore.segments.length || !mediaStore.voicePlan) return mediaStore.voicePlan?.voicePrompt || ''
  const timeline = mediaStore.segments.map((segment) => {
    const type = segment.timelineType === 'dialogue' ? '对白' : '无对白动作'
    return `镜头${segment.index}｜${type}｜角色：${segment.dialogueCharacter || '无'}｜情绪：${segment.dialogueEmotion || '无'}｜强度：${segment.emotionIntensity || '无'}｜语速：${segment.speechRate || '无'}｜停顿/重音：${segment.pauseEmphasis || '无'}｜时长：${segment.playDuration}秒｜台词：${segment.dialogueText || '无'}`
  }).join('\n')
  return `${mediaStore.voicePlan.voicePrompt}\n\n【本集镜头声音时间轴】\n${timeline}\n\n严格遵守：无对白动作镜头不朗读、不补旁白；对白只按对应角色和镜头情绪表达。`
}

async function generateShotPlan() {
  await runAction('shot-plan', async () => {
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
    }
    const previousState = JSON.parse(JSON.stringify(mediaStore.$state))
    const transactionId = await window.electron.cloud.beginStoryboardUpdate(mediaStore.runId)
    try {
      const result = await window.electron.cloud.runWikiSkill(
        'jc-script-storyboard',
        `${JSON.stringify({ ...skillInput, referenceShotCount }, null, 2)}\n\n读取 wiki/文稿/确认文稿.md 和已确认资产页面。严格按 Skill 的 Markdown 合同写入导演总览和每个单镜；只能绑定现有资产 ID，不得创建或修改资产。`,
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
    const voiceDocument = await window.electron.cloud.readMarkdown(
      mediaStore.runId,
      'wiki/声音/配音设计.md',
    ).catch(() => null)
    if (voiceDocument) {
      const content = voiceDocument.content.replace(/^---\n[\s\S]*?\n---\n?/, '')
      const match = content.match(/^# 配音设计\s*\n([\s\S]*?)^## 配音正文\s*\n([\s\S]*)$/m)
      if (match) {
        const next = parseVoiceDesign(
          { voicePrompt: match[1].trim(), text: match[2].trim() },
          mediaStore.approvedScript,
        )
        if (JSON.stringify(next) !== JSON.stringify(mediaStore.voicePlan)) {
          mediaStore.invalidateFrom('voice')
          mediaStore.voicePlan = next
          mediaStore.stage = 'voice-plan-ready'
          upstreamChanged = true
        }
      }
    }
    if (upstreamChanged) return
    const paths = await window.electron.cloud.listMarkdown(mediaStore.runId)
    const selectedPaths = runPaths ? new Set(runPaths) : null
    const documents = await Promise.all(
      paths
        .filter((value) =>
          value.startsWith('wiki/资产/') ||
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
    const oldVisualAnchor = mediaStore.visualAnchor
    const existingById = new Map(mediaStore.referenceAssets.map((asset) => [asset.id, asset]))
    const changedAssetIds = new Set<string>()
    const referenceAssets: ReferenceAsset[] = parsed.assets.map((asset) => {
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
        segment.error = ''
      })
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

const ASSET_PLAN_SKILLS: Record<AssetRole, string> = {
  character: 'jc-character-prompt',
  scene: 'jc-scene-prompt',
  prop: 'jc-prop-prompt',
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
sourceDocument: wiki/文稿/确认文稿.md
---

# ${asset.label}

## 说明

${asset.description}

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

function parsePlannedAssets(value: any, role: AssetRole, skill: string): ReferenceAsset[] {
  if (!Array.isArray(value?.assets)) throw new Error(`${assetFolder(role)} Skill 没有返回 assets`)
  const existing = new Map(
    mediaStore.referenceAssets
      .filter((asset) => asset.role === role)
      .map((asset) => [asset.label.trim().toLocaleLowerCase(), asset]),
  )
  return value.assets.map((item: any, index: number) => {
    if (item?.role !== role) throw new Error(`${assetFolder(role)}第 ${index + 1} 项类型错误`)
    const label = String(item?.label || '').trim()
    const description = String(item?.description || '').trim()
    if (!label || !description)
      throw new Error(`${assetFolder(role)}第 ${index + 1} 项内容不完整`)
    const design = currentProjectDesign(item?.design)
    const searchQuery = String(item?.searchQuery || '').trim()
    if (
      !validAssetDesign(role, design) ||
      !searchQuery ||
      searchQuery.length > 160 ||
      !validAssetSearchQuery(role, design, searchQuery)
    )
      throw new Error(`${assetFolder(role)}第 ${index + 1} 项缺少完整设计，或参考图搜索词无效`)
    const previous = existing.get(label.toLocaleLowerCase())
    return {
      id: previous?.id || `asset-${role}-${crypto.randomUUID().slice(0, 8)}`,
      role,
      label,
      description,
      identityTraits: Array.isArray(item.identityTraits) ? item.identityTraits.map(String).filter(Boolean) : [],
      styleRequirements: Array.isArray(item.styleRequirements) ? item.styleRequirements.map(String).filter(Boolean) : [],
      required: item.required !== false,
      status: previous?.status === 'approved' ? 'approved' : 'design-ready',
      design,
      searchQuery,
      versions: previous?.versions || [],
      activeVersionId: previous?.activeVersionId,
      pendingVersionId: previous?.pendingVersionId,
      generatedBySkill: skill,
      sourceDocument: 'wiki/文稿/确认文稿.md',
    }
  })
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
    const roles = ['character', 'scene', 'prop'] as AssetRole[]
    const results = await Promise.allSettled(
      roles.map(async (role) => {
        const skill = ASSET_PLAN_SKILLS[role]
        const result = await window.electron.cloud.runSkill(
          skill,
          JSON.stringify({
            mode: 'app-plan',
            script: mediaStore.approvedScript,
            projectStyle: {
              id: mediaStore.styleId,
              prompt: VISUAL_STYLES.find((style) => style.id === mediaStore.styleId)?.prompt,
              ratio: mediaStore.ratio,
            },
            existingAssets: mediaStore.referenceAssets.filter((asset) => asset.role === role),
          }),
          mediaStore.runId,
          mediaStore.textModel,
        )
        const assets = parsePlannedAssets(result, role, skill)
        await writeAssetDocuments(assets)
        return { role, assets }
      }),
    )
    const failures: string[] = []
    results.forEach((result, index) => {
      const role = roles[index]
      if (result.status === 'rejected') {
        failures.push(`${assetFolder(role)}：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
        return
      }
      mediaStore.referenceAssets = [
        ...mediaStore.referenceAssets.filter((asset) => asset.role !== role),
        ...result.value.assets,
      ]
      if (!mediaStore.assetPlanCompletedRoles.includes(role)) mediaStore.assetPlanCompletedRoles.push(role)
    })
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

function validAssetSearchQuery(role: AssetRole, design: Record<string, any>, query: string) {
  const medium = String(design[role]?.medium || '').toLowerCase()
  const value = query.toLowerCase()
  const liveAction = medium.includes('真人')
  const required = liveAction
    ? {
        character: ['live action', 'full body'],
        scene: ['wide', 'establishing shot'],
        prop: ['isolated', 'reference'],
      }[role]
    : {
        character: ['character', 'full body'],
        scene: ['background', 'wide'],
        prop: ['prop', 'reference'],
      }[role]
  return required.every((word) => value.includes(word))
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
    await pool(pending, 2, generateAssetVersion)
    if (mediaStore.allRequiredAssetsApproved) mediaStore.stage = 'assets-ready'
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    await refreshCloudTasks()
  }
}

async function generateStoryboards() {
  try {
    if (!mediaStore.segments.length) throw new Error(t('workflow.messages.shotPlanFirst'))
    if (!mediaStore.voicePath) throw new Error('请先完成本集配音')
    validateShotPlan()
    if (!mediaStore.allRequiredAssetsApproved) throw new Error('请先确认全部必需资产')
    const pendingImages = unfinishedSegments(mediaStore.segments, 'image')
    if (
      pendingImages.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '图片', count: pendingImages.length }),
      )
    )
      return
    await pool(pendingImages, 2, generateImage)
    if (!mediaStore.allImagesReady) {
      const errors = [...new Set(pendingImages.map((item) => item.error).filter(Boolean))]
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
    const pendingVideos = unfinishedSegments(mediaStore.segments, 'video')
    if (
      pendingVideos.length > 20 &&
      !window.confirm(
        t('workflow.messages.largeTaskConfirm', { kind: '视频', count: pendingVideos.length }),
      )
    )
      return
    await pool(pendingVideos, 2, generateVideo)
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

async function composeVideo() {
  await runAction('compose', async () => {
    if (!mediaStore.voicePath || !mediaStore.allVideosReady)
      throw new Error(t('workflow.messages.assetsIncomplete'))
    const subtitleCues = buildSubtitleCues()
    const subtitleMarkdown = `# 本集字幕\n\n${subtitleCues.length ? subtitleCues.map((cue, index) => `${index + 1}. ${cue.text}（${cue.start.toFixed(2)}-${cue.end.toFixed(2)} 秒）`).join('\\n') : '本集无对白字幕。'}`
    await window.electron.cloud.writeMarkdown(
      mediaStore.runId,
      'wiki/字幕/episode-001.srt.md',
      subtitleMarkdown,
      (await window.electron.cloud.readMarkdown(mediaStore.runId, 'wiki/字幕/episode-001.srt.md').catch(() => null))?.revision,
    )
    mediaStore.finalPath = await window.electron.cloud.composeVideo({
      runId: mediaStore.runId,
      videoFiles: mediaStore.segments.map((segment) => segment.videoPath!),
      playDurations: mediaStore.segments.map((segment) => segment.playDuration),
      voiceFile: mediaStore.voicePath,
      ratio: mediaStore.ratio,
      subtitleCues,
    })
    mediaStore.stage = 'completed'
    mediaStore.selectView('final')
    toast.success(t('workflow.messages.composed'))
  })
}

function buildSubtitleCues() {
  let cursor = 0
  return mediaStore.segments.flatMap((segment) => {
    const start = cursor
    cursor += segment.playDuration
    const text = segment.dialogueText?.trim() || (segment.timelineType === 'dialogue' ? segment.script.trim() : '')
    if (!text) return []
    const duration = segment.dialogueDuration && segment.dialogueDuration > 0
      ? Math.min(segment.dialogueDuration, segment.playDuration)
      : segment.playDuration
    return [{ start, end: start + duration, text }]
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
  targetType: 'script' | 'voice-plan' | 'asset-prompt' | 'shot' | 'image' | 'video',
  targetId: string,
  instruction: string,
) {
  await runAction('revision', async () => {
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
              prompt,
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
    mediaStore.finalPath = ''
    mediaStore.stage = mediaStore.allVideosReady ? 'videos-ready' : 'storyboards-ready'
  }
  mediaStore.revisionProposal = null
}

function captureUndo(targetType: 'script' | 'voice-plan' | 'asset-prompt' | 'shot') {
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
  }
}

function showFinal() {
  if (mediaStore.finalPath) window.electron.cloud.showMedia(mediaStore.runId, mediaStore.finalPath)
}
async function exportFinal() {
  if (mediaStore.finalPath)
    await window.electron.cloud.exportMedia(mediaStore.runId, mediaStore.finalPath)
}

async function generateVideo(segment: StoryboardSegment) {
  if (!segment.imagePath) return
  const runId = mediaStore.runId
  segment.videoStatus = 'running'
  segment.error = ''
  try {
    segment.videoPath = await window.electron.cloud.generateVideo({
      runId,
      index: segment.index,
      model: mediaStore.videoModel,
      prompt: segment.videoPrompt,
      ratio: mediaStore.ratio,
      generationDuration: segment.generationDuration,
      imagePath: segment.imagePath,
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
.inspector-toggle {
  display: none;
}
@media (max-width: 1080px) {
  .workspace-grid {
    grid-template-columns: minmax(230px, 0.75fr) minmax(360px, 1.35fr);
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
