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
import { schedulePlaybackQueueSourceReconcile } from '../services/playback-bridge/queue-source-reconcile';
import { useLibraryStore } from '../stores/library-store';
import { usePlaylistStore } from '../stores/playlist-store';

const QUEUE_EVENTS = [
  PlaybackEvent.PlaybackActiveTrackChanged,
  PlaybackEvent.PlaybackQueueEnded,
  PlaybackEvent.PlaybackError,
  PlaybackEvent.PlaybackState,
] as const;

type UsePlaybackSyncOptions = {
  enabled: boolean;
};

export function usePlaybackSync({ enabled }: UsePlaybackSyncOptions): void {
  const lastActiveIndexRef = useRef<number | null>(null);
  const lastActiveTrackIdRef = useRef<string | number | null>(null);
  const lastPlaybackStateRef = useRef<PlaybackRuntimeStateSnapshot['state'] | null>(null);

  usePlaybackRuntimeEvents(
    [...QUEUE_EVENTS],
    (event) => {
      if (!enabled) {
        return;
      }

      switch (event.type) {
        case PlaybackEvent.PlaybackActiveTrackChanged:
          if ('index' in event || 'track' in event) {
            void syncActiveTrack({
              index: 'index' in event ? event.index : undefined,
              track: 'track' in event ? event.track : undefined,
            });
          }
          break;
        case PlaybackEvent.PlaybackQueueEnded:
          void handleQueueEnded();
          break;
        case PlaybackEvent.PlaybackError:
          console.error('[RNTP] Playback error:', 'message' in event ? event.message : undefined);
          break;
        case PlaybackEvent.PlaybackState:
          if ('state' in event) {
            syncPlaybackState(event);
          }
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
        const [activeIndex, activeTrack] = await Promise.all([
          getActivePlaybackTrackIndex(),
          getActivePlaybackTrack(),
        ]);

        if (activeIndex != null) {
          const activeTrackId = activeTrack?.id ?? null;
          if (
            activeIndex !== lastActiveIndexRef.current
            || activeTrackId !== lastActiveTrackIdRef.current
          ) {
            lastActiveIndexRef.current = activeIndex;
            lastActiveTrackIdRef.current = activeTrackId;
            await syncActiveTrack({ index: activeIndex, track: activeTrack });
          }
        } else {
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
    }, 1_500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribeLibrary = useLibraryStore.subscribe(schedulePlaybackQueueSourceReconcile);
    const unsubscribePlaylists = usePlaylistStore.subscribe(schedulePlaybackQueueSourceReconcile);
    return () => {
      unsubscribeLibrary();
      unsubscribePlaylists();
    };
  }, [enabled]);
}
