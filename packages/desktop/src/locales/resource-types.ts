import type { LocaleResourceObject, SupportedLanguage } from '@ton/core';

export type DesktopResourceNamespaces = Record<string, LocaleResourceObject>;
export type DesktopResourceGroup = Partial<Record<SupportedLanguage, DesktopResourceNamespaces>>;
