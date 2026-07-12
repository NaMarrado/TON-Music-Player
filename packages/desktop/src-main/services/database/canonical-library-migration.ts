import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

type TrackRow = {
  id: number;
  file_path: string;
  cover_art_path: string | null;
};

type PlaylistFileRow = {
  track_id: number;
  file_path: string;
};

export function migrateCanonicalLibraryStorage(
  db: Database.Database,
  defaultLibraryDir: string,
): void {
  const version = db.prepare(
    "SELECT value FROM settings WHERE key = 'storage_layout_version'",
  ).get() as { value: string } | undefined;
  if (version?.value === '2') return;

  // Legacy databases may predate the external-content FTS table.
  db.prepare("INSERT INTO tracks_fts(tracks_fts) VALUES ('rebuild')").run();

  const configured = db.prepare(
    "SELECT value FROM settings WHERE key = 'download_directory'",
  ).get() as { value: string } | undefined;
  const libraryDir = configured?.value || defaultLibraryDir;
  const playlistRoot = path.join(libraryDir, 'Playlists');
  fs.mkdirSync(libraryDir, { recursive: true });

  const tracks = db.prepare('SELECT id, file_path, cover_art_path FROM tracks').all() as TrackRow[];
  const playlistFiles = db.prepare(
    'SELECT track_id, file_path FROM playlist_tracks WHERE file_path IS NOT NULL',
  ).all() as PlaylistFileRow[];
  const filesByTrack = new Map<number, string[]>();
  for (const row of playlistFiles) {
    const files = filesByTrack.get(row.track_id) ?? [];
    files.push(row.file_path);
    filesByTrack.set(row.track_id, files);
  }

  const updates: Array<{
    id: number;
    canonicalPath: string;
    coverPath: string | null;
    obsoletePaths: string[];
  }> = [];
  let unresolved = 0;

  for (const track of tracks) {
    const referencedPaths = filesByTrack.get(track.id) ?? [];
    const source = [track.file_path, ...referencedPaths].find(fileExists);
    if (!source) {
      unresolved += 1;
      continue;
    }

    let canonicalPath = track.file_path;
    if (!fileExists(canonicalPath) || isInside(canonicalPath, playlistRoot)) {
      canonicalPath = uniquePath(libraryDir, path.basename(source));
      if (path.resolve(source) !== path.resolve(canonicalPath)) {
        fs.copyFileSync(source, canonicalPath);
      }
    }

    let coverPath = track.cover_art_path;
    if (coverPath && fileExists(coverPath) && isInside(coverPath, playlistRoot)) {
      const artworkDir = path.join(libraryDir, 'Artwork');
      fs.mkdirSync(artworkDir, { recursive: true });
      const nextCoverPath = uniquePath(artworkDir, path.basename(coverPath));
      fs.copyFileSync(coverPath, nextCoverPath);
      coverPath = nextCoverPath;
    }

    updates.push({
      id: track.id,
      canonicalPath,
      coverPath,
      obsoletePaths: [track.file_path, ...referencedPaths].filter(
        (candidate) => path.resolve(candidate) !== path.resolve(canonicalPath),
      ),
    });
  }

  db.transaction(() => {
    const updateTrack = db.prepare(
      'UPDATE tracks SET file_path = ?, cover_art_path = ?, in_library = 1 WHERE id = ?',
    );
    const clearPlaylistPaths = db.prepare(
      'UPDATE playlist_tracks SET file_path = NULL WHERE track_id = ?',
    );
    for (const update of updates) {
      updateTrack.run(update.canonicalPath, update.coverPath, update.id);
      clearPlaylistPaths.run(update.id);
    }
    if (unresolved === 0) {
      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('storage_layout_version', '2')",
      ).run();
    }
  })();

  for (const obsoletePath of new Set(updates.flatMap((update) => update.obsoletePaths))) {
    try {
      fs.unlinkSync(obsoletePath);
    } catch {
      // A missing legacy copy is already clean.
    }
  }
  removeEmptyDirectories(playlistRoot);
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isInside(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function uniquePath(directory: string, baseName: string): string {
  const initial = path.join(directory, baseName);
  if (!fileExists(initial)) return initial;
  const extension = path.extname(baseName);
  const stem = path.basename(baseName, extension);
  let suffix = 2;
  while (fileExists(path.join(directory, `${stem} (${suffix})${extension}`))) suffix += 1;
  return path.join(directory, `${stem} (${suffix})${extension}`);
}

function removeEmptyDirectories(root: string): void {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(root, entry.name));
  }
  try {
    if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  } catch {
    // Playlist covers or unrelated files keep the directory alive.
  }
}
