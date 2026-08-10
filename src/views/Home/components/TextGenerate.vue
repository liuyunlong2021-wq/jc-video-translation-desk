<template>
  <v-sheet class="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-3" border rounded>
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-subtitle-1 font-weight-medium">{{ t('workflow.script.title') }}</div>
        <div class="text-caption text-medium-emphasis">当前项目创作模型</div>
      </div>
      <div class="flex items-center gap-1">
        <v-btn
          icon="mdi-file-upload-outline"
          variant="text"
          size="small"
          title="导入 Markdown"
          :disabled="Boolean(mediaStore.busyAction)"
          @click="$emit('importMarkdown')"
        />
        <v-btn
          icon="mdi-cog-outline"
          variant="text"
          :title="t('workflow.script.apiConfig')"
          @click="openConfig"
        />
      </div>
    </div>

    <v-select
      v-model="mediaStore.textModel"
      class="text-model-select"
      :items="TEXT_MODELS"
      label="文本模型"
      density="compact"
      hide-details
      :disabled="Boolean(mediaStore.busyAction)"
    />

    <v-select
      v-model="mediaStore.videoModel"
      class="text-model-select"
      :items="VIDEO_MODELS"
      item-title="title"
      item-value="value"
      label="视频模型"
      density="compact"
      hide-details
      :disabled="Boolean(mediaStore.busyAction)"
    />

    <v-textarea
      v-model="mediaStore.request"
      :label="t('workflow.script.request')"
      rows="5"
      no-resize
      hide-details
      :disabled="Boolean(mediaStore.busyAction)"
    />
    <div class="grid grid-cols-2 gap-2">
      <v-select
        :model-value="mediaStore.ratio"
        :items="VIDEO_RATIOS"
        :label="t('workflow.script.ratio')"
        density="compact"
        hide-details
        :disabled="Boolean(mediaStore.busyAction)"
        @update:model-value="changeRatio"
      />
      <div>
        <v-select
          v-if="durationSelection !== 'custom'"
          v-model="durationSelection"
          :items="durationItems"
          item-title="title"
          item-value="value"
          :label="t('workflow.script.duration')"
          density="compact"
          hide-details
          :disabled="Boolean(mediaStore.busyAction)"
          @update:model-value="changeDurationSelection"
        />
        <v-text-field
          v-else
          v-model="customDuration"
          type="number"
          min="5"
          max="180"
          step="1"
          suffix="秒"
          :label="t('workflow.script.customDuration')"
          append-inner-icon="mdi-chevron-down"
          density="compact"
          hide-details
          autofocus
          :disabled="Boolean(mediaStore.busyAction)"
          @blur="commitCustomDuration"
          @keydown.enter.prevent="commitCustomDuration"
          @click:append-inner="leaveCustomDuration"
        />
      </div>
      <v-select
        :model-value="mediaStore.styleId"
        :items="styleItems"
        item-title="title"
        item-value="value"
        :label="t('workflow.script.style')"
        density="compact"
        hide-details
        :disabled="Boolean(mediaStore.busyAction)"
        @update:model-value="changeStyle"
      />
      <v-select
        :model-value="mediaStore.shotPace"
        :items="paceItems"
        item-title="title"
        item-value="value"
        :label="t('workflow.script.shotPace')"
        density="compact"
        hide-details
        :disabled="Boolean(mediaStore.busyAction)"
        @update:model-value="changeShotPace"
      />
    </div>

    <v-dialog v-model="configDialog" max-width="620" persistent>
      <v-card prepend-icon="mdi-key-variant" :title="t('workflow.api.title')">
        <v-card-text class="flex flex-col gap-3">
          <div class="text-subtitle-2">{{ t('workflow.api.section') }}</div>
          <v-select
            v-model="mediaStore.textModel"
            :items="TEXT_MODEL_ITEMS"
            item-title="title"
            item-value="value"
            label="模型"
            hide-details
          />
          <div class="flex gap-2 items-start">
            <v-text-field
              v-model="apiKey"
              class="flex-1"
              label="API Key"
              :type="showApiKey ? 'text' : 'password'"
              :append-inner-icon="showApiKey ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              autocomplete="off"
              hide-details
              :placeholder="
                sessionOnly
                  ? t('workflow.api.sessionPlaceholder')
                  : hasApiKey
                    ? t('workflow.api.savedPlaceholder')
                    : t('workflow.api.emptyPlaceholder')
              "
              @click:append-inner="showApiKey = !showApiKey"
            />
            <v-btn class="!h-[56px]" variant="tonal" @click="openKeysPage">{{
              t('workflow.api.getKey')
            }}</v-btn>
          </div>
          <div
            class="text-caption"
            :class="
              sessionOnly ? 'text-warning' : hasApiKey ? 'text-success' : 'text-medium-emphasis'
            "
          >
            {{
              sessionOnly
                ? t('workflow.api.sessionOnly')
                : hasApiKey
                  ? t('workflow.api.saved')
                  : t('workflow.api.missing')
            }}
          </div>
          <v-divider />
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-subtitle-2">{{ t('workflow.localVoice.title') }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ t('workflow.localVoice.description') }}
              </div>
            </div>
            <v-btn-toggle
              class="local-engine-toggle"
              :model-value="mediaStore.voiceEngine"
              mandatory
              density="compact"
              color="primary"
              @update:model-value="changeVoiceEngine"
            >
              <v-btn value="cloud">{{ t('workflow.localVoice.cloud') }}</v-btn>
              <v-btn value="local">{{ t('workflow.localVoice.local') }}</v-btn>
            </v-btn-toggle>
          </div>
          <div v-if="mediaStore.voiceEngine === 'local'" class="local-voice-status">
            <v-btn-toggle
              :model-value="mediaStore.localVoiceEngine"
              mandatory
              density="compact"
              color="primary"
              @update:model-value="changeLocalVoiceEngine"
            >
              <v-btn value="qwen3-tts">Qwen3-TTS VoiceDesign</v-btn>
              <v-btn value="indextts2">IndexTTS2</v-btn>
            </v-btn-toggle>
            <div class="local-voice-detail">
              <v-chip
                size="small"
                variant="tonal"
                :color="
                  indexTtsState === 'running' || localVoiceStatus?.available ? 'success' : 'warning'
                "
              >
                {{ localVoiceStatusLabel }}
              </v-chip>
              <span class="text-caption text-medium-emphasis text-truncate">
                {{ localVoiceStatus?.modelPath || t('workflow.localVoice.model') }}
              </span>
            </div>
            <div class="local-voice-actions">
              <v-btn
                size="small"
                variant="tonal"
                :loading="checkingLocalVoice"
                @click="checkLocalVoice"
                >{{ t('workflow.localVoice.check') }}</v-btn
              >
              <v-btn
                v-if="mediaStore.localVoiceEngine === 'indextts2'"
                size="small"
                color="primary"
                :loading="changingIndexTts"
                :disabled="indexTtsState === 'running'"
                @click="startIndexTts"
                >启动服务</v-btn
              >
              <v-btn
                v-if="mediaStore.localVoiceEngine === 'indextts2'"
                size="small"
                variant="tonal"
                :loading="changingIndexTts"
                :disabled="indexTtsState !== 'running'"
                @click="stopIndexTts"
                >停止服务</v-btn
              >
            </div>
          </div>
          <v-divider />
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-subtitle-2">本地字幕引擎</div>
              <div class="text-caption text-medium-emphasis">
                {{ funAsrStatus?.message || '正在检查本地字幕引擎…' }}
              </div>
              <div v-if="funAsrProgress" class="text-caption text-medium-emphasis mt-1">
                {{ funAsrProgress }}
              </div>
            </div>
            <v-btn
              :color="funAsrStatus?.state === 'ready' ? undefined : 'success'"
              :variant="funAsrStatus?.state === 'ready' ? 'tonal' : 'flat'"
              :loading="installingFunAsr"
              :disabled="installingFunAsr || funAsrStatus?.state === 'ready'"
              @click="installFunAsr"
            >{{ funAsrStatus?.state === 'ready' ? '已安装' : '一键安装' }}</v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="configDialog = false">{{
            t('common.buttons.close')
          }}</v-btn>
          <v-btn :loading="testing" variant="tonal" @click="testConnection">{{
            t('workflow.api.test')
          }}</v-btn>
          <v-btn color="primary" @click="saveConfig">{{ t('common.buttons.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import { useMediaTaskStore } from '@/store'
import {
  isValidTargetDuration,
  SHOT_PACES,
  TARGET_DURATIONS,
  VIDEO_RATIOS,
  VISUAL_STYLE_GROUPS,
} from '@/runtime/videoWorkflow'
import type {
  IndexTtsServiceStatus,
  LocalVoiceEngine,
  LocalVoiceStatus,
  ShotPace,
  TargetDuration,
  VideoRatio,
  VoiceEngine,
  VisualStyleId,
} from '~/electron/types'

defineEmits(['importMarkdown'])

const KEYS_URL = 'https://api.jiucaihezi.studio/keys'
const TEXT_MODELS = [
  'gemini-3.6-flash',
  'doubao-seed-evolving',
  'claude-fable-5',
  'claude-opus-5',
  'gpt-5.6-sol',
  'deepseek-v4-pro',
]
const TEXT_MODEL_ITEMS = [
  { title: 'Gemini 3.6 Flash', value: 'gemini-3.6-flash' },
  { title: '豆包', value: 'doubao-seed-evolving' },
]
const VIDEO_MODELS = [
  { title: 'Veo 3.1', value: 'veo-3.1-generate-preview' },
  { title: 'Veo 3.0', value: 'veo-3.0-generate-001' },
  { title: 'Grok Video 图生视频', value: 'rh-grok-image-video' },
  { title: 'Seedance 2.0', value: 'rh-seedance2' },
]
const mediaStore = useMediaTaskStore()
const toast = useToast()
const { t } = useTranslation()
const configDialog = ref(false)
const apiKey = ref('')
const hasApiKey = ref(false)
const sessionOnly = ref(false)
const testing = ref(false)
const checkingLocalVoice = ref(false)
const changingIndexTts = ref(false)
const installingFunAsr = ref(false)
const funAsrProgress = ref('')
const funAsrStatus = ref<{
  state: 'ready' | 'missing' | 'installing' | 'failed'
  message: string
} | null>(null)
const localVoiceStatus = ref<LocalVoiceStatus | IndexTtsServiceStatus | null>(null)
const showApiKey = ref(false)
const customDuration = ref(String(mediaStore.targetDuration))
const durationSelection = ref<TargetDuration | 'custom'>(
  TARGET_DURATIONS.includes(mediaStore.targetDuration) ? mediaStore.targetDuration : 'custom',
)
const durationItems = computed(() => [
  ...TARGET_DURATIONS.map((value) => ({
    title: `${value} ${t('workflow.script.seconds')}`,
    value,
  })),
  { title: t('workflow.script.customDuration'), value: 'custom' as const },
])
const styleItems = computed(() =>
  VISUAL_STYLE_GROUPS.flatMap((group) => [
    { title: group.label, value: null, props: { disabled: true } },
    ...group.styles.map(({ id, label }) => ({ title: `  ${label}`, value: id })),
  ]),
)
const paceItems = computed(() =>
  SHOT_PACES.map((value) => ({ title: t(`workflow.script.paces.${value}`), value })),
)
const localVoiceStatusLabel = computed(() => {
  if (!localVoiceStatus.value) return '检测中'
  if ('state' in localVoiceStatus.value) {
    return {
      unchecked: '未检测',
      unavailable: '不可用',
      stopped: '服务已停止',
      starting: '服务启动中',
      running: '服务运行中',
      failed: '服务异常',
    }[localVoiceStatus.value.state]
  }
  return t(`workflow.localVoice.status.${localVoiceStatus.value.reason}`)
})
const indexTtsState = computed(() =>
  localVoiceStatus.value && 'state' in localVoiceStatus.value
    ? localVoiceStatus.value.state
    : undefined,
)

onMounted(async () => {
  hasApiKey.value = await window.electron.cloud.hasApiKey()
  mediaStore.apiConfigured = hasApiKey.value
  if (!hasApiKey.value) configDialog.value = true
  if (mediaStore.voiceEngine === 'local') await checkLocalVoice()
  await checkFunAsr()
})

const stopFunAsrProgress = window.electron.cloud.onFunAsrInstallProgress((message) => {
  funAsrProgress.value = message
})

onBeforeUnmount(stopFunAsrProgress)

async function openConfig() {
  configDialog.value = true
  if (mediaStore.voiceEngine === 'local') await checkLocalVoice()
  await checkFunAsr()
}

defineExpose({ openConfig })

async function checkLocalVoice() {
  checkingLocalVoice.value = true
  try {
    localVoiceStatus.value =
      mediaStore.localVoiceEngine === 'indextts2'
        ? await window.electron.cloud.indexTtsStatus()
        : await window.electron.cloud.localVoiceStatus()
  } finally {
    checkingLocalVoice.value = false
  }
}

async function checkFunAsr() {
  funAsrStatus.value = await window.electron.cloud.funAsrInstallStatus()
}

async function installFunAsr() {
  installingFunAsr.value = true
  funAsrProgress.value = '正在开始安装…'
  try {
    funAsrStatus.value = await window.electron.cloud.installFunAsr()
    if (funAsrStatus.value.state === 'ready') toast.success('本地字幕引擎安装完成')
    else toast.error(funAsrStatus.value.message)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    installingFunAsr.value = false
    funAsrProgress.value = ''
  }
}

async function changeLocalVoiceEngine(value: LocalVoiceEngine) {
  if (!value || value === mediaStore.localVoiceEngine) return
  mediaStore.localVoiceEngine = value
  await checkLocalVoice()
}

async function startIndexTts() {
  changingIndexTts.value = true
  try {
    localVoiceStatus.value = await window.electron.cloud.indexTtsStart()
    if (localVoiceStatus.value.state !== 'running')
      toast.error(localVoiceStatus.value.error || 'IndexTTS2 启动失败')
  } finally {
    changingIndexTts.value = false
  }
}

async function stopIndexTts() {
  changingIndexTts.value = true
  try {
    localVoiceStatus.value = await window.electron.cloud.indexTtsStop()
  } finally {
    changingIndexTts.value = false
  }
}

async function changeVoiceEngine(value: VoiceEngine) {
  if (!value || value === mediaStore.voiceEngine) return
  mediaStore.voiceEngine = value
  if (mediaStore.voicePath || mediaStore.segments.length || mediaStore.finalPath) {
    mediaStore.invalidateFrom('voice')
    mediaStore.voicePath = ''
    mediaStore.voiceDuration = 0
    mediaStore.stage = mediaStore.voicePlan ? 'voice-plan-ready' : 'script-approved'
  }
  if (value === 'local') await checkLocalVoice()
}

async function saveConfig() {
  if (!hasApiKey.value && !apiKey.value.trim()) {
    toast.error(t('workflow.api.keyRequired'))
    return
  }
  if (apiKey.value.trim())
    sessionOnly.value = !(await window.electron.cloud.saveApiKey(apiKey.value))
  hasApiKey.value = await window.electron.cloud.hasApiKey()
  mediaStore.apiConfigured = hasApiKey.value
  apiKey.value = ''
  configDialog.value = false
  toast[sessionOnly.value ? 'warning' : 'success'](
    t(sessionOnly.value ? 'workflow.api.sessionOnly' : 'workflow.api.savedToast'),
  )
}

async function testConnection() {
  testing.value = true
  try {
    if (apiKey.value.trim())
      sessionOnly.value = !(await window.electron.cloud.saveApiKey(apiKey.value))
    await window.electron.cloud.testApiKey()
    hasApiKey.value = true
    mediaStore.apiConfigured = true
    toast[sessionOnly.value ? 'warning' : 'success'](
      t(sessionOnly.value ? 'workflow.api.connectedSession' : 'workflow.api.connected'),
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    testing.value = false
  }
}

function openKeysPage() {
  window.electron.openExternal({ url: KEYS_URL })
}

function changeRatio(value: VideoRatio) {
  if (mediaStore.ratio === value) return
  mediaStore.ratio = value
  invalidateVisuals()
}

function changeStyle(value: VisualStyleId | null) {
  if (!value) return
  if (mediaStore.styleId === value) return
  mediaStore.styleId = value
  invalidateVisuals()
}

function changeShotPace(value: ShotPace) {
  if (mediaStore.shotPace === value) return
  mediaStore.shotPace = value
  invalidateVisuals()
}

function applyTargetDuration(value: TargetDuration) {
  if (!isValidTargetDuration(value) || mediaStore.targetDuration === value) return
  mediaStore.targetDuration = value
  invalidateVisuals()
}

function changeDurationSelection(value: TargetDuration | 'custom') {
  if (value === 'custom') {
    customDuration.value = String(mediaStore.targetDuration)
    durationSelection.value = 'custom'
    return
  }
  durationSelection.value = value
  applyTargetDuration(value)
}

function commitCustomDuration() {
  const value = Number(customDuration.value)
  if (!isValidTargetDuration(value)) {
    customDuration.value = String(mediaStore.targetDuration)
    toast.error(t('workflow.script.durationInvalid'))
    return
  }
  applyTargetDuration(value)
}

function leaveCustomDuration() {
  durationSelection.value = 15
  customDuration.value = '15'
  applyTargetDuration(15)
}

function invalidateVisuals() {
  if (
    !mediaStore.segments.length &&
    !mediaStore.visualAnchor &&
    !mediaStore.projectDirectorDraft &&
    !mediaStore.projectDirectorPlan
  )
    return
  mediaStore.invalidateVisuals()
  mediaStore.stage = mediaStore.voicePath
    ? 'voice-ready'
    : mediaStore.voicePlan
      ? 'voice-plan-ready'
      : mediaStore.approvedScript
        ? 'script-approved'
        : mediaStore.script
          ? 'script-generated'
          : 'draft'
}
</script>

<style scoped>
.text-model-select {
  flex: none;
}
.local-voice-status {
  min-width: 0;
  display: grid;
  gap: 8px;
}
.local-engine-toggle {
  justify-self: start;
}
.local-voice-detail {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.local-voice-actions {
  display: flex;
  gap: 8px;
}
</style>
