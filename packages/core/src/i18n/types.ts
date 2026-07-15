import type { SupportedLanguage } from './languages';

export type LocaleResourceValue = string | LocaleResourceObject;

export interface LocaleResourceObject {
  [key: string]: LocaleResourceValue;
}

export interface LocaleResources {
  [namespace: string]: LocaleResourceObject;
}

export interface I18nConfig {
  language: SupportedLanguage;
  resources: Record<SupportedLanguage, LocaleResources>;
}
