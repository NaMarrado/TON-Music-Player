import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { primePlaybackState } from './audio/playback-service';
import { router } from './router';
import { mergeLibraryTrackSummaries, reconcileLibraryTracks } from './stores/library-store';
import {
  mergeCloudTrackBatchIntoCurrentPlaylist,
  reloadPlaylistViews,
} from './stores/playlist-store';

type CloudAppliedPayload = {
  phase?: 'metadata' | 'track-batch';
  trackIds?: number[];
};

export function App() {
  useEffect(() => {
    primePlaybackState();
  }, []);

  useEffect(() => {
    const handleCloudApply = (payload?: unknown) => {
      const event = payload as CloudAppliedPayload | undefined;
      if (event?.phase === 'track-batch' && Array.isArray(event.trackIds)) {
        void Promise.all([
          mergeLibraryTrackSummaries(event.trackIds),
          mergeCloudTrackBatchIntoCurrentPlaylist(event.trackIds),
        ]);
        return;
      }
      void Promise.all([
        reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
        reloadPlaylistViews(),
      ]);
    };
    window.api.on('cloud:applied', handleCloudApply);
    return () => window.api.off('cloud:applied', handleCloudApply);
  }, []);

  return <RouterProvider router={router} />;
}
