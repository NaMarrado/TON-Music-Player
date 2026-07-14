import type { SupportedLanguage } from '@ton/core';

export type DesktopResourceNamespaces = Record<string, Record<string, string>>;
export type DesktopResourceGroup = Partial<Record<SupportedLanguage, DesktopResourceNamespaces>>;
