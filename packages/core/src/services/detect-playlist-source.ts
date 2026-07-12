export type PlaylistSource = 'spotify' | 'youtube' | 'soundcloud';

export function parseSpotifyPlaylistUrl(url: string): string | null {
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /spotify:playlist:([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function parseYouTubePlaylistUrl(url: string): string | null {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function parseSoundCloudPlaylistUrl(url: string): string | null {
  const match = url.match(/soundcloud\.com\/[^/]+\/sets\/[^/?]+/);
  return match ? match[0] : null;
}

export function detectPlaylistSource(url: string): { source: PlaylistSource; id: string } | null {
  const spotifyId = parseSpotifyPlaylistUrl(url);
  if (spotifyId) return { source: 'spotify', id: spotifyId };

  const ytListId = parseYouTubePlaylistUrl(url);
  if (ytListId) return { source: 'youtube', id: ytListId };

  const scUrl = parseSoundCloudPlaylistUrl(url);
  if (scUrl) return { source: 'soundcloud', id: scUrl };

  return null;
}
