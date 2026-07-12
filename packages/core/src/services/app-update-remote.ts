import {
  TON_PACKAGE_VERSION_URL,
  TON_RELEASES_URL,
  TON_UPDATE_MANIFEST_URL,
} from './app-update-constants';
import { parseUpdateManifest, resolveUpdateManifest } from './app-update-manifest';
import { normalizeAppVersion } from './app-update-version';
import type {
  AppUpdatePlatform,
  ResolvedUpdateTarget,
  UpdateFetch,
} from './app-update-types';

function withCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ts=${Date.now()}`;
}

export async function loadRemoteManifest(
  fetcher: UpdateFetch,
  platform: AppUpdatePlatform,
): Promise<ResolvedUpdateTarget | null> {
  try {
    const response = await fetcher(withCacheBust(TON_UPDATE_MANIFEST_URL), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const manifest = parseUpdateManifest(await response.json());
    return resolveUpdateManifest(manifest, 'manifest', platform);
  } catch {
    return null;
  }
}

export async function loadRemotePackageVersion(
  fetcher: UpdateFetch,
  platform: AppUpdatePlatform,
): Promise<ResolvedUpdateTarget> {
  const response = await fetcher(withCacheBust(TON_PACKAGE_VERSION_URL), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch package version from GitHub');
  }

  const payload = await response.json();
  if (typeof payload !== 'object' || payload === null || typeof (payload as { version?: unknown }).version !== 'string') {
    throw new Error('GitHub package version payload is invalid');
  }

  return {
    latestVersion: normalizeAppVersion((payload as { version: string }).version),
    downloadUrl: TON_RELEASES_URL,
    detailsUrl: TON_RELEASES_URL,
    source: 'package',
    platform,
    canDownload: false,
  };
}
