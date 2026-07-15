import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { primePlaybackState } from './audio/playback-service';
import { router } from './router';
import { reconcileLibraryTracks } from './stores/library-store';
import { reloadPlaylistViews } from './stores/playlist-store';

export function App() {
  useEffect(() => {
    primePlaybackState();
  }, []);

  useEffect(() => {
    const handleCloudApply = () => {
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
