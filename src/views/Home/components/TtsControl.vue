<template>
  <v-sheet class="h-full p-3 flex flex-col gap-3" border rounded>
    <div class="flex items-center justify-between">
      <div class="text-subtitle-1 font-weight-medium">{{ t('workflow.voice.title') }}</div>
      <v-chip size="small" :color="mediaStore.voicePlan ? 'success' : 'grey'" variant="tonal">
        {{ mediaStore.voicePlan ? t('workflow.voice.ready') : t('workflow.voice.waiting') }}
      </v-chip>
    </div>
    <div
      v-if="mediaStore.voicePlan"
      class="text-body-2 overflow-y-auto whitespace-pre-wrap leading-6"
    >
      {{ mediaStore.voicePlan.voicePrompt }}
    </div>
    <div
      v-else
      class="flex-1 flex items-center justify-center text-medium-emphasis text-body-2 text-center"
    >
      {{ t('workflow.voice.empty') }}
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { useMediaTaskStore } from '@/store'
import { useTranslation } from 'i18next-vue'
const mediaStore = useMediaTaskStore()
const { t } = useTranslation()
</script>
