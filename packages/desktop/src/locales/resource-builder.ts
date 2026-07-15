import type { LocaleResourceObject } from '@ton/core';

export function buildDesktopNamespaces(
  sidebar: LocaleResourceObject,
  nowPlayingBar: LocaleResourceObject,
  playbackControls: LocaleResourceObject,
  volumeSlider: LocaleResourceObject,
  queuePanel: LocaleResourceObject,
  home: LocaleResourceObject,
  search: LocaleResourceObject,
  library: LocaleResourceObject,
  downloads: LocaleResourceObject,
  settings: LocaleResourceObject,
  artists: LocaleResourceObject,
  playlist: LocaleResourceObject,
  artist: LocaleResourceObject,
) {
  return {
    'components/layout/sidebar': sidebar,
    'components/layout/now-playing-bar': nowPlayingBar,
    'components/player/playback-controls': playbackControls,
    'components/player/volume-slider': volumeSlider,
    'components/player/queue-panel': queuePanel,
    'pages/home': home,
    'pages/search': search,
    'pages/library': library,
    'pages/downloads': downloads,
    'pages/settings': settings,
    'pages/artists': artists,
    'pages/playlist': playlist,
    'pages/artist': artist,
  };
}
