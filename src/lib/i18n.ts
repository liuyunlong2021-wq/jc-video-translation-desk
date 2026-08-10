import { useAppStore } from '@/store'
import i18next from 'i18next'
import { toRaw } from 'vue'
import { i18nCommonOptions } from '~/electron/i18n/common-options'
import en from '../../locales/en/common.json'
import zhCN from '../../locales/zh-CN/common.json'

const i18nInitialized = async () => {
  const appStore = useAppStore()
  appStore.updateLocale('zh-CN')
  if (appStore.locale) {
    await window.i18n.changeLanguage(toRaw(appStore.locale))
  } else {
    const systemLocale = await window.i18n.getLanguage()
    appStore.updateLocale(systemLocale)
  }
  return i18next.init({
    ...i18nCommonOptions,
    lng: appStore.locale,
    resources: {
      en: { common: en },
      'zh-CN': { common: zhCN },
    },
  })
}

export const i18n = i18next

export default i18nInitialized
