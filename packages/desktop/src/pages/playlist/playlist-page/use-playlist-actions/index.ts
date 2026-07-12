import { usePlaybackActions } from './use-playback-actions';
import { usePlaylistFileActions } from './use-playlist-file-actions';
import { usePlaylistMutationActions } from './use-playlist-mutation-actions';
import type { UsePlaylistActionsArgs } from './types';

export function usePlaylistActions({
  clearSelection,
  displayTracksRef,
  navigate,
  playlist,
  selectedIds,
  t,
}: UsePlaylistActionsArgs) {
  const playbackActions = usePlaybackActions(displayTracksRef);
  const fileActions = usePlaylistFileActions({ playlist, t });
  const mutationActions = usePlaylistMutationActions({
    clearSelection,
    navigate,
    playlist,
    selectedIds,
    t,
  });

  return {
    ...playbackActions,
    ...fileActions,
    ...mutationActions,
  };
}
