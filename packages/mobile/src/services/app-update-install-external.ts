import type { AppUpdateCheck } from '@ton/core';
import type { MobileUpdateInstallResult } from './app-update-install';
import { openMobileUpdateUrl } from './app-update-open';

export async function openExternalMobileUpdate(
  update: AppUpdateCheck,
): Promise<MobileUpdateInstallResult> {
  await openMobileUpdateUrl(update.detailsUrl);
  return {
    openedDetailsPage: true,
    openedInstaller: false,
    simulated: false,
  };
}
