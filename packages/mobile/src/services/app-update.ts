import { checkForAppUpdate } from '@ton/core';
import type { AppUpdateCheck, UpdateFetch, UpdateFetchResponse } from '@ton/core';
import {
  getFallbackUpdateManifest,
  getMobileAppVersion,
} from './app-update-manifest';
import { getMobileUpdatePlatform } from './app-update-platform';
import {
  installMobileUpdate,
  type MobileUpdateInstallResult,
} from './app-update-install';
import { openMobileUpdateUrl } from './app-update-open';
import { canInstallMobileUpdate, getMobileUpdateActionKey } from './app-update-runtime';

const MOBILE_UPDATE_CHECK_TIMEOUT_MS = 5000;

function createMobileUpdateFetch(deadlineMs: number): UpdateFetch {
  return async (
    input: string,
    init?: { headers?: Record<string, string> },
  ): Promise<UpdateFetchResponse> => {
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    if (remainingMs === 0) {
      throw new Error('mobile_update_check_timeout');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, remainingMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

export async function checkMobileForUpdates(): Promise<AppUpdateCheck> {
  return checkForAppUpdate(getMobileAppVersion(), createMobileUpdateFetch(
    Date.now() + MOBILE_UPDATE_CHECK_TIMEOUT_MS,
  ), {
    fallbackManifest: getFallbackUpdateManifest(),
    platform: getMobileUpdatePlatform(),
  });
}

export {
  canInstallMobileUpdate,
  getMobileAppVersion,
  getMobileUpdateActionKey,
  installMobileUpdate,
  openMobileUpdateUrl,
};
export type { MobileUpdateInstallResult };
