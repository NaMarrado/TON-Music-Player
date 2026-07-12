import fs from 'fs';
import path from 'path';
import type { DownloadItem } from '@ton/core';
import { analyzeLoudness } from '../loudness-analyzer';
import { readTrackMetadataOffthread } from '../metadata-reader';
import { getFileStatsAsync } from '../file-scanner';
import { findNonCollidingFileAsync, getPlaylistDir } from '../library-paths';
import { getDb } from '../database';
import { getFfmpegPathAsync } from '../binary-manager';
import { downloadCoverArt } from './artwork';
import type { ResolvedDesktopDownload } from './resolve';
import { settleDesktopPlaylistImportQueueItem } from '../playlist-import/targets';

export async function importDownloadedTrack(
  item: DownloadItem,
  outputFile: string,
  resolved: ResolvedDesktopDownload,
): Promise<{ playlistIds: number[]; trackId: number }> {
  const stats = await getFileStatsAsync(outputFile);
  if (!stats) {
    throw new Error('Cannot read downloaded file');
  }

  const metadata = await readTrackMetadataOffthread(outputFile, stats.size);
  let coverArtPath = metadata.cover_art_path;
  if (!coverArtPath && resolved.coverUrl && metadata.file_hash) {
    coverArtPath = await downloadCoverArt(resolved.coverUrl, metadata.file_hash);
  }

  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO tracks (
      file_path, file_hash, file_size, file_mtime,
      title, artist, album, album_artist,
      track_number, disc_number, duration_ms,
      genre, year, bitrate, sample_rate, format,
      cover_art_path,
      youtube_id, spotify_id, soundcloud_id, source_url
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?
    )`,
  ).run(
    outputFile,
    metadata.file_hash,
    stats.size,
    stats.mtimeMs,
    item.title || metadata.title,
    item.artist || metadata.artist,
    item.album || metadata.album,
    metadata.album_artist,
    metadata.track_number,
    metadata.disc_number,
    metadata.duration_ms,
    metadata.genre,
    metadata.year,
    metadata.bitrate,
    metadata.sample_rate,
    metadata.format,
    coverArtPath,
    resolved.youtubeId,
    item.source === 'spotify' ? item.source_id : null,
    item.source === 'soundcloud' ? item.source_id : null,
    resolved.url,
  );

  const trackRow = db.prepare('SELECT id FROM tracks WHERE file_path = ?')
    .get(outputFile) as { id: number } | undefined;
  const trackId = trackRow?.id ?? 0;

  await analyzeTrackLoudness(outputFile, trackId);
  const legacyPlaylistId = await linkTrackToPlaylist(item, trackId, outputFile);
  const importedPlaylistIds = await settleDesktopPlaylistImportQueueItem(item.id, trackId);

  return {
    playlistIds: [...new Set([
      ...importedPlaylistIds,
      ...(legacyPlaylistId == null ? [] : [legacyPlaylistId]),
    ])],
    trackId,
  };
}

async function analyzeTrackLoudness(outputFile: string, trackId: number): Promise<void> {
  try {
    const ffmpegPath = await getFfmpegPathAsync();
    if (!ffmpegPath) {
      return;
    }

    const loudness = await analyzeLoudness(outputFile, ffmpegPath);
    if (!loudness) {
      return;
    }

    getDb().prepare('UPDATE tracks SET loudness_lufs = ?, loudness_gain = ? WHERE id = ?').run(
      loudness.lufs,
      loudness.gain,
      trackId,
    );
  } catch {
    // Loudness analysis failure is non-critical.
  }
}

async function linkTrackToPlaylist(
  item: DownloadItem,
  trackId: number,
  outputFile: string,
): Promise<number | null> {
  if (!item.playlist_id || trackId <= 0) {
    return null;
  }

  try {
    const playlistDir = getPlaylistDir(item.playlist_id);
    await fs.promises.mkdir(playlistDir, { recursive: true });

    const playlistPath = await findNonCollidingFileAsync(playlistDir, path.basename(outputFile));
    await fs.promises.copyFile(outputFile, playlistPath);

    const db = getDb();
    const maxRow = db.prepare(
      'SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlist_id = ?',
    ).get(item.playlist_id) as { maxPos: number | null } | undefined;
    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, ?)',
    ).run(item.playlist_id, trackId, nextPosition, playlistPath);

    db.prepare("UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?").run(
      item.playlist_id,
    );
    return item.playlist_id;
  } catch {
    // Playlist linking failure is non-critical.
    return null;
  }
}
