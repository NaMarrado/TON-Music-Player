import type { CloudLibraryManifestV1, CloudStorageConfig } from '@ton/core';
import {
  buildCloudCommitObjectKey,
  buildCloudManifestObjectKey,
  buildLegacyCloudManifestObjectKey,
  normalizeCloudPrefix,
} from '@ton/core';
import { setDesktopCloudLastRevision } from './config';
import { DesktopR2Client } from './r2-client';

type ManagedPlaylistKeys = Map<string, Set<string>>;

function parseManifest(value: CloudLibraryManifestV1 | null): CloudLibraryManifestV1 | null {
  return value?.schema_version === 1 && value.app === 'TON' ? value : null;
}

export async function readRemoteManifest(
  client: DesktopR2Client,
  config: CloudStorageConfig,
): Promise<CloudLibraryManifestV1 | null> {
  const current = parseManifest(
    await client.getJson<CloudLibraryManifestV1>(buildCloudManifestObjectKey(config.prefix)),
  );
  if (current) {
    return current;
  }
  return parseManifest(
    await client.getJson<CloudLibraryManifestV1>(buildLegacyCloudManifestObjectKey(config.prefix)),
  );
}

export async function writeRemoteManifest(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  manifest: CloudLibraryManifestV1,
): Promise<void> {
  await client.putJson(buildCloudCommitObjectKey(config.prefix, manifest.revision), manifest);
  await client.putJson(buildCloudManifestObjectKey(config.prefix), manifest);
  setDesktopCloudLastRevision(manifest.revision);
}

export async function cleanupLegacyCloudLayout(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  manifest: CloudLibraryManifestV1,
): Promise<void> {
  if (manifest.tracks.some((track) => (
    track.object_key.includes('/v1/') || (track.artwork_object_key?.includes('/v1/') ?? false)
  ))) {
    return;
  }
  if (manifest.playlists.some((playlist) => playlist.cover_object_key?.includes('/v1/'))) {
    return;
  }
  const keys = await client.listObjectKeys(`${normalizeCloudPrefix(config.prefix)}/v1/`);
  await Promise.all(keys.map((key) => client.deleteObject(key).catch(() => undefined)));
}

export function addManagedPlaylistKey(
  plan: ManagedPlaylistKeys,
  prefix: string,
  key: string | null | undefined,
): void {
  if (!key) {
    return;
  }
  const keys = plan.get(prefix) ?? new Set<string>();
  keys.add(key);
  plan.set(prefix, keys);
}

export async function cleanupReadablePlaylistObjects(
  client: DesktopR2Client,
  plan: ManagedPlaylistKeys,
): Promise<void> {
  for (const [prefix, expectedKeys] of plan) {
    const existingKeys = await client.listObjectKeys(prefix);
    await Promise.all(existingKeys
      .filter((key) => !expectedKeys.has(key))
      .map((key) => client.deleteObject(key).catch(() => undefined)));
  }
}
