import * as FileSystem from 'expo-file-system';
import type {
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudSyncOrigin,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  CloudTrackRecordV2,
  CloudPlaylistRecordV2,
  Track,
} from '@ton/core';
import {
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  buildCloudV2ActivationObjectKey,
  buildCloudManifestObjectKey,
  buildCloudRevision,
  buildCloudV2CommitObjectKey,
  buildCloudV2ManifestObjectKey,
  buildLegacyCloudManifestObjectKey,
  convertCloudLibraryManifestV1ToV2,
  createCloudDeletedPlaylistRecordV2,
  createCloudDeletedTrackRecordV2,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  createEmptyCloudLibraryManifestV2,
  mergeCloudLibraryManifestsV2,
  nextCloudEntityVersion,
  normalizeCloudPrefix,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import { getDb } from '../database';
import { getPlaylistById, getPlaylistTracks, getTrackById } from '../db-queries';
import { MUSIC_DIR } from '../downloader/filesystem';
import { scheduleMobileJob } from '../job-scheduler';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists, reloadLoadedPlaylistDetails } from '../../stores/playlist-store';
import { buildLocalManifest, fetchCloudLibrary } from './index';
import { getMobileCloudDeviceId } from './config';
import { contentTypeForExtension, getFileExtension } from './media';
import { hashCloudArtworkCached, hashFileSha256 } from './hash';
import {
  acknowledgeMobileCloudOutbox,
  ensureMobileCloudScope,
  getMobileCloudOutbox,
  getMobileCloudPersistedState,
  getMobileCloudProtectedEntities,
  updateMobileCloudPersistedState,
  withMobileCloudOutboxSuppressed,
  type MobileCloudOutboxRow,
  type MobileCloudProtectedEntities,
} from './local-state';
import { MobileR2Client, MobileR2PreconditionFailedError } from './r2-client';

export type MobileCloudSyncMode = 'upload' | 'fetch' | 'sync';

export interface MobileCloudV2SyncOptions {
  config: CloudStorageConfig;
  mode: MobileCloudSyncMode;
  origin: CloudSyncOrigin;
  allowAudioDownloads: boolean;
  onProgress?: (progress: CloudSyncProgress) => void;
  signal?: AbortSignal;
}

interface PreparedLocalManifest {
  manifest: CloudLibraryManifestV2;
  uploads: Map<string, { filePath: string; contentType: string; hash: string }>;
  trackEntryByLocalId: Map<number, CloudTrackEntry>;
  playlistEntryByLocalId: Map<number, CloudPlaylistEntry>;
  incremental: boolean;
}

const EMPTY_RESULT: CloudSyncResult = {
  uploaded: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  importedTracks: 0,
  importedPlaylists: 0,
  revision: null,
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('cloud_sync_cancelled');
  }
}

function emitProgress(
  callback: MobileCloudV2SyncOptions['onProgress'],
  patch: Partial<CloudSyncProgress>,
): void {
  callback?.({
    phase: 'idle',
    current: 0,
    total: 0,
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    ...patch,
  });
}

function parseManifestV1(value: unknown): CloudLibraryManifestV1 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const manifest = value as Partial<CloudLibraryManifestV1>;
  return manifest.schema_version === 1 && manifest.app === 'TON'
    ? manifest as CloudLibraryManifestV1
    : null;
}

function projectManifestV2ToV1(manifest: CloudLibraryManifestV2): CloudLibraryManifestV1 {
  const tracks = manifest.tracks
    .filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted)
    .map((record) => record.entry);
  return {
    schema_version: 1,
    app: 'TON',
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    device_id: manifest.writer_device_id,
    revision: manifest.revision,
    library_track_hashes: tracks.map((track) => track.content_hash_sha256),
    tracks,
    playlists: manifest.playlists
      .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => record.entry),
  };
}

async function readBootstrapManifestV1(
  client: MobileR2Client,
  config: CloudStorageConfig,
  signal?: AbortSignal,
): Promise<CloudLibraryManifestV1 | null> {
  const current = parseManifestV1(await client.getJson<CloudLibraryManifestV1>(
    buildCloudManifestObjectKey(config.prefix),
    signal,
  ));
  if (current) {
    return current;
  }
  return parseManifestV1(await client.getJson<CloudLibraryManifestV1>(
    buildLegacyCloudManifestObjectKey(config.prefix),
    signal,
  ));
}

async function ensureV2ActivationMarker(
  client: MobileR2Client,
  config: CloudStorageConfig,
  deviceId: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await client.putJsonConditional(
      buildCloudV2ActivationObjectKey(config.prefix),
      { schema_version: 2, activated_at: Date.now(), device_id: deviceId },
      { ifNoneMatch: '*', signal },
    );
  } catch (error) {
    if (!(error instanceof MobileR2PreconditionFailedError)) {
      throw error;
    }
  }
}

async function prepareLocalManifest(
  config: CloudStorageConfig,
  deviceId: string,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<PreparedLocalManifest> {
  const built = await buildLocalManifest(config, onProgress, () => Boolean(signal?.aborted));
  const audioKeyByHash = new Map<string, string>();
  const artworkKeyByHash = new Map<string, string>();
  const uploads = new Map<string, { filePath: string; contentType: string; hash: string }>();

  for (const local of built.localTracks) {
    const ext = getFileExtension(local.track.file_path, local.track.format);
    const key = buildCloudContentAudioObjectKey(config.prefix, local.contentHash, ext);
    audioKeyByHash.set(local.contentHash, key);
    uploads.set(key, {
      filePath: local.track.file_path,
      contentType: contentTypeForExtension(ext),
      hash: local.contentHash,
    });
  }
  for (const artwork of built.localArtworks) {
    const ext = getFileExtension(artwork.filePath, null);
    const key = buildCloudContentArtworkObjectKey(config.prefix, artwork.hash, ext);
    artworkKeyByHash.set(artwork.hash, key);
    uploads.set(key, {
      filePath: artwork.filePath,
      contentType: artwork.contentType,
      hash: artwork.hash,
    });
  }

  const rewrittenTracks = built.manifest.tracks.map((entry) => ({
    ...entry,
    object_key: audioKeyByHash.get(entry.content_hash_sha256) ?? entry.object_key,
    artwork_object_key: entry.artwork_hash_sha256
      ? artworkKeyByHash.get(entry.artwork_hash_sha256) ?? entry.artwork_object_key
      : null,
  }));
  const rewrittenPlaylists = built.manifest.playlists.map((entry) => ({
    ...entry,
    cover_object_key: entry.cover_hash_sha256
      ? artworkKeyByHash.get(entry.cover_hash_sha256) ?? entry.cover_object_key
      : null,
  }));
  const rewrittenV1: CloudLibraryManifestV1 = {
    ...built.manifest,
    tracks: rewrittenTracks,
    playlists: rewrittenPlaylists,
  };
  const manifest = convertCloudLibraryManifestV1ToV2(rewrittenV1);
  manifest.writer_device_id = deviceId;

  const entryByHash = new Map(rewrittenTracks.map((entry) => [entry.content_hash_sha256, entry]));
  const trackEntryByLocalId = new Map<number, CloudTrackEntry>();
  for (const local of built.localTracks) {
    const entry = entryByHash.get(local.contentHash);
    if (entry) {
      trackEntryByLocalId.set(local.track.id, entry);
    }
  }
  const playlistRows = await getDb().getAllAsync<{ id: number; cloud_id: string }>(
    `SELECT id, cloud_id FROM playlists
     WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
  );
  const entryByCloudId = new Map(rewrittenPlaylists.map((entry) => [entry.cloud_id, entry]));
  const playlistEntryByLocalId = new Map<number, CloudPlaylistEntry>();
  for (const row of playlistRows) {
    const entry = entryByCloudId.get(row.cloud_id);
    if (entry) {
      playlistEntryByLocalId.set(row.id, entry);
    }
  }
  return { manifest, uploads, trackEntryByLocalId, playlistEntryByLocalId, incremental: false };
}

async function pathExists(path: string | null | undefined): Promise<boolean> {
  if (!path) {
    return false;
  }
  return (await FileSystem.getInfoAsync(path)).exists;
}

function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

async function serializeIncrementalTrack(
  config: CloudStorageConfig,
  track: Track,
  uploads: PreparedLocalManifest['uploads'],
): Promise<CloudTrackEntry | null> {
  if (!(await pathExists(track.file_path))) {
    return null;
  }
  let contentHash = track.content_hash_sha256;
  if (!contentHash) {
    contentHash = await hashFileSha256(track.file_path);
    // This is a cloud bookkeeping update for the mutation already being
    // serialized, so do not create a redundant second outbox generation.
    await withMobileCloudOutboxSuppressed(async (db) => {
      await db.runAsync(
        'UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?',
        [contentHash, track.id],
      );
    });
  }
  const ext = getFileExtension(track.file_path, track.format);
  const objectKey = buildCloudContentAudioObjectKey(config.prefix, contentHash, ext);
  uploads.set(objectKey, {
    filePath: track.file_path,
    contentType: contentTypeForExtension(ext),
    hash: contentHash,
  });

  let artworkHash: string | null = null;
  let artworkObjectKey: string | null = null;
  let artworkFileName: string | null = null;
  if (track.cover_art_path && await pathExists(track.cover_art_path)) {
    artworkHash = await hashCloudArtworkCached(track.cover_art_path);
    const artworkExt = getFileExtension(track.cover_art_path, null);
    artworkObjectKey = buildCloudContentArtworkObjectKey(config.prefix, artworkHash, artworkExt);
    artworkFileName = track.cover_art_path.split('/').pop() ?? `${artworkHash}${artworkExt}`;
    uploads.set(artworkObjectKey, {
      filePath: track.cover_art_path,
      contentType: contentTypeForExtension(artworkExt),
      hash: artworkHash,
    });
  }
  return {
    content_hash_sha256: contentHash,
    object_key: objectKey,
    file_name: track.file_path.split('/').pop() ?? `${contentHash}${ext}`,
    file_size: track.file_size,
    format: track.format,
    artwork_hash_sha256: artworkHash,
    artwork_object_key: artworkObjectKey,
    artwork_file_name: artworkFileName,
    youtube_id: track.youtube_id,
    spotify_id: track.spotify_id,
    soundcloud_id: track.soundcloud_id,
    source_url: track.source_url,
    downloaded_at: normalizeDownloadedAt(track.downloaded_at),
    added_at: track.added_at,
    updated_at: track.scanned_at || track.added_at,
    metadata: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      album_artist: track.album_artist,
      track_number: track.track_number,
      disc_number: track.disc_number,
      duration_ms: track.duration_ms,
      genre: track.genre,
      year: track.year,
      bitrate: track.bitrate,
      sample_rate: track.sample_rate,
      loudness_lufs: track.loudness_lufs,
      loudness_gain: track.loudness_gain,
      rating: track.rating,
    },
  };
}

async function prepareIncrementalManifest(
  config: CloudStorageConfig,
  deviceId: string,
  outbox: readonly MobileCloudOutboxRow[],
  signal?: AbortSignal,
): Promise<PreparedLocalManifest> {
  const uploads: PreparedLocalManifest['uploads'] = new Map();
  const trackEntryByLocalId = new Map<number, CloudTrackEntry>();
  const playlistEntryByLocalId = new Map<number, CloudPlaylistEntry>();
  const trackIds = new Set<number>();
  const playlistIds = new Set<number>();
  for (const row of outbox) {
    if (row.operation !== 'upsert' || row.local_id == null) {
      continue;
    }
    (row.entity_type === 'track' ? trackIds : playlistIds).add(row.local_id);
  }

  const playlistTracksById = new Map<number, Awaited<ReturnType<typeof getPlaylistTracks>>>();
  for (const playlistId of playlistIds) {
    throwIfAborted(signal);
    const tracks = await getPlaylistTracks(playlistId);
    playlistTracksById.set(playlistId, tracks);
    // A playlist mutation can introduce an already-hashed local track which
    // the remote has never seen. Serialize every member; after the remote GET,
    // the mutation builder keeps only identities missing remotely and the
    // uploader sends only blobs referenced by that reduced mutation set.
    tracks.forEach((track) => trackIds.add(track.id));
  }
  for (const trackId of trackIds) {
    throwIfAborted(signal);
    const track = await getTrackById(trackId);
    if (!track) {
      continue;
    }
    const entry = await serializeIncrementalTrack(config, track, uploads);
    if (entry) {
      trackEntryByLocalId.set(trackId, entry);
    }
  }
  for (const playlistId of playlistIds) {
    throwIfAborted(signal);
    const playlist = await getPlaylistById(playlistId);
    if (!playlist?.cloud_id) {
      continue;
    }
    let coverHash: string | null = null;
    let coverObjectKey: string | null = null;
    if (playlist.cover_path && await pathExists(playlist.cover_path)) {
      coverHash = await hashCloudArtworkCached(playlist.cover_path);
      const ext = getFileExtension(playlist.cover_path, null);
      coverObjectKey = buildCloudContentArtworkObjectKey(config.prefix, coverHash, ext);
      uploads.set(coverObjectKey, {
        filePath: playlist.cover_path,
        contentType: contentTypeForExtension(ext),
        hash: coverHash,
      });
    }
    const trackHashes = (playlistTracksById.get(playlistId) ?? [])
      .map((track) => (
        track.content_hash_sha256
        ?? trackEntryByLocalId.get(track.id)?.content_hash_sha256
        ?? null
      ))
      .filter((hash): hash is string => Boolean(hash));
    playlistEntryByLocalId.set(playlistId, {
      cloud_id: playlist.cloud_id,
      name: playlist.name,
      description: playlist.description,
      cover_hash_sha256: coverHash,
      cover_object_key: coverObjectKey,
      is_smart: Boolean(playlist.is_smart),
      smart_rules: playlist.smart_rules,
      sort_order: playlist.sort_order,
      created_at: playlist.created_at,
      updated_at: playlist.updated_at,
      track_hashes: trackHashes,
    });
  }

  return {
    manifest: createEmptyCloudLibraryManifestV2(deviceId),
    uploads,
    trackEntryByLocalId,
    playlistEntryByLocalId,
    incremental: true,
  };
}

function parseDeletePayload(row: MobileCloudOutboxRow): Record<string, unknown> {
  if (!row.payload_json) {
    return {};
  }
  try {
    return JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function preserveExistingTrackBlobKeys(
  entry: CloudTrackEntry,
  remote: CloudTrackRecordV2 | undefined,
): CloudTrackEntry {
  if (!remote || remote.deleted) {
    return entry;
  }
  const sameArtwork = entry.artwork_hash_sha256 != null
    && entry.artwork_hash_sha256 === remote.entry.artwork_hash_sha256;
  return {
    ...entry,
    // A metadata-only edit must keep a migrated V1 object's key. The content
    // hash is the identity, so the existing immutable audio is already valid.
    object_key: remote.entry.object_key,
    artwork_object_key: sameArtwork
      ? remote.entry.artwork_object_key
      : entry.artwork_object_key,
    artwork_file_name: sameArtwork
      ? remote.entry.artwork_file_name
      : entry.artwork_file_name,
  };
}

function preserveExistingPlaylistBlobKeys(
  entry: CloudPlaylistEntry,
  remote: CloudPlaylistRecordV2 | undefined,
): CloudPlaylistEntry {
  if (!remote || remote.deleted) {
    return entry;
  }
  const sameCover = entry.cover_hash_sha256 != null
    && entry.cover_hash_sha256 === remote.entry.cover_hash_sha256;
  return {
    ...entry,
    cover_object_key: sameCover ? remote.entry.cover_object_key : entry.cover_object_key,
  };
}

function buildLocalMutationManifest(
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

  const addDiscoveredTrack = (entry: CloudTrackEntry): void => {
    const existing = remoteTracks.get(entry.content_hash_sha256);
    if (existing) {
      // This includes tombstones. A full reconcile is discovery, not an
      // explicit re-add, and therefore must never resurrect a remote delete.
      if (
        refreshV1LiveRecords
        && !existing.deleted
      ) {
        const preferred = entry.updated_at >= existing.entry.updated_at
          ? entry
          : existing.entry;
        const localDownloadedAt = normalizeDownloadedAt(entry.downloaded_at);
        const remoteDownloadedAt = normalizeDownloadedAt(existing.entry.downloaded_at);
        const downloadedAt = localDownloadedAt && remoteDownloadedAt
          ? Math.min(localDownloadedAt, remoteDownloadedAt)
          : localDownloadedAt ?? remoteDownloadedAt;
        const version = nextCloudEntityVersion(counter, deviceId);
        counter = version.counter;
        const reconciled = preserveExistingTrackBlobKeys({
          ...preferred,
          downloaded_at: downloadedAt,
        }, existing);
        tracks.set(
          entry.content_hash_sha256,
          createCloudLiveTrackRecordV2(reconciled, version),
        );
      }
      return;
    }
    const version = nextCloudEntityVersion(counter, deviceId);
    counter = version.counter;
    tracks.set(entry.content_hash_sha256, createCloudLiveTrackRecordV2(entry, version));
  };
  const addDiscoveredPlaylist = (entry: CloudPlaylistEntry): void => {
    const existing = remotePlaylists.get(entry.cloud_id);
    if (existing) {
      if (
        refreshV1LiveRecords
        && !existing.deleted
      ) {
        const preferred = entry.updated_at >= existing.entry.updated_at
          ? entry
          : existing.entry;
        const version = nextCloudEntityVersion(counter, deviceId);
        counter = version.counter;
        const reconciled = preserveExistingPlaylistBlobKeys(preferred, existing);
        playlists.set(entry.cloud_id, createCloudLivePlaylistRecordV2(reconciled, version));
      }
      return;
    }
    const version = nextCloudEntityVersion(counter, deviceId);
    counter = version.counter;
    playlists.set(entry.cloud_id, createCloudLivePlaylistRecordV2(entry, version));
  };

  if (prepared && !prepared.incremental) {
    // A first V2 reconcile publishes only identities that V1/V2 does not
    // already know. Existing remote live records and tombstones stay remote-
    // authoritative unless an explicit current outbox mutation says otherwise.
    prepared.manifest.tracks.forEach((record) => {
      if (!record.deleted) {
        addDiscoveredTrack(record.entry);
      }
    });
    prepared.manifest.playlists.forEach((record) => {
      if (!record.deleted) {
        addDiscoveredPlaylist(record.entry);
      }
    });
  } else if (prepared?.incremental) {
    // Playlist membership can reference a local track which did not itself
    // mutate. Publish it only when the remote has never seen that identity.
    for (const entry of prepared.trackEntryByLocalId.values()) {
      addDiscoveredTrack(entry);
    }
  }

  for (const row of outbox) {
    const version = nextCloudEntityVersion(counter, deviceId);
    counter = version.counter;
    if (row.entity_type === 'track') {
      if (row.operation === 'delete') {
        const hash = parseDeletePayload(row).content_hash_sha256;
        if (
          typeof hash === 'string'
          && hash
          && !trackHashesStillPresent.has(hash)
        ) {
          tracks.set(hash, createCloudDeletedTrackRecordV2(hash, version, row.created_at * 1000));
        }
      } else if (row.local_id != null) {
        const entry = prepared?.trackEntryByLocalId.get(row.local_id);
        if (entry) {
          const reconciled = preserveExistingTrackBlobKeys(
            entry,
            remoteTracks.get(entry.content_hash_sha256),
          );
          tracks.set(entry.content_hash_sha256, createCloudLiveTrackRecordV2(reconciled, version));
        }
      }
    } else if (row.operation === 'delete') {
      const cloudId = parseDeletePayload(row).cloud_id;
      if (typeof cloudId === 'string' && cloudId) {
        playlists.set(cloudId, createCloudDeletedPlaylistRecordV2(cloudId, version, row.created_at * 1000));
      }
    } else if (row.local_id != null) {
      const entry = prepared?.playlistEntryByLocalId.get(row.local_id);
      if (entry) {
        const reconciled = preserveExistingPlaylistBlobKeys(
          entry,
          remotePlaylists.get(entry.cloud_id),
        );
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

async function findDeletedTrackHashesStillPresent(
  outbox: readonly MobileCloudOutboxRow[],
): Promise<Set<string>> {
  const hashes = new Set<string>();
  for (const row of outbox) {
    if (row.entity_type !== 'track' || row.operation !== 'delete') {
      continue;
    }
    const hash = parseDeletePayload(row).content_hash_sha256;
    if (typeof hash !== 'string' || !hash || hashes.has(hash)) {
      continue;
    }
    const stillExists = await getDb().getFirstAsync<{ present: number }>(
      `SELECT EXISTS(
         SELECT 1 FROM tracks WHERE content_hash_sha256 = ? LIMIT 1
       ) AS present`,
      [hash],
    );
    if (stillExists?.present) {
      hashes.add(hash);
    }
  }
  return hashes;
}

async function uploadPreparedObjects(
  client: MobileR2Client,
  prepared: PreparedLocalManifest | null,
  mutations: CloudLibraryManifestV2,
  attemptedKeys: Set<string>,
  result: CloudSyncResult,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  if (!prepared) {
    return;
  }
  const referencedKeys = liveManifestObjectKeys(mutations);
  const uploads = [...prepared.uploads.entries()].filter(
    ([key]) => referencedKeys.has(key) && !attemptedKeys.has(key),
  );
  emitProgress(onProgress, { phase: 'uploading', total: uploads.length });
  for (let index = 0; index < uploads.length; index += 1) {
    throwIfAborted(signal);
    const [key, upload] = uploads[index];
    const status = await client.uploadFile(
      key,
      upload.filePath,
      upload.contentType,
      upload.hash,
      { ifNoneMatch: '*', signal },
    );
    if (status === 'uploaded') {
      result.uploaded += 1;
    } else {
      result.skipped += 1;
    }
    attemptedKeys.add(key);
    emitProgress(onProgress, {
      phase: 'uploading',
      current: index + 1,
      total: uploads.length,
      uploaded: result.uploaded,
      skipped: result.skipped,
    });
  }
}

async function repairMissingPublishedObjects(
  client: MobileR2Client,
  prepared: PreparedLocalManifest | null,
  remote: CloudLibraryManifestV2,
  attemptedKeys: Set<string>,
  result: CloudSyncResult,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  if (!prepared || prepared.incremental) {
    return;
  }
  const localTracks = new Map(
    prepared.manifest.tracks
      .filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => [record.content_hash_sha256, record.entry]),
  );
  const localPlaylists = new Map(
    prepared.manifest.playlists
      .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => [record.cloud_id, record.entry]),
  );
  const targets = new Map<string, { filePath: string; contentType: string; hash: string }>();
  for (const record of remote.tracks) {
    if (record.deleted) {
      continue;
    }
    const local = localTracks.get(record.content_hash_sha256);
    if (!local) {
      continue;
    }
    const audio = prepared.uploads.get(local.object_key);
    if (audio) {
      targets.set(record.entry.object_key, audio);
    }
    if (
      local.artwork_hash_sha256
      && local.artwork_hash_sha256 === record.entry.artwork_hash_sha256
      && local.artwork_object_key
      && record.entry.artwork_object_key
    ) {
      const artwork = prepared.uploads.get(local.artwork_object_key);
      if (artwork) {
        targets.set(record.entry.artwork_object_key, artwork);
      }
    }
  }
  for (const record of remote.playlists) {
    if (record.deleted) {
      continue;
    }
    const local = localPlaylists.get(record.cloud_id);
    if (
      !local?.cover_hash_sha256
      || local.cover_hash_sha256 !== record.entry.cover_hash_sha256
      || !local.cover_object_key
      || !record.entry.cover_object_key
    ) {
      continue;
    }
    const cover = prepared.uploads.get(local.cover_object_key);
    if (cover) {
      targets.set(record.entry.cover_object_key, cover);
    }
  }

  const pending = [...targets.entries()].filter(([key]) => !attemptedKeys.has(key));
  emitProgress(onProgress, { phase: 'uploading', total: pending.length });
  for (let index = 0; index < pending.length; index += 1) {
    throwIfAborted(signal);
    const [key, upload] = pending[index];
    if (await client.headObject(key, signal)) {
      result.skipped += 1;
    } else {
      const status = await client.uploadFile(
        key,
        upload.filePath,
        upload.contentType,
        upload.hash,
        { ifNoneMatch: '*', signal },
      );
      if (status === 'uploaded') {
        result.uploaded += 1;
      } else {
        result.skipped += 1;
      }
    }
    attemptedKeys.add(key);
    emitProgress(onProgress, {
      phase: 'uploading',
      current: index + 1,
      total: pending.length,
      uploaded: result.uploaded,
      skipped: result.skipped,
    });
  }
}

function omitProtectedManifestEntities(
  manifest: CloudLibraryManifestV2,
  protectedEntities: MobileCloudProtectedEntities,
): CloudLibraryManifestV2 {
  return {
    ...manifest,
    tracks: manifest.tracks.filter(
      (record) => !protectedEntities.trackHashes.has(record.content_hash_sha256),
    ),
    playlists: manifest.playlists.filter(
      (record) => !protectedEntities.playlistCloudIds.has(record.cloud_id),
    ),
  };
}

interface ApplyProtection {
  scopeId: string;
  afterGeneration: number;
}

async function applyTombstones(
  manifest: CloudLibraryManifestV2,
  protection?: ApplyProtection,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const trackHashes = manifest.tracks
    .filter((record) => record.deleted)
    .map((record) => record.content_hash_sha256);
  const playlistIds = manifest.playlists
    .filter((record) => record.deleted)
    .map((record) => record.cloud_id);
  const pathsToDelete: string[] = [];

  throwIfAborted(signal);
  await withMobileCloudOutboxSuppressed(async (txn) => {
      throwIfAborted(signal);
      const protectedEntities = protection
        ? await getMobileCloudProtectedEntities(
          protection.scopeId,
          protection.afterGeneration,
          txn,
        )
        : null;
      throwIfAborted(signal);
      for (const hash of trackHashes) {
        throwIfAborted(signal);
        if (protectedEntities?.trackHashes.has(hash)) {
          continue;
        }
        const rows = await txn.getAllAsync<{ id: number; file_path: string }>(
          'SELECT id, file_path FROM tracks WHERE content_hash_sha256 = ?',
          [hash],
        );
        throwIfAborted(signal);
        for (const row of rows) {
          throwIfAborted(signal);
          if (row.file_path.startsWith(MUSIC_DIR)) {
            pathsToDelete.push(row.file_path);
          }
          await txn.runAsync('DELETE FROM tracks WHERE id = ?', [row.id]);
          throwIfAborted(signal);
        }
      }
      for (const cloudId of playlistIds) {
        throwIfAborted(signal);
        if (protectedEntities?.playlistCloudIds.has(cloudId)) {
          continue;
        }
        await txn.runAsync('DELETE FROM playlists WHERE cloud_id = ?', [cloudId]);
        throwIfAborted(signal);
      }
      throwIfAborted(signal);
  });
  throwIfAborted(signal);
  await Promise.all(pathsToDelete.map((path) => (
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)
  )));
  throwIfAborted(signal);
}

async function applyManifestWithoutAudio(
  manifest: CloudLibraryManifestV2,
  scopeId: string,
  afterGeneration: number,
  signal?: AbortSignal,
): Promise<{ pendingDownloads: number; pendingAssets: number }> {
  throwIfAborted(signal);
  const protection = { scopeId, afterGeneration };
  await applyTombstones(manifest, protection, signal);
  throwIfAborted(signal);
  const liveTracks = manifest.tracks
    .filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted);
  const livePlaylists = manifest.playlists
    .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted);
  const db = getDb();
  const existing = await db.getAllAsync<{
    id: number;
    content_hash_sha256: string;
    downloaded_at: number | null;
    cover_art_path: string | null;
  }>(
    `SELECT id, content_hash_sha256, downloaded_at, cover_art_path
     FROM tracks
     WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''`,
  );
  throwIfAborted(signal);
  const existingByHash = new Map(existing.map((row) => [row.content_hash_sha256, row]));
  const missingAudio = liveTracks.reduce(
    (count, record) => count + (existingByHash.has(record.content_hash_sha256) ? 0 : 1),
    0,
  );
  const previousRows = await db.getAllAsync<{
    entity_type: 'track' | 'playlist';
    entity_key: string;
    record_json: string;
  }>(
    `SELECT entity_type, entity_key, record_json
     FROM cloud_sync_entities WHERE scope_id = ?`,
    [scopeId],
  );
  throwIfAborted(signal);
  const previousByIdentity = new Map(
    previousRows.map((row) => [`${row.entity_type}:${row.entity_key}`, row.record_json]),
  );
  const missingAssetHashes = new Set<string>();
  for (const record of liveTracks) {
    const hash = record.entry.artwork_hash_sha256;
    const existingTrack = existingByHash.get(record.content_hash_sha256);
    if (!hash || !existingTrack) {
      continue;
    }
    let previousHash: string | null = null;
    try {
      const raw = previousByIdentity.get(`track:${record.content_hash_sha256}`);
      const previous = raw ? JSON.parse(raw) as CloudTrackRecordV2 : null;
      previousHash = previous && !previous.deleted
        ? previous.entry.artwork_hash_sha256
        : null;
    } catch {
      previousHash = null;
    }
    if (previousHash !== hash || !(await pathExists(existingTrack.cover_art_path))) {
      missingAssetHashes.add(hash);
    }
    throwIfAborted(signal);
  }
  const localPlaylistRows = await db.getAllAsync<{ cloud_id: string; cover_path: string | null }>(
    `SELECT cloud_id, cover_path FROM playlists
     WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
  );
  throwIfAborted(signal);
  const localPlaylistByCloudId = new Map(localPlaylistRows.map((row) => [row.cloud_id, row]));
  for (const record of livePlaylists) {
    const hash = record.entry.cover_hash_sha256;
    if (!hash) {
      continue;
    }
    let previousHash: string | null = null;
    try {
      const raw = previousByIdentity.get(`playlist:${record.cloud_id}`);
      const previous = raw ? JSON.parse(raw) as CloudPlaylistRecordV2 : null;
      previousHash = previous && !previous.deleted
        ? previous.entry.cover_hash_sha256
        : null;
    } catch {
      previousHash = null;
    }
    const local = localPlaylistByCloudId.get(record.cloud_id);
    if (previousHash !== hash || !(await pathExists(local?.cover_path))) {
      missingAssetHashes.add(hash);
    }
    throwIfAborted(signal);
  }

  throwIfAborted(signal);
  await withMobileCloudOutboxSuppressed(async (txn) => {
      throwIfAborted(signal);
      const protectedEntities = await getMobileCloudProtectedEntities(
        scopeId,
        afterGeneration,
        txn,
      );
      throwIfAborted(signal);
      for (const record of liveTracks) {
        throwIfAborted(signal);
        if (protectedEntities.trackHashes.has(record.content_hash_sha256)) {
          continue;
        }
        const row = existingByHash.get(record.content_hash_sha256);
        if (!row) {
          continue;
        }
        const entry = record.entry;
        const remoteDownloadedAt = normalizeDownloadedAt(entry.downloaded_at);
        const localDownloadedAt = normalizeDownloadedAt(row.downloaded_at);
        const downloadedAt = remoteDownloadedAt && localDownloadedAt
          ? Math.min(remoteDownloadedAt, localDownloadedAt)
          : remoteDownloadedAt ?? localDownloadedAt;
        await txn.runAsync(
          `UPDATE tracks
           SET title = ?, artist = ?, album = ?, album_artist = ?,
               track_number = ?, disc_number = ?, duration_ms = ?, genre = ?,
               year = ?, bitrate = ?, sample_rate = ?, file_size = ?, format = ?,
               loudness_lufs = ?,
               loudness_gain = ?, youtube_id = ?, spotify_id = ?, soundcloud_id = ?,
               source_url = ?, rating = ?, downloaded_at = ?,
               cover_art_path = CASE WHEN ? = 1 THEN NULL ELSE cover_art_path END,
               in_library = 1
           WHERE id = ?`,
          [
            entry.metadata.title, entry.metadata.artist, entry.metadata.album,
            entry.metadata.album_artist, entry.metadata.track_number,
            entry.metadata.disc_number, entry.metadata.duration_ms,
            entry.metadata.genre, entry.metadata.year, entry.metadata.bitrate,
            entry.metadata.sample_rate, entry.file_size, entry.format,
            entry.metadata.loudness_lufs,
            entry.metadata.loudness_gain, entry.youtube_id, entry.spotify_id,
            entry.soundcloud_id, entry.source_url, entry.metadata.rating,
            downloadedAt, entry.artwork_hash_sha256 == null ? 1 : 0, row.id,
          ],
        );
        throwIfAborted(signal);
      }

      for (const record of livePlaylists) {
        throwIfAborted(signal);
        if (protectedEntities.playlistCloudIds.has(record.cloud_id)) {
          continue;
        }
        const entry = record.entry;
        await txn.runAsync(
          `INSERT INTO playlists(
             cloud_id, name, description, is_smart, smart_rules, sort_order,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(cloud_id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             cover_path = CASE WHEN ? = 1 THEN NULL ELSE playlists.cover_path END,
             is_smart = excluded.is_smart,
             smart_rules = excluded.smart_rules,
             sort_order = excluded.sort_order,
             updated_at = excluded.updated_at`,
          [
            entry.cloud_id, entry.name, entry.description,
            entry.is_smart ? 1 : 0, entry.smart_rules, entry.sort_order,
            entry.created_at, entry.updated_at,
            entry.cover_hash_sha256 == null ? 1 : 0,
          ],
        );
        throwIfAborted(signal);
        if (!entry.track_hashes.every((hash) => existingByHash.has(hash))) {
          continue;
        }
        const playlist = await txn.getFirstAsync<{ id: number }>(
          'SELECT id FROM playlists WHERE cloud_id = ?',
          [entry.cloud_id],
        );
        throwIfAborted(signal);
        if (!playlist) {
          continue;
        }
        await txn.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlist.id]);
        throwIfAborted(signal);
        for (let position = 0; position < entry.track_hashes.length; position += 1) {
          throwIfAborted(signal);
          const trackId = existingByHash.get(entry.track_hashes[position])?.id;
          if (trackId == null) {
            continue;
          }
          await txn.runAsync(
            'INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES (?, ?, ?)',
            [playlist.id, trackId, position],
          );
          throwIfAborted(signal);
        }
      }
      throwIfAborted(signal);
  });
  throwIfAborted(signal);
  await Promise.all([
    reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
    loadPlaylists(),
  ]);
  throwIfAborted(signal);
  await reloadLoadedPlaylistDetails();
  throwIfAborted(signal);
  return {
    pendingDownloads: missingAudio,
    pendingAssets: missingAssetHashes.size,
  };
}

async function storeEntityMirror(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  afterGeneration: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const db = getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    throwIfAborted(signal);
    const protectedEntities = await getMobileCloudProtectedEntities(
      scopeId,
      afterGeneration,
      txn,
    );
    throwIfAborted(signal);
    for (const record of manifest.tracks) {
      throwIfAborted(signal);
      if (protectedEntities.trackHashes.has(record.content_hash_sha256)) {
        continue;
      }
      await txn.runAsync(
        `INSERT INTO cloud_sync_entities(
           scope_id, entity_type, entity_key, version_counter,
           version_device_id, record_json, deleted, updated_at
         ) VALUES (?, 'track', ?, ?, ?, ?, ?, strftime('%s','now'))
         ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
           version_counter = excluded.version_counter,
           version_device_id = excluded.version_device_id,
           record_json = excluded.record_json,
           deleted = excluded.deleted,
           updated_at = excluded.updated_at`,
        [
          scopeId,
          record.content_hash_sha256,
          record.version.counter,
          record.version.device_id,
          JSON.stringify(record),
          record.deleted ? 1 : 0,
        ],
      );
      throwIfAborted(signal);
    }
    for (const record of manifest.playlists) {
      throwIfAborted(signal);
      if (protectedEntities.playlistCloudIds.has(record.cloud_id)) {
        continue;
      }
      await txn.runAsync(
        `INSERT INTO cloud_sync_entities(
           scope_id, entity_type, entity_key, version_counter,
           version_device_id, record_json, deleted, updated_at
         ) VALUES (?, 'playlist', ?, ?, ?, ?, ?, strftime('%s','now'))
         ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
           version_counter = excluded.version_counter,
           version_device_id = excluded.version_device_id,
           record_json = excluded.record_json,
           deleted = excluded.deleted,
           updated_at = excluded.updated_at`,
        [
          scopeId,
          record.cloud_id,
          record.version.counter,
          record.version.device_id,
          JSON.stringify(record),
          record.deleted ? 1 : 0,
        ],
      );
      throwIfAborted(signal);
    }
    throwIfAborted(signal);
  });
  throwIfAborted(signal);
}

function liveManifestObjectKeys(manifest: CloudLibraryManifestV2): Set<string> {
  const keys = new Set<string>();
  for (const record of manifest.tracks) {
    if (record.deleted) {
      continue;
    }
    keys.add(record.entry.object_key);
    if (record.entry.artwork_object_key) {
      keys.add(record.entry.artwork_object_key);
    }
  }
  for (const record of manifest.playlists) {
    if (!record.deleted && record.entry.cover_object_key) {
      keys.add(record.entry.cover_object_key);
    }
  }
  return keys;
}

async function queueBlobGcTransitions(
  scopeId: string,
  previousRemote: CloudLibraryManifestV2 | null,
  published: CloudLibraryManifestV2,
): Promise<void> {
  const previousTrackByHash = new Map(
    previousRemote?.tracks.map((record) => [record.content_hash_sha256, record]) ?? [],
  );
  const previousPlaylistById = new Map(
    previousRemote?.playlists.map((record) => [record.cloud_id, record]) ?? [],
  );
  const mirrorRows = await getDb().getAllAsync<{
    entity_type: 'track' | 'playlist';
    entity_key: string;
    record_json: string;
  }>(
    `SELECT entity_type, entity_key, record_json
     FROM cloud_sync_entities WHERE scope_id = ?`,
    [scopeId],
  );
  const mirrorByIdentity = new Map(
    mirrorRows.map((row) => [`${row.entity_type}:${row.entity_key}`, row.record_json]),
  );
  const candidateKeys = new Set<string>();
  const readMirror = <T extends CloudTrackRecordV2 | CloudPlaylistRecordV2>(
    identity: string,
  ): T | null => {
    const raw = mirrorByIdentity.get(identity);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  for (const record of published.tracks) {
    const candidates = [
      previousTrackByHash.get(record.content_hash_sha256),
      readMirror<CloudTrackRecordV2>(`track:${record.content_hash_sha256}`),
    ];
    for (const previous of candidates) {
      if (!previous || previous.deleted) {
        continue;
      }
      if (record.deleted || previous.entry.object_key !== record.entry.object_key) {
        candidateKeys.add(previous.entry.object_key);
      }
      if (
        previous.entry.artwork_object_key
        && (record.deleted
          || previous.entry.artwork_object_key !== record.entry.artwork_object_key)
      ) {
        candidateKeys.add(previous.entry.artwork_object_key);
      }
    }
  }
  for (const record of published.playlists) {
    const candidates = [
      previousPlaylistById.get(record.cloud_id),
      readMirror<CloudPlaylistRecordV2>(`playlist:${record.cloud_id}`),
    ];
    for (const previous of candidates) {
      if (
        previous
        && !previous.deleted
        && previous.entry.cover_object_key
        && (record.deleted
          || previous.entry.cover_object_key !== record.entry.cover_object_key)
      ) {
        candidateKeys.add(previous.entry.cover_object_key);
      }
    }
  }

  const liveKeys = liveManifestObjectKeys(published);
  const eligibleAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const db = getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const key of liveKeys) {
      await txn.runAsync(
        'DELETE FROM cloud_sync_blob_gc WHERE scope_id = ? AND object_key = ?',
        [scopeId, key],
      );
    }
    for (const key of candidateKeys) {
      if (liveKeys.has(key)) {
        continue;
      }
      await txn.runAsync(
        `INSERT INTO cloud_sync_blob_gc(scope_id, object_key, eligible_at)
         VALUES (?, ?, ?)
         ON CONFLICT(scope_id, object_key) DO UPDATE SET
           eligible_at = MIN(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)`,
        [scopeId, key, eligibleAt],
      );
    }
  });
}

async function runDailyCloudMaintenance(
  client: MobileR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  lastCleanupAt: number | null,
  signal?: AbortSignal,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (lastCleanupAt != null && nowSeconds - lastCleanupAt < 24 * 60 * 60) {
    return;
  }
  const root = normalizeCloudPrefix(config.prefix);
  const commitKeys = await client.listObjectKeys(`${root}/system/v2/commits/`, signal);
  const staleCommits = [...commitKeys].sort().slice(0, Math.max(0, commitKeys.length - 20));
  await Promise.all(staleCommits.map((key) => client.deleteObject(key, signal)));
  // Blob candidates remain durably queued, but are not physically deleted.
  // A manifest ETag check cannot prevent a re-add CAS from landing between the
  // check and DELETE. Until the protocol has a shared GC claim/lock, keeping an
  // orphan is the only race-free choice; commit snapshots are safe to prune.
  await updateMobileCloudPersistedState(scopeId, { last_cleanup_at: nowSeconds });
}

export async function runMobileCloudV2Sync(
  options: MobileCloudV2SyncOptions,
): Promise<CloudSyncResult> {
  return scheduleMobileJob({
    kind: 'cloud-sync',
    lane: 'network',
    priority: options.origin === 'manual' ? 'user-visible' : 'background',
    run: async () => {
      const { config, mode, signal } = options;
      const result = { ...EMPTY_RESULT };
      const scopeId = await ensureMobileCloudScope(config);
      const state = await getMobileCloudPersistedState(scopeId);
      const outbox = mode === 'fetch' ? [] : await getMobileCloudOutbox(scopeId);
      const maxAcknowledgedGeneration = outbox.reduce(
        (max, row) => Math.max(max, row.generation),
        0,
      );
      const deviceId = await getMobileCloudDeviceId();
      const client = new MobileR2Client(config);
      const manualRecovery = options.origin === 'manual' && mode !== 'fetch';
      const needsLocal = mode !== 'fetch'
        && (manualRecovery || outbox.length > 0 || state.needs_full_reconcile === 1);
      const prepared = needsLocal
        ? state.needs_full_reconcile === 1 || manualRecovery
          ? await prepareLocalManifest(config, deviceId, options.onProgress, signal)
          : await prepareIncrementalManifest(config, deviceId, outbox, signal)
        : null;

      let published: CloudLibraryManifestV2 | null = null;
      let publishedEtag: string | null = null;
      let previousRemoteForGc: CloudLibraryManifestV2 | null = null;
      const attemptedUploadKeys = new Set<string>();
      let bootstrapLiveMerge = false;
      let activationEnsured = state.activation_marker_confirmed === 1;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        throwIfAborted(signal);
        emitProgress(options.onProgress, { phase: 'reading-manifest', current: attempt, total: 5 });
        const remoteRead = await client.getJsonConditional<CloudLibraryManifestV2>(
          buildCloudV2ManifestObjectKey(config.prefix),
          undefined,
          signal,
        );
        let remote = remoteRead.status === 'ok'
          ? parseCloudLibraryManifestV2(remoteRead.value)
          : null;
        let remoteSource: 'v2' | 'v1' | 'empty' = remote ? 'v2' : 'empty';
        const currentEtag = remoteRead.status === 'ok' ? remoteRead.etag : null;
        if (remoteRead.status === 'ok' && !remote) {
          throw new Error('cloud_sync_invalid_v2_manifest');
        }
        if (remoteRead.status === 'ok' && remote && !activationEnsured) {
          await ensureV2ActivationMarker(client, config, deviceId, signal);
          await updateMobileCloudPersistedState(scopeId, {
            activation_marker_confirmed: 1,
          });
          activationEnsured = true;
        }
        if (!remote) {
          const [mirror, activation] = await Promise.all([
            getDb().getFirstAsync<{ present: number }>(
              `SELECT EXISTS(
                 SELECT 1 FROM cloud_sync_entities WHERE scope_id = ? LIMIT 1
               ) AS present`,
              [scopeId],
            ),
            client.getJsonConditional<Record<string, unknown>>(
              buildCloudV2ActivationObjectKey(config.prefix),
              undefined,
              signal,
            ),
          ]);
          if (state.etag || state.revision || mirror?.present || activation.status === 'ok') {
            // Once V2 has ever existed, an absent current manifest is data loss,
            // not permission to resurrect a stale V1 snapshot. Immutable commit
            // snapshots are accepted history, but they do not prove which head
            // is current; the post-CAS activation marker is permanent.
            throw new Error('cloud_sync_v2_manifest_missing');
          }
          const legacy = await readBootstrapManifestV1(client, config, signal);
          remoteSource = legacy ? 'v1' : 'empty';
          remote = legacy
            ? convertCloudLibraryManifestV1ToV2(legacy)
            : createEmptyCloudLibraryManifestV2(deviceId);
        }
        if (remoteRead.status === 'missing' && remoteSource !== 'v2') {
          bootstrapLiveMerge = true;
        }
        previousRemoteForGc = remote;

        const trackHashesStillPresent = await findDeletedTrackHashesStillPresent(outbox);
        const versionedLocal = buildLocalMutationManifest(
          remote,
          prepared,
          outbox,
          deviceId,
          Math.max(state.lamport_counter, remote.max_counter),
          bootstrapLiveMerge && prepared?.incremental === false,
          trackHashesStillPresent,
        );
        await uploadPreparedObjects(
          client,
          prepared,
          versionedLocal,
          attemptedUploadKeys,
          result,
          options.onProgress,
          signal,
        );
        if (manualRecovery) {
          await repairMissingPublishedObjects(
            client,
            prepared,
            remote,
            attemptedUploadKeys,
            result,
            options.onProgress,
            signal,
          );
        }
        const shouldPublish = remoteRead.status === 'missing' || needsLocal;
        if (!shouldPublish) {
          published = remote;
          publishedEtag = currentEtag;
          break;
        }

        const now = Date.now();
        const revision = buildCloudRevision(deviceId, now);
        const merged = mergeCloudLibraryManifestsV2(remote, versionedLocal, {
          writerDeviceId: deviceId,
          revision,
          updatedAt: now,
        });
        emitProgress(options.onProgress, { phase: 'writing-manifest', current: attempt, total: 5 });
        if (remoteRead.status !== 'missing' && !currentEtag) {
          throw new Error('cloud_sync_missing_etag');
        }
        try {
          const write = await client.putJsonConditional(
            buildCloudV2ManifestObjectKey(config.prefix),
            merged,
            remoteRead.status === 'missing'
              ? { ifNoneMatch: '*', signal }
              : { ifMatch: currentEtag as string, signal },
          );
          published = merged;
          publishedEtag = write.etag;
          if (!activationEnsured) {
            await ensureV2ActivationMarker(client, config, deviceId, signal);
            await updateMobileCloudPersistedState(scopeId, {
              activation_marker_confirmed: 1,
            });
            activationEnsured = true;
          }
          await client.putJson(
            buildCloudV2CommitObjectKey(config.prefix, revision),
            merged,
            signal,
          );
          if (!publishedEtag) {
            const verify = await client.getJsonConditional<CloudLibraryManifestV2>(
              buildCloudV2ManifestObjectKey(config.prefix),
              undefined,
              signal,
            );
            if (verify.status !== 'ok' || !verify.etag) {
              throw new Error('cloud_sync_missing_etag');
            }
            published = parseCloudLibraryManifestV2(verify.value);
            if (!published) {
              throw new Error('cloud_sync_invalid_v2_manifest');
            }
            publishedEtag = verify.etag;
          }
          break;
        } catch (error) {
          if (!(error instanceof MobileR2PreconditionFailedError) || attempt === 4) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 220));
        }
      }
      if (!published) {
        throw new Error('cloud_sync_conflict_retry_exhausted');
      }

      if (!activationEnsured) {
        await ensureV2ActivationMarker(client, config, deviceId, signal);
        await updateMobileCloudPersistedState(scopeId, {
          activation_marker_confirmed: 1,
        });
      }

      await queueBlobGcTransitions(scopeId, previousRemoteForGc, published);

      try {
        await runDailyCloudMaintenance(
          client,
          config,
          scopeId,
          state.last_cleanup_at,
          signal,
        );
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        // Retention is best-effort and must not block a successful manifest
        // sync when listing/deleting old objects temporarily fails. Record the
        // attempt so a broken LIST endpoint cannot create a 10-second hot loop.
        await updateMobileCloudPersistedState(scopeId, {
          last_cleanup_at: Math.floor(Date.now() / 1000),
        }).catch(() => {});
      }

      let pendingDownloads = 0;
      let pendingAssets = 0;
      if (mode !== 'upload') {
        throwIfAborted(signal);
        const protectedEntities = await getMobileCloudProtectedEntities(
          scopeId,
          maxAcknowledgedGeneration,
        );
        throwIfAborted(signal);
        const applicableManifest = omitProtectedManifestEntities(published, protectedEntities);
        const applyProtection = {
          scopeId,
          afterGeneration: maxAcknowledgedGeneration,
        };
        if (options.allowAudioDownloads) {
          throwIfAborted(signal);
          await applyTombstones(applicableManifest, applyProtection, signal);
          throwIfAborted(signal);
          const fetched = await fetchCloudLibrary(
            options.onProgress,
            () => Boolean(signal?.aborted),
            projectManifestV2ToV1(applicableManifest),
            signal,
            applyProtection,
            options.origin === 'manual' ? 'user-visible' : 'background',
            true,
          );
          throwIfAborted(signal);
          result.downloaded += fetched.downloaded;
          result.skipped += fetched.skipped;
          result.failed += fetched.failed;
          result.importedTracks += fetched.importedTracks;
          result.importedPlaylists += fetched.importedPlaylists;
          await Promise.all([
            reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
            loadPlaylists(),
          ]);
          throwIfAborted(signal);
          await reloadLoadedPlaylistDetails();
          throwIfAborted(signal);
        } else {
          throwIfAborted(signal);
          const pending = await applyManifestWithoutAudio(
            applicableManifest,
            scopeId,
            maxAcknowledgedGeneration,
            signal,
          );
          throwIfAborted(signal);
          pendingDownloads = pending.pendingDownloads;
          pendingAssets = pending.pendingAssets;
        }
      }

      throwIfAborted(signal);
      if (mode !== 'upload') {
        await storeEntityMirror(scopeId, published, maxAcknowledgedGeneration, signal);
      }
      throwIfAborted(signal);
      if (maxAcknowledgedGeneration > 0) {
        await acknowledgeMobileCloudOutbox(scopeId, maxAcknowledgedGeneration);
      }
      throwIfAborted(signal);
      const successAt = Math.floor(Date.now() / 1000);
      throwIfAborted(signal);
      await updateMobileCloudPersistedState(scopeId, {
        revision: published.revision,
        etag: mode === 'upload' ? null : publishedEtag,
        lamport_counter: published.max_counter,
        last_success_at: successAt,
        last_error: null,
        next_retry_at: null,
        // Upload-only intentionally does not apply remote mutations locally.
        // Keep reconciliation pending so a later auto/fetch cannot mistake a
        // 304 for an already-applied manifest.
        needs_full_reconcile: mode === 'upload'
          || (mode === 'fetch' && state.needs_full_reconcile === 1)
          ? 1
          : 0,
        pending_downloads: mode === 'upload' ? state.pending_downloads : pendingDownloads,
        pending_assets: mode === 'upload' ? state.pending_assets : pendingAssets,
      });
      throwIfAborted(signal);
      result.revision = published.revision;
      emitProgress(options.onProgress, {
        phase: 'done',
        current: 1,
        total: 1,
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        skipped: result.skipped,
        failed: result.failed,
      });
      return result;
    },
  });
}
