import { resolveUpdateManifest } from './app-update-manifest';
import { loadRemoteManifest, loadRemotePackageVersion } from './app-update-remote';
import { compareVersions, normalizeAppVersion } from './app-update-version';
import type {
  AppUpdateCheck,
  AppUpdatePlatform,
  UpdateFetch,
  UpdateManifest,
} from './app-update-types';

export {
  TON_PACKAGE_VERSION_URL,
  TON_RELEASES_URL,
  TON_REPOSITORY_URL,
  TON_UPDATE_MANIFEST_URL,
} from './app-update-constants';
export { compareVersions } from './app-update-version';
export type {
  AppUpdateCheck,
  AppUpdatePlatform,
  UpdateAssetDescriptor,
  UpdateFetch,
  UpdateFetchResponse,
  UpdateManifest,
  UpdateManifestDesktopTargets,
  UpdateSource,
} from './app-update-types';

export async function checkForAppUpdate(
  currentVersion: string,
  fetcher: UpdateFetch,
  options: { fallbackManifest?: UpdateManifest | null; platform?: AppUpdatePlatform } = {},
): Promise<AppUpdateCheck> {
  const normalizedCurrentVersion = normalizeAppVersion(currentVersion);
  const platform = options.platform ?? 'unknown';

  try {
    const remoteTarget =
      (await loadRemoteManifest(fetcher, platform)) ??
      (await loadRemotePackageVersion(fetcher, platform));

    return {
      currentVersion: normalizedCurrentVersion,
      latestVersion: remoteTarget.latestVersion,
      hasUpdate: compareVersions(remoteTarget.latestVersion, normalizedCurrentVersion) > 0,
      downloadUrl: remoteTarget.downloadUrl,
      detailsUrl: remoteTarget.detailsUrl,
      notes: remoteTarget.notes,
      source: remoteTarget.source,
      platform: remoteTarget.platform,
      canDownload: remoteTarget.canDownload,
      assetFileName: remoteTarget.assetFileName,
    };
  } catch (error) {
    const simulatedTarget = resolveUpdateManifest(options.fallbackManifest, 'simulation', platform);
    if (!simulatedTarget) {
      throw error;
    }

    return {
      currentVersion: normalizedCurrentVersion,
      latestVersion: simulatedTarget.latestVersion,
      hasUpdate: compareVersions(simulatedTarget.latestVersion, normalizedCurrentVersion) > 0,
      downloadUrl: simulatedTarget.downloadUrl,
      detailsUrl: simulatedTarget.detailsUrl,
      notes: simulatedTarget.notes,
      source: simulatedTarget.source,
      platform: simulatedTarget.platform,
      canDownload: simulatedTarget.canDownload,
      assetFileName: simulatedTarget.assetFileName,
    };
  }
}
