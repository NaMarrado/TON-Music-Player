import { create } from 'zustand';
import { getSetting, setSetting } from '../services/db-queries';

/** Saved setting: whether the phone shows the Studio tab. Off unless the user switches it on in Settings. */
export const STUDIO_TAB_SETTING = 'studio_tab_enabled';

export const useStudioTabStore = create<{ enabled: boolean }>()(() => ({ enabled: false }));

export async function loadStudioTabSetting(): Promise<void> {
  useStudioTabStore.setState({ enabled: (await getSetting(STUDIO_TAB_SETTING)) === 'true' });
}

export async function setStudioTabEnabled(enabled: boolean): Promise<void> {
  useStudioTabStore.setState({ enabled });
  await setSetting(STUDIO_TAB_SETTING, enabled ? 'true' : 'false');
}
