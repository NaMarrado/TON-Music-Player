import {
  buildCloudV2ManifestObjectKey,
  buildCloudLocalDeletionPreview,
  parseCloudLibraryManifestV2,
  partitionCloudManifestForLocalExclusions,
  type CloudLibraryManifestV2,
  type CloudLocalDeletionPreview,
} from '@ton/core';
import { getMobileCloudConfig } from './config';
import {
  clearMobileCloudLocalExclusions,
  ensureMobileCloudScope,
  getMobileCloudLocalExclusionHashes,
  pruneMobileCloudLocalExclusions,
} from './local-state';
import { MobileR2Client } from './r2-client';

export async function prepareMobileManifestForLocalDevice(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  restoreLocallyDeleted: boolean,
): Promise<{ manifest: CloudLibraryManifestV2; restored: number }> {
  const exclusions = await getMobileCloudLocalExclusionHashes(scopeId);
  const partition = partitionCloudManifestForLocalExclusions(
    manifest,
    exclusions,
    restoreLocallyDeleted,
  );
  await pruneMobileCloudLocalExclusions(scopeId, partition.liveHashes);
  const restored = restoreLocallyDeleted
    ? await clearMobileCloudLocalExclusions(scopeId, partition.matchingHashes)
    : 0;
  return { manifest: partition.manifest, restored };
}

export async function previewMobileCloudLocalDeletions(
  signal?: AbortSignal,
): Promise<CloudLocalDeletionPreview> {
  const config = await getMobileCloudConfig();
  if (!config) throw new Error('cloud_storage_not_configured');
  const scopeId = await ensureMobileCloudScope(config);
  const read = await new MobileR2Client(config).getJsonConditional<CloudLibraryManifestV2>(
    buildCloudV2ManifestObjectKey(config.prefix),
    undefined,
    signal,
  );
  if (read.status !== 'ok') return { deletedTracks: 0, reclaimableBytes: 0 };
  const manifest = parseCloudLibraryManifestV2(read.value);
  if (!manifest) throw new Error('cloud_sync_invalid_v2_manifest');
  const exclusions = await getMobileCloudLocalExclusionHashes(scopeId);
  return buildCloudLocalDeletionPreview(manifest.tracks, exclusions);
}
