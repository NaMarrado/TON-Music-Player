import { usePlaybackActions } from './use-playback-actions';
import { usePlaylistFileActions } from './use-playlist-file-actions';
import { usePlaylistMutationActions } from './use-playlist-mutation-actions';
import type { UsePlaylistActionsArgs } from './types';

export function usePlaylistActions({
  clearSelection,
  playbackTracksRef,
  navigate,
  playlist,
  selectedIds,
  t,
}: UsePlaylistActionsArgs) {
  const playbackActions = usePlaybackActions(playbackTracksRef);
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
