import { useEffect, useRef } from 'react';
import {
  handleQueueEnded,
  syncActiveTrack,
  syncPlaybackState,
} from '../services/playback-bridge';
import {
  getActivePlaybackTrack,
  getActivePlaybackTrackIndex,
  getPlaybackState,
  PlaybackEvent,
  type PlaybackRuntimeStateSnapshot,
  usePlaybackRuntimeEvents,
} from '../services/playback-runtime';

type UsePlaybackSyncOptions = {
  enabled: boolean;
};

export function usePlaybackSync({ enabled }: UsePlaybackSyncOptions): void {
  const lastActiveIndexRef = useRef<number | null>(null);
  const lastActiveTrackIdRef = useRef<string | number | null>(null);
  const lastPlaybackStateRef = useRef<PlaybackRuntimeStateSnapshot['state'] | null>(null);

  usePlaybackRuntimeEvents(
    [PlaybackEvent.PlaybackQueueEnded, PlaybackEvent.PlaybackError],
    (event) => {
      if (!enabled) {
        return;
      }

      switch (event.type) {
        case PlaybackEvent.PlaybackQueueEnded:
          void handleQueueEnded();
          break;
        case PlaybackEvent.PlaybackError:
          console.error('[RNTP] Playback error:', 'message' in event ? event.message : undefined);
          break;
      }
    },
  );

  useEffect(() => {
    if (!enabled) {
      lastActiveIndexRef.current = null;
      lastActiveTrackIdRef.current = null;
      lastPlaybackStateRef.current = null;
      return;
    }

    let cancelled = false;

    const syncPlayerSnapshot = async (): Promise<void> => {
      try {
        const activeIndex = await getActivePlaybackTrackIndex();

        if (activeIndex != null) {
          if (activeIndex !== lastActiveIndexRef.current) {
            lastActiveIndexRef.current = activeIndex;
            lastActiveTrackIdRef.current = null;
            await syncActiveTrack({ index: activeIndex });
          }
        } else {
          const activeTrack = await getActivePlaybackTrack();
          const activeTrackId = activeTrack?.id ?? null;

          if (activeTrackId != null && activeTrackId !== lastActiveTrackIdRef.current) {
            lastActiveTrackIdRef.current = activeTrackId;
            lastActiveIndexRef.current = null;
            await syncActiveTrack({ track: activeTrack });
          }
        }

        const playbackState = await getPlaybackState();
        if (
          playbackState.state != null
          && playbackState.state !== lastPlaybackStateRef.current
        ) {
          lastPlaybackStateRef.current = playbackState.state;
          syncPlaybackState(playbackState);
        }
      } catch {
        // Ignore transient player readiness errors during startup/background transitions.
      }
    };

    void syncPlayerSnapshot();
    const intervalId = setInterval(() => {
      if (!cancelled) {
        void syncPlayerSnapshot();
      }
    }, 350);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);
}
