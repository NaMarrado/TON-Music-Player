import type { AppUpdateCheck } from '@ton/core';
import { installAndroidMobileUpdate } from './app-update-install-android';
import { openExternalMobileUpdate } from './app-update-install-external';
import { canInstallMobileUpdate } from './app-update-runtime';

export interface MobileUpdateInstallResult {
  fileUri?: string;
  openedInstaller: boolean;
  openedDetailsPage: boolean;
  simulated: boolean;
}

export async function installMobileUpdate(
  update: AppUpdateCheck,
): Promise<MobileUpdateInstallResult> {
  if (!update.hasUpdate) {
    throw new Error('No update is available');
  }

  if (!canInstallMobileUpdate(update)) {
    return openExternalMobileUpdate(update);
  }

  return installAndroidMobileUpdate(update);
}
