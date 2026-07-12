import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { AppUpdateCheck } from '@ton/core';
import type { MobileUpdateInstallResult } from './app-update-install';

const INSTALLER_INTENT_FLAGS = 1 | 0x10000000;

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'TON-update.apk';
}

async function ensureUpdateDirectory(): Promise<string> {
  const rootDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!rootDirectory) {
    throw new Error('No writable file system directory is available');
  }

  const updatesDirectory = `${rootDirectory}updates`;
  await FileSystem.makeDirectoryAsync(updatesDirectory, { intermediates: true });
  return updatesDirectory;
}

function resolveAndroidUpdateFileName(update: AppUpdateCheck): string {
  if (update.assetFileName?.trim()) {
    return sanitizeFileName(update.assetFileName);
  }

  return sanitizeFileName(`TON-${update.latestVersion}.apk`);
}

export async function installAndroidMobileUpdate(
  update: AppUpdateCheck,
): Promise<MobileUpdateInstallResult> {
  const updatesDirectory = await ensureUpdateDirectory();
  const fileUri = `${updatesDirectory}/${resolveAndroidUpdateFileName(update)}`;

  if (update.source === 'simulation') {
    const lines = [
      'TON Android update simulation',
      `Version: ${update.latestVersion}`,
      `Created: ${new Date().toISOString()}`,
      '',
      'This placeholder simulates a downloaded APK while the release is private.',
    ];

    await FileSystem.writeAsStringAsync(fileUri, `${lines.join('\n')}\n`);

    return {
      fileUri,
      openedDetailsPage: false,
      openedInstaller: false,
      simulated: true,
    };
  }

  const result = await FileSystem.downloadAsync(update.downloadUrl, fileUri);
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: INSTALLER_INTENT_FLAGS,
    type: 'application/vnd.android.package-archive',
  });

  return {
    fileUri: result.uri,
    openedDetailsPage: false,
    openedInstaller: true,
    simulated: false,
  };
}
