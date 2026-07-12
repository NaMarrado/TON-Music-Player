/**
 * Syncs playback state to the Media Session API so OS media controls
 * (keyboard media keys, system overlay) control our player.
 *
 * Position state is updated from the playback service (not here)
 * to avoid 60fps re-renders of the host component.
 */

import { useEffect } from 'react';
import { usePlaybackStore } from '../stores/playback-store';
import { toggle, nextTrack, prevTrack, seek } from '../audio/playback-service';

export function useMediaSession(): void {
  const track = usePlaybackStore((s) => s.currentTrack);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  // Set action handlers once
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const session = navigator.mediaSession;
    session.setActionHandler('play', () => toggle());
    session.setActionHandler('pause', () => toggle());
    session.setActionHandler('previoustrack', () => prevTrack());
    session.setActionHandler('nexttrack', () => nextTrack());
    session.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) seek(details.seekTime);
    });

    return () => {
      session.setActionHandler('play', null);
      session.setActionHandler('pause', null);
      session.setActionHandler('previoustrack', null);
      session.setActionHandler('nexttrack', null);
      session.setActionHandler('seekto', null);
    };
  }, []);

  // Update metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;

    let blobUrl: string | null = null;

    const update = async () => {
      let artwork: MediaImage[] = [];

      if (track.cover_art_path) {
        try {
          const resp = await fetch(`ton-media://${encodeURIComponent(track.cover_art_path)}`);
          const blob = await resp.blob();
          blobUrl = URL.createObjectURL(blob);
          artwork = [{ src: blobUrl }];
        } catch { /* artwork unavailable */ }
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title ?? 'Unknown',
        artist: track.artist ?? undefined,
        album: track.album ?? undefined,
        artwork,
      });
    };

    update();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [track]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);
}
