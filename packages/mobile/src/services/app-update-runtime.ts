import type { AppUpdateCheck } from '@ton/core';
import { isAndroidMobileRuntime } from './app-update-platform';

type UpdateAvailability = Pick<AppUpdateCheck, 'canDownload'> | null | undefined;

export function canInstallMobileUpdate(update: UpdateAvailability): boolean {
  return isAndroidMobileRuntime() && update?.canDownload === true;
}

export function getMobileUpdateActionKey(
  update: UpdateAvailability,
): 'downloadUpdate' | 'openReleasePage' {
  return canInstallMobileUpdate(update)
    ? 'downloadUpdate'
    : 'openReleasePage';
}
