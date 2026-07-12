import type { SupportedLanguage } from './languages';

export interface LocaleResources {
  [namespace: string]: Record<string, string>;
}

export interface I18nConfig {
  language: SupportedLanguage;
  resources: Record<SupportedLanguage, LocaleResources>;
}
