import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import {
  addPreparedResourceBundle,
  createI18nInstance,
  SUPPORTED_LANGUAGES,
} from '@ton/core';
import type { SupportedLanguage } from '@ton/core';
import { mobileResources } from './locales';

function detectDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const langCode = locales[0]?.languageCode ?? 'en';
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(langCode)) {
    return langCode as SupportedLanguage;
  }
  return 'en';
}

const i18n = createI18nInstance([initReactI18next]);

for (const [lang, namespaces] of Object.entries(mobileResources)) {
  for (const [ns, resources] of Object.entries(namespaces)) {
    addPreparedResourceBundle(i18n, lang as SupportedLanguage, ns, resources);
  }
}

i18n.changeLanguage(detectDeviceLanguage());

export async function applyStoredLanguagePreference(value: string | null | undefined): Promise<void> {
  const nextLanguage = resolveLanguagePreference(value);
  if (i18n.language === nextLanguage) {
    return;
  }

  await i18n.changeLanguage(nextLanguage);
}

function resolveLanguagePreference(value: string | null | undefined): SupportedLanguage {
  if (
    value
    && value !== 'auto'
    && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  ) {
    return value as SupportedLanguage;
  }

  return detectDeviceLanguage();
}

export default i18n;
