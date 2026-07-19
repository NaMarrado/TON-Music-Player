import type { AppUpdateCheck } from '@ton/core';
import { create } from 'zustand';
import { checkDesktopForUpdates } from '../services/app-update';

const LAST_SEEN_UPDATE_SETTING = 'last_seen_update_version';

interface UpdateState {
  initialized: boolean;
  isChecking: boolean;
  lastSeenVersion: string | null;
  result: AppUpdateCheck | null;
}

export const useUpdateStore = create<UpdateState>()(() => ({
  initialized: false,
  isChecking: false,
  lastSeenVersion: null,
  result: null,
}));

let initializePromise: Promise<void> | null = null;

export function hasUnreadDesktopUpdate(state = useUpdateStore.getState()): boolean {
  return Boolean(
    state.result?.hasUpdate
      && state.result.latestVersion !== state.lastSeenVersion,
  );
}

export function initializeDesktopUpdateState(): Promise<void> {
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    const lastSeenVersion = await window.api.invoke('settings:get', LAST_SEEN_UPDATE_SETTING);
    useUpdateStore.setState({ lastSeenVersion });
    try {
      const result = await checkDesktopForUpdates();
      useUpdateStore.setState({ result });
    } catch {
      // Startup update checks are intentionally silent.
    } finally {
      useUpdateStore.setState({ initialized: true });
    }
  })();
  return initializePromise;
}

export async function checkDesktopUpdateState(): Promise<AppUpdateCheck> {
  useUpdateStore.setState({ isChecking: true });
  try {
    const result = await checkDesktopForUpdates();
    useUpdateStore.setState({ result, initialized: true });
    return result;
  } finally {
    useUpdateStore.setState({ isChecking: false });
  }
}

export async function markDesktopUpdateSeen(): Promise<void> {
  const result = useUpdateStore.getState().result;
  if (!result?.hasUpdate) return;
  useUpdateStore.setState({ lastSeenVersion: result.latestVersion });
  await window.api.invoke('settings:set', LAST_SEEN_UPDATE_SETTING, result.latestVersion);
}
