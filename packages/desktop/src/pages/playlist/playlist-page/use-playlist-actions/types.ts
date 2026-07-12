import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import type { TFunction } from 'i18next';
import type { MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router';

export type PlaylistLibraryCounts = {
  total: number;
  alreadyInLibrary: number;
  newTracks: number;
};

export type UsePlaylistActionsArgs = {
  clearSelection: () => void;
  displayTracksRef: MutableRefObject<PlaylistTrackEntry[]>;
  navigate: NavigateFunction;
  playlist: Playlist | null;
  selectedIds: Set<number>;
  t: TFunction<'pages/playlist'>;
};
