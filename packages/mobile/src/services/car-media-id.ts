export type CarPlaybackRequest =
  | { kind: 'library'; trackId: number }
  | { kind: 'playlist'; playlistId: number; playlistTrackId: number };

const LIBRARY_TRACK_PATTERN = /^ton:play:library:(\d+)$/;
const PLAYLIST_TRACK_PATTERN = /^ton:play:playlist:(\d+):(\d+)$/;

export function parseCarPlaybackMediaId(mediaId: string): CarPlaybackRequest | null {
  const libraryMatch = LIBRARY_TRACK_PATTERN.exec(mediaId);
  if (libraryMatch) {
    return { kind: 'library', trackId: Number(libraryMatch[1]) };
  }

  const playlistMatch = PLAYLIST_TRACK_PATTERN.exec(mediaId);
  if (playlistMatch) {
    return {
      kind: 'playlist',
      playlistId: Number(playlistMatch[1]),
      playlistTrackId: Number(playlistMatch[2]),
    };
  }

  return null;
}
