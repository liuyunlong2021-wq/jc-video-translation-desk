<template>
  <v-sheet class="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-3" border rounded>
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-subtitle-1 font-weight-medium">{{ t('workflow.script.title') }}</div>
        <div class="text-caption text-medium-emphasis">Gemini 3.6 Flash</div>
      </div>
      <v-btn
        icon="mdi-cog-outline"
        variant="text"
        :title="t('workflow.script.apiConfig')"
        @click="configDialog = true"
      />
    </div>

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
      <v-select
        :model-value="mediaStore.targetDuration"
        :items="durationItems"
        item-title="title"
        item-value="value"
        :label="t('workflow.script.duration')"
        density="compact"
        hide-details
        :disabled="Boolean(mediaStore.busyAction)"
        @update:model-value="changeTargetDuration"
      />
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
      <v-btn
        color="primary"
        prepend-icon="mdi-auto-fix"
        :loading="mediaStore.busyAction === 'script'"
        :disabled="
          !mediaStore.apiConfigured || !mediaStore.request.trim() || Boolean(mediaStore.busyAction)
        "
        @click="generateScript"
        >{{ t('workflow.script.generate') }}</v-btn
      >
    </div>

    <div class="reference-control">
      <img
        v-if="mediaStore.coreReference"
        :src="fileUrl(mediaStore.coreReference.relativePath)"
        :alt="t('workflow.script.reference')"
        class="reference-thumb"
      />
      <div class="min-w-0 flex-1">
        <div class="text-body-2 font-weight-medium">{{ t('workflow.script.reference') }}</div>
        <div class="text-caption text-medium-emphasis text-truncate">
          {{ mediaStore.coreReference?.label || t('workflow.script.referenceOptional') }}
        </div>
      </div>
      <v-btn
        size="small"
        variant="tonal"
        :prepend-icon="mediaStore.coreReference ? 'mdi-image-edit-outline' : 'mdi-image-plus-outline'"
        :disabled="Boolean(mediaStore.busyAction)"
        @click="selectCoreReference"
      >{{ t(mediaStore.coreReference ? 'workflow.script.replaceReference' : 'workflow.script.addReference') }}</v-btn>
      <v-btn
        v-if="mediaStore.coreReference"
        icon="mdi-close"
        size="small"
        variant="text"
        :title="t('workflow.script.removeReference')"
        :disabled="Boolean(mediaStore.busyAction)"
        @click="removeCoreReference"
      />
    </div>

    <v-textarea
      :model-value="mediaStore.script"
      class="flex-1"
      :label="t('workflow.script.editable')"
      no-resize
      hide-details
      :disabled="Boolean(mediaStore.busyAction)"
      @update:model-value="editScript"
    />
    <div v-if="mediaStore.script.trim()" class="text-caption text-medium-emphasis">
      {{
        mediaStore.segments.length
          ? t('workflow.script.actual', {
              seconds: mediaStore.voiceDuration.toFixed(1),
              segments: mediaStore.segments.length,
            })
          : t('workflow.script.estimate', {
              seconds: Math.round(estimatedDuration),
              segments: Math.ceil(estimatedDuration / 8),
            })
      }}
    </div>
    <v-btn
      block
      color="success"
      prepend-icon="mdi-check-circle-outline"
      :loading="mediaStore.busyAction === 'approve'"
      :disabled="!mediaStore.script.trim() || Boolean(mediaStore.busyAction)"
      @click="approveScript"
      >{{ t('workflow.script.approve') }}</v-btn
    >

    <v-dialog v-model="configDialog" max-width="560" persistent>
      <v-card prepend-icon="mdi-key-variant" :title="t('workflow.api.title')">
        <v-card-text class="flex flex-col gap-3">
          <v-text-field
            :label="t('workflow.api.address')"
            :model-value="API_URL"
            readonly
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
            :class="sessionOnly ? 'text-warning' : hasApiKey ? 'text-success' : 'text-medium-emphasis'"
          >
            {{
              sessionOnly
                ? t('workflow.api.sessionOnly')
                : hasApiKey
                  ? t('workflow.api.saved')
                  : t('workflow.api.missing')
            }}
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
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import { useMediaTaskStore } from '@/store'
import {
  createRunId,
  estimateDuration,
  hashScript,
  TARGET_DURATIONS,
  VIDEO_RATIOS,
  VISUAL_STYLES,
} from '@/runtime/videoWorkflow'
import type { VideoRatio, VisualStyleId } from '~/electron/types'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'

const API_URL = 'https://api.jiucaihezi.studio/v1'
const KEYS_URL = 'https://api.jiucaihezi.studio/keys'
const mediaStore = useMediaTaskStore()
const toast = useToast()
const { t } = useTranslation()
const configDialog = ref(false)
const apiKey = ref('')
const hasApiKey = ref(false)
const sessionOnly = ref(false)
const testing = ref(false)
const showApiKey = ref(false)
const estimatedDuration = computed(() => estimateDuration(mediaStore.script))
const durationItems = computed(() =>
  TARGET_DURATIONS.map((value) => ({ title: `${value} ${t('workflow.script.seconds')}`, value })),
)
const styleItems = computed(() => VISUAL_STYLES.map(({ id, label }) => ({ title: label, value: id })))

onMounted(async () => {
  hasApiKey.value = await window.electron.cloud.hasApiKey()
  mediaStore.apiConfigured = hasApiKey.value
  if (!hasApiKey.value) configDialog.value = true
})

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

async function generateScript() {
  mediaStore.busyAction = 'script'
  mediaStore.error = ''
  try {
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
    })
    mediaStore.stage = 'script-generated'
  } catch (error) {
    mediaStore.error = error instanceof Error ? error.message : String(error)
    toast.error(mediaStore.error)
  } finally {
    mediaStore.busyAction = ''
  }
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
  if (mediaStore.busyAction) return
  mediaStore.busyAction = 'approve'
  const approvedScript = mediaStore.script.trim()
  try {
    const scriptHash = await hashScript(approvedScript)
    mediaStore.invalidateFrom('script')
    mediaStore.approvedScript = approvedScript
    mediaStore.scriptHash = scriptHash
    mediaStore.runId ||= createRunId()
    mediaStore.stage = 'script-approved'
    toast.success(t('workflow.script.approved'))
  } finally {
    mediaStore.busyAction = ''
  }
}

function changeRatio(value: VideoRatio) {
  if (mediaStore.ratio === value) return
  mediaStore.ratio = value
  invalidateVisuals()
}

function changeStyle(value: VisualStyleId) {
  if (mediaStore.styleId === value) return
  mediaStore.styleId = value
  invalidateVisuals()
}

function changeTargetDuration(value: 10 | 15 | 30) {
  if (mediaStore.targetDuration === value) return
  mediaStore.targetDuration = value
  invalidateVisuals()
}

async function selectCoreReference() {
  mediaStore.runId ||= createRunId()
  const selected = await window.electron.cloud.selectCoreReference(mediaStore.runId)
  if (!selected) return
  const [resolved] = await window.electron.cloud.resolveMedia(mediaStore.runId, [selected.relativePath])
  mediaStore.coreReference = { ...selected, relativePath: resolved }
  invalidateVisuals()
}

function removeCoreReference() {
  mediaStore.coreReference = null
  invalidateVisuals()
}

function invalidateVisuals() {
  if (!mediaStore.segments.length && !mediaStore.visualAnchor) return
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

function fileUrl(filePath: string) {
  return managedMediaUrl(mediaStore.runId, filePath)
}
</script>

<style scoped>
.reference-control {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}
.reference-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
}
</style>
