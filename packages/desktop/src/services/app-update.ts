import { APP_VERSION, TON_RELEASES_URL, checkForAppUpdate } from '@ton/core';
import type { AppUpdateCheck, AppUpdatePlatform, UpdateManifest } from '@ton/core';

export interface DesktopUpdateInstallResult {
  filePath: string;
  fileName: string;
  openedInstaller: boolean;
  simulated: boolean;
}

function mapDesktopPlatform(platform: string): AppUpdatePlatform {
  switch (platform) {
    case 'darwin':
      return 'desktop-darwin';
    case 'win32':
      return 'desktop-win32';
    case 'linux':
      return 'desktop-linux';
    default:
      return 'unknown';
  }
}

function getSimulatedManifest(): UpdateManifest | null {
  const simulatedVersion = import.meta.env.VITE_TON_SIMULATE_UPDATE_VERSION?.trim();
  if (!simulatedVersion) {
    return null;
  }

  const fileName = `TON-${simulatedVersion}-update-simulation.txt`;

  return {
    version: simulatedVersion,
    detailsUrl: import.meta.env.VITE_TON_SIMULATE_UPDATE_URL?.trim() || TON_RELEASES_URL,
    notes: 'Simulated GitHub release feed',
    desktop: {
      darwin: { url: 'https://example.invalid/ton-update-simulation', fileName },
      win32: { url: 'https://example.invalid/ton-update-simulation', fileName },
      linux: { url: 'https://example.invalid/ton-update-simulation', fileName },
    },
  };
}

export async function getDesktopAppVersion(): Promise<string> {
  try {
    return await window.api.invoke('app:get-version');
  } catch {
    return APP_VERSION;
  }
}

export async function getDesktopUpdatePlatform(): Promise<AppUpdatePlatform> {
  try {
    const platform = await window.api.invoke('app:get-platform');
    return mapDesktopPlatform(String(platform));
  } catch {
    return 'unknown';
  }
}

export async function checkDesktopForUpdates(): Promise<AppUpdateCheck> {
  const simulatedManifest = getSimulatedManifest();
  if (!simulatedManifest) {
    return window.api.invoke('app:check-update') as Promise<AppUpdateCheck>;
  }

  const [currentVersion, platform] = await Promise.all([
    getDesktopAppVersion(),
    getDesktopUpdatePlatform(),
  ]);

  return checkForAppUpdate(currentVersion, fetch, {
    fallbackManifest: simulatedManifest,
    platform,
  });
}

export async function openDesktopUpdateUrl(url: string): Promise<void> {
  await window.api.invoke('app:open-external', url);
}

export async function downloadDesktopUpdate(
  update: AppUpdateCheck,
): Promise<DesktopUpdateInstallResult> {
  return window.api.invoke('app:download-update', {
    url: update.downloadUrl,
    fileName: update.assetFileName,
    version: update.latestVersion,
    simulate: update.source === 'simulation',
  }) as Promise<DesktopUpdateInstallResult>;
}
