import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudPlaylistRecordV2,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudStoragePublicConfig,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  CloudTrackRecordV2,
  Track,
  Playlist,
} from '@ton/core';
import {
  buildCloudCommitObjectKey,
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudManifestObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudPlaylistFolderName,
  buildCloudRevision,
  buildCloudV2CommitObjectKey,
  buildCloudV2ActivationObjectKey,
  buildCloudV2ManifestObjectKey,
  buildLegacyCloudManifestObjectKey,
  mergeCloudLibraryManifests,
  mergeCloudLibraryManifestsV2,
  convertCloudLibraryManifestV1ToV2,
  createCloudDeletedPlaylistRecordV2,
  createCloudDeletedTrackRecordV2,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  createEmptyCloudLibraryManifestV2,
  nextCloudEntityVersion,
  normalizeCloudPrefix,
  parseCloudLibraryManifestV2,
  sanitizeFilename,
} from '@ton/core';
import { getDb } from '../database';
import { findNonCollidingFileAsync, getLibraryDir } from '../library-paths';
import { ensureArtworkDir, getArtworkDir } from '../metadata-reader/artwork';
import { DesktopR2Client } from './r2-client';
import { hashFileSha256 } from './hash';
import { hashCloudArtworkFile } from './hash-cache';
import { contentTypeForExtension, extensionForTrack } from './media';
import {
  activateDesktopCloudScope,
  getDesktopCloudConfig,
  getDesktopCloudDeviceId,
  getDesktopCloudLastRevision,
  getDesktopCloudPublicConfig,
  saveDesktopCloudConfig,
  setDesktopCloudLastRevision,
} from './config';
import {
  acknowledgeDesktopCloudOutbox,
  readDesktopCloudOutbox,
  readDesktopCloudSyncState,
  setDesktopCloudOutboxSuppressed,
  updateDesktopCloudSyncState,
} from './auto-sync-store';
import {
  deriveDesktopCloudApplyProtection,
  type DesktopCloudApplyProtection,
} from './apply-protection';
import {
  uploadPendingCloudObjects,
  type PendingCloudObjectUpload,
} from './pending-object-uploader';
import {
  mergeV1BootstrapPlaylistEntry,
  mergeV1BootstrapTrackEntry,
} from './v1-bootstrap-merge';
import { conditionalManifestEtag, hasCloudV2History } from './v2-bootstrap-guard';

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

const EMPTY_RESULT: CloudSyncResult = {
  uploaded: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  importedTracks: 0,
  importedPlaylists: 0,
  revision: null,
};

function emitProgress(
  onProgress: ProgressCallback | undefined,
  patch: Partial<CloudSyncProgress>,
): void {
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

function requireConfig(): CloudStorageConfig {
  const config = getDesktopCloudConfig();
  if (!config) {
    throw new Error('Cloudflare R2 is not configured');
  }
  return config;
}

async function pathExists(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) {
    return false;
  }
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildImportedFileName(track: CloudTrackEntry): string {
  const ext = path.extname(track.file_name) || extensionForTrack(track.file_name, track.format);
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

function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

async function ensureTrackContentHash(track: Track): Promise<string | null> {
  if (!(await pathExists(track.file_path))) {
    return null;
  }
  if (track.content_hash_sha256) {
    return track.content_hash_sha256;
  }
  const contentHash = await hashFileSha256(track.file_path);
  setDesktopCloudOutboxSuppressed(() => {
    getDb().prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?')
      .run(contentHash, track.id);
  });
  track.content_hash_sha256 = contentHash;
  return contentHash;
}

async function ensurePlaylistCloudId(playlist: Playlist): Promise<string> {
  if (playlist.cloud_id) {
    return playlist.cloud_id;
  }
  const cloudId = `playlist-${randomUUID()}`;
  setDesktopCloudOutboxSuppressed(() => {
    getDb().prepare('UPDATE playlists SET cloud_id = ? WHERE id = ?').run(cloudId, playlist.id);
  });
  playlist.cloud_id = cloudId;
  return cloudId;
}

async function buildLocalManifest(
  config: CloudStorageConfig,
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<{ manifest: CloudLibraryManifestV1; localTracks: LocalCloudTrack[]; localArtworks: LocalCloudArtwork[] }> {
  const db = getDb();
  const deviceId = getDesktopCloudDeviceId();
  const now = Date.now();
  const revision = buildCloudRevision(deviceId, now);
  const tracks = db.prepare(`
    SELECT DISTINCT t.*
    FROM tracks t
    ORDER BY t.added_at DESC, t.id DESC
  `).all() as Track[];
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

    const ext = extensionForTrack(track.file_path, track.format);
    const trackObjectName = {
      title: track.title,
      artist: track.artist,
      fileName: path.basename(track.file_path),
    };
    const audioObjectKey = buildCloudLibraryAudioObjectKey(config.prefix, contentHash, ext, trackObjectName);
    let artworkHash: string | null = null;
    let artworkObjectKey: string | null = null;
    let artworkFileName: string | null = null;
    if (track.cover_art_path && await pathExists(track.cover_art_path)) {
      artworkHash = await hashCloudArtworkFile(track.cover_art_path);
      const artworkExt = path.extname(track.cover_art_path) || '.jpg';
      artworkObjectKey = buildCloudLibraryArtworkObjectKey(config.prefix, artworkHash, artworkExt, trackObjectName);
      artworkFileName = path.basename(track.cover_art_path);
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
      file_name: path.basename(track.file_path),
      file_size: track.file_size,
      format: track.format,
      artwork_hash_sha256: artworkHash,
      artwork_object_key: artworkObjectKey,
      artwork_file_name: artworkFileName,
      youtube_id: track.youtube_id,
      spotify_id: track.spotify_id,
      soundcloud_id: track.soundcloud_id,
      source_url: track.source_url,
      downloaded_at: track.downloaded_at,
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
  const libraryTrackHashes = localTracks.map((entry) => entry.contentHash);
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY sort_order ASC, updated_at DESC').all() as Playlist[];
  const playlistEntries: CloudPlaylistEntry[] = [];

  for (const playlist of playlists) {
    throwIfCancelled(shouldCancel);
    const cloudId = await ensurePlaylistCloudId(playlist);
    const rows = db.prepare(`
      SELECT track_id
      FROM playlist_tracks
      WHERE playlist_id = ?
      ORDER BY position ASC
    `).all(playlist.id) as Array<{ track_id: number }>;
    const trackHashes = rows
      .map((row) => contentHashByTrackId.get(row.track_id) ?? null)
      .filter((hash): hash is string => Boolean(hash));
    let coverHash: string | null = null;
    let coverObjectKey: string | null = null;
    if (playlist.cover_path && await pathExists(playlist.cover_path)) {
      coverHash = await hashCloudArtworkFile(playlist.cover_path);
      const coverExt = path.extname(playlist.cover_path) || '.jpg';
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
      library_track_hashes: [...new Set(libraryTrackHashes)],
      tracks: trackEntries,
      playlists: playlistEntries,
    },
    localTracks,
    localArtworks,
  };
}

async function readRemoteManifest(client: DesktopR2Client, config: CloudStorageConfig): Promise<CloudLibraryManifestV1 | null> {
  const current = parseManifest(await client.getJson<CloudLibraryManifestV1>(buildCloudManifestObjectKey(config.prefix)));
  if (current) {
    return current;
  }
  return parseManifest(await client.getJson<CloudLibraryManifestV1>(buildLegacyCloudManifestObjectKey(config.prefix)));
}

async function writeRemoteManifest(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  manifest: CloudLibraryManifestV1,
): Promise<void> {
  await client.putJson(buildCloudCommitObjectKey(config.prefix, manifest.revision), manifest);
  await client.putJson(buildCloudManifestObjectKey(config.prefix), manifest);
  setDesktopCloudLastRevision(manifest.revision);
}

async function cleanupLegacyCloudLayout(
  client: DesktopR2Client,
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

export function getCloudConfigForDesktop(): CloudStoragePublicConfig | null {
  return getDesktopCloudPublicConfig();
}

export function saveCloudConfigForDesktop(config: CloudStorageConfig): CloudStoragePublicConfig {
  return saveDesktopCloudConfig(config);
}

export async function testCloudConnectionForDesktop(config?: CloudStorageConfig): Promise<void> {
  const resolvedConfig = config ?? requireConfig();
  await new DesktopR2Client(resolvedConfig).testConnection();
}

export async function uploadMissingLocalToCloud(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const client = new DesktopR2Client(config);
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
      contentType: contentTypeForExtension(extensionForTrack(entry.track.file_path, entry.track.format)),
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
}

export async function fetchCloudLibraryToDesktop(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const client = new DesktopR2Client(config);
  const manifest = await readRemoteManifest(client, config);
  if (!manifest) {
    return { ...EMPTY_RESULT };
  }

  const db = getDb();
  const result: CloudSyncResult = { ...EMPTY_RESULT, revision: manifest.revision };
  const existingRows = db.prepare(`
    SELECT id, content_hash_sha256
    FROM tracks
    WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
    ORDER BY id ASC
  `).all() as Array<{ id: number; content_hash_sha256: string }>;
  const trackIdByHash = new Map(existingRows.map((row) => [row.content_hash_sha256, row.id]));
  const fillMissingDownloadedAt = db.prepare(`
    UPDATE tracks
    SET downloaded_at = ?
    WHERE id = ? AND downloaded_at IS NULL
  `);
  const libraryDir = getLibraryDir();
  await fs.promises.mkdir(libraryDir, { recursive: true });

  emitProgress(onProgress, { phase: 'downloading', total: manifest.tracks.length });
  for (let index = 0; index < manifest.tracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const track = manifest.tracks[index];
    const existingTrackId = trackIdByHash.get(track.content_hash_sha256);
    if (existingTrackId != null) {
      const downloadedAt = normalizeDownloadedAt(track.downloaded_at);
      if (downloadedAt != null) {
        fillMissingDownloadedAt.run(downloadedAt, existingTrackId);
      }
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

    const destinationPath = await findNonCollidingFileAsync(libraryDir, buildImportedFileName(track));
    await client.downloadFile(track.object_key, destinationPath);
    const destinationStats = await fs.promises.stat(destinationPath);
    let coverPath: string | null = null;
    if (track.artwork_object_key && track.artwork_hash_sha256) {
      await ensureArtworkDir(getArtworkDir());
      coverPath = path.join(getArtworkDir(), track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`);
      if (!(await pathExists(coverPath))) {
        await client.downloadFile(track.artwork_object_key, coverPath);
      }
    }

    const insertResult = db.prepare(`
      INSERT INTO tracks (
        file_path, file_hash, content_hash_sha256, file_size, file_mtime,
        title, artist, album, album_artist, track_number, disc_number,
        duration_ms, genre, year, bitrate, sample_rate, format, cover_art_path,
        loudness_lufs, loudness_gain, youtube_id, spotify_id, soundcloud_id, source_url,
        rating, downloaded_at, in_library
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      destinationPath,
      null,
      track.content_hash_sha256,
      destinationStats.size,
      null,
      track.metadata.title,
      track.metadata.artist,
      track.metadata.album,
      track.metadata.album_artist,
      track.metadata.track_number,
      track.metadata.disc_number,
      track.metadata.duration_ms,
      track.metadata.genre,
      track.metadata.year,
      track.metadata.bitrate,
      track.metadata.sample_rate,
      track.format,
      coverPath,
      track.metadata.loudness_lufs,
      track.metadata.loudness_gain,
      track.youtube_id,
      track.spotify_id,
      track.soundcloud_id,
      track.source_url,
      track.metadata.rating,
      normalizeDownloadedAt(track.downloaded_at),
      1,
    );
    trackIdByHash.set(track.content_hash_sha256, Number(insertResult.lastInsertRowid));
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
      await ensureArtworkDir(getArtworkDir());
      const coverExt = path.extname(playlist.cover_object_key) || '.jpg';
      playlistCoverPath = path.join(getArtworkDir(), `${playlist.cover_hash_sha256}${coverExt}`);
      if (!(await pathExists(playlistCoverPath))) {
        await client.downloadFile(playlist.cover_object_key, playlistCoverPath);
      }
    }
    playlistCoverPathByCloudId.set(playlist.cloud_id, playlistCoverPath);
  }

  const upsertPlaylist = db.prepare(`
    INSERT INTO playlists (cloud_id, name, description, cover_path, is_smart, smart_rules, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cloud_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      cover_path = excluded.cover_path,
      is_smart = excluded.is_smart,
      smart_rules = excluded.smart_rules,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `);
  const lookupPlaylist = db.prepare('SELECT id FROM playlists WHERE cloud_id = ?');
  const deletePlaylistTracks = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
  const insertPlaylistTrack = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let index = 0; index < manifest.playlists.length; index += 1) {
      throwIfCancelled(shouldCancel);
      const playlist = manifest.playlists[index];
      upsertPlaylist.run(
        playlist.cloud_id,
        playlist.name,
        playlist.description,
        playlistCoverPathByCloudId.get(playlist.cloud_id) ?? null,
        playlist.is_smart ? 1 : 0,
        playlist.smart_rules,
        playlist.sort_order,
        playlist.created_at,
        playlist.updated_at,
      );
      const row = lookupPlaylist.get(playlist.cloud_id) as { id: number } | undefined;
      if (!row) {
        continue;
      }
      deletePlaylistTracks.run(row.id);
      let position = 0;
      for (const hash of playlist.track_hashes) {
        const trackId = trackIdByHash.get(hash);
        if (!trackId) {
          continue;
        }
        insertPlaylistTrack.run(row.id, trackId, position);
        position += 1;
      }
      result.importedPlaylists += 1;
    }
  })();
  setDesktopCloudLastRevision(manifest.revision);
  emitProgress(onProgress, {
    phase: 'done',
    current: 1,
    total: 1,
    downloaded: result.downloaded,
    skipped: result.skipped,
  });
  return result;
}

export async function syncCloudLibraryForDesktop(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const uploadResult = await uploadMissingLocalToCloud(onProgress, shouldCancel);
  const fetchResult = await fetchCloudLibraryToDesktop(onProgress, shouldCancel);
  return {
    uploaded: uploadResult.uploaded,
    downloaded: fetchResult.downloaded,
    skipped: uploadResult.skipped + fetchResult.skipped,
    failed: uploadResult.failed + fetchResult.failed,
    importedTracks: fetchResult.importedTracks,
    importedPlaylists: fetchResult.importedPlaylists,
    revision: fetchResult.revision ?? uploadResult.revision ?? (getDesktopCloudLastRevision() || null),
  };
}

type V2SyncOptions = {
  onProgress?: ProgressCallback;
  shouldCancel?: CancelSignal;
  signal?: AbortSignal;
  force?: boolean;
  mode?: 'upload' | 'fetch' | 'sync';
};

type SerializedTrack = {
  local: LocalCloudTrack;
  entry: CloudTrackEntry;
};

type SerializedPlaylist = {
  localId: number;
  entry: CloudPlaylistEntry;
  cover: LocalCloudArtwork | null;
};

function throwIfV2Cancelled(options: V2SyncOptions): void {
  throwIfCancelled(options.shouldCancel);
  if (options.signal?.aborted) {
    throw new Error('cloud_sync_cancelled');
  }
}

function readCloudApplyProtection(
  scopeId: string,
  capturedGeneration: number,
): DesktopCloudApplyProtection {
  const db = getDb();
  const trackHash = db.prepare(`
    SELECT content_hash_sha256 FROM tracks WHERE id = ?
  `);
  const playlistCloudId = db.prepare(`
    SELECT cloud_id FROM playlists WHERE id = ?
  `);
  const entries = readDesktopCloudOutbox(scopeId)
    .filter((entry) => entry.generation > capturedGeneration);
  return deriveDesktopCloudApplyProtection(entries, {
    trackHash: (localId) => {
      const row = trackHash.get(localId) as { content_hash_sha256: string | null } | undefined;
      return row?.content_hash_sha256 || null;
    },
    playlistCloudId: (localId) => {
      const row = playlistCloudId.get(localId) as { cloud_id: string | null } | undefined;
      return row?.cloud_id || null;
    },
  });
}

function waitForV2ConflictRetry(options: V2SyncOptions): Promise<void> {
  throwIfV2Cancelled(options);
  const delayMs = 80 + Math.floor(Math.random() * 221);
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new Error('cloud_sync_cancelled'));
    };
    const timer = setTimeout(() => {
      options.signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    options.signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function serializeTrackForV2(
  config: CloudStorageConfig,
  trackId: number,
): Promise<SerializedTrack | null> {
  const track = getDb().prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as Track | undefined;
  if (!track) {
    return null;
  }
  const contentHash = track.content_hash_sha256 || await ensureTrackContentHash(track);
  if (!contentHash) {
    return null;
  }
  const ext = extensionForTrack(track.file_path, track.format);
  const audioObjectKey = buildCloudContentAudioObjectKey(config.prefix, contentHash, ext);
  let artworkHash: string | null = null;
  let artworkObjectKey: string | null = null;
  let artworkFileName: string | null = null;
  if (track.cover_art_path && await pathExists(track.cover_art_path)) {
    artworkHash = await hashCloudArtworkFile(track.cover_art_path);
    const artworkExt = path.extname(track.cover_art_path) || '.jpg';
    artworkObjectKey = buildCloudContentArtworkObjectKey(config.prefix, artworkHash, artworkExt);
    artworkFileName = path.basename(track.cover_art_path);
  }
  return {
    local: {
      track,
      contentHash,
      audioObjectKey,
      artworkHash,
      artworkObjectKey,
      artworkPath: track.cover_art_path,
    },
    entry: {
      content_hash_sha256: contentHash,
      object_key: audioObjectKey,
      file_name: path.basename(track.file_path),
      file_size: track.file_size,
      format: track.format,
      artwork_hash_sha256: artworkHash,
      artwork_object_key: artworkObjectKey,
      artwork_file_name: artworkFileName,
      youtube_id: track.youtube_id,
      spotify_id: track.spotify_id,
      soundcloud_id: track.soundcloud_id,
      source_url: track.source_url,
      downloaded_at: track.downloaded_at,
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
    },
  };
}

async function serializePlaylistForV2(
  config: CloudStorageConfig,
  playlistId: number,
): Promise<SerializedPlaylist | null> {
  const playlist = getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as Playlist | undefined;
  if (!playlist) {
    return null;
  }
  const cloudId = await ensurePlaylistCloudId(playlist);
  const memberRows = getDb().prepare(`
    SELECT t.*
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC, pt.id ASC
  `).all(playlistId) as Track[];
  const trackHashes: string[] = [];
  for (const track of memberRows) {
    const hash = track.content_hash_sha256 || await ensureTrackContentHash(track);
    if (hash) {
      trackHashes.push(hash);
    }
  }
  let coverHash: string | null = null;
  let coverObjectKey: string | null = null;
  let cover: LocalCloudArtwork | null = null;
  if (playlist.cover_path && await pathExists(playlist.cover_path)) {
    coverHash = await hashCloudArtworkFile(playlist.cover_path);
    const coverExt = path.extname(playlist.cover_path) || '.jpg';
    coverObjectKey = buildCloudContentArtworkObjectKey(config.prefix, coverHash, coverExt);
    cover = {
      key: coverObjectKey,
      filePath: playlist.cover_path,
      hash: coverHash,
      contentType: contentTypeForExtension(coverExt),
    };
  }
  return {
    localId: playlistId,
    cover,
    entry: {
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
    },
  };
}

async function downloadVerifiedCloudFile(
  client: DesktopR2Client,
  objectKey: string,
  destinationPath: string,
  expectedHash: string,
  signal?: AbortSignal,
): Promise<void> {
  const temporaryPath = `${destinationPath}.part-${randomUUID()}`;
  try {
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await client.downloadFile(objectKey, temporaryPath, signal);
    const actualHash = await hashFileSha256(temporaryPath);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(`Cloud object hash mismatch for ${objectKey}`);
    }
    await fs.promises.rename(temporaryPath, destinationPath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function cleanupOldV2CommitsIfDue(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  signal?: AbortSignal,
): Promise<void> {
  const state = readDesktopCloudSyncState(scopeId);
  const now = Date.now();
  if (state.last_commit_cleanup_at && now - state.last_commit_cleanup_at < 24 * 60 * 60 * 1_000) {
    return;
  }
  // Persist the attempt before network I/O so a broken maintenance endpoint
  // cannot turn the normal 10-second poll into a cleanup hot loop.
  updateDesktopCloudSyncState(scopeId, { last_commit_cleanup_at: now });
  const prefix = `${normalizeCloudPrefix(config.prefix)}/system/v2/commits/`;
  const keys = await client.listObjectKeys(prefix, signal);
  const obsolete = keys.sort((left, right) => right.localeCompare(left)).slice(20);
  await Promise.all(obsolete.map((key) => client.deleteObject(key, signal)));
}

async function ensureV2ActivationMarker(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  signal?: AbortSignal,
): Promise<void> {
  await client.putJsonConditional(
    buildCloudV2ActivationObjectKey(config.prefix),
    { schema_version: 2, activated_at: Date.now() },
    { ifNoneMatch: '*', signal },
  );
  updateDesktopCloudSyncState(scopeId, { activation_marker_confirmed: 1 });
}

function queueReplacedRemoteBlobsForGc(
  scopeId: string,
  previous: CloudLibraryManifestV2 | null,
  published: CloudLibraryManifestV2,
): void {
  if (!previous) return;
  const eligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1_000;
  const insert = getDb().prepare(`
    INSERT INTO cloud_sync_blob_gc (scope_id, object_key, eligible_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scope_id, object_key) DO UPDATE SET
      eligible_at = MAX(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)
  `);
  const nextTracks = new Map(published.tracks.map((record) => [record.content_hash_sha256, record]));
  for (const record of previous.tracks) {
    if (record.deleted || !nextTracks.get(record.content_hash_sha256)?.deleted) continue;
    insert.run(scopeId, record.entry.object_key, eligibleAt);
    if (record.entry.artwork_object_key) insert.run(scopeId, record.entry.artwork_object_key, eligibleAt);
  }
  const nextPlaylists = new Map(published.playlists.map((record) => [record.cloud_id, record]));
  for (const record of previous.playlists) {
    if (record.deleted || !nextPlaylists.get(record.cloud_id)?.deleted) continue;
    if (record.entry.cover_object_key) insert.run(scopeId, record.entry.cover_object_key, eligibleAt);
  }
}

function isManagedLibraryFile(filePath: string): boolean {
  const relative = path.relative(path.resolve(getLibraryDir()), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function applyCloudManifestV2(
  client: DesktopR2Client,
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  result: CloudSyncResult,
  options: V2SyncOptions,
  capturedGeneration: number,
): Promise<void> {
  throwIfV2Cancelled(options);
  const db = getDb();
  await fs.promises.mkdir(getLibraryDir(), { recursive: true });
  throwIfV2Cancelled(options);
  const mirrorRows = db.prepare(`
    SELECT entity_type, entity_key, record_json
    FROM cloud_sync_entities
    WHERE scope_id = ?
  `).all(scopeId) as Array<{
    entity_type: 'track' | 'playlist';
    entity_key: string;
    record_json: string;
  }>;
  const trackMirror = new Map(
    mirrorRows.filter((row) => row.entity_type === 'track')
      .map((row) => [row.entity_key, row.record_json]),
  );
  const playlistMirror = new Map(
    mirrorRows.filter((row) => row.entity_type === 'playlist')
      .map((row) => [row.entity_key, row.record_json]),
  );
  const trackRecordChanged = (record: CloudTrackRecordV2) => (
    options.force || trackMirror.get(record.content_hash_sha256) !== JSON.stringify(record)
  );
  const changedTrackRecords = manifest.tracks.filter(trackRecordChanged);
  let applyProtection = readCloudApplyProtection(scopeId, capturedGeneration);
  const trackIsProtected = (hash: string) => (
    applyProtection.protectAll || applyProtection.trackHashes.has(hash)
  );
  const playlistIsProtected = (cloudId: string) => (
    applyProtection.protectAll || applyProtection.playlistCloudIds.has(cloudId)
  );
  const trackRecordsToApply = changedTrackRecords
    .filter((record) => !trackIsProtected(record.content_hash_sha256));
  const changedTrackHashes = new Set(trackRecordsToApply.map((record) => record.content_hash_sha256));
  const trackIdByHash = new Map<string, number>();
  const existingRows = db.prepare(`
    SELECT id, content_hash_sha256 FROM tracks
    WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
  `).all() as Array<{ id: number; content_hash_sha256: string }>;
  existingRows.forEach((row) => trackIdByHash.set(row.content_hash_sha256, row.id));

  const deletedPaths: string[] = [];
  const queueBlobGc = db.prepare(`
    INSERT INTO cloud_sync_blob_gc (scope_id, object_key, eligible_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scope_id, object_key) DO UPDATE SET
      eligible_at = MAX(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)
  `);
  const cancelBlobGc = db.prepare(`
    DELETE FROM cloud_sync_blob_gc WHERE scope_id = ? AND object_key = ?
  `);
  const gcEligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1_000;
  for (const record of trackRecordsToApply) {
    throwIfV2Cancelled(options);
    if (!record.deleted) {
      cancelBlobGc.run(scopeId, record.entry.object_key);
      if (record.entry.artwork_object_key) {
        cancelBlobGc.run(scopeId, record.entry.artwork_object_key);
      }
      continue;
    }
    const previousJson = trackMirror.get(record.content_hash_sha256);
    if (previousJson) {
      try {
        const previous = JSON.parse(previousJson) as CloudTrackRecordV2;
        if (!previous.deleted) {
          queueBlobGc.run(scopeId, previous.entry.object_key, gcEligibleAt);
          if (previous.entry.artwork_object_key) {
            queueBlobGc.run(scopeId, previous.entry.artwork_object_key, gcEligibleAt);
          }
        }
      } catch {
        // A malformed local mirror must not prevent applying the tombstone.
      }
    }
    const rows = db.prepare(`
      SELECT id, file_path FROM tracks WHERE content_hash_sha256 = ?
    `).all(record.content_hash_sha256) as Array<{ id: number; file_path: string }>;
    if (rows.length > 0) {
      setDesktopCloudOutboxSuppressed(() => {
        db.transaction(() => {
          for (const row of rows) {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(row.id);
            if (isManagedLibraryFile(row.file_path)) {
              deletedPaths.push(row.file_path);
            }
          }
        })();
      });
      trackIdByHash.delete(record.content_hash_sha256);
    }
  }
  await Promise.all(deletedPaths.map((filePath) => fs.promises.rm(filePath, { force: true }).catch(() => undefined)));
  throwIfV2Cancelled(options);

  const liveTracks = trackRecordsToApply.filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted);
  emitProgress(options.onProgress, { phase: 'downloading', total: liveTracks.length });
  for (let index = 0; index < liveTracks.length; index += 1) {
    throwIfV2Cancelled(options);
    const entry = liveTracks[index].entry;
    let trackId = trackIdByHash.get(entry.content_hash_sha256) ?? null;
    let existing = trackId == null ? undefined : db.prepare(`
      SELECT id, file_path, downloaded_at FROM tracks WHERE id = ?
    `).get(trackId) as { id: number; file_path: string; downloaded_at: number | null } | undefined;
    let destinationPath = existing?.file_path ?? null;
    const existingFilePresent = destinationPath ? await pathExists(destinationPath) : false;
    if (!existingFilePresent) {
      destinationPath = await findNonCollidingFileAsync(getLibraryDir(), buildImportedFileName(entry));
      await downloadVerifiedCloudFile(
        client,
        entry.object_key,
        destinationPath,
        entry.content_hash_sha256,
        options.signal,
      );
      result.downloaded += 1;
    } else {
      result.skipped += 1;
    }
    if (!destinationPath) {
      throw new Error(`Unable to resolve local path for ${entry.content_hash_sha256}`);
    }
    const stats = await fs.promises.stat(destinationPath);
    let coverPath: string | null = null;
    if (entry.artwork_object_key && entry.artwork_hash_sha256) {
      await ensureArtworkDir(getArtworkDir());
      const coverExt = path.extname(entry.artwork_file_name || entry.artwork_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${entry.artwork_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) {
        await downloadVerifiedCloudFile(
          client,
          entry.artwork_object_key,
          coverPath,
          entry.artwork_hash_sha256,
          options.signal,
        );
      }
    }
    const downloadedAt = normalizeDownloadedAt(entry.downloaded_at);
    // File/network work above yields back to the renderer. Re-read generations
    // immediately before the SQLite write so an edit made during a download is
    // never replaced by the older record this cycle published/read.
    throwIfV2Cancelled(options);
    applyProtection = readCloudApplyProtection(scopeId, capturedGeneration);
    if (trackIsProtected(entry.content_hash_sha256)) {
      continue;
    }
    setDesktopCloudOutboxSuppressed(() => {
      if (trackId == null) {
        const inserted = db.prepare(`
          INSERT INTO tracks (
            file_path, content_hash_sha256, file_size, file_mtime, title, artist,
            album, album_artist, track_number, disc_number, duration_ms, genre,
            year, bitrate, sample_rate, format, cover_art_path, loudness_lufs,
            loudness_gain, youtube_id, spotify_id, soundcloud_id, source_url,
            rating, downloaded_at, added_at, scanned_at, in_library
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          destinationPath, entry.content_hash_sha256, stats.size, Math.round(stats.mtimeMs),
          entry.metadata.title, entry.metadata.artist, entry.metadata.album,
          entry.metadata.album_artist, entry.metadata.track_number, entry.metadata.disc_number,
          entry.metadata.duration_ms, entry.metadata.genre, entry.metadata.year,
          entry.metadata.bitrate, entry.metadata.sample_rate, entry.format, coverPath,
          entry.metadata.loudness_lufs, entry.metadata.loudness_gain, entry.youtube_id,
          entry.spotify_id, entry.soundcloud_id, entry.source_url, entry.metadata.rating,
          downloadedAt, entry.added_at, entry.updated_at,
        );
        trackId = Number(inserted.lastInsertRowid);
        result.importedTracks += 1;
      } else {
        db.prepare(`
          UPDATE tracks SET
            file_path = ?, file_size = ?, file_mtime = ?, title = ?, artist = ?,
            album = ?, album_artist = ?, track_number = ?, disc_number = ?,
            duration_ms = ?, genre = ?, year = ?, bitrate = ?, sample_rate = ?,
            format = ?, cover_art_path = ?, loudness_lufs = ?, loudness_gain = ?,
            youtube_id = ?, spotify_id = ?, soundcloud_id = ?, source_url = ?,
            rating = ?, downloaded_at = CASE
              WHEN downloaded_at IS NULL THEN ?
              WHEN ? IS NULL THEN downloaded_at
              ELSE MIN(downloaded_at, ?)
            END
          WHERE id = ?
        `).run(
          destinationPath, stats.size, Math.round(stats.mtimeMs), entry.metadata.title,
          entry.metadata.artist, entry.metadata.album, entry.metadata.album_artist,
          entry.metadata.track_number, entry.metadata.disc_number, entry.metadata.duration_ms,
          entry.metadata.genre, entry.metadata.year, entry.metadata.bitrate,
          entry.metadata.sample_rate, entry.format, coverPath, entry.metadata.loudness_lufs,
          entry.metadata.loudness_gain, entry.youtube_id, entry.spotify_id,
          entry.soundcloud_id, entry.source_url, entry.metadata.rating, downloadedAt,
          downloadedAt, downloadedAt, trackId,
        );
      }
    });
    if (trackId == null) {
      throw new Error(`Unable to import cloud track ${entry.content_hash_sha256}`);
    }
    trackIdByHash.set(entry.content_hash_sha256, trackId);
    emitProgress(options.onProgress, {
      phase: 'downloading', current: index + 1, total: liveTracks.length,
      downloaded: result.downloaded, skipped: result.skipped,
    });
  }

  throwIfV2Cancelled(options);
  const playlistRecordChanged = (record: CloudPlaylistRecordV2) => {
    if (options.force || playlistMirror.get(record.cloud_id) !== JSON.stringify(record)) {
      return true;
    }
    return !record.deleted && record.entry.track_hashes.some((hash) => changedTrackHashes.has(hash));
  };
  const changedPlaylistRecords = manifest.playlists.filter(playlistRecordChanged);
  applyProtection = readCloudApplyProtection(scopeId, capturedGeneration);
  const playlistRecordsToApply = changedPlaylistRecords
    .filter((record) => !playlistIsProtected(record.cloud_id));
  const deletedPlaylistIds = playlistRecordsToApply
    .filter((record) => record.deleted)
    .map((record) => record.cloud_id);
  for (const record of playlistRecordsToApply) {
    if (!record.deleted) {
      if (record.entry.cover_object_key) cancelBlobGc.run(scopeId, record.entry.cover_object_key);
      continue;
    }
    const previousJson = playlistMirror.get(record.cloud_id);
    if (!previousJson) continue;
    try {
      const previous = JSON.parse(previousJson) as CloudPlaylistRecordV2;
      if (!previous.deleted && previous.entry.cover_object_key) {
        queueBlobGc.run(scopeId, previous.entry.cover_object_key, gcEligibleAt);
      }
    } catch {
      // A malformed local mirror must not prevent applying the tombstone.
    }
  }
  throwIfV2Cancelled(options);
  setDesktopCloudOutboxSuppressed(() => {
    db.transaction(() => {
      for (const cloudId of deletedPlaylistIds) {
        db.prepare('DELETE FROM playlists WHERE cloud_id = ?').run(cloudId);
      }
    })();
  });

  const livePlaylists = playlistRecordsToApply.filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted);
  const downloadedCovers = new Map<string, string | null>();
  for (const record of livePlaylists) {
    throwIfV2Cancelled(options);
    const entry = record.entry;
    let coverPath: string | null = null;
    if (entry.cover_object_key && entry.cover_hash_sha256) {
      const coverExt = path.extname(entry.cover_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${entry.cover_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) {
        await downloadVerifiedCloudFile(
          client, entry.cover_object_key, coverPath, entry.cover_hash_sha256, options.signal,
        );
      }
    }
    throwIfV2Cancelled(options);
    downloadedCovers.set(entry.cloud_id, coverPath);
  }

  // Cover downloads may also yield long enough for membership/metadata edits.
  // Freeze the final protected set immediately before the atomic playlist and
  // mirror transaction; no renderer SQL can interleave with that transaction.
  throwIfV2Cancelled(options);
  applyProtection = readCloudApplyProtection(scopeId, capturedGeneration);
  const finalLivePlaylists = livePlaylists.filter((record) => !playlistIsProtected(record.cloud_id));
  setDesktopCloudOutboxSuppressed(() => {
    db.transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO playlists (
          cloud_id, name, description, cover_path, is_smart, smart_rules,
          sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET
          name = excluded.name, description = excluded.description,
          cover_path = excluded.cover_path, is_smart = excluded.is_smart,
          smart_rules = excluded.smart_rules, sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `);
      for (const record of finalLivePlaylists) {
        const entry = record.entry;
        upsert.run(
          entry.cloud_id, entry.name, entry.description,
          downloadedCovers.get(entry.cloud_id) ?? null, entry.is_smart ? 1 : 0,
          entry.smart_rules, entry.sort_order, entry.created_at, entry.updated_at,
        );
        const playlist = db.prepare('SELECT id FROM playlists WHERE cloud_id = ?')
          .get(entry.cloud_id) as { id: number };
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlist.id);
        let position = 0;
        for (const hash of entry.track_hashes) {
          const trackId = trackIdByHash.get(hash);
          if (trackId == null) continue;
          db.prepare(`
            INSERT INTO playlist_tracks (playlist_id, track_id, position)
            VALUES (?, ?, ?)
          `).run(playlist.id, trackId, position++);
        }
        result.importedPlaylists += 1;
      }

      const insertMirror = db.prepare(`
        INSERT OR REPLACE INTO cloud_sync_entities (
          scope_id, entity_type, entity_key, record_json, version_counter,
          version_device_id, is_deleted, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
      `);
      for (const record of changedTrackRecords) {
        if (trackIsProtected(record.content_hash_sha256)) continue;
        insertMirror.run(
          scopeId, 'track', record.content_hash_sha256, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
      for (const record of changedPlaylistRecords) {
        if (playlistIsProtected(record.cloud_id)) continue;
        insertMirror.run(
          scopeId, 'playlist', record.cloud_id, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
      const manifestTrackKeys = new Set(manifest.tracks.map((record) => record.content_hash_sha256));
      const manifestPlaylistKeys = new Set(manifest.playlists.map((record) => record.cloud_id));
      const deleteMirror = db.prepare(`
        DELETE FROM cloud_sync_entities
        WHERE scope_id = ? AND entity_type = ? AND entity_key = ?
      `);
      for (const row of mirrorRows) {
        if (row.entity_type === 'track' && trackIsProtected(row.entity_key)) continue;
        if (row.entity_type === 'playlist' && playlistIsProtected(row.entity_key)) continue;
        const stillPresent = row.entity_type === 'track'
          ? manifestTrackKeys.has(row.entity_key)
          : manifestPlaylistKeys.has(row.entity_key);
        if (!stillPresent) deleteMirror.run(scopeId, row.entity_type, row.entity_key);
      }
    })();
  });
}

/**
 * Incremental V2 cycle. A clean conditional poll exits on 304 before touching
 * the library or hashing a file. Normal outbox cycles serialize only changed
 * entities; the full Library is visited solely for first bootstrap/reconcile.
 */
export async function syncCloudLibraryV2ForDesktop(
  options: V2SyncOptions = {},
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const scopeId = activateDesktopCloudScope(config);
  const client = new DesktopR2Client(config);
  const deviceId = getDesktopCloudDeviceId();
  const state = readDesktopCloudSyncState(scopeId);
  const durableOutbox = readDesktopCloudOutbox(scopeId);
  const requestedMode = options.mode ?? 'sync';
  // A fetch-only apply must never overwrite values that are represented only
  // by identity in the durable outbox. Publish/rebase those local mutations in
  // the same single-flight cycle before applying the remote manifest.
  let mode = requestedMode === 'fetch' && durableOutbox.length > 0
    ? 'sync'
    : requestedMode;
  let shouldUpload = mode !== 'fetch';
  const shouldApply = mode !== 'upload';
  let outbox = shouldUpload ? durableOutbox : [];
  let capturedGeneration = outbox.reduce((max, item) => Math.max(max, item.generation), 0);
  let fullReconcile = shouldUpload && Boolean(
    options.force || state.needs_full_reconcile || outbox.some((item) => item.operation === 'reconcile')
  );
  const v2Key = buildCloudV2ManifestObjectKey(config.prefix);
  emitProgress(options.onProgress, { phase: 'reading-manifest', total: 1 });
  throwIfV2Cancelled(options);

  const initialRead = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, {
    ifNoneMatch: conditionalManifestEtag(
      Boolean(options.force), fullReconcile, outbox.length, state.etag,
    ),
    signal: options.signal,
  });
  throwIfV2Cancelled(options);
  if (initialRead.status === 'not-modified' && outbox.length === 0 && !fullReconcile) {
    if (!state.activation_marker_confirmed) {
      await ensureV2ActivationMarker(client, config, scopeId, options.signal);
    }
    throwIfV2Cancelled(options);
    updateDesktopCloudSyncState(scopeId, {
      last_success_at: Date.now(), last_error: null, next_retry_at: null,
    });
    emitProgress(options.onProgress, { phase: 'done', current: 1, total: 1 });
    return { ...EMPTY_RESULT, revision: state.revision };
  }

  let remote: CloudLibraryManifestV2 | null = initialRead.status === 'ok'
    ? parseCloudLibraryManifestV2(initialRead.value)
    : null;
  let remoteEtag = initialRead.status === 'ok' ? initialRead.etag : null;
  let createV2 = initialRead.status === 'missing';
  let authoritativeV2Head = initialRead.status === 'ok';
  let bootstrappingFromV1 = false;
  if (initialRead.status === 'ok' && !remote) {
    throw new Error('cloud_sync_invalid_v2_manifest');
  }
  if (createV2) {
    const mirror = getDb().prepare(`
      SELECT COUNT(*) AS count FROM cloud_sync_entities WHERE scope_id = ?
    `).get(scopeId) as { count: number };
    const localHistory = hasCloudV2History({
      revision: state.revision,
      etag: state.etag,
      mirroredEntityCount: mirror.count,
      activationMarkerPresent: false,
    });
    const activationMarkerPresent = localHistory
      ? false
      : await client.headObject(
          buildCloudV2ActivationObjectKey(config.prefix), options.signal,
        );
    if (localHistory || hasCloudV2History({
      revision: null,
      etag: null,
      mirroredEntityCount: 0,
      activationMarkerPresent,
    })) {
      // The permanent marker is created only after the first V2 manifest CAS.
      // A missing head after activation must fail closed rather than reviving
      // stale V1 state and its already deleted entities.
      throw new Error('cloud_sync_v2_manifest_missing');
    }
    if (!shouldUpload) {
      // A first-ever recovery Fetch still has to establish the authoritative
      // V2 head. Applying a converted V1 snapshot without publishing it would
      // create local V2 history that makes the next run fail closed.
      mode = 'sync';
      shouldUpload = true;
      outbox = durableOutbox;
      capturedGeneration = outbox.reduce(
        (max, item) => Math.max(max, item.generation), 0,
      );
      fullReconcile = true;
    }
    const v1 = await readRemoteManifest(client, config);
    bootstrappingFromV1 = Boolean(v1);
    remote = v1
      ? convertCloudLibraryManifestV1ToV2(v1)
      : createEmptyCloudLibraryManifestV2(deviceId);
  }

  const serializedTracks = new Map<number, SerializedTrack>();
  const serializedPlaylists = new Map<number, SerializedPlaylist>();
  const trackIds = new Set<number>();
  const playlistIds = new Set<number>();
  if (fullReconcile) {
    const rows = getDb().prepare('SELECT id FROM tracks ORDER BY id').all() as Array<{ id: number }>;
    rows.forEach((row) => trackIds.add(row.id));
    const playlists = getDb().prepare('SELECT id FROM playlists ORDER BY id').all() as Array<{ id: number }>;
    playlists.forEach((row) => playlistIds.add(row.id));
  }
  for (const item of outbox) {
    if (item.operation !== 'upsert' || item.local_id == null) continue;
    if (item.entity_type === 'track') trackIds.add(item.local_id);
    if (item.entity_type === 'playlist') playlistIds.add(item.local_id);
  }
  emitProgress(options.onProgress, { phase: 'hashing', total: trackIds.size + playlistIds.size });
  let serializedCount = 0;
  for (const id of trackIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializeTrackForV2(config, id);
    if (serialized) serializedTracks.set(id, serialized);
    serializedCount += 1;
    emitProgress(options.onProgress, { phase: 'hashing', current: serializedCount, total: trackIds.size + playlistIds.size });
  }
  for (const id of playlistIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializePlaylistForV2(config, id);
    if (serialized) serializedPlaylists.set(id, serialized);
    serializedCount += 1;
    emitProgress(options.onProgress, { phase: 'hashing', current: serializedCount, total: trackIds.size + playlistIds.size });
  }

  // A playlist mutation may be the first operation that needs one of its
  // member tracks in cloud storage. Include only those missing dependencies;
  // otherwise the published playlist could point at an audio hash that has not
  // been uploaded yet.
  const knownRemoteTrackHashes = new Set(remote!.tracks.map((record) => record.content_hash_sha256));
  const serializedTrackHashes = new Set(
    [...serializedTracks.values()].map((serialized) => serialized.entry.content_hash_sha256),
  );
  for (const playlist of serializedPlaylists.values()) {
    for (const hash of playlist.entry.track_hashes) {
      if (knownRemoteTrackHashes.has(hash) || serializedTrackHashes.has(hash)) continue;
      const row = getDb().prepare(`
        SELECT id FROM tracks WHERE content_hash_sha256 = ? ORDER BY id LIMIT 1
      `).get(hash) as { id: number } | undefined;
      if (!row) continue;
      const serialized = await serializeTrackForV2(config, row.id);
      if (!serialized) continue;
      serializedTracks.set(row.id, serialized);
      serializedTrackHashes.add(hash);
    }
  }

  const requiredAudio = new Map<string, { serialized: SerializedTrack; key: string }>();
  const requiredArtwork = new Map<string, LocalCloudArtwork>();
  const repairObjectKeys = new Set<string>();
  const repairReferencedBlobs = shouldUpload && Boolean(options.force);
  const buildLocalMutations = (base: CloudLibraryManifestV2): CloudLibraryManifestV2 => {
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

    for (const [id, serialized] of serializedTracks) {
      const pending = outbox.some((item) => item.entity_type === 'track' && item.local_id === id && item.operation === 'upsert');
      const previous = remoteTracks.get(serialized.entry.content_hash_sha256);
      if (repairReferencedBlobs && previous && !previous.deleted) {
        requiredAudio.set(serialized.entry.content_hash_sha256, {
          serialized,
          key: previous.entry.object_key,
        });
        repairObjectKeys.add(previous.entry.object_key);
        if (
          serialized.local.artworkHash
          && serialized.local.artworkPath
          && previous.entry.artwork_hash_sha256 === serialized.local.artworkHash
          && previous.entry.artwork_object_key
        ) {
          const ext = path.extname(serialized.local.artworkPath) || '.jpg';
          requiredArtwork.set(previous.entry.artwork_object_key, {
            key: previous.entry.artwork_object_key,
            filePath: serialized.local.artworkPath,
            hash: serialized.local.artworkHash,
            contentType: contentTypeForExtension(ext),
          });
          repairObjectKeys.add(previous.entry.artwork_object_key);
        }
      }
      // Reconcile discovers local entities missing from cloud; it must never
      // resurrect a remote tombstone. Only a fresh explicit local mutation may
      // supersede a deletion with a higher Lamport version.
      const mergeLiveV1 = bootstrappingFromV1 && !pending && previous && !previous.deleted;
      if (!pending && previous && !mergeLiveV1) continue;
      const candidate = mergeLiveV1
        ? mergeV1BootstrapTrackEntry(previous.entry, serialized.entry)
        : serialized.entry;
      const entry: CloudTrackEntry = !previous || previous.deleted
        ? candidate
        : {
            ...candidate,
            // V1 imports may use title-based object keys. The content hash is
            // the immutable identity, so a metadata-only edit must keep that
            // already valid blob instead of uploading a content-key duplicate.
            object_key: previous.entry.object_key,
            artwork_object_key:
              previous.entry.artwork_hash_sha256 === candidate.artwork_hash_sha256
                && previous.entry.artwork_object_key
                ? previous.entry.artwork_object_key
                : candidate.artwork_object_key,
          };
      trackRecords.push(createCloudLiveTrackRecordV2(entry, nextVersion()));
      if (!previous || previous.deleted || previous.entry.object_key !== entry.object_key) {
        requiredAudio.set(serialized.entry.content_hash_sha256, {
          serialized,
          key: entry.object_key,
        });
      }
      if (serialized.local.artworkHash && serialized.local.artworkPath && entry.artwork_object_key
          && entry.artwork_hash_sha256 === serialized.local.artworkHash
          && (!previous || previous.deleted || previous.entry.artwork_hash_sha256 !== entry.artwork_hash_sha256)) {
        const ext = path.extname(serialized.local.artworkPath) || '.jpg';
        requiredArtwork.set(entry.artwork_object_key, {
          key: entry.artwork_object_key,
          filePath: serialized.local.artworkPath,
          hash: serialized.local.artworkHash,
          contentType: contentTypeForExtension(ext),
        });
      }
    }
    for (const item of outbox) {
      if (item.entity_type !== 'track' || item.operation !== 'delete') continue;
      const hash = (() => {
        try { return (JSON.parse(item.payload_json || '{}') as { content_hash_sha256?: string }).content_hash_sha256; }
        catch { return undefined; }
      })();
      if (!hash) continue;
      const stillExists = getDb().prepare(`
        SELECT 1 FROM tracks WHERE content_hash_sha256 = ? LIMIT 1
      `).get(hash);
      if (!stillExists) trackRecords.push(createCloudDeletedTrackRecordV2(hash, nextVersion()));
    }

    for (const [id, serialized] of serializedPlaylists) {
      const pending = outbox.some((item) => item.entity_type === 'playlist' && item.local_id === id && item.operation === 'upsert');
      const previous = remotePlaylists.get(serialized.entry.cloud_id);
      if (
        repairReferencedBlobs
        && serialized.cover
        && previous
        && !previous.deleted
        && previous.entry.cover_hash_sha256 === serialized.cover.hash
        && previous.entry.cover_object_key
      ) {
        requiredArtwork.set(previous.entry.cover_object_key, {
          ...serialized.cover,
          key: previous.entry.cover_object_key,
        });
        repairObjectKeys.add(previous.entry.cover_object_key);
      }
      const mergeLiveV1 = bootstrappingFromV1 && !pending && previous && !previous.deleted;
      if (!pending && previous && !mergeLiveV1) continue;
      const candidate = mergeLiveV1
        ? mergeV1BootstrapPlaylistEntry(previous.entry, serialized.entry)
        : serialized.entry;
      const entry: CloudPlaylistEntry = !previous || previous.deleted
        ? candidate
        : {
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
        requiredArtwork.set(entry.cover_object_key ?? serialized.cover.key, {
          ...serialized.cover,
          key: entry.cover_object_key ?? serialized.cover.key,
        });
      }
    }
    for (const item of outbox) {
      if (item.entity_type !== 'playlist' || item.operation !== 'delete') continue;
      const cloudId = (() => {
        try { return (JSON.parse(item.payload_json || '{}') as { cloud_id?: string }).cloud_id; }
        catch { return undefined; }
      })();
      if (cloudId) playlistRecords.push(createCloudDeletedPlaylistRecordV2(cloudId, nextVersion()));
    }
    const local = createEmptyCloudLibraryManifestV2(deviceId);
    local.max_counter = counter;
    local.tracks = trackRecords;
    local.playlists = playlistRecords;
    return local;
  };

  let mutationManifest = buildLocalMutations(remote!);
  const hasMutations = mutationManifest.tracks.length > 0 || mutationManifest.playlists.length > 0;
  const result: CloudSyncResult = { ...EMPTY_RESULT };
  const completedObjectKeys = new Set<string>();
  const uploadRequiredObjects = async () => {
    const targets: PendingCloudObjectUpload[] = [];
    for (const required of requiredAudio.values()) {
      const { serialized } = required;
      targets.push({
        key: required.key,
        filePath: serialized.local.track.file_path,
        contentType: contentTypeForExtension(extensionForTrack(
          serialized.local.track.file_path,
          serialized.local.track.format,
        )),
        hash: serialized.entry.content_hash_sha256,
      });
    }
    targets.push(...requiredArtwork.values());
    const pendingCount = targets.filter((target) => !completedObjectKeys.has(target.key)).length;
    if (pendingCount === 0) return;
    emitProgress(options.onProgress, { phase: 'uploading', total: pendingCount });
    const uploadedBefore = result.uploaded;
    const skippedBefore = result.skipped;
    const batch = await uploadPendingCloudObjects(
      targets,
      completedObjectKeys,
      repairObjectKeys,
      {
        headObject: async (key) => {
          throwIfV2Cancelled(options);
          return client.headObject(key, options.signal);
        },
        uploadObject: async (target) => {
          throwIfV2Cancelled(options);
          const uploaded = await client.uploadFile(
            target.key, target.filePath, target.contentType, target.hash,
            { ifNoneMatch: '*', signal: options.signal },
          );
          return uploaded.status === 'ok' ? 'uploaded' : 'exists';
        },
      },
      (current, total, batchProgress) => {
        emitProgress(options.onProgress, {
          phase: 'uploading', current, total,
          uploaded: uploadedBefore + batchProgress.uploaded,
          skipped: skippedBefore + batchProgress.skipped,
        });
      },
    );
    result.uploaded += batch.uploaded;
    result.skipped += batch.skipped;
  };

  await uploadRequiredObjects();

  let published = remote!;
  let publishedEtag = remoteEtag;
  if (shouldUpload && (hasMutations || createV2)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      throwIfV2Cancelled(options);
      // A 412 rebase can change a live remote record into a tombstone (or
      // reveal changed artwork), adding blob requirements that did not exist
      // before the first upload pass. Confirm every current requirement before
      // publishing the manifest built from this specific base.
      await uploadRequiredObjects();
      const revision = buildCloudRevision(deviceId);
      published = mergeCloudLibraryManifestsV2(remote, mutationManifest, {
        writerDeviceId: deviceId, revision, updatedAt: Date.now(),
      });
      emitProgress(options.onProgress, { phase: 'writing-manifest', total: 1 });
      const write = await client.putJsonConditional(v2Key, published, createV2
        ? { ifNoneMatch: '*', signal: options.signal }
        : { ifMatch: remoteEtag, signal: options.signal });
      if (write.status === 'ok') {
        authoritativeV2Head = true;
        if (!state.activation_marker_confirmed) {
          await ensureV2ActivationMarker(client, config, scopeId, options.signal);
          state.activation_marker_confirmed = 1;
        }
        // A snapshot is accepted history only after its manifest CAS wins.
        // Writing it before CAS leaves orphan snapshots that can permanently
        // block a first bootstrap after a crash/network failure.
        await client.putJson(
          buildCloudV2CommitObjectKey(config.prefix, revision), published, options.signal,
        );
        publishedEtag = write.etag;
        if (!publishedEtag) {
          // Some S3-compatible responses omit the PUT ETag. Verify the current
          // head before applying anything. Another writer may legitimately win
          // a second CAS between our PUT and this GET, so the body and ETag must
          // be adopted as one inseparable pair.
          const verified = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, {
            signal: options.signal,
          });
          const verifiedManifest = verified.status === 'ok'
            ? parseCloudLibraryManifestV2(verified.value)
            : null;
          if (!verifiedManifest || !verified.etag) {
            throw new Error('cloud_sync_missing_etag');
          }
          published = verifiedManifest;
          publishedEtag = verified.etag;
        }
        break;
      }
      if (attempt === 4) {
        throw new Error('cloud_sync_precondition_failed');
      }
      await waitForV2ConflictRetry(options);
      const refreshed = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, { signal: options.signal });
      const parsedRefreshed = refreshed.status === 'ok'
        ? parseCloudLibraryManifestV2(refreshed.value)
        : null;
      if (!parsedRefreshed) throw new Error('cloud_sync_invalid_v2_manifest');
      remote = parsedRefreshed;
      remoteEtag = refreshed.etag;
      createV2 = false;
      mutationManifest = buildLocalMutations(remote!);
    }
    await cleanupOldV2CommitsIfDue(client, config, scopeId, options.signal).catch((error) => {
      throwIfV2Cancelled(options);
      console.warn('Cloud commit cleanup failed:', error);
    });
  }

  if (authoritativeV2Head && !state.activation_marker_confirmed) {
    await ensureV2ActivationMarker(client, config, scopeId, options.signal);
  }

  throwIfV2Cancelled(options);
  if (shouldUpload) {
    queueReplacedRemoteBlobsForGc(scopeId, remote, published);
  }
  if (shouldApply) {
    await applyCloudManifestV2(
      client, scopeId, published, result, options, capturedGeneration,
    );
  }
  throwIfV2Cancelled(options);
  if (shouldUpload) {
    acknowledgeDesktopCloudOutbox(scopeId, capturedGeneration);
  }
  throwIfV2Cancelled(options);
  updateDesktopCloudSyncState(scopeId, {
    revision: mode === 'upload' ? state.revision : published.revision,
    // Upload-only intentionally forces the next automatic poll to fetch and
    // apply the merged remote state instead of treating it as already applied.
    etag: mode === 'upload' ? null : publishedEtag,
    lamport_counter: published.max_counter,
    last_success_at: Date.now(),
    last_error: null,
    next_retry_at: null,
    needs_full_reconcile: shouldUpload ? 0 : state.needs_full_reconcile,
    pending_remote_revision: mode === 'upload' ? published.revision : null,
    pending_downloads: 0,
  });
  setDesktopCloudLastRevision(published.revision);
  result.revision = published.revision;
  emitProgress(options.onProgress, {
    phase: 'done', current: 1, total: 1, uploaded: result.uploaded,
    downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
  });
  return result;
}
