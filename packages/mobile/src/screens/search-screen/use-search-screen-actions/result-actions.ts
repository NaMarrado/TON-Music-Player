import type { SearchResult } from '@ton/core';
import type { ActionSheetOption } from '../../../components/action-sheet';

interface BuildResultActionsArgs {
  handleDownload: (result: SearchResult) => Promise<void>;
  handlePlayLocal: (result: SearchResult) => Promise<void>;
  selectedResult: SearchResult | null;
  setPlaylistPickerTrackId: (value: number | null) => void;
  t: (key: string) => string;
}

export function buildResultActions({
  handleDownload,
  handlePlayLocal,
  selectedResult,
  setPlaylistPickerTrackId,
  t,
}: BuildResultActionsArgs): ActionSheetOption[] {
  if (!selectedResult) {
    return [];
  }

  const isLibraryResult = selectedResult.library_track_id != null;

  return [
    ...(isLibraryResult
      ? [
          {
            label: t('play'),
            icon: 'play' as const,
            onPress: () => {
              void handlePlayLocal(selectedResult);
            },
          },
        ]
      : []),
    ...(!isLibraryResult
      ? [
          {
            label: t('download'),
            icon: 'download' as const,
            onPress: () => {
              void handleDownload(selectedResult);
            },
          },
        ]
      : []),
    ...(isLibraryResult
      ? [
          {
            label: t('addToPlaylist'),
            icon: 'plus-circle' as const,
            onPress: () => {
              setPlaylistPickerTrackId(selectedResult.library_track_id ?? null);
            },
          },
        ]
      : []),
  ];
}
