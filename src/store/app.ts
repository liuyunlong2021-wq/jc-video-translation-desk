import { ref } from 'vue'
import { defineStore } from 'pinia'

try {
  const saved = JSON.parse(localStorage.getItem('app') || '{}')
  if (saved.llmConfig) {
    delete saved.llmConfig
    localStorage.setItem('app', JSON.stringify(saved))
  }
} catch {
  // Ignore malformed legacy state; Pinia will replace it on the next save.
}

export const useAppStore = defineStore(
  'app',
  () => {
    const locale = ref('')
    const updateLocale = (value: string) => {
      locale.value = value
    }
    const zoomFactor = ref(1)
    const zoomOptions = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
    const updateZoomFactor = (factor: number) => {
      zoomFactor.value = factor
    }
    return { locale, updateLocale, zoomFactor, zoomOptions, updateZoomFactor }
  },
  { persist: true },
)
