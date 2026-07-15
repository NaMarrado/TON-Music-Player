import sidebarRu from './ru/components/layout/sidebar.json';
import nowPlayingBarRu from './ru/components/layout/now-playing-bar.json';
import playbackControlsRu from './ru/components/player/playback-controls.json';
import volumeSliderRu from './ru/components/player/volume-slider.json';
import queuePanelRu from './ru/components/player/queue-panel.json';
import homeRu from './ru/pages/home.json';
import searchRu from './ru/pages/search.json';
import libraryRu from './ru/pages/library.json';
import downloadsRu from './ru/pages/downloads.json';
import settingsRu from './ru/pages/settings.json';
import artistsRu from './ru/pages/artists.json';
import playlistRu from './ru/pages/playlist.json';
import artistRu from './ru/pages/artist.json';
import sidebarJa from './ja/components/layout/sidebar.json';
import nowPlayingBarJa from './ja/components/layout/now-playing-bar.json';
import playbackControlsJa from './ja/components/player/playback-controls.json';
import volumeSliderJa from './ja/components/player/volume-slider.json';
import queuePanelJa from './ja/components/player/queue-panel.json';
import homeJa from './ja/pages/home.json';
import searchJa from './ja/pages/search.json';
import libraryJa from './ja/pages/library.json';
import downloadsJa from './ja/pages/downloads.json';
import settingsJa from './ja/pages/settings.json';
import artistsJa from './ja/pages/artists.json';
import playlistJa from './ja/pages/playlist.json';
import artistJa from './ja/pages/artist.json';
import sidebarAr from './ar/components/layout/sidebar.json';
import nowPlayingBarAr from './ar/components/layout/now-playing-bar.json';
import playbackControlsAr from './ar/components/player/playback-controls.json';
import volumeSliderAr from './ar/components/player/volume-slider.json';
import queuePanelAr from './ar/components/player/queue-panel.json';
import homeAr from './ar/pages/home.json';
import searchAr from './ar/pages/search.json';
import libraryAr from './ar/pages/library.json';
import downloadsAr from './ar/pages/downloads.json';
import settingsAr from './ar/pages/settings.json';
import artistsAr from './ar/pages/artists.json';
import playlistAr from './ar/pages/playlist.json';
import artistAr from './ar/pages/artist.json';
import sidebarHe from './he/components/layout/sidebar.json';
import nowPlayingBarHe from './he/components/layout/now-playing-bar.json';
import playbackControlsHe from './he/components/player/playback-controls.json';
import volumeSliderHe from './he/components/player/volume-slider.json';
import queuePanelHe from './he/components/player/queue-panel.json';
import homeHe from './he/pages/home.json';
import searchHe from './he/pages/search.json';
import libraryHe from './he/pages/library.json';
import downloadsHe from './he/pages/downloads.json';
import settingsHe from './he/pages/settings.json';
import artistsHe from './he/pages/artists.json';
import playlistHe from './he/pages/playlist.json';
import artistHe from './he/pages/artist.json';
import sidebarZh from './zh/components/layout/sidebar.json';
import nowPlayingBarZh from './zh/components/layout/now-playing-bar.json';
import playbackControlsZh from './zh/components/player/playback-controls.json';
import volumeSliderZh from './zh/components/player/volume-slider.json';
import queuePanelZh from './zh/components/player/queue-panel.json';
import homeZh from './zh/pages/home.json';
import searchZh from './zh/pages/search.json';
import libraryZh from './zh/pages/library.json';
import downloadsZh from './zh/pages/downloads.json';
import settingsZh from './zh/pages/settings.json';
import artistsZh from './zh/pages/artists.json';
import playlistZh from './zh/pages/playlist.json';
import artistZh from './zh/pages/artist.json';
import { buildDesktopNamespaces as namespaces } from './resource-builder';
import type { DesktopResourceGroup } from './resource-types';

export const globalDesktopResources = {
  ru: namespaces(sidebarRu, nowPlayingBarRu, playbackControlsRu, volumeSliderRu, queuePanelRu, homeRu, searchRu, libraryRu, downloadsRu, settingsRu, artistsRu, playlistRu, artistRu),
  ja: namespaces(sidebarJa, nowPlayingBarJa, playbackControlsJa, volumeSliderJa, queuePanelJa, homeJa, searchJa, libraryJa, downloadsJa, settingsJa, artistsJa, playlistJa, artistJa),
  ar: namespaces(sidebarAr, nowPlayingBarAr, playbackControlsAr, volumeSliderAr, queuePanelAr, homeAr, searchAr, libraryAr, downloadsAr, settingsAr, artistsAr, playlistAr, artistAr),
  he: namespaces(sidebarHe, nowPlayingBarHe, playbackControlsHe, volumeSliderHe, queuePanelHe, homeHe, searchHe, libraryHe, downloadsHe, settingsHe, artistsHe, playlistHe, artistHe),
  zh: namespaces(sidebarZh, nowPlayingBarZh, playbackControlsZh, volumeSliderZh, queuePanelZh, homeZh, searchZh, libraryZh, downloadsZh, settingsZh, artistsZh, playlistZh, artistZh),
} satisfies DesktopResourceGroup;
