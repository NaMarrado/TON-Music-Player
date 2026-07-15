import type {
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudPlaylistRecordV2,
  CloudTrackEntry,
  CloudTrackRecordV2,
} from '@ton/core';
import {
  createCloudDeletedPlaylistRecordV2,
  createCloudDeletedTrackRecordV2,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  createEmptyCloudLibraryManifestV2,
  nextCloudEntityVersion,
} from '@ton/core';
import { getDb } from '../database';
import type { MobileCloudOutboxRow } from './local-state';
import { normalizeDownloadedAt, type PreparedLocalManifest } from './v2-common';

function parseDeletePayload(row: MobileCloudOutboxRow): Record<string, unknown> {
  if (!row.payload_json) return {};
  try { return JSON.parse(row.payload_json) as Record<string, unknown>; }
  catch { return {}; }
}

function preserveExistingTrackBlobKeys(
  entry: CloudTrackEntry,
  remote: CloudTrackRecordV2 | undefined,
): CloudTrackEntry {
  if (!remote || remote.deleted) return entry;
  const sameArtwork = entry.artwork_hash_sha256 != null
    && entry.artwork_hash_sha256 === remote.entry.artwork_hash_sha256;
  return {
    ...entry,
    object_key: remote.entry.object_key,
    artwork_object_key: sameArtwork ? remote.entry.artwork_object_key : entry.artwork_object_key,
    artwork_file_name: sameArtwork ? remote.entry.artwork_file_name : entry.artwork_file_name,
  };
}

function preserveExistingPlaylistBlobKeys(
  entry: CloudPlaylistEntry,
  remote: CloudPlaylistRecordV2 | undefined,
): CloudPlaylistEntry {
  if (!remote || remote.deleted) return entry;
  const sameCover = entry.cover_hash_sha256 != null
    && entry.cover_hash_sha256 === remote.entry.cover_hash_sha256;
  return {
    ...entry,
    cover_object_key: sameCover ? remote.entry.cover_object_key : entry.cover_object_key,
  };
}

export function buildLocalMutationManifest(
  remote: CloudLibraryManifestV2,
  prepared: PreparedLocalManifest | null,
  outbox: readonly MobileCloudOutboxRow[],
  deviceId: string,
  observedCounter: number,
  refreshV1LiveRecords: boolean,
  trackHashesStillPresent: ReadonlySet<string>,
): CloudLibraryManifestV2 {
  const remoteTracks = new Map(remote.tracks.map((record) => [record.content_hash_sha256, record]));
  const remotePlaylists = new Map(remote.playlists.map((record) => [record.cloud_id, record]));
  const tracks = new Map<string, CloudTrackRecordV2>();
  const playlists = new Map<string, CloudPlaylistRecordV2>();
  let counter = Math.max(remote.max_counter, observedCounter);
  const nextVersion = () => {
    const version = nextCloudEntityVersion(counter, deviceId);
    counter = version.counter;
    return version;
  };
  const addDiscoveredTrack = (entry: CloudTrackEntry): void => {
    const existing = remoteTracks.get(entry.content_hash_sha256);
    if (existing) {
      if (refreshV1LiveRecords && !existing.deleted) {
        const preferred = entry.updated_at >= existing.entry.updated_at ? entry : existing.entry;
        const localAt = normalizeDownloadedAt(entry.downloaded_at);
        const remoteAt = normalizeDownloadedAt(existing.entry.downloaded_at);
        const downloadedAt = localAt && remoteAt ? Math.min(localAt, remoteAt) : localAt ?? remoteAt;
        const reconciled = preserveExistingTrackBlobKeys({
          ...preferred, downloaded_at: downloadedAt,
        }, existing);
        tracks.set(entry.content_hash_sha256, createCloudLiveTrackRecordV2(reconciled, nextVersion()));
      }
      return;
    }
    tracks.set(entry.content_hash_sha256, createCloudLiveTrackRecordV2(entry, nextVersion()));
  };
  const addDiscoveredPlaylist = (entry: CloudPlaylistEntry): void => {
    const existing = remotePlaylists.get(entry.cloud_id);
    if (existing) {
      if (refreshV1LiveRecords && !existing.deleted) {
        const preferred = entry.updated_at >= existing.entry.updated_at ? entry : existing.entry;
        const reconciled = preserveExistingPlaylistBlobKeys(preferred, existing);
        playlists.set(entry.cloud_id, createCloudLivePlaylistRecordV2(reconciled, nextVersion()));
      }
      return;
    }
    playlists.set(entry.cloud_id, createCloudLivePlaylistRecordV2(entry, nextVersion()));
  };

  if (prepared && !prepared.incremental) {
    prepared.manifest.tracks.forEach((record) => {
      if (!record.deleted) addDiscoveredTrack(record.entry);
    });
    prepared.manifest.playlists.forEach((record) => {
      if (!record.deleted) addDiscoveredPlaylist(record.entry);
    });
  } else if (prepared?.incremental) {
    prepared.trackEntryByLocalId.forEach(addDiscoveredTrack);
  }

  for (const row of outbox) {
    const version = nextVersion();
    if (row.entity_type === 'track') {
      if (row.operation === 'delete') {
        const hash = parseDeletePayload(row).content_hash_sha256;
        if (typeof hash === 'string' && hash && !trackHashesStillPresent.has(hash)) {
          tracks.set(hash, createCloudDeletedTrackRecordV2(hash, version, row.created_at * 1000));
        }
      } else if (row.local_id != null) {
        const entry = prepared?.trackEntryByLocalId.get(row.local_id);
        if (entry) {
          const reconciled = preserveExistingTrackBlobKeys(
            entry, remoteTracks.get(entry.content_hash_sha256),
          );
          tracks.set(entry.content_hash_sha256, createCloudLiveTrackRecordV2(reconciled, version));
        }
      }
    } else if (row.operation === 'delete') {
      const cloudId = parseDeletePayload(row).cloud_id;
      if (typeof cloudId === 'string' && cloudId) {
        playlists.set(
          cloudId, createCloudDeletedPlaylistRecordV2(cloudId, version, row.created_at * 1000),
        );
      }
    } else if (row.local_id != null) {
      const entry = prepared?.playlistEntryByLocalId.get(row.local_id);
      if (entry) {
        const reconciled = preserveExistingPlaylistBlobKeys(entry, remotePlaylists.get(entry.cloud_id));
        playlists.set(entry.cloud_id, createCloudLivePlaylistRecordV2(reconciled, version));
      }
    }
  }
  return {
    ...createEmptyCloudLibraryManifestV2(deviceId),
    max_counter: counter,
    tracks: [...tracks.values()],
    playlists: [...playlists.values()],
  };
}

export async function findDeletedTrackHashesStillPresent(
  outbox: readonly MobileCloudOutboxRow[],
): Promise<Set<string>> {
  const hashes = new Set<string>();
  for (const row of outbox) {
    if (row.entity_type !== 'track' || row.operation !== 'delete') continue;
    const hash = parseDeletePayload(row).content_hash_sha256;
    if (typeof hash !== 'string' || !hash || hashes.has(hash)) continue;
    const stillExists = await getDb().getFirstAsync<{ present: number }>(
      `SELECT EXISTS(SELECT 1 FROM tracks WHERE content_hash_sha256 = ? LIMIT 1) AS present`,
      [hash],
    );
    if (stillExists?.present) hashes.add(hash);
  }
  return hashes;
}
