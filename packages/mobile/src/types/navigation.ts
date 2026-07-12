import type { NavigatorScreenParams } from '@react-navigation/native';

// Shared screen params used across multiple stacks
export type PlaylistParams = { id: number };
export type AlbumParams = { name: string; artist?: string };
export type ArtistParams = { name: string };

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  NowPlaying: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  SearchTab: NavigatorScreenParams<SearchStackParamList>;
  LibraryTab: NavigatorScreenParams<LibraryStackParamList>;
  DownloadsTab: NavigatorScreenParams<DownloadsStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

export type HomeStackParamList = {
  Home: undefined;
  Playlist: PlaylistParams;
  Album: AlbumParams;
  Artist: ArtistParams;
};

export type SearchStackParamList = {
  Search: undefined;
  Album: AlbumParams;
  Artist: ArtistParams;
};

export type LibraryStackParamList = {
  Library: undefined;
  Playlist: PlaylistParams;
  Album: AlbumParams;
  Artist: ArtistParams;
};

export type DownloadsStackParamList = {
  Downloads: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
