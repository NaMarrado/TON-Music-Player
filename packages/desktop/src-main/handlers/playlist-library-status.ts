import fs from 'fs';
import path from 'path';
import { getDb } from '../services/database';
import { findNonCollidingFileAsync, getLibraryDir } from '../services/library-paths';

function getLibraryFingerprints(db: ReturnType<typeof getDb>): Set<string> {
  const libraryTracks = db
    .prepare('SELECT title, duration_ms FROM tracks WHERE in_library = 1 AND title IS NOT NULL')
    .all() as Array<{ title: string; duration_ms: number | null }>;

  const fingerprints = new Set<string>();
  for (const track of libraryTracks) {
    const key = track.title.toLowerCase();
    const duration = track.duration_ms ?? 0;

    for (let bucket = duration - 3000; bucket <= duration + 3000; bucket += 1000) {
      fingerprints.add(`${key}|${Math.round(bucket / 1000)}`);
    }
  }

  return fingerprints;
}

function trackMatchesLibrary(
  fingerprints: Set<string>,
  title: string | null,
  durationMs: number | null,
): boolean {
  if (!title) return false;

  const key = `${title.toLowerCase()}|${Math.round((durationMs ?? 0) / 1000)}`;
  return fingerprints.has(key);
}

export function getPlaylistLibraryStatus(playlistId: number) {
  const db = getDb();
  const playlistTracks = db
    .prepare(`
      SELECT t.title, t.duration_ms, t.in_library
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
    `)
    .all(playlistId) as Array<{
    title: string | null;
    duration_ms: number | null;
    in_library: number;
  }>;

  const fingerprints = getLibraryFingerprints(db);
  let alreadyInLibrary = 0;

  for (const track of playlistTracks) {
    if (track.in_library || trackMatchesLibrary(fingerprints, track.title, track.duration_ms)) {
      alreadyInLibrary++;
    }
  }

  return {
    total: playlistTracks.length,
    alreadyInLibrary,
    newTracks: playlistTracks.length - alreadyInLibrary,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function addPlaylistTracksToLibrary(playlistId: number, forceAll = false) {
  const db = getDb();
  const libraryDir = getLibraryDir();
  const fingerprints = forceAll ? null : getLibraryFingerprints(db);
  const tracks = db
    .prepare(`
      SELECT t.id, t.file_path, t.in_library, t.title, t.duration_ms
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
    `)
    .all(playlistId) as Array<{
    id: number;
    file_path: string;
    in_library: number;
    title: string | null;
    duration_ms: number | null;
  }>;

  let added = 0;
  let skipped = 0;

  for (const track of tracks) {
    if (track.in_library) {
      skipped++;
      continue;
    }

    if (fingerprints && trackMatchesLibrary(fingerprints, track.title, track.duration_ms)) {
      skipped++;
      continue;
    }

    if (!(await pathExists(track.file_path))) {
      continue;
    }

    const libraryPath = await findNonCollidingFileAsync(libraryDir, path.basename(track.file_path));
    await fs.promises.copyFile(track.file_path, libraryPath);
    db.prepare('UPDATE tracks SET file_path = ?, in_library = 1 WHERE id = ?').run(
      libraryPath,
      track.id,
    );
    added++;
  }

  return { added, skipped };
}
