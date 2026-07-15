import type { LocaleResourceObject, SupportedLanguage } from '@ton/core';
import homeEn from './en/home.json';
import homeCs from './cs/home.json';
import libraryEn from './en/library.json';
import libraryCs from './cs/library.json';
import searchEn from './en/search.json';
import searchCs from './cs/search.json';
import downloadsEn from './en/downloads.json';
import downloadsCs from './cs/downloads.json';
import settingsEn from './en/settings.json';
import settingsCs from './cs/settings.json';
import playlistEn from './en/playlist.json';
import playlistCs from './cs/playlist.json';
import artistEn from './en/artist.json';
import artistCs from './cs/artist.json';
import albumEn from './en/album.json';
import albumCs from './cs/album.json';
import nowPlayingEn from './en/now-playing.json';
import nowPlayingCs from './cs/now-playing.json';
import homeEs from './es/home.json';
import libraryEs from './es/library.json';
import searchEs from './es/search.json';
import downloadsEs from './es/downloads.json';
import settingsEs from './es/settings.json';
import playlistEs from './es/playlist.json';
import artistEs from './es/artist.json';
import albumEs from './es/album.json';
import nowPlayingEs from './es/now-playing.json';
import homeDe from './de/home.json';
import libraryDe from './de/library.json';
import searchDe from './de/search.json';
import downloadsDe from './de/downloads.json';
import settingsDe from './de/settings.json';
import playlistDe from './de/playlist.json';
import artistDe from './de/artist.json';
import albumDe from './de/album.json';
import nowPlayingDe from './de/now-playing.json';
import homeFr from './fr/home.json';
import libraryFr from './fr/library.json';
import searchFr from './fr/search.json';
import downloadsFr from './fr/downloads.json';
import settingsFr from './fr/settings.json';
import playlistFr from './fr/playlist.json';
import artistFr from './fr/artist.json';
import albumFr from './fr/album.json';
import nowPlayingFr from './fr/now-playing.json';
import homePt from './pt/home.json';
import libraryPt from './pt/library.json';
import searchPt from './pt/search.json';
import downloadsPt from './pt/downloads.json';
import settingsPt from './pt/settings.json';
import playlistPt from './pt/playlist.json';
import artistPt from './pt/artist.json';
import albumPt from './pt/album.json';
import nowPlayingPt from './pt/now-playing.json';
import homeIt from './it/home.json';
import libraryIt from './it/library.json';
import searchIt from './it/search.json';
import downloadsIt from './it/downloads.json';
import settingsIt from './it/settings.json';
import playlistIt from './it/playlist.json';
import artistIt from './it/artist.json';
import albumIt from './it/album.json';
import nowPlayingIt from './it/now-playing.json';
import homePl from './pl/home.json';
import libraryPl from './pl/library.json';
import searchPl from './pl/search.json';
import downloadsPl from './pl/downloads.json';
import settingsPl from './pl/settings.json';
import playlistPl from './pl/playlist.json';
import artistPl from './pl/artist.json';
import albumPl from './pl/album.json';
import nowPlayingPl from './pl/now-playing.json';
import homeRu from './ru/home.json';
import libraryRu from './ru/library.json';
import searchRu from './ru/search.json';
import downloadsRu from './ru/downloads.json';
import settingsRu from './ru/settings.json';
import playlistRu from './ru/playlist.json';
import artistRu from './ru/artist.json';
import albumRu from './ru/album.json';
import nowPlayingRu from './ru/now-playing.json';
import homeJa from './ja/home.json';
import libraryJa from './ja/library.json';
import searchJa from './ja/search.json';
import downloadsJa from './ja/downloads.json';
import settingsJa from './ja/settings.json';
import playlistJa from './ja/playlist.json';
import artistJa from './ja/artist.json';
import albumJa from './ja/album.json';
import nowPlayingJa from './ja/now-playing.json';
import homeAr from './ar/home.json';
import libraryAr from './ar/library.json';
import searchAr from './ar/search.json';
import downloadsAr from './ar/downloads.json';
import settingsAr from './ar/settings.json';
import playlistAr from './ar/playlist.json';
import artistAr from './ar/artist.json';
import albumAr from './ar/album.json';
import nowPlayingAr from './ar/now-playing.json';
import homeHe from './he/home.json';
import libraryHe from './he/library.json';
import searchHe from './he/search.json';
import downloadsHe from './he/downloads.json';
import settingsHe from './he/settings.json';
import playlistHe from './he/playlist.json';
import artistHe from './he/artist.json';
import albumHe from './he/album.json';
import nowPlayingHe from './he/now-playing.json';
import homeZh from './zh/home.json';
import libraryZh from './zh/library.json';
import searchZh from './zh/search.json';
import downloadsZh from './zh/downloads.json';
import settingsZh from './zh/settings.json';
import playlistZh from './zh/playlist.json';
import artistZh from './zh/artist.json';
import albumZh from './zh/album.json';
import nowPlayingZh from './zh/now-playing.json';

export const mobileResources: Record<SupportedLanguage, Record<string, LocaleResourceObject>> = {
  en: {
    home: homeEn,
    library: libraryEn,
    search: searchEn,
    downloads: downloadsEn,
    settings: settingsEn,
    playlist: playlistEn,
    artist: artistEn,
    album: albumEn,
    nowPlaying: nowPlayingEn,
  },
  cs: {
    home: homeCs,
    library: libraryCs,
    search: searchCs,
    downloads: downloadsCs,
    settings: settingsCs,
    playlist: playlistCs,
    artist: artistCs,
    album: albumCs,
    nowPlaying: nowPlayingCs,
  },
  es: {
    home: homeEs,
    library: libraryEs,
    search: searchEs,
    downloads: downloadsEs,
    settings: settingsEs,
    playlist: playlistEs,
    artist: artistEs,
    album: albumEs,
    nowPlaying: nowPlayingEs,
  },
  de: {
    home: homeDe,
    library: libraryDe,
    search: searchDe,
    downloads: downloadsDe,
    settings: settingsDe,
    playlist: playlistDe,
    artist: artistDe,
    album: albumDe,
    nowPlaying: nowPlayingDe,
  },
  fr: {
    home: homeFr,
    library: libraryFr,
    search: searchFr,
    downloads: downloadsFr,
    settings: settingsFr,
    playlist: playlistFr,
    artist: artistFr,
    album: albumFr,
    nowPlaying: nowPlayingFr,
  },
  pt: {
    home: homePt,
    library: libraryPt,
    search: searchPt,
    downloads: downloadsPt,
    settings: settingsPt,
    playlist: playlistPt,
    artist: artistPt,
    album: albumPt,
    nowPlaying: nowPlayingPt,
  },
  it: {
    home: homeIt,
    library: libraryIt,
    search: searchIt,
    downloads: downloadsIt,
    settings: settingsIt,
    playlist: playlistIt,
    artist: artistIt,
    album: albumIt,
    nowPlaying: nowPlayingIt,
  },
  pl: {
    home: homePl,
    library: libraryPl,
    search: searchPl,
    downloads: downloadsPl,
    settings: settingsPl,
    playlist: playlistPl,
    artist: artistPl,
    album: albumPl,
    nowPlaying: nowPlayingPl,
  },
  ru: {
    home: homeRu,
    library: libraryRu,
    search: searchRu,
    downloads: downloadsRu,
    settings: settingsRu,
    playlist: playlistRu,
    artist: artistRu,
    album: albumRu,
    nowPlaying: nowPlayingRu,
  },
  ja: {
    home: homeJa,
    library: libraryJa,
    search: searchJa,
    downloads: downloadsJa,
    settings: settingsJa,
    playlist: playlistJa,
    artist: artistJa,
    album: albumJa,
    nowPlaying: nowPlayingJa,
  },
  ar: {
    home: homeAr,
    library: libraryAr,
    search: searchAr,
    downloads: downloadsAr,
    settings: settingsAr,
    playlist: playlistAr,
    artist: artistAr,
    album: albumAr,
    nowPlaying: nowPlayingAr,
  },
  he: {
    home: homeHe,
    library: libraryHe,
    search: searchHe,
    downloads: downloadsHe,
    settings: settingsHe,
    playlist: playlistHe,
    artist: artistHe,
    album: albumHe,
    nowPlaying: nowPlayingHe,
  },
  zh: {
    home: homeZh,
    library: libraryZh,
    search: searchZh,
    downloads: downloadsZh,
    settings: settingsZh,
    playlist: playlistZh,
    artist: artistZh,
    album: albumZh,
    nowPlaying: nowPlayingZh,
  },
};
