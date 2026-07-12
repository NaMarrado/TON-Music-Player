import { useCallback, useState } from 'react';
import {
  deleteTracksEverywhere,
} from '../../stores/library-store';
import { showToast } from '../../stores/toast-store';
import { getTrackPlaylistReferenceCounts } from '../../services/track-removal';
import type { ActionSheetOption } from '../../components/action-sheet';

type RemovePromptState = {
  trackIds: number[];
  playlistReferenceCounts: Record<number, number>;
};

export function useLibraryRemoveActions(
  selectedTrackIds: number[],
  clearSelection: () => void,
  t: (key: string, vars?: Record<string, unknown>) => string,
) {
  const [removePrompt, setRemovePrompt] = useState<RemovePromptState | null>(null);

  const removeSelectedTracks = useCallback(async (trackIds: number[]) => {
    await deleteTracksEverywhere(trackIds);
  }, []);

  const handleRemoveSelection = useCallback(async () => {
    if (selectedTrackIds.length === 0) {
      return;
    }

    try {
      const selectedIds = [...selectedTrackIds];
      const playlistReferenceCounts = await getTrackPlaylistReferenceCounts(selectedIds);
      const hasPlaylistReferences = selectedIds.some(
        (trackId) => (playlistReferenceCounts[trackId] ?? 0) > 0,
      );

      if (!hasPlaylistReferences) {
        await removeSelectedTracks(selectedIds);
        showToast(
          selectedIds.length === 1 ? t('trackRemoved') : t('tracksRemoved'),
          'success',
        );
        clearSelection();
        return;
      }

      setRemovePrompt({
        trackIds: selectedIds,
        playlistReferenceCounts,
      });
    } catch {
      showToast(t('removeFailed'), 'error');
    }
  }, [clearSelection, removeSelectedTracks, selectedTrackIds, t]);

  const dismissRemovePrompt = useCallback(() => {
    setRemovePrompt(null);
  }, []);

  const completePromptRemoval = useCallback(async () => {
    if (!removePrompt) {
      return;
    }

    const { trackIds } = removePrompt;

    try {
      await removeSelectedTracks(trackIds);
      showToast(
        trackIds.length === 1 ? t('trackRemoved') : t('tracksRemoved'),
        'success',
      );
      clearSelection();
      setRemovePrompt(null);
    } catch {
      showToast(t('removeFailed'), 'error');
    }
  }, [clearSelection, removePrompt, removeSelectedTracks, t]);

  const removePromptOptions: ActionSheetOption[] = removePrompt ? [
    {
      label: t('deleteEverywhere'),
      icon: 'trash-2',
      destructive: true,
      onPress: () => {
        void completePromptRemoval();
      },
    },
  ] : [];

  return {
    dismissRemovePrompt,
    handleRemoveSelection,
    removePromptDescription: removePrompt
      ? t('removePromptMessage', { count: removePrompt.trackIds.length })
      : undefined,
    removePromptOptions,
    removePromptTitle: removePrompt
      ? t('removePromptTitle', { count: removePrompt.trackIds.length })
      : undefined,
    removePromptVisible: removePrompt !== null,
  };
}
