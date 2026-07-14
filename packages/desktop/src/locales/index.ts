import type { SupportedLanguage } from '@ton/core';
import { europeanDesktopResources } from './resources-europe';
import { globalDesktopResources } from './resources-global';
import { westernDesktopResources } from './resources-western';
import type { DesktopResourceNamespaces } from './resource-types';

export const desktopResources = {
  ...westernDesktopResources,
  ...europeanDesktopResources,
  ...globalDesktopResources,
} satisfies Record<SupportedLanguage, DesktopResourceNamespaces>;
