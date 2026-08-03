import { InitOptions } from 'i18next'

export const i18nLanguages = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en', name: 'English' },
]

export const i18nCommonOptions: InitOptions = {
  fallbackLng: i18nLanguages[0].code,
  supportedLngs: i18nLanguages.map((l) => l.code),
  load: 'currentOnly',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
}
