import i18next from 'i18next';
import type { i18n, Module, ThirdPartyModule, BackendModule, LanguageDetectorModule } from 'i18next';
import commonEn from './locales/en/common.json';
import commonCs from './locales/cs/common.json';
import commonEs from './locales/es/common.json';
import commonDe from './locales/de/common.json';
import commonFr from './locales/fr/common.json';
import commonPt from './locales/pt/common.json';
import commonIt from './locales/it/common.json';
import commonPl from './locales/pl/common.json';
import commonRu from './locales/ru/common.json';
import commonJa from './locales/ja/common.json';
import commonAr from './locales/ar/common.json';
import commonHe from './locales/he/common.json';
import commonZh from './locales/zh/common.json';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './languages';
import {
  directionalTextPostProcessor,
  prepareLocaleResources,
} from './text-direction';
import type { LocaleResourceObject } from './types';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export { SUPPORTED_LANGUAGES } from './languages';
export type { SupportedLanguage } from './languages';

type I18nPlugin = Module | ThirdPartyModule | BackendModule | LanguageDetectorModule;

const commonResources: Record<SupportedLanguage, { common: LocaleResourceObject }> = {
  en: { common: prepareLocaleResources('en', commonEn) },
  cs: { common: prepareLocaleResources('cs', commonCs) },
  es: { common: prepareLocaleResources('es', commonEs) },
  de: { common: prepareLocaleResources('de', commonDe) },
  fr: { common: prepareLocaleResources('fr', commonFr) },
  pt: { common: prepareLocaleResources('pt', commonPt) },
  it: { common: prepareLocaleResources('it', commonIt) },
  pl: { common: prepareLocaleResources('pl', commonPl) },
  ru: { common: prepareLocaleResources('ru', commonRu) },
  ja: { common: prepareLocaleResources('ja', commonJa) },
  ar: { common: prepareLocaleResources('ar', commonAr) },
  he: { common: prepareLocaleResources('he', commonHe) },
  zh: { common: prepareLocaleResources('zh', commonZh) },
};

export function createI18nInstance(plugins: I18nPlugin[] = []): i18n {
  const instance = i18next.createInstance();

  instance.use(directionalTextPostProcessor);

  for (const plugin of plugins) {
    instance.use(plugin);
  }

  instance.init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false,
    },
    initImmediate: false,
    resources: commonResources,
    postProcess: [directionalTextPostProcessor.name],
  });

  return instance;
}
