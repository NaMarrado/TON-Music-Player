import type { ExportManifest } from '../types/export';

/**
 * The part of a bundle the user ticked in the playlist import: only the chosen playlists (by their position in the file)
 * and only the songs they use. Everything else in the file is left out of the import.
 */
export function narrowManifestToPlaylists(manifest: ExportManifest, playlistIndexes: number[]): ExportManifest {
  const chosen = new Set(playlistIndexes);
  const playlists = manifest.playlists.filter((_playlist, index) => chosen.has(index));
  const used = new Set(playlists.flatMap((playlist) => playlist.track_hashes));
  const tracks = manifest.tracks.filter((track) => used.has(track.file_hash));
  return {
    ...manifest,
    playlists,
    tracks,
    track_count: tracks.length,
    playlist_count: playlists.length,
    library_track_hashes: [],
    profile: undefined,
  };
}
