import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type {
  CloudLibraryManifestV1,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudStoragePublicConfig,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  AudioFormat,
  Track,
} from '@ton/core';
import {
  buildCloudCommitObjectKey,
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudManifestObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudPlaylistFolderName,
  buildCloudRevision,
  buildLegacyCloudManifestObjectKey,
  mergeCloudLibraryManifests,
  normalizeCloudPrefix,
  sanitizeFilename,
} from '@ton/core';
import { getDb } from '../database';
import {
  getAllPlaylists,
  getAllTracksForTransfer,
  getPlaylistTracks,
  insertTrack,
  updateTrack,
} from '../db-queries';
import { ensureMusicDir, MUSIC_DIR } from '../downloader/filesystem';
import { ensureArtworkDir } from '../cover-art';
import { ensureUniqueLocalFilePathAsync } from '../library-transfer/file-helpers';
import { audioFormatFromExtension } from '../library-transfer/media';
import { scheduleMobileJob } from '../job-scheduler';
import { normalizeDownloadedAudioForPlayback } from '../audio-normalization';
import { MobileR2Client } from './r2-client';
import { hashFileSha256 } from './hash';
import { contentTypeForExtension, getFileExtension, getFileName } from './media';
import {
  getMobileCloudConfig,
  getMobileCloudDeviceId,
  getMobileCloudLastRevision,
  getMobileCloudPublicConfig,
  saveMobileCloudConfig,
  setMobileCloudLastRevision,
} from './config';

type ProgressCallback = (progress: CloudSyncProgress) => void;
type CancelSignal = () => boolean;

type LocalCloudTrack = {
  track: Track;
  contentHash: string;
  audioObjectKey: string;
  artworkHash: string | null;
  artworkObjectKey: string | null;
  artworkPath: string | null;
};

type LocalCloudArtwork = {
  key: string;
  filePath: string;
  hash: string;
  contentType: string;
};

type ManagedPlaylistKeys = Map<string, Set<string>>;

const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;

const EMPTY_RESULT: CloudSyncResult = {
  uploaded: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  importedTracks: 0,
  importedPlaylists: 0,
  revision: null,
};

let activeCancelRequested = false;

function emitProgress(onProgress: ProgressCallback | undefined, patch: Partial<CloudSyncProgress>): void {
  onProgress?.({
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

function throwIfCancelled(shouldCancel?: CancelSignal): void {
  if (shouldCancel?.()) {
    throw new Error('cloud_sync_cancelled');
  }
}

async function requireConfig(): Promise<CloudStorageConfig> {
  const config = await getMobileCloudConfig();
  if (!config) {
    throw new Error('Cloudflare R2 is not configured');
  }
  return config;
}

async function fileExists(fileUri: string | null | undefined): Promise<boolean> {
  if (!fileUri) {
    return false;
  }
  const info = await FileSystem.getInfoAsync(fileUri);
  return info.exists;
}

function buildImportedFileName(track: CloudTrackEntry): string {
  const ext = getFileExtension(track.file_name, track.format);
  const title = track.metadata.title || 'Unknown Track';
  const artist = track.metadata.artist || 'Unknown Artist';
  return `${sanitizeFilename(`${artist} - ${title}`) || 'Track'}_${track.content_hash_sha256.slice(0, 8)}${ext}`;
}

function parseManifest(value: CloudLibraryManifestV1 | null): CloudLibraryManifestV1 | null {
  if (!value || value.schema_version !== 1 || value.app !== 'TON') {
    return null;
  }
  return value;
}

async function normalizeCloudAudioForPlayback(
  filePath: string,
  format: AudioFormat | null,
): Promise<{ filePath: string; format: AudioFormat | null }> {
  if (format !== 'm4a') {
    if (Platform.OS === 'ios') {
      await FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
      throw new Error(`cloud_audio_incompatible:${format ?? 'unknown'}`);
    }
    return { filePath, format };
  }

  const normalized = await normalizeDownloadedAudioForPlayback({
    filePath,
    format: 'm4a',
  }, {
    qualityProfile: 'best_compatible',
  });
  return {
    filePath: normalized.filePath,
    format: normalized.format,
  };
}

async function ensureTrackContentHash(track: Track): Promise<string | null> {
  if (!(await fileExists(track.file_path))) {
    return null;
  }
  if (track.content_hash_sha256) {
    return track.content_hash_sha256;
  }
  const contentHash = await hashFileSha256(track.file_path);
  await updateTrack(track.id, { content_hash_sha256: contentHash });
  return contentHash;
}

async function ensurePlaylistCloudId(id: number, existing: string | null): Promise<string> {
  if (existing) {
    return existing;
  }
  const cloudId = `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const db = getDb();
  await db.runAsync('UPDATE playlists SET cloud_id = ? WHERE id = ?', [cloudId, id]);
  return cloudId;
}

async function buildLocalManifest(
  config: CloudStorageConfig,
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<{ manifest: CloudLibraryManifestV1; localTracks: LocalCloudTrack[]; localArtworks: LocalCloudArtwork[] }> {
  const allTracks = await getAllTracksForTransfer();
  const playlists = await getAllPlaylists();
  const selectedTrackIds = new Set<number>();
  for (const track of allTracks) {
    if (track.in_library === 1) {
      selectedTrackIds.add(track.id);
    }
  }
  const playlistTrackIdsByPlaylistId = new Map<number, number[]>();
  for (const playlist of playlists) {
    const playlistTracks = await getPlaylistTracks(playlist.id);
    playlistTrackIdsByPlaylistId.set(playlist.id, playlistTracks.map((track) => track.id));
    for (const track of playlistTracks) {
      selectedTrackIds.add(track.id);
    }
  }
  const tracks = allTracks.filter((track) => selectedTrackIds.has(track.id));
  const deviceId = await getMobileCloudDeviceId();
  const now = Date.now();
  const revision = buildCloudRevision(deviceId, now);
  const localTracks: LocalCloudTrack[] = [];
  const localArtworks: LocalCloudArtwork[] = [];
  const trackEntries: CloudTrackEntry[] = [];

  emitProgress(onProgress, { phase: 'hashing', total: tracks.length });
  for (let index = 0; index < tracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const track = tracks[index];
    const contentHash = await ensureTrackContentHash(track);
    if (!contentHash) {
      emitProgress(onProgress, { phase: 'hashing', current: index + 1, total: tracks.length, failed: 1 });
      continue;
    }
    const ext = getFileExtension(track.file_path, track.format);
    const trackObjectName = {
      title: track.title,
      artist: track.artist,
      fileName: getFileName(track.file_path),
    };
    const audioObjectKey = buildCloudLibraryAudioObjectKey(config.prefix, contentHash, ext, trackObjectName);
    let artworkHash: string | null = null;
    let artworkObjectKey: string | null = null;
    let artworkFileName: string | null = null;
    if (track.cover_art_path && await fileExists(track.cover_art_path)) {
      artworkHash = await hashFileSha256(track.cover_art_path);
      const artworkExt = getFileExtension(track.cover_art_path, null);
      artworkObjectKey = buildCloudLibraryArtworkObjectKey(config.prefix, artworkHash, artworkExt, trackObjectName);
      artworkFileName = getFileName(track.cover_art_path);
      localArtworks.push({
        key: artworkObjectKey,
        filePath: track.cover_art_path,
        hash: artworkHash,
        contentType: contentTypeForExtension(artworkExt),
      });
    }
    localTracks.push({
      track,
      contentHash,
      audioObjectKey,
      artworkHash,
      artworkObjectKey,
      artworkPath: track.cover_art_path,
    });
    trackEntries.push({
      content_hash_sha256: contentHash,
      object_key: audioObjectKey,
      file_name: getFileName(track.file_path),
      file_size: track.file_size,
      format: track.format,
      artwork_hash_sha256: artworkHash,
      artwork_object_key: artworkObjectKey,
      artwork_file_name: artworkFileName,
      youtube_id: track.youtube_id,
      spotify_id: track.spotify_id,
      soundcloud_id: track.soundcloud_id,
      source_url: track.source_url,
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
    });
    emitProgress(onProgress, { phase: 'hashing', current: index + 1, total: tracks.length });
  }

  const contentHashByTrackId = new Map(localTracks.map((entry) => [entry.track.id, entry.contentHash]));
  const playlistEntries: CloudPlaylistEntry[] = [];
  for (const playlist of playlists) {
    throwIfCancelled(shouldCancel);
    const cloudId = await ensurePlaylistCloudId(playlist.id, playlist.cloud_id);
    const trackHashes = (playlistTrackIdsByPlaylistId.get(playlist.id) ?? [])
      .map((trackId) => contentHashByTrackId.get(trackId) ?? null)
      .filter((hash): hash is string => Boolean(hash));
    let coverHash: string | null = null;
    let coverObjectKey: string | null = null;
    if (playlist.cover_path && await fileExists(playlist.cover_path)) {
      coverHash = await hashFileSha256(playlist.cover_path);
      const coverExt = getFileExtension(playlist.cover_path, null);
      coverObjectKey = buildCloudPlaylistCoverObjectKey(
        config.prefix,
        { name: playlist.name, cloudId },
        coverHash,
        coverExt,
      );
      localArtworks.push({
        key: coverObjectKey,
        filePath: playlist.cover_path,
        hash: coverHash,
        contentType: contentTypeForExtension(coverExt),
      });
    }
    playlistEntries.push({
      cloud_id: cloudId,
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
    manifest: {
      schema_version: 1,
      app: 'TON',
      created_at: now,
      updated_at: now,
      device_id: deviceId,
      revision,
      library_track_hashes: [...new Set(localTracks.map((entry) => entry.contentHash))],
      tracks: trackEntries,
      playlists: playlistEntries,
    },
    localTracks,
    localArtworks,
  };
}

async function readRemoteManifest(client: MobileR2Client, config: CloudStorageConfig): Promise<CloudLibraryManifestV1 | null> {
  const current = parseManifest(await client.getJson<CloudLibraryManifestV1>(buildCloudManifestObjectKey(config.prefix)));
  if (current) {
    return current;
  }
  return parseManifest(await client.getJson<CloudLibraryManifestV1>(buildLegacyCloudManifestObjectKey(config.prefix)));
}

async function writeRemoteManifest(
  client: MobileR2Client,
  config: CloudStorageConfig,
  manifest: CloudLibraryManifestV1,
): Promise<void> {
  await client.putJson(buildCloudCommitObjectKey(config.prefix, manifest.revision), manifest);
  await client.putJson(buildCloudManifestObjectKey(config.prefix), manifest);
  await setMobileCloudLastRevision(manifest.revision);
}

async function cleanupLegacyCloudLayout(
  client: MobileR2Client,
  config: CloudStorageConfig,
  manifest: CloudLibraryManifestV1,
): Promise<void> {
  for (const track of manifest.tracks) {
    if (
      track.object_key.includes('/v1/')
      || (track.artwork_object_key?.includes('/v1/') ?? false)
    ) {
      return;
    }
  }
  for (const playlist of manifest.playlists) {
    if (playlist.cover_object_key?.includes('/v1/')) {
      return;
    }
  }

  const legacyPrefix = `${normalizeCloudPrefix(config.prefix)}/v1/`;
  const keys = await client.listObjectKeys(legacyPrefix);
  await Promise.all(keys.map((key) => client.deleteObject(key).catch(() => undefined)));
}

function addManagedPlaylistKey(plan: ManagedPlaylistKeys, prefix: string, key: string | null | undefined): void {
  if (!key) {
    return;
  }
  const keys = plan.get(prefix) ?? new Set<string>();
  keys.add(key);
  plan.set(prefix, keys);
}

async function cleanupReadablePlaylistObjects(
  client: MobileR2Client,
  plan: ManagedPlaylistKeys,
): Promise<void> {
  for (const [prefix, expectedKeys] of plan) {
    const existingKeys = await client.listObjectKeys(prefix);
    await Promise.all(existingKeys
      .filter((key) => !expectedKeys.has(key))
      .map((key) => client.deleteObject(key).catch(() => undefined)));
  }
}

export async function getMobileCloudSyncConfig(): Promise<CloudStoragePublicConfig | null> {
  return getMobileCloudPublicConfig();
}

export async function saveMobileCloudSyncConfig(config: CloudStorageConfig): Promise<CloudStoragePublicConfig> {
  return saveMobileCloudConfig(config);
}

export async function testMobileCloudConnection(config?: CloudStorageConfig): Promise<void> {
  const resolvedConfig = config ?? await requireConfig();
  await new MobileR2Client(resolvedConfig).testConnection();
}

export async function uploadMissingLocalToCloud(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  return scheduleMobileJob({
    kind: 'cloud-sync',
    lane: 'network',
    priority: 'user-visible',
    run: async () => {
      const config = await requireConfig();
      const client = new MobileR2Client(config);
      const result: CloudSyncResult = { ...EMPTY_RESULT };
      const { manifest: localManifest, localTracks, localArtworks } = await buildLocalManifest(config, onProgress, shouldCancel);
      const remoteManifest = await readRemoteManifest(client, config);
      const uploadTargetsByKey = new Map<string, { key: string; filePath: string; contentType: string; hash: string }>();
      const addUploadTarget = (target: { key: string; filePath: string; contentType: string; hash: string }): void => {
        if (!uploadTargetsByKey.has(target.key)) {
          uploadTargetsByKey.set(target.key, target);
        }
      };
      const managedPlaylistKeys: ManagedPlaylistKeys = new Map();
      const cloudRoot = normalizeCloudPrefix(config.prefix);
      for (const entry of localTracks) {
        addUploadTarget({
          key: entry.audioObjectKey,
          filePath: entry.track.file_path,
          contentType: contentTypeForExtension(getFileExtension(entry.track.file_path, entry.track.format)),
          hash: entry.contentHash,
        });
      }
      for (const playlist of localManifest.playlists) {
        const playlistFolder = buildCloudPlaylistFolderName({ name: playlist.name, cloudId: playlist.cloud_id });
        const playlistTracksPrefix = `${cloudRoot}/playlists/${playlistFolder}/tracks/`;
        const playlistArtworkPrefix = `${cloudRoot}/playlists/${playlistFolder}/artwork/`;
        managedPlaylistKeys.set(playlistTracksPrefix, new Set());
        addManagedPlaylistKey(managedPlaylistKeys, playlistArtworkPrefix, playlist.cover_object_key);
      }
      for (const artwork of localArtworks) {
        addUploadTarget(artwork);
      }
      const uploadTargets = [...uploadTargetsByKey.values()];

      emitProgress(onProgress, { phase: 'uploading', total: uploadTargets.length });
      for (let index = 0; index < uploadTargets.length; index += 1) {
        throwIfCancelled(shouldCancel);
        const target = uploadTargets[index];
        if (await client.headObject(target.key)) {
          result.skipped += 1;
        } else {
          await client.uploadFile(target.key, target.filePath, target.contentType, target.hash);
          result.uploaded += 1;
        }
        emitProgress(onProgress, {
          phase: 'uploading',
          current: index + 1,
          total: uploadTargets.length,
          uploaded: result.uploaded,
          skipped: result.skipped,
        });
      }

      const merged = mergeCloudLibraryManifests(remoteManifest, localManifest);
      merged.revision = localManifest.revision;
      merged.updated_at = Date.now();
      emitProgress(onProgress, { phase: 'writing-manifest', current: 0, total: 1, uploaded: result.uploaded, skipped: result.skipped });
      throwIfCancelled(shouldCancel);
      await writeRemoteManifest(client, config, merged);
      await cleanupLegacyCloudLayout(client, config, merged);
      await cleanupReadablePlaylistObjects(client, managedPlaylistKeys);
      result.revision = merged.revision;
      emitProgress(onProgress, { phase: 'done', current: 1, total: 1, uploaded: result.uploaded, skipped: result.skipped });
      return result;
    },
  });
}

export async function fetchCloudLibrary(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  return scheduleMobileJob({
    kind: 'cloud-sync',
    lane: 'network',
    priority: 'user-visible',
    run: async () => {
      const config = await requireConfig();
      const client = new MobileR2Client(config);
      const manifest = await readRemoteManifest(client, config);
      if (!manifest) {
        return { ...EMPTY_RESULT };
      }
      const db = getDb();
      const result: CloudSyncResult = { ...EMPTY_RESULT, revision: manifest.revision };
      const existingRows = await db.getAllAsync<{ id: number; content_hash_sha256: string }>(
        `SELECT id, content_hash_sha256
         FROM tracks
         WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
         ORDER BY id ASC`,
      );
      const trackIdByHash = new Map(existingRows.map((row) => [row.content_hash_sha256, row.id]));
      await ensureMusicDir();
      await ensureArtworkDir();

      emitProgress(onProgress, { phase: 'downloading', total: manifest.tracks.length });
      for (let index = 0; index < manifest.tracks.length; index += 1) {
        throwIfCancelled(shouldCancel);
        const track = manifest.tracks[index];
        if (trackIdByHash.has(track.content_hash_sha256)) {
          result.skipped += 1;
          emitProgress(onProgress, {
            phase: 'downloading',
            current: index + 1,
            total: manifest.tracks.length,
            downloaded: result.downloaded,
            skipped: result.skipped,
          });
          continue;
        }
        const destinationUri = await ensureUniqueLocalFilePathAsync(
          MUSIC_DIR,
          buildImportedFileName(track),
          track.content_hash_sha256,
        );
        await client.downloadFile(track.object_key, destinationUri);
        const requestedFormat = track.format ?? audioFormatFromExtension(getFileExtension(destinationUri, null));
        const normalizedAudio = await normalizeCloudAudioForPlayback(destinationUri, requestedFormat);
        let coverPath: string | null = null;
        if (track.artwork_object_key && track.artwork_hash_sha256) {
          coverPath = await ensureUniqueLocalFilePathAsync(
            ARTWORK_DIR,
            track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`,
            track.artwork_hash_sha256,
          );
          if (!(await fileExists(coverPath))) {
            await client.downloadFile(track.artwork_object_key, coverPath);
          }
        }
        const info = await FileSystem.getInfoAsync(normalizedAudio.filePath, { size: true });
        const trackId = await insertTrack({
          file_path: normalizedAudio.filePath,
          file_hash: null,
          content_hash_sha256: track.content_hash_sha256,
          file_size: info.exists && typeof info.size === 'number' ? info.size : track.file_size,
          file_mtime: null,
          title: track.metadata.title,
          artist: track.metadata.artist,
          album: track.metadata.album,
          album_artist: track.metadata.album_artist,
          track_number: track.metadata.track_number,
          disc_number: track.metadata.disc_number,
          duration_ms: track.metadata.duration_ms,
          genre: track.metadata.genre,
          year: track.metadata.year,
          bitrate: track.metadata.bitrate,
          sample_rate: track.metadata.sample_rate,
          format: normalizedAudio.format ?? requestedFormat,
          cover_art_path: coverPath,
          loudness_lufs: track.metadata.loudness_lufs,
          loudness_gain: track.metadata.loudness_gain,
          youtube_id: track.youtube_id,
          spotify_id: track.spotify_id,
          soundcloud_id: track.soundcloud_id,
          source_url: track.source_url,
          last_played_at: null,
          rating: track.metadata.rating,
          in_library: 1,
        });
        trackIdByHash.set(track.content_hash_sha256, trackId);
        result.downloaded += 1;
        result.importedTracks += 1;
        emitProgress(onProgress, {
          phase: 'downloading',
          current: index + 1,
          total: manifest.tracks.length,
          downloaded: result.downloaded,
          skipped: result.skipped,
        });
      }

      emitProgress(onProgress, { phase: 'importing', total: manifest.playlists.length, downloaded: result.downloaded, skipped: result.skipped });
      const playlistCoverPathByCloudId = new Map<string, string | null>();
      for (const playlist of manifest.playlists) {
        throwIfCancelled(shouldCancel);
        let playlistCoverPath: string | null = null;
        if (playlist.cover_object_key && playlist.cover_hash_sha256) {
          const coverExt = getFileExtension(playlist.cover_object_key, null);
          playlistCoverPath = `${ARTWORK_DIR}${playlist.cover_hash_sha256}${coverExt}`;
          if (!(await fileExists(playlistCoverPath))) {
            await client.downloadFile(playlist.cover_object_key, playlistCoverPath);
          }
        }
        playlistCoverPathByCloudId.set(playlist.cloud_id, playlistCoverPath);
      }
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const playlist of manifest.playlists) {
          throwIfCancelled(shouldCancel);
          await txn.runAsync(
            `INSERT INTO playlists (cloud_id, name, description, cover_path, is_smart, smart_rules, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(cloud_id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               cover_path = excluded.cover_path,
               is_smart = excluded.is_smart,
               smart_rules = excluded.smart_rules,
               sort_order = excluded.sort_order,
               updated_at = excluded.updated_at`,
            [
              playlist.cloud_id,
              playlist.name,
              playlist.description,
              playlistCoverPathByCloudId.get(playlist.cloud_id) ?? null,
              playlist.is_smart ? 1 : 0,
              playlist.smart_rules,
              playlist.sort_order,
              playlist.created_at,
              playlist.updated_at,
            ],
          );
          const row = await txn.getFirstAsync<{ id: number }>(
            'SELECT id FROM playlists WHERE cloud_id = ?',
            [playlist.cloud_id],
          );
          if (!row) {
            continue;
          }
          await txn.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [row.id]);
          let position = 0;
          for (const hash of playlist.track_hashes) {
            const trackId = trackIdByHash.get(hash);
            if (!trackId) {
              continue;
            }
            await txn.runAsync(
              'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
              [row.id, trackId, position],
            );
            position += 1;
          }
          result.importedPlaylists += 1;
        }
      });
      await setMobileCloudLastRevision(manifest.revision);
      emitProgress(onProgress, { phase: 'done', current: 1, total: 1, downloaded: result.downloaded, skipped: result.skipped });
      return result;
    },
  });
}

export async function syncCloudLibrary(onProgress?: ProgressCallback): Promise<CloudSyncResult | null> {
  activeCancelRequested = false;
  try {
    const uploadResult = await uploadMissingLocalToCloud(onProgress, () => activeCancelRequested);
    const fetchResult = await fetchCloudLibrary(onProgress, () => activeCancelRequested);
    return {
      uploaded: uploadResult.uploaded,
      downloaded: fetchResult.downloaded,
      skipped: uploadResult.skipped + fetchResult.skipped,
      failed: uploadResult.failed + fetchResult.failed,
      importedTracks: fetchResult.importedTracks,
      importedPlaylists: fetchResult.importedPlaylists,
      revision: fetchResult.revision ?? uploadResult.revision ?? ((await getMobileCloudLastRevision()) || null),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'cloud_sync_cancelled') {
      emitProgress(onProgress, { phase: 'cancelled' });
      return null;
    }
    throw error;
  } finally {
    activeCancelRequested = false;
  }
}

export function cancelMobileCloudSync(): void {
  activeCancelRequested = true;
}
