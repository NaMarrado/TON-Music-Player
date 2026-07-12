import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { primePlaybackState } from './audio/playback-service';
import { router } from './router';

export function App() {
  useEffect(() => {
    primePlaybackState();
  }, []);

  return <RouterProvider router={router} />;
}
