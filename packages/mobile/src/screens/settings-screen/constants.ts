import { getLocales } from 'expo-localization';
import { SUPPORTED_LANGUAGES } from '@ton/core';

export function detectDeviceLanguage(): string {
  const locales = getLocales();
  const code = locales[0]?.languageCode ?? 'en';
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
    return code;
  }

  return 'en';
}
