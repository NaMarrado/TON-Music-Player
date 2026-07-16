import type { PlaybackQueueSourceDescriptor, Track } from '@ton/core';
import { useTranslation } from 'react-i18next';
import { useLibraryPlaybackActions } from './use-library-playback-actions';
import { useLibraryPlaylistActions } from './use-library-playlist-actions';
import { useLibraryRemoveActions } from './use-library-remove-actions';
import { useLibrarySelectionState } from './use-library-selection-state';

export function useLibrarySelection(
  displayTracks: Track[],
  queueSource: PlaybackQueueSourceDescriptor,
) {
  const { t } = useTranslation('library');
  const selectionState = useLibrarySelectionState(displayTracks);
  const playbackActions = useLibraryPlaybackActions(
    displayTracks,
    selectionState.selectedTracks,
    selectionState.clearSelection,
    queueSource,
  );
  const playlistActions = useLibraryPlaylistActions(
    selectionState.selectedTrackIds,
    selectionState.setPlaylistPickerTrackIds,
  );
  const removeActions = useLibraryRemoveActions(
    selectionState.selectedTrackIds,
    selectionState.clearSelection,
    t,
  );

  return {
    clearSelection: selectionState.clearSelection,
    dismissRemovePrompt: removeActions.dismissRemovePrompt,
    handleAddSelectionToPlaylist: playlistActions.handleAddSelectionToPlaylist,
    handlePlaySelection: playbackActions.handlePlaySelection,
    handleRemoveSelection: removeActions.handleRemoveSelection,
    handleTrackLongPress: (track: Track) => {
      playbackActions.handleTrackLongPress(track, selectionState.toggleSelection);
    },
    handleTrackPress: (track: Track) => {
      playbackActions.handleTrackPress(track, selectionState.selectionActive, selectionState.toggleSelection);
    },
    playlistPickerTrackIds: selectionState.playlistPickerTrackIds,
    removePromptDescription: removeActions.removePromptDescription,
    removePromptOptions: removeActions.removePromptOptions,
    removePromptTitle: removeActions.removePromptTitle,
    removePromptVisible: removeActions.removePromptVisible,
    selectedTrackIds: selectionState.selectedTrackIds,
    selectedTrackIdSet: selectionState.selectedTrackIdSet,
    selectionRevision: selectionState.selectionRevision,
    selectedTracks: selectionState.selectedTracks,
    selectionActive: selectionState.selectionActive,
    setPlaylistPickerTrackIds: selectionState.setPlaylistPickerTrackIds,
  };
}
