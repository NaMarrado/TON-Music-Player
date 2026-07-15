import type { CloudLibraryManifestV2, CloudStorageConfig } from '@ton/core';
import {
  buildCloudV2ActivationObjectKey,
  convertCloudLibraryManifestV1ToV2,
  createEmptyCloudLibraryManifestV2,
} from '@ton/core';
import { getDb } from '../database';
import type { DesktopCloudSyncStateRow } from './auto-sync-store';
import { DesktopR2Client } from './r2-client';
import { readRemoteManifest } from './v1-remote-manifest';
import { hasCloudV2History } from './v2-bootstrap-guard';
import type { V2SyncOptions } from './v2-types';

export async function bootstrapMissingV2Manifest(input: {
  client: DesktopR2Client;
  config: CloudStorageConfig;
  scopeId: string;
  state: DesktopCloudSyncStateRow;
  deviceId: string;
  options: V2SyncOptions;
}): Promise<{ remote: CloudLibraryManifestV2; bootstrappingFromV1: boolean }> {
  const { client, config, scopeId, state, deviceId, options } = input;
  const mirror = getDb().prepare(`
    SELECT COUNT(*) AS count FROM cloud_sync_entities WHERE scope_id = ?
  `).get(scopeId) as { count: number };
  const localHistory = hasCloudV2History({
    revision: state.revision,
    etag: state.etag,
    mirroredEntityCount: mirror.count,
    activationMarkerPresent: false,
  });
  const activationMarkerPresent = localHistory ? false : await client.headObject(
    buildCloudV2ActivationObjectKey(config.prefix), options.signal,
  );
  if (localHistory || hasCloudV2History({
    revision: null,
    etag: null,
    mirroredEntityCount: 0,
    activationMarkerPresent,
  })) {
    throw new Error('cloud_sync_v2_manifest_missing');
  }
  const v1 = await readRemoteManifest(client, config);
  return {
    remote: v1
      ? convertCloudLibraryManifestV1ToV2(v1)
      : createEmptyCloudLibraryManifestV2(deviceId),
    bootstrappingFromV1: Boolean(v1),
  };
}
