import path from 'node:path';
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
import type { DesktopCloudOutboxEntry, DesktopCloudSyncStateRow } from './auto-sync-store';
import { contentTypeForExtension } from './media';
import type { LocalCloudArtwork } from './sync-common';
import { mergeV1BootstrapPlaylistEntry, mergeV1BootstrapTrackEntry } from './v1-bootstrap-merge';
import type { SerializedPlaylist, SerializedTrack } from './v2-types';

export type RequiredV2Audio = { serialized: SerializedTrack; key: string };

export function createV2MutationBuilder(input: {
  state: DesktopCloudSyncStateRow;
  deviceId: string;
  outbox: DesktopCloudOutboxEntry[];
  tracks: Map<number, SerializedTrack>;
  playlists: Map<number, SerializedPlaylist>;
  bootstrappingFromV1: boolean;
  repairReferencedBlobs: boolean;
}): {
  build: (base: CloudLibraryManifestV2) => CloudLibraryManifestV2;
  requiredAudio: Map<string, RequiredV2Audio>;
  requiredArtwork: Map<string, LocalCloudArtwork>;
  repairObjectKeys: Set<string>;
} {
  const {
    state, deviceId, outbox, tracks, playlists,
    bootstrappingFromV1, repairReferencedBlobs,
  } = input;
  const requiredAudio = new Map<string, RequiredV2Audio>();
  const requiredArtwork = new Map<string, LocalCloudArtwork>();
  const repairObjectKeys = new Set<string>();
  const build = (base: CloudLibraryManifestV2): CloudLibraryManifestV2 => {
    let counter = Math.max(state.lamport_counter, base.max_counter);
    const trackRecords: CloudTrackRecordV2[] = [];
    const playlistRecords: CloudPlaylistRecordV2[] = [];
    const remoteTracks = new Map(base.tracks.map((record) => [record.content_hash_sha256, record]));
    const remotePlaylists = new Map(base.playlists.map((record) => [record.cloud_id, record]));
    const nextVersion = () => {
      const version = nextCloudEntityVersion(counter, deviceId);
      counter = version.counter;
      return version;
    };

    for (const [id, serialized] of tracks) {
      const pending = outbox.some((item) => (
        item.entity_type === 'track' && item.local_id === id && item.operation === 'upsert'
      ));
      const previous = remoteTracks.get(serialized.entry.content_hash_sha256);
      if (repairReferencedBlobs && previous && !previous.deleted) {
        requiredAudio.set(serialized.entry.content_hash_sha256, { serialized, key: previous.entry.object_key });
        repairObjectKeys.add(previous.entry.object_key);
        if (serialized.local.artworkHash && serialized.local.artworkPath
            && previous.entry.artwork_hash_sha256 === serialized.local.artworkHash
            && previous.entry.artwork_object_key) {
          requiredArtwork.set(previous.entry.artwork_object_key, {
            key: previous.entry.artwork_object_key,
            filePath: serialized.local.artworkPath,
            hash: serialized.local.artworkHash,
            contentType: contentTypeForExtension(path.extname(serialized.local.artworkPath) || '.jpg'),
          });
          repairObjectKeys.add(previous.entry.artwork_object_key);
        }
      }
      const mergeLiveV1 = bootstrappingFromV1 && !pending && previous && !previous.deleted;
      if (!pending && previous && !mergeLiveV1) continue;
      const candidate = mergeLiveV1
        ? mergeV1BootstrapTrackEntry(previous.entry, serialized.entry)
        : serialized.entry;
      const entry: CloudTrackEntry = !previous || previous.deleted ? candidate : {
        ...candidate,
        object_key: previous.entry.object_key,
        artwork_object_key:
          previous.entry.artwork_hash_sha256 === candidate.artwork_hash_sha256
            && previous.entry.artwork_object_key
            ? previous.entry.artwork_object_key
            : candidate.artwork_object_key,
      };
      trackRecords.push(createCloudLiveTrackRecordV2(entry, nextVersion()));
      if (!previous || previous.deleted || previous.entry.object_key !== entry.object_key) {
        requiredAudio.set(serialized.entry.content_hash_sha256, { serialized, key: entry.object_key });
      }
      if (serialized.local.artworkHash && serialized.local.artworkPath && entry.artwork_object_key
          && entry.artwork_hash_sha256 === serialized.local.artworkHash
          && (!previous || previous.deleted
            || previous.entry.artwork_hash_sha256 !== entry.artwork_hash_sha256)) {
        requiredArtwork.set(entry.artwork_object_key, {
          key: entry.artwork_object_key,
          filePath: serialized.local.artworkPath,
          hash: serialized.local.artworkHash,
          contentType: contentTypeForExtension(path.extname(serialized.local.artworkPath) || '.jpg'),
        });
      }
    }
    for (const item of outbox) {
      if (item.entity_type !== 'track' || item.operation !== 'delete') continue;
      let hash: string | undefined;
      try { hash = (JSON.parse(item.payload_json || '{}') as { content_hash_sha256?: string }).content_hash_sha256; }
      catch { hash = undefined; }
      if (!hash) continue;
      const stillExists = getDb().prepare('SELECT 1 FROM tracks WHERE content_hash_sha256 = ? LIMIT 1').get(hash);
      if (!stillExists) trackRecords.push(createCloudDeletedTrackRecordV2(hash, nextVersion()));
    }

    for (const [id, serialized] of playlists) {
      const pending = outbox.some((item) => (
        item.entity_type === 'playlist' && item.local_id === id && item.operation === 'upsert'
      ));
      const previous = remotePlaylists.get(serialized.entry.cloud_id);
      if (repairReferencedBlobs && serialized.cover && previous && !previous.deleted
          && previous.entry.cover_hash_sha256 === serialized.cover.hash
          && previous.entry.cover_object_key) {
        requiredArtwork.set(previous.entry.cover_object_key, {
          ...serialized.cover, key: previous.entry.cover_object_key,
        });
        repairObjectKeys.add(previous.entry.cover_object_key);
      }
      const mergeLiveV1 = bootstrappingFromV1 && !pending && previous && !previous.deleted;
      if (!pending && previous && !mergeLiveV1) continue;
      const candidate = mergeLiveV1
        ? mergeV1BootstrapPlaylistEntry(previous.entry, serialized.entry)
        : serialized.entry;
      const entry: CloudPlaylistEntry = !previous || previous.deleted ? candidate : {
        ...candidate,
        cover_object_key:
          previous.entry.cover_hash_sha256 === candidate.cover_hash_sha256
            && previous.entry.cover_object_key
            ? previous.entry.cover_object_key
            : candidate.cover_object_key,
      };
      playlistRecords.push(createCloudLivePlaylistRecordV2(entry, nextVersion()));
      if (serialized.cover && entry.cover_hash_sha256 === serialized.cover.hash
          && (!previous || previous.deleted
            || previous.entry.cover_hash_sha256 !== entry.cover_hash_sha256)) {
        const key = entry.cover_object_key ?? serialized.cover.key;
        requiredArtwork.set(key, { ...serialized.cover, key });
      }
    }
    for (const item of outbox) {
      if (item.entity_type !== 'playlist' || item.operation !== 'delete') continue;
      let cloudId: string | undefined;
      try { cloudId = (JSON.parse(item.payload_json || '{}') as { cloud_id?: string }).cloud_id; }
      catch { cloudId = undefined; }
      if (cloudId) playlistRecords.push(createCloudDeletedPlaylistRecordV2(cloudId, nextVersion()));
    }
    const local = createEmptyCloudLibraryManifestV2(deviceId);
    local.max_counter = counter;
    local.tracks = trackRecords;
    local.playlists = playlistRecords;
    return local;
  };
  return { build, requiredAudio, requiredArtwork, repairObjectKeys };
}
