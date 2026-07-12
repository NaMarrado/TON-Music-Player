import path from 'path';
import { getFfmpegPathAsync } from '../../../services/binary-manager';
import { getDb } from '../../../services/database';
import { analyzeLoudnessBatch, findDirectoryCover, type TrackMetaEntry } from '../../playlist-helpers';
import { readTrackMetadata } from '../../../services/metadata-reader';
import type { ImportedPlaylistTrack } from '../types';

type TrackMetadata = Awaited<ReturnType<typeof readTrackMetadata>>;

export function sortSourceFilesBySavedPosition(
  sourceFiles: string[],
  tracksMeta?: Record<string, TrackMetaEntry>,
): void {
  if (!tracksMeta) {
    return;
  }

  sourceFiles.sort((a, b) => {
    const posA = tracksMeta[path.basename(a)]?.position ?? Infinity;
    const posB = tracksMeta[path.basename(b)]?.position ?? Infinity;
    return posA - posB;
  });
}

export async function applySavedMetadata(
  meta: TrackMetadata,
  sourceFile: string,
  tracksMeta?: Record<string, TrackMetaEntry>,
  artworkMap?: Map<string, string>,
): Promise<void> {
  const savedMeta = tracksMeta?.[path.basename(sourceFile)];
  if (savedMeta) {
    if (savedMeta.title && !meta.title) meta.title = savedMeta.title;
    if (savedMeta.artist && !meta.artist) meta.artist = savedMeta.artist;
    if (savedMeta.album && !meta.album) meta.album = savedMeta.album;
    if (savedMeta.artwork && !meta.cover_art_path && artworkMap) {
      const restoredArt = artworkMap.get(savedMeta.artwork);
      if (restoredArt) {
        meta.cover_art_path = restoredArt;
      }
    }
  }

  if (!meta.cover_art_path) {
    meta.cover_art_path = await findDirectoryCover(path.dirname(sourceFile), meta.file_hash);
  }
}

export function attachImportedTracks(
  db: ReturnType<typeof getDb>,
  playlistId: number,
  imported: ImportedPlaylistTrack[],
): void {
  if (imported.length === 0) {
    return;
  }

  const addStmt = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, NULL)',
  );
  db.transaction(() => {
    for (let index = 0; index < imported.length; index += 1) {
      addStmt.run(playlistId, imported[index].trackId, index);
    }
  })();
}

export function syncPlaylistCover(
  db: ReturnType<typeof getDb>,
  playlistId: number,
  coverPath: string | null,
  imported: ImportedPlaylistTrack[],
): void {
  if (coverPath || imported.length === 0) {
    return;
  }

  const firstTrack = db
    .prepare('SELECT cover_art_path FROM tracks WHERE id = ?')
    .get(imported[0].trackId) as { cover_art_path: string | null } | undefined;
  if (firstTrack?.cover_art_path) {
    db.prepare('UPDATE playlists SET cover_path = ? WHERE id = ?').run(
      firstTrack.cover_art_path,
      playlistId,
    );
  }
}

export function scheduleImportedTrackLoudness(
  db: ReturnType<typeof getDb>,
  imported: ImportedPlaylistTrack[],
): void {
  const trackIds = imported.map((entry) => entry.trackId);
  if (trackIds.length === 0) {
    return;
  }

  void (async () => {
    const ffmpegPath = await getFfmpegPathAsync();
    if (!ffmpegPath) {
      return;
    }

    await analyzeLoudnessBatch(trackIds, ffmpegPath, db);
  })();
}
