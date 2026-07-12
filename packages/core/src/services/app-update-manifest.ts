import { TON_RELEASES_URL } from './app-update-constants';
import { normalizeAppVersion } from './app-update-version';
import type {
  AppUpdatePlatform,
  ResolvedUpdateTarget,
  UpdateAssetDescriptor,
  UpdateManifest,
  UpdateManifestDesktopTargets,
  UpdateSource,
} from './app-update-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function parseAssetDescriptor(value: unknown): UpdateAssetDescriptor | undefined {
  if (!isRecord(value) || typeof value.url !== 'string') {
    return undefined;
  }

  return {
    url: value.url,
    fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
  };
}

function parseDesktopTargets(value: unknown): UpdateManifestDesktopTargets | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const darwin = parseAssetDescriptor(value.darwin);
  const win32 = parseAssetDescriptor(value.win32);
  const linux = parseAssetDescriptor(value.linux);

  if (!darwin && !win32 && !linux) {
    return undefined;
  }

  return {
    darwin,
    win32,
    linux,
  };
}

export function parseUpdateManifest(data: unknown): UpdateManifest | null {
  if (!isRecord(data) || typeof data.version !== 'string') {
    return null;
  }

  return {
    version: data.version,
    downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : undefined,
    detailsUrl: typeof data.detailsUrl === 'string' ? data.detailsUrl : undefined,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    desktop: parseDesktopTargets(data.desktop),
    android: parseAssetDescriptor(data.android),
    ios: parseAssetDescriptor(data.ios),
  };
}

function resolveAssetForPlatform(
  manifest: UpdateManifest,
  platform: AppUpdatePlatform,
): UpdateAssetDescriptor | undefined {
  switch (platform) {
    case 'desktop-darwin':
      return manifest.desktop?.darwin;
    case 'desktop-win32':
      return manifest.desktop?.win32;
    case 'desktop-linux':
      return manifest.desktop?.linux;
    case 'android':
      return manifest.android;
    case 'ios':
      return manifest.ios;
    default:
      return undefined;
  }
}

export function resolveUpdateManifest(
  manifest: UpdateManifest | null | undefined,
  source: UpdateSource,
  platform: AppUpdatePlatform,
): ResolvedUpdateTarget | null {
  if (!manifest) {
    return null;
  }

  const platformAsset = resolveAssetForPlatform(manifest, platform);
  const downloadUrl = isHttpUrl(platformAsset?.url) ? platformAsset.url : undefined;
  const detailsUrl = isHttpUrl(manifest.detailsUrl)
    ? manifest.detailsUrl
    : isHttpUrl(manifest.downloadUrl)
      ? manifest.downloadUrl
      : TON_RELEASES_URL;

  return {
    latestVersion: normalizeAppVersion(manifest.version),
    downloadUrl: downloadUrl ?? detailsUrl,
    detailsUrl,
    notes: manifest.notes?.trim() || undefined,
    source,
    platform,
    canDownload: source === 'simulation' ? true : Boolean(downloadUrl),
    assetFileName: platformAsset?.fileName?.trim() || undefined,
  };
}
