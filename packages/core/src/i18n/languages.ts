export const LANGUAGE_DEFINITIONS = [
  { code: 'en', nativeName: 'English', direction: 'ltr' },
  { code: 'cs', nativeName: 'Čeština', direction: 'ltr' },
  { code: 'es', nativeName: 'Español', direction: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', direction: 'ltr' },
  { code: 'fr', nativeName: 'Français', direction: 'ltr' },
  { code: 'pt', nativeName: 'Português', direction: 'ltr' },
  { code: 'it', nativeName: 'Italiano', direction: 'ltr' },
  { code: 'pl', nativeName: 'Polski', direction: 'ltr' },
  { code: 'ru', nativeName: 'Русский', direction: 'ltr' },
  { code: 'ja', nativeName: '日本語', direction: 'ltr' },
  { code: 'ar', nativeName: 'العربية', direction: 'rtl' },
  { code: 'he', nativeName: 'עברית', direction: 'rtl' },
  { code: 'zh', nativeName: '简体中文', direction: 'ltr' },
] as const;

export type SupportedLanguage = (typeof LANGUAGE_DEFINITIONS)[number]['code'];
export type LanguageDirection = (typeof LANGUAGE_DEFINITIONS)[number]['direction'];

export const SUPPORTED_LANGUAGES = LANGUAGE_DEFINITIONS.map(
  ({ code }) => code,
) as SupportedLanguage[];

export function getLanguageNativeName(language: SupportedLanguage): string {
  return LANGUAGE_DEFINITIONS.find(({ code }) => code === language)?.nativeName ?? language;
}
