import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
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
import { useQueueStore } from '../stores/queue-store';

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
  const syncAuthoritativePlaybackState = useCallback(async (): Promise<void> => {
    const expectedGeneration = useQueueStore.getState().generation;
    try {
      const [playbackState, activeTrack] = await Promise.all([
        getPlaybackState(),
        getActivePlaybackTrack(),
      ]);
      if (useQueueStore.getState().generation !== expectedGeneration) return;
      lastPlaybackStateRef.current = playbackState.state;
      syncPlaybackState({ ...playbackState, trackId: activeTrack?.id });
    } catch {
      // A newer native queue snapshot will replace this transient state.
    }
  }, []);

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
            if (event.trackId != null) {
              lastPlaybackStateRef.current = event.state;
              syncPlaybackState(event);
            } else {
              void syncAuthoritativePlaybackState();
            }
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
        const [activeIndex, activeTrack, playbackState] = await Promise.all([
          getActivePlaybackTrackIndex(),
          getActivePlaybackTrack(),
          getPlaybackState(),
        ]);

        if (playbackState.state === 'none'
            || playbackState.state === 'stopped'
            || playbackState.state === 'ended') {
          lastActiveIndexRef.current = null;
          lastActiveTrackIdRef.current = null;
          lastPlaybackStateRef.current = playbackState.state;
          syncPlaybackState(playbackState);
          return;
        }

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
          } else if (activeTrackId == null) {
            lastActiveIndexRef.current = null;
            lastActiveTrackIdRef.current = null;
          }
        }

        if (
          playbackState.state != null
          && playbackState.state !== lastPlaybackStateRef.current
        ) {
          lastPlaybackStateRef.current = playbackState.state;
          syncPlaybackState({ ...playbackState, trackId: activeTrack?.id });
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
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) {
        void syncPlayerSnapshot();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      appStateSubscription.remove();
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
