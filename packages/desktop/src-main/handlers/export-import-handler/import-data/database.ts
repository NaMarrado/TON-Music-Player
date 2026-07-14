import type { ExportManifest } from '@ton/core';
import { getDb } from '../../../services/database';
import type { ImportPreparedFile, ProgressPayload } from '../types';

export type InsertImportedLibraryResult = {
  importedPlaylists: number;
  playlistIds: number[];
};

function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function insertImportedLibrary(
  manifest: ExportManifest,
  filesToInsert: ImportPreparedFile[],
  playlistCoverPaths: Record<string, string>,
  sendProgress: (data: ProgressPayload) => void,
): InsertImportedLibraryResult {
  const db = getDb();
  const trackEntryByHash = new Map(manifest.tracks.map((track) => [track.file_hash, track]));
  const insertTrack = db.prepare(`
    INSERT INTO tracks (
      file_path, file_hash, content_hash_sha256, file_size, title, artist, album,
      genre, year, duration_ms, loudness_lufs, loudness_gain, downloaded_at, in_library
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markTrackInLibrary = db.prepare(`
    UPDATE tracks
    SET in_library = 1,
        downloaded_at = COALESCE(downloaded_at, ?)
    WHERE file_hash = ? OR (? IS NOT NULL AND content_hash_sha256 = ?)
  `);
  const insertPlaylist = db.prepare(
    'INSERT INTO playlists (name, description, cover_path, is_smart, smart_rules) VALUES (?, ?, ?, ?, ?)',
  );
  const insertPlaylistTrack = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
  );
  const lookupTrackByHash = db.prepare(`
    SELECT id
    FROM tracks
    WHERE file_hash = ? OR (? IS NOT NULL AND content_hash_sha256 = ?)
    ORDER BY CASE WHEN file_hash = ? THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `);

  let importedPlaylists = 0;
  const playlistIds: number[] = [];
  sendProgress({ phase: 'playlists', current: 0, total: manifest.playlists.length });

  const runImport = db.transaction(() => {
    for (const file of filesToInsert) {
      insertTrack.run(
        file.destPath,
        file.hash,
        file.contentHashSha256,
        file.fileSize,
        file.meta.title,
        file.meta.artist,
        file.meta.album,
        file.meta.genre,
        file.meta.year,
        file.meta.duration_ms,
        file.meta.loudness_lufs,
        file.meta.loudness_gain,
        file.downloadedAt,
        1,
      );
    }

    for (const entry of manifest.tracks) {
      const contentHash = entry.content_hash_sha256 ?? null;
      markTrackInLibrary.run(
        normalizeDownloadedAt(entry.downloaded_at),
        entry.file_hash,
        contentHash,
        contentHash,
      );
    }

    for (let index = 0; index < manifest.playlists.length; index += 1) {
      const playlist = manifest.playlists[index];
      const coverPath = playlist.cover_relative_path
        ? (playlistCoverPaths[playlist.cover_relative_path] ?? null)
        : null;
      const playlistResult = insertPlaylist.run(
        playlist.name,
        playlist.description,
        coverPath,
        playlist.is_smart ? 1 : 0,
        playlist.smart_rules,
      );
      const playlistId = Number(playlistResult.lastInsertRowid);
      playlistIds.push(playlistId);

      let position = 0;
      for (const hash of playlist.track_hashes) {
        const entry = trackEntryByHash.get(hash);
        const contentHash = entry?.content_hash_sha256 ?? null;
        const trackRow = lookupTrackByHash.get(
          hash,
          contentHash,
          contentHash,
          hash,
        ) as { id: number } | undefined;
        if (trackRow) {
          insertPlaylistTrack.run(playlistId, trackRow.id, position);
          position += 1;
        }
      }

      importedPlaylists += 1;
      sendProgress({ phase: 'playlists', current: index + 1, total: manifest.playlists.length });
    }
  });

  runImport();
  return { importedPlaylists, playlistIds };
}
