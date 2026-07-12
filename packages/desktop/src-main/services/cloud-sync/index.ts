import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CloudLibraryManifestV1,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudStoragePublicConfig,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  Track,
  Playlist,
} from '@ton/core';
import {
  buildCloudCommitObjectKey,
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudManifestObjectKey,
  buildCloudPlaylistAudioObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudPlaylistFolderName,
  buildCloudRevision,
  buildLegacyCloudManifestObjectKey,
  mergeCloudLibraryManifests,
  normalizeCloudPrefix,
  sanitizeFilename,
} from '@ton/core';
import { getDb } from '../database';
import { findNonCollidingFileAsync, getLibraryDir } from '../library-paths';
import { ensureArtworkDir, getArtworkDir } from '../metadata-reader/artwork';
import { DesktopR2Client } from './r2-client';
import { hashFileSha256 } from './hash';
import { contentTypeForExtension, extensionForTrack } from './media';
import {
  getDesktopCloudConfig,
  getDesktopCloudDeviceId,
  getDesktopCloudLastRevision,
  getDesktopCloudPublicConfig,
  saveDesktopCloudConfig,
  setDesktopCloudLastRevision,
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

async function ensureTrackContentHash(track: Track): Promise<string | null> {
  if (!(await pathExists(track.file_path))) {
    return null;
  }
  if (track.content_hash_sha256) {
    return track.content_hash_sha256;
  }
  const contentHash = await hashFileSha256(track.file_path);
  getDb().prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?').run(contentHash, track.id);
  return contentHash;
}

async function ensurePlaylistCloudId(playlist: Playlist): Promise<string> {
  if (playlist.cloud_id) {
    return playlist.cloud_id;
  }
  const cloudId = `playlist-${randomUUID()}`;
  getDb().prepare('UPDATE playlists SET cloud_id = ? WHERE id = ?').run(cloudId, playlist.id);
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
    WHERE t.in_library = 1
       OR EXISTS (SELECT 1 FROM playlist_tracks pt WHERE pt.track_id = t.id)
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
      artworkHash = await hashFileSha256(track.cover_art_path);
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
  const libraryTrackHashes = localTracks
    .filter((entry) => entry.track.in_library === 1)
    .map((entry) => entry.contentHash);
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
      coverHash = await hashFileSha256(playlist.cover_path);
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
  const localTrackByHash = new Map(localTracks.map((entry) => [entry.contentHash, entry]));
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
    addManagedPlaylistKey(managedPlaylistKeys, playlistArtworkPrefix, playlist.cover_object_key);
    playlist.track_hashes.forEach((hash, index) => {
      const entry = localTrackByHash.get(hash);
      if (!entry) {
        return;
      }
      const ext = extensionForTrack(entry.track.file_path, entry.track.format);
      const playlistAudioObjectKey = buildCloudPlaylistAudioObjectKey(
        config.prefix,
        { name: playlist.name, cloudId: playlist.cloud_id },
        index,
        entry.contentHash,
        ext,
        {
          title: entry.track.title,
          artist: entry.track.artist,
          fileName: path.basename(entry.track.file_path),
        },
      );
      addManagedPlaylistKey(managedPlaylistKeys, playlistTracksPrefix, playlistAudioObjectKey);
      addUploadTarget({
        key: playlistAudioObjectKey,
        filePath: entry.track.file_path,
        contentType: contentTypeForExtension(ext),
        hash: entry.contentHash,
      });
    });
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
  const libraryHashes = new Set(manifest.library_track_hashes);
  const libraryDir = getLibraryDir();
  await fs.promises.mkdir(libraryDir, { recursive: true });

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

    const destinationPath = await findNonCollidingFileAsync(libraryDir, buildImportedFileName(track));
    await client.downloadFile(track.object_key, destinationPath);
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
        rating, in_library
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      destinationPath,
      null,
      track.content_hash_sha256,
      track.file_size,
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
      libraryHashes.has(track.content_hash_sha256) ? 1 : 0,
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
