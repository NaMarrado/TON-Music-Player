import sidebarEn from './en/components/layout/sidebar.json';
import nowPlayingBarEn from './en/components/layout/now-playing-bar.json';
import playbackControlsEn from './en/components/player/playback-controls.json';
import volumeSliderEn from './en/components/player/volume-slider.json';
import queuePanelEn from './en/components/player/queue-panel.json';
import homeEn from './en/pages/home.json';
import searchEn from './en/pages/search.json';
import libraryEn from './en/pages/library.json';
import downloadsEn from './en/pages/downloads.json';
import settingsEn from './en/pages/settings.json';
import artistsEn from './en/pages/artists.json';
import playlistEn from './en/pages/playlist.json';
import artistEn from './en/pages/artist.json';
import sidebarCs from './cs/components/layout/sidebar.json';
import nowPlayingBarCs from './cs/components/layout/now-playing-bar.json';
import playbackControlsCs from './cs/components/player/playback-controls.json';
import volumeSliderCs from './cs/components/player/volume-slider.json';
import queuePanelCs from './cs/components/player/queue-panel.json';
import homeCs from './cs/pages/home.json';
import searchCs from './cs/pages/search.json';
import libraryCs from './cs/pages/library.json';
import downloadsCs from './cs/pages/downloads.json';
import settingsCs from './cs/pages/settings.json';
import artistsCs from './cs/pages/artists.json';
import playlistCs from './cs/pages/playlist.json';
import artistCs from './cs/pages/artist.json';
import sidebarEs from './es/components/layout/sidebar.json';
import nowPlayingBarEs from './es/components/layout/now-playing-bar.json';
import playbackControlsEs from './es/components/player/playback-controls.json';
import volumeSliderEs from './es/components/player/volume-slider.json';
import queuePanelEs from './es/components/player/queue-panel.json';
import homeEs from './es/pages/home.json';
import searchEs from './es/pages/search.json';
import libraryEs from './es/pages/library.json';
import downloadsEs from './es/pages/downloads.json';
import settingsEs from './es/pages/settings.json';
import artistsEs from './es/pages/artists.json';
import playlistEs from './es/pages/playlist.json';
import artistEs from './es/pages/artist.json';
import sidebarDe from './de/components/layout/sidebar.json';
import nowPlayingBarDe from './de/components/layout/now-playing-bar.json';
import playbackControlsDe from './de/components/player/playback-controls.json';
import volumeSliderDe from './de/components/player/volume-slider.json';
import queuePanelDe from './de/components/player/queue-panel.json';
import homeDe from './de/pages/home.json';
import searchDe from './de/pages/search.json';
import libraryDe from './de/pages/library.json';
import downloadsDe from './de/pages/downloads.json';
import settingsDe from './de/pages/settings.json';
import artistsDe from './de/pages/artists.json';
import playlistDe from './de/pages/playlist.json';
import artistDe from './de/pages/artist.json';
import { buildDesktopNamespaces as namespaces } from './resource-builder';
import type { DesktopResourceGroup } from './resource-types';

export const westernDesktopResources = {
  en: namespaces(sidebarEn, nowPlayingBarEn, playbackControlsEn, volumeSliderEn, queuePanelEn, homeEn, searchEn, libraryEn, downloadsEn, settingsEn, artistsEn, playlistEn, artistEn),
  cs: namespaces(sidebarCs, nowPlayingBarCs, playbackControlsCs, volumeSliderCs, queuePanelCs, homeCs, searchCs, libraryCs, downloadsCs, settingsCs, artistsCs, playlistCs, artistCs),
  es: namespaces(sidebarEs, nowPlayingBarEs, playbackControlsEs, volumeSliderEs, queuePanelEs, homeEs, searchEs, libraryEs, downloadsEs, settingsEs, artistsEs, playlistEs, artistEs),
  de: namespaces(sidebarDe, nowPlayingBarDe, playbackControlsDe, volumeSliderDe, queuePanelDe, homeDe, searchDe, libraryDe, downloadsDe, settingsDe, artistsDe, playlistDe, artistDe),
} satisfies DesktopResourceGroup;
