import { initReactI18next } from 'react-i18next';
import {
  addPreparedResourceBundle,
  createI18nInstance,
  SUPPORTED_LANGUAGES,
} from '@ton/core';
import type { SupportedLanguage } from '@ton/core';
import { desktopResources } from './locales';

function detectSystemLanguage(): SupportedLanguage {
  const systemLang = navigator.language.split('-')[0];
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(systemLang)) {
    return systemLang as SupportedLanguage;
  }
  return 'en';
}

const i18n = createI18nInstance([initReactI18next]);

for (const [lang, namespaces] of Object.entries(desktopResources)) {
  for (const [ns, resources] of Object.entries(namespaces)) {
    addPreparedResourceBundle(i18n, lang as SupportedLanguage, ns, resources);
  }
}

// Start with system-detected language, then override with saved preference
i18n.changeLanguage(detectSystemLanguage());

if (window.api) {
  window.api.invoke('settings:get', 'language').then((saved) => {
    const val = saved as string | null;
    if (val && val !== 'auto' && (SUPPORTED_LANGUAGES as readonly string[]).includes(val)) {
      i18n.changeLanguage(val);
    }
  });
}

export default i18n;
