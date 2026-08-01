<template>
  <section class="wiki-document">
    <header>
      <div class="document-title">
        <v-btn
          v-if="parentPath"
          icon="mdi-arrow-left"
          size="small"
          variant="text"
          :title="parentLabel"
          @click="emit('navigate', parentPath)"
        />
        <strong>{{ title }}</strong>
      </div>
      <div v-if="loaded">
        <v-btn v-if="!editing" icon="mdi-pencil-outline" size="small" variant="text" title="编辑 Markdown" @click="editing = true" />
        <template v-else>
          <v-btn size="small" variant="text" @click="cancel">取消</v-btn>
          <v-btn size="small" color="primary" variant="flat" :loading="saving" @click="save">保存</v-btn>
        </template>
      </div>
    </header>
    <v-textarea v-if="editing" v-model="draft" class="wiki-editor" variant="outlined" hide-details no-resize />
    <article v-else class="markdown-body" @click="openLink" v-html="html" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { renderMarkdown, resolveWikiLink } from '@/runtime/markdown'

const props = defineProps<{
  projectId: string
  path: string
  parentPath?: string
  parentLabel?: string
}>()
const emit = defineEmits<{ navigate: [path: string]; saved: [] }>()
const content = ref('')
const revision = ref('')
const draft = ref('')
const editing = ref(false)
const saving = ref(false)
const loaded = ref(false)
const toast = useToast()
const title = computed(() => props.path.split('/').pop()?.replace(/\.md$/, '') || 'Markdown')
const html = computed(() => renderMarkdown(content.value, props.projectId, props.path))

async function load() {
  if (!props.projectId || !props.path) return
  loaded.value = false
  try {
    const document = await window.electron.cloud.readMarkdown(props.projectId, props.path)
    content.value = document.content
    revision.value = document.revision
    draft.value = document.content
    editing.value = false
    loaded.value = true
  } catch (error) {
    content.value = ''
    draft.value = ''
    editing.value = false
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
watch(() => [props.projectId, props.path], load, { immediate: true })

function cancel() {
  draft.value = content.value
  editing.value = false
}
async function save() {
  saving.value = true
  try {
    const document = await window.electron.cloud.writeMarkdown(props.projectId, props.path, draft.value, revision.value)
    content.value = document.content
    revision.value = document.revision
    editing.value = false
    emit('saved')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}
function openLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href') || ''
  if (!href || href === '#') return
  event.preventDefault()
  if (href.startsWith('wiki:')) {
    emit('navigate', resolveWikiLink(props.path, href.slice(5)))
    return
  }
  if (/^(https?:|mailto:)/i.test(href)) void window.electron.openExternal({ url: href })
}
</script>

<style scoped>
.wiki-document { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.wiki-document header { min-height: 44px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,.1); padding: 0 16px; }
.document-title { min-width: 0; display: flex; align-items: center; gap: 4px; }
.wiki-editor { flex: 1; min-height: 0; margin: 12px; }
.wiki-editor :deep(.v-input__control), .wiki-editor :deep(.v-field), .wiki-editor :deep(.v-field__field), .wiki-editor :deep(textarea) { height: 100%; min-height: 0; }
.markdown-body { min-height: 0; overflow: auto; padding: 20px 24px 48px; line-height: 1.75; color: #202722; }
.markdown-body :deep(h1) { font-size: 24px; margin: 0 0 20px; }
.markdown-body :deep(h2) { font-size: 18px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #dfe5e0; }
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; }
.markdown-body :deep(th), .markdown-body :deep(td) { border: 1px solid #d8dfda; padding: 7px 10px; text-align: left; }
.markdown-body :deep(blockquote) { margin: 12px 0; padding: 4px 14px; border-left: 3px solid #238636; color: #526057; }
.markdown-body :deep(a) { color: #167c31; text-decoration: none; }
.markdown-body :deep(code) { background: #eef2ef; padding: 2px 5px; border-radius: 3px; }
</style>
