import type {
  CloudLibraryManifestV2,
  CloudLocalDeletionPreview,
  CloudTrackRecordV2,
} from '../../types/cloud-sync';

export type CloudLocalExclusionPartition = {
  manifest: CloudLibraryManifestV2;
  excludedRecords: CloudTrackRecordV2[];
  liveHashes: Set<string>;
  matchingHashes: Set<string>;
};

export function partitionCloudManifestForLocalExclusions(
  manifest: CloudLibraryManifestV2,
  excludedHashes: ReadonlySet<string>,
  restoreLocallyDeleted: boolean,
): CloudLocalExclusionPartition {
  const normalizedExclusions = new Set(
    [...excludedHashes].map((hash) => hash.toLowerCase()),
  );
  const liveHashes = new Set(
    manifest.tracks
      .filter((record) => !record.deleted)
      .map((record) => record.content_hash_sha256.toLowerCase()),
  );
  const matchingHashes = new Set(
    [...normalizedExclusions].filter((hash) => liveHashes.has(hash)),
  );
  if (restoreLocallyDeleted || matchingHashes.size === 0) {
    return { manifest, excludedRecords: [], liveHashes, matchingHashes };
  }
  const excludedRecords = manifest.tracks.filter(
    (record) => !record.deleted
      && matchingHashes.has(record.content_hash_sha256.toLowerCase()),
  );
  return {
    manifest: {
      ...manifest,
      tracks: manifest.tracks.filter(
        (record) => record.deleted
          || !matchingHashes.has(record.content_hash_sha256.toLowerCase()),
      ),
    },
    excludedRecords,
    liveHashes,
    matchingHashes,
  };
}

export function buildCloudLocalDeletionPreview(
  records: readonly CloudTrackRecordV2[],
  excludedHashes: ReadonlySet<string>,
): CloudLocalDeletionPreview {
  const normalizedExclusions = new Set(
    [...excludedHashes].map((hash) => hash.toLowerCase()),
  );
  const matching = records.filter(
    (record) => !record.deleted
      && normalizedExclusions.has(record.content_hash_sha256.toLowerCase()),
  );
  return {
    deletedTracks: matching.length,
    reclaimableBytes: matching.reduce(
      (total, record) => total + (record.deleted ? 0 : record.entry.file_size ?? 0),
      0,
    ),
  };
}
