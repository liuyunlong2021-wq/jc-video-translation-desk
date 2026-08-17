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
    <v-btn
      v-if="showRoles"
      color="primary"
      variant="tonal"
      prepend-icon="mdi-file-account-outline"
      :loading="mediaStore.busyAction === 'extract-script-characters'"
      :disabled="Boolean(mediaStore.busyAction) || !mediaStore.apiConfigured"
      @click="scriptDialogOpen = true"
      >提取角色</v-btn
    >
    <template v-if="showRoles">
      <div v-if="mediaStore.scriptCharacters.length" class="role-heading">
        <strong>剧本角色</strong><small>{{ mediaStore.scriptCharacters.length }} 人</small>
      </div>
      <div v-if="mediaStore.scriptCharacters.length" class="script-roles">
        <div
          v-for="character in orderedScriptCharacters"
          :key="character.scriptCharacterId"
          class="script-role"
          :title="scriptCharacterDetail(character)"
        >
          <strong>{{ character.displayName }}</strong>
          <small>{{ scriptCharacterBrief(character) }}</small>
        </div>
      </div>
      <div class="role-heading"><strong>翻译角色</strong><small>{{ visibleTranslationRoles.length }} 人</small></div>
      <div v-if="!visibleTranslationRoles.length" class="empty">确认说话角色后显示在这里</div>
      <div v-else class="roles">
        <div v-for="role in visibleTranslationRoles" :key="role.translationRoleId" class="role">
          <v-icon size="18">mdi-account-voice</v-icon>
          <span>
            <strong>{{ role.displayName }}</strong>
            <small>{{ roleStatus(role) }}</small>
          </span>
          <v-btn
            icon="mdi-pencil-outline"
            size="x-small"
            variant="text"
            title="修改角色名"
            aria-label="修改角色名"
            @click="renameRole(role.translationRoleId)"
          />
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
    <v-dialog v-model="renameDialogOpen" max-width="420">
      <v-card title="修改角色名">
        <v-card-text>
          <v-text-field
            v-model="roleNameDraft"
            label="真实角色姓名"
            autofocus
            hide-details
            @keyup.enter="confirmRoleRename"
          />
          <v-select
            v-model="scriptCharacterDraft"
            :items="scriptCharacterItems"
            label="绑定剧本角色"
            density="compact"
            hide-details
            clearable
            class="mt-3"
          />
          <v-text-field
            v-model="roleAliasesDraft"
            label="别名（用顿号或逗号分隔）"
            hide-details
            class="mt-3"
          />
          <v-textarea
            v-model="roleDescriptionDraft"
            label="身份/职业描述"
            rows="3"
            no-resize
            hide-details
            class="mt-3"
          />
          <p v-if="selectedScriptCharacter?.evidence" class="dialog-hint mt-2">
            提取依据：{{ selectedScriptCharacter.evidence }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="renameDialogOpen = false">取消</v-btn>
          <v-btn color="primary" :disabled="!roleNameDraft.trim()" @click="confirmRoleRename">确认</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="scriptDialogOpen" max-width="620">
      <v-card title="提取角色">
        <v-card-text>
          <p class="dialog-hint">可直接粘贴剧本/故事文本，也可以上传 TXT、MD、SRT、DOCX、PDF 文档。</p>
          <v-textarea
            v-model="scriptTextDraft"
            label="粘贴剧本/故事文本"
            rows="8"
            no-resize
            hide-details
            class="script-textarea"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="scriptDialogOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            variant="tonal"
            :disabled="Boolean(mediaStore.busyAction)"
            @click="extractFromDocument"
            >上传文档提取</v-btn
          >
          <v-btn
            color="primary"
            :disabled="Boolean(mediaStore.busyAction) || !scriptTextDraft.trim()"
            @click="extractFromText"
            >提取角色</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import { scriptCharacterOptions } from '@/runtime/videoTranslation'
import type { ScriptCharacter, TranslationRole } from '@/runtime/videoTranslation'

withDefaults(defineProps<{ showRoles?: boolean }>(), { showRoles: true })
const emit = defineEmits<{
  deleteRole: [roleId: string]
  extractScriptCharacters: [text?: string]
}>()
const mediaStore = useMediaTaskStore()
const state = computed(() => mediaStore.videoTranslation!)
const renameDialogOpen = ref(false)
const scriptDialogOpen = ref(false)
const scriptTextDraft = ref('')
const roleNameDraft = ref('')
const roleAliasesDraft = ref('')
const roleDescriptionDraft = ref('')
const scriptCharacterDraft = ref<string | null>(null)
const pendingRoleId = ref('')
const orderedScriptCharacters = computed(() => scriptCharacterOptions(mediaStore.scriptCharacters))
const visibleTranslationRoles = computed(() => {
  const used = new Set(mediaStore.videoTranslation?.cues.map((cue) => cue.translationRoleId).filter(Boolean))
  return mediaStore.videoTranslationRoles.filter(
    (role) => used.has(role.translationRoleId) || role.visualPersonId || role.voiceProfileId,
  )
})
const scriptCharacterItems = computed(() =>
  orderedScriptCharacters.value.map((character) => ({
    title: character.displayName,
    value: character.scriptCharacterId,
  })),
)
const selectedScriptCharacter = computed(() =>
  mediaStore.scriptCharacters.find((item) => item.scriptCharacterId === scriptCharacterDraft.value),
)
watch(scriptCharacterDraft, (scriptCharacterId) => {
  if (!renameDialogOpen.value || !scriptCharacterId) return
  const character = mediaStore.scriptCharacters.find(
    (item) => item.scriptCharacterId === scriptCharacterId,
  )
  if (!character) return
  roleNameDraft.value = character.displayName
  roleAliasesDraft.value = character.aliases.join('、')
  roleDescriptionDraft.value = character.description
})
const sourceLanguages = [
  { title: '自动识别', value: 'auto' }, { title: '中文', value: 'zh' },
  { title: '英语', value: 'en' }, { title: '日语', value: 'ja' }, { title: '韩语', value: 'ko' },
]
const targetLanguages = [
  { title: '英语', value: 'en' }, { title: '中文', value: 'zh' },
  { title: '日语', value: 'ja' }, { title: '韩语', value: 'ko' },
  { title: '西班牙语', value: 'es' }, { title: '法语', value: 'fr' }, { title: '德语', value: 'de' },
  { title: '越南语', value: 'vi' }, { title: '泰语', value: 'th' },
  { title: '印尼语', value: 'id' }, { title: '马来语（马来西亚）', value: 'ms' },
]
function updateLanguage(key: 'sourceLanguage' | 'targetLanguage', value: string) {
  if (!value || state.value[key] === value) return
  state.value[key] = value
  mediaStore.invalidateTranslation('language')
}
function extractFromDocument() {
  scriptDialogOpen.value = false
  emit('extractScriptCharacters')
}
function extractFromText() {
  const text = scriptTextDraft.value.trim()
  if (!text) return
  scriptDialogOpen.value = false
  emit('extractScriptCharacters', text)
}
function shortText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
function scriptCharacterBrief(character: ScriptCharacter) {
  const text = character.description || character.aliases.join('、') || '待补充身份'
  return shortText(text.split(/[。；;\n]/)[0] || text, 28)
}
function scriptCharacterDetail(character: ScriptCharacter) {
  return [character.displayName, character.description, character.evidence && `依据：${character.evidence}`]
    .filter(Boolean)
    .join('\n')
}
function requestRoleDeletion(roleId: string) {
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === roleId)
  if (!role || !window.confirm(`删除角色“${role.displayName}”？共享剧集中的该角色也会移除。`)) return
  emit('deleteRole', roleId)
}
function renameRole(roleId: string) {
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === roleId)
  if (!role) return
  pendingRoleId.value = roleId
  roleNameDraft.value = role.displayName
  roleAliasesDraft.value = role.aliases.join('、')
  roleDescriptionDraft.value = role.description || ''
  scriptCharacterDraft.value = role.scriptCharacterId || null
  renameDialogOpen.value = true
}
function confirmRoleRename() {
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === pendingRoleId.value)
  const name = roleNameDraft.value.trim()
  if (!role || !name) return
  renameDialogOpen.value = false
  const aliases = roleAliasesDraft.value
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const description = roleDescriptionDraft.value.trim()
  const scriptCharacter = mediaStore.scriptCharacters.find(
    (item) => item.scriptCharacterId === scriptCharacterDraft.value,
  )
  const changed =
    name !== role.displayName ||
    aliases.join('\n') !== role.aliases.join('\n') ||
    description !== (role.description || '') ||
    (scriptCharacter?.scriptCharacterId || '') !== (role.scriptCharacterId || '')
  role.displayName = name
  role.aliases = aliases
  role.description = description
  role.scriptCharacterId = scriptCharacter?.scriptCharacterId
  if (scriptCharacter) {
    role.displayName = scriptCharacter.displayName
    role.aliases = [...new Set([...role.aliases, ...scriptCharacter.aliases])]
    role.description = scriptCharacter.description || role.description
  }
  if (changed) {
    role.voiceConfirmedAt = undefined
    mediaStore.invalidateTranslation('role-binding')
  }
}
function roleStatus(role: TranslationRole) {
  if (role.scriptCharacterId) return role.voiceProfileId ? '已绑定剧本角色和声音' : '已绑定剧本角色'
  if (role.visualPersonId) return role.voiceProfileId ? '画面人物 · 已选声音' : '画面人物 · 待绑定剧本角色'
  return role.voiceProfileId ? '已选声音' : '待选声音'
}
</script>

<style scoped>
.translation-sidebar { min-width: 0; min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 12px; }
header, .role, .role-heading { display: flex; align-items: center; gap: 9px; }
header { padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,.1); }
header div, .role span { display: grid; min-width: 0; }
header small, .role small, .role-heading small, .empty { color: rgba(0,0,0,.56); }
.role-heading { justify-content: space-between; margin-top: 4px; }
.roles, .script-roles { display: grid; gap: 6px; }
.script-roles { max-height: 150px; overflow: auto; padding: 6px; border-radius: 6px; background: rgba(21,122,53,.06); }
.script-role { display: grid; gap: 2px; min-width: 0; padding: 5px 6px; border-radius: 5px; background: rgba(255,255,255,.55); }
.script-role strong, .script-role small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.script-role strong { font-size: 13px; }
.script-role small { color: rgba(0,0,0,.58); font-size: 12px; }
.dialog-hint { margin: 0 0 10px; color: rgba(0,0,0,.58); font-size: 12px; }
.script-textarea :deep(.v-field__input) { max-height: 230px; overflow: auto; }
.role { padding: 8px; border-bottom: 1px solid rgba(0,0,0,.08); }
.role span { flex: 1; }
.empty { padding: 18px 4px; text-align: center; font-size: 13px; }
</style>
