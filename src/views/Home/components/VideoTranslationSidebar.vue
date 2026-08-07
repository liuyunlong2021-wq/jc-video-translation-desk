<template>
  <v-sheet class="translation-sidebar" border rounded>
    <header>
      <v-icon color="primary">mdi-translate</v-icon>
      <div><strong>视频翻译</strong><small>{{ mediaStore.episodeId }}</small></div>
    </header>
    <v-select
      :model-value="state.sourceLanguage"
      :items="sourceLanguages"
      label="源语言"
      density="compact"
      hide-details
      @update:model-value="updateLanguage('sourceLanguage', $event)"
    />
    <v-select
      :model-value="state.targetLanguage"
      :items="targetLanguages"
      label="目标语言"
      density="compact"
      hide-details
      @update:model-value="updateLanguage('targetLanguage', $event)"
    />
    <template v-if="showRoles">
      <div class="role-heading"><strong>翻译角色</strong><small>{{ mediaStore.videoTranslationRoles.length }} 人</small></div>
      <div v-if="!mediaStore.videoTranslationRoles.length" class="empty">确认说话角色后显示在这里</div>
      <div v-else class="roles">
        <div v-for="role in mediaStore.videoTranslationRoles" :key="role.translationRoleId" class="role">
          <v-icon size="18">mdi-account-voice</v-icon>
          <span><strong>{{ role.displayName }}</strong><small>{{ role.voiceProfileId ? '已选声音' : '待选声音' }}</small></span>
          <v-btn
            icon="mdi-delete-outline"
            size="x-small"
            variant="text"
            color="error"
            title="删除角色"
            aria-label="删除角色"
            @click="requestRoleDeletion(role.translationRoleId)"
          />
        </div>
      </div>
    </template>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMediaTaskStore } from '@/store'

withDefaults(defineProps<{ showRoles?: boolean }>(), { showRoles: true })
const emit = defineEmits<{ deleteRole: [roleId: string] }>()
const mediaStore = useMediaTaskStore()
const state = computed(() => mediaStore.videoTranslation!)
const sourceLanguages = [
  { title: '自动识别', value: 'auto' }, { title: '中文', value: 'zh' },
  { title: '英语', value: 'en' }, { title: '日语', value: 'ja' }, { title: '韩语', value: 'ko' },
]
const targetLanguages = [
  { title: '英语', value: 'en' }, { title: '中文', value: 'zh' },
  { title: '日语', value: 'ja' }, { title: '韩语', value: 'ko' },
  { title: '西班牙语', value: 'es' }, { title: '法语', value: 'fr' }, { title: '德语', value: 'de' },
]
function updateLanguage(key: 'sourceLanguage' | 'targetLanguage', value: string) {
  if (!value || state.value[key] === value) return
  state.value[key] = value
  mediaStore.invalidateTranslation('language')
}
function requestRoleDeletion(roleId: string) {
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === roleId)
  if (!role || !window.confirm(`删除角色“${role.displayName}”？共享剧集中的该角色也会移除。`)) return
  emit('deleteRole', roleId)
}
</script>

<style scoped>
.translation-sidebar { min-width: 0; min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 12px; }
header, .role, .role-heading { display: flex; align-items: center; gap: 9px; }
header { padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,.1); }
header div, .role span { display: grid; min-width: 0; }
header small, .role small, .role-heading small, .empty { color: rgba(0,0,0,.56); }
.role-heading { justify-content: space-between; margin-top: 4px; }
.roles { display: grid; gap: 6px; }
.role { padding: 8px; border-bottom: 1px solid rgba(0,0,0,.08); }
.role span { flex: 1; }
.empty { padding: 18px 4px; text-align: center; font-size: 13px; }
</style>
