import type { PostProcessorModule, TOptions, i18n } from 'i18next';

type SupportedLanguage = 'en' | 'cs' | 'es' | 'de' | 'fr' | 'pt' | 'it' | 'pl' | 'ru' | 'ja' | 'ar' | 'he' | 'zh';
type LanguageDirection = 'ltr' | 'rtl';

const RIGHT_TO_LEFT_ISOLATE = '\u2067';
const POP_DIRECTIONAL_ISOLATE = '\u2069';
const PLURAL_SUFFIX_PATTERN = /^(.*)_(zero|one|two|few|many|other)$/;
const RIGHT_TO_LEFT_LANGUAGES = new Set<string>(['ar', 'he']);
const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  cs: 'Čeština',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  pl: 'Polski',
  ru: 'Русский',
  ja: '日本語',
  ar: 'العربية',
  he: 'עברית',
  zh: '简体中文',
};
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

// Hermes does not provide Intl.PluralRules on every supported mobile runtime.
const LANGUAGE_PLURAL_CATEGORIES: Record<SupportedLanguage, readonly PluralCategory[]> = {
  en: ['one', 'other'],
  cs: ['one', 'few', 'other'],
  es: ['one', 'many', 'other'],
  de: ['one', 'other'],
  fr: ['one', 'many', 'other'],
  pt: ['one', 'many', 'other'],
  it: ['one', 'many', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  ja: ['other'],
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  he: ['one', 'two', 'other'],
  zh: ['other'],
};

export function getLanguageDirection(language: string): LanguageDirection {
  return RIGHT_TO_LEFT_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export function getLanguageDisplayName(language: SupportedLanguage): string {
  return isolateDirectionalText(
    LANGUAGE_NATIVE_NAMES[language],
    getLanguageDirection(language),
  );
}

export function isolateDirectionalText(
  value: string,
  direction: LanguageDirection,
): string {
  if (
    direction !== 'rtl'
    || (value.startsWith(RIGHT_TO_LEFT_ISOLATE) && value.endsWith(POP_DIRECTIONAL_ISOLATE))
  ) {
    return value;
  }

  return `${RIGHT_TO_LEFT_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;
}

export function prepareLocaleResources(
  language: SupportedLanguage,
  resources: Record<string, string>,
): Record<string, string> {
  const prepared = { ...resources };
  const pluralCategories = LANGUAGE_PLURAL_CATEGORIES[language];

  for (const [key, value] of Object.entries(resources)) {
    const match = key.match(PLURAL_SUFFIX_PATTERN);
    if (!match || match[2] !== 'other') {
      continue;
    }

    const stem = match[1];
    for (const category of pluralCategories) {
      prepared[`${stem}_${category}`] ??= value;
    }
  }

  return prepared;
}

export function addPreparedResourceBundle(
  instance: i18n,
  language: SupportedLanguage,
  namespace: string,
  resources: Record<string, string>,
): void {
  instance.addResourceBundle(
    language,
    namespace,
    prepareLocaleResources(language, resources),
  );
}

function resolvePostProcessorLanguage(options: TOptions, translator: unknown): string {
  if (typeof options.lng === 'string') {
    return options.lng;
  }

  if (
    typeof translator === 'object'
    && translator !== null
    && 'language' in translator
    && typeof translator.language === 'string'
  ) {
    return translator.language;
  }

  return 'en';
}

export const directionalTextPostProcessor: PostProcessorModule = {
  name: 'tonDirectionalText',
  type: 'postProcessor',
  process(value, _key, options, translator) {
    return isolateDirectionalText(
      value,
      getLanguageDirection(resolvePostProcessorLanguage(options, translator)),
    );
  },
};
