import sidebarFr from './fr/components/layout/sidebar.json';
import nowPlayingBarFr from './fr/components/layout/now-playing-bar.json';
import playbackControlsFr from './fr/components/player/playback-controls.json';
import volumeSliderFr from './fr/components/player/volume-slider.json';
import queuePanelFr from './fr/components/player/queue-panel.json';
import homeFr from './fr/pages/home.json';
import searchFr from './fr/pages/search.json';
import libraryFr from './fr/pages/library.json';
import downloadsFr from './fr/pages/downloads.json';
import settingsFr from './fr/pages/settings.json';
import artistsFr from './fr/pages/artists.json';
import playlistFr from './fr/pages/playlist.json';
import artistFr from './fr/pages/artist.json';
import sidebarPt from './pt/components/layout/sidebar.json';
import nowPlayingBarPt from './pt/components/layout/now-playing-bar.json';
import playbackControlsPt from './pt/components/player/playback-controls.json';
import volumeSliderPt from './pt/components/player/volume-slider.json';
import queuePanelPt from './pt/components/player/queue-panel.json';
import homePt from './pt/pages/home.json';
import searchPt from './pt/pages/search.json';
import libraryPt from './pt/pages/library.json';
import downloadsPt from './pt/pages/downloads.json';
import settingsPt from './pt/pages/settings.json';
import artistsPt from './pt/pages/artists.json';
import playlistPt from './pt/pages/playlist.json';
import artistPt from './pt/pages/artist.json';
import sidebarIt from './it/components/layout/sidebar.json';
import nowPlayingBarIt from './it/components/layout/now-playing-bar.json';
import playbackControlsIt from './it/components/player/playback-controls.json';
import volumeSliderIt from './it/components/player/volume-slider.json';
import queuePanelIt from './it/components/player/queue-panel.json';
import homeIt from './it/pages/home.json';
import searchIt from './it/pages/search.json';
import libraryIt from './it/pages/library.json';
import downloadsIt from './it/pages/downloads.json';
import settingsIt from './it/pages/settings.json';
import artistsIt from './it/pages/artists.json';
import playlistIt from './it/pages/playlist.json';
import artistIt from './it/pages/artist.json';
import sidebarPl from './pl/components/layout/sidebar.json';
import nowPlayingBarPl from './pl/components/layout/now-playing-bar.json';
import playbackControlsPl from './pl/components/player/playback-controls.json';
import volumeSliderPl from './pl/components/player/volume-slider.json';
import queuePanelPl from './pl/components/player/queue-panel.json';
import homePl from './pl/pages/home.json';
import searchPl from './pl/pages/search.json';
import libraryPl from './pl/pages/library.json';
import downloadsPl from './pl/pages/downloads.json';
import settingsPl from './pl/pages/settings.json';
import artistsPl from './pl/pages/artists.json';
import playlistPl from './pl/pages/playlist.json';
import artistPl from './pl/pages/artist.json';
import { buildDesktopNamespaces as namespaces } from './resource-builder';
import type { DesktopResourceGroup } from './resource-types';

export const europeanDesktopResources = {
  fr: namespaces(sidebarFr, nowPlayingBarFr, playbackControlsFr, volumeSliderFr, queuePanelFr, homeFr, searchFr, libraryFr, downloadsFr, settingsFr, artistsFr, playlistFr, artistFr),
  pt: namespaces(sidebarPt, nowPlayingBarPt, playbackControlsPt, volumeSliderPt, queuePanelPt, homePt, searchPt, libraryPt, downloadsPt, settingsPt, artistsPt, playlistPt, artistPt),
  it: namespaces(sidebarIt, nowPlayingBarIt, playbackControlsIt, volumeSliderIt, queuePanelIt, homeIt, searchIt, libraryIt, downloadsIt, settingsIt, artistsIt, playlistIt, artistIt),
  pl: namespaces(sidebarPl, nowPlayingBarPl, playbackControlsPl, volumeSliderPl, queuePanelPl, homePl, searchPl, libraryPl, downloadsPl, settingsPl, artistsPl, playlistPl, artistPl),
} satisfies DesktopResourceGroup;
