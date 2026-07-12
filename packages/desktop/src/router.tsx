import { createHashRouter } from 'react-router';
import { MainLayout } from './components/layout/main-layout';
import { HomePage } from './pages/home';
import { SearchPage } from './pages/search';
import { LibraryPage } from './pages/library';
import { ArtistsPage } from './pages/artists';
import { PlaylistPage } from './pages/playlist';
import { ArtistPage } from './pages/artist';
import { DownloadsPage } from './pages/downloads';
import { SettingsPage } from './pages/settings';

export const router = createHashRouter([
  {
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'library/artists', element: <ArtistsPage /> },
      { path: 'playlist/:id', element: <PlaylistPage /> },
      { path: 'artist/:id', element: <ArtistPage /> },
      { path: 'downloads', element: <DownloadsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
