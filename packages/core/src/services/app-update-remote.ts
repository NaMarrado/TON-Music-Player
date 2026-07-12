import {
  TON_UPDATE_MANIFEST_URL,
} from './app-update-constants';
import { parseUpdateManifest, resolveUpdateManifest } from './app-update-manifest';
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
