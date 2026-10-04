import os from 'node:os';
import type Database from 'better-sqlite3';
import { buildProfileBundle, starIdentity, type ExportPlaylistEntry, type ProfileBundle } from '@ton/core';
import { readDesktopProfileRecords } from '../listening-profile/store';

export interface CollectedProfile {
  bundle: ProfileBundle;
  /** Starred songs that have no hash and so cannot be recognised on another device. */
  unidentifiedStars: number;
  /** Songs in playlists that have no hash and were left out of the playlist. */
  unidentifiedPlaylistTracks: number;
}

interface TrackIdentityRow {
  id: number;
  content_hash_sha256: string | null;
  file_hash: string | null;
}

interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  is_smart: number;
  smart_rules: string | null;
}

function rows<T>(db: Database.Database, sql: string): T[] {
  const found: unknown = db.prepare(sql).all();
  // The columns are the ones the statement selects, so the shape is fixed by the statement itself.
  return found as T[];
}

/** Reads the settings, stars, playlists and listening history of this device. Secrets are filtered by the shared builder. */
export function collectDesktopProfile(db: Database.Database, options: { deviceName?: string; now?: number } = {}): CollectedProfile {
  const settings: Record<string, string> = {};
  for (const row of rows<{ key: string; value: string | null }>(db, 'SELECT key, value FROM settings')) if (row.value !== null) settings[row.key] = row.value;

  const identityByTrackId: Record<number, string | null> = {};
  for (const track of rows<TrackIdentityRow>(db, 'SELECT id, content_hash_sha256, file_hash FROM tracks')) identityByTrackId[track.id] = starIdentity(track);

  const starred: string[] = [];
  let unidentifiedStars = 0;
  for (const track of rows<{ id: number }>(db, 'SELECT id FROM tracks WHERE COALESCE(rating, 0) > 0')) {
    const identity = identityByTrackId[track.id];
    if (identity) starred.push(identity);
    else unidentifiedStars += 1;
  }

  const members = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, id');
  let unidentifiedPlaylistTracks = 0;
  const playlists: ExportPlaylistEntry[] = rows<PlaylistRow>(db, 'SELECT id, name, description, is_smart, smart_rules FROM playlists ORDER BY sort_order, id').map((playlist) => {
    const hashes: string[] = [];
    const trackRows: unknown = members.all(playlist.id);
    for (const member of trackRows as Array<{ track_id: number }>) {
      const identity = identityByTrackId[member.track_id];
      if (identity) hashes.push(identity);
      else unidentifiedPlaylistTracks += 1;
    }
    return { name: playlist.name, description: playlist.description, is_smart: playlist.is_smart === 1, smart_rules: playlist.smart_rules, track_hashes: hashes };
  });

  const bundle = buildProfileBundle({
    deviceName: options.deviceName ?? os.hostname(),
    platform: 'desktop',
    settings,
    starred,
    playlists,
    listening: readDesktopProfileRecords(db),
  }, options.now);
  return { bundle, unidentifiedStars, unidentifiedPlaylistTracks };
}
