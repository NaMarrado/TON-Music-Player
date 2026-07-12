import { useCallback } from 'react';

export function useLibraryPlaylistActions(
  selectedTrackIds: number[],
  setPlaylistPickerTrackIds: (trackIds: number[] | null) => void,
) {
  const handleAddSelectionToPlaylist = useCallback(() => {
    if (selectedTrackIds.length === 0) {
      return;
    }

    setPlaylistPickerTrackIds(selectedTrackIds);
  }, [selectedTrackIds, setPlaylistPickerTrackIds]);

  return {
    handleAddSelectionToPlaylist,
  };
}
