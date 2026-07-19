import { useCallback, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { PlaylistDuplicateTrack } from '@ton/core';
import {
  usePlaylistStore,
  createPlaylist,
  addTracksToPlaylist,
} from '../stores/playlist-store';
import { showToast } from '../stores/toast-store';
import { PlaylistPickerCreateForm } from './playlist-picker-create-form';
import { PlaylistPickerList } from './playlist-picker-list';

interface Props {
  visible: boolean;
  trackId?: number;
  trackIds?: number[];
  onClose: () => void;
}

export function PlaylistPicker({ visible, trackId, trackIds, onClose }: Props) {
  const { t } = useTranslation('library');
  const insets = useSafeAreaInsets();
  const playlists = usePlaylistStore((s) => s.playlists);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [duplicateState, setDuplicateState] = useState<{
    playlistId: number;
    playlistName: string;
    trackIds: number[];
    duplicates: PlaylistDuplicateTrack[];
    currentIndex: number;
    approved: Set<number>;
    skipped: Set<number>;
    isBulk: boolean;
  } | null>(null);
  const resolvedTrackIds = trackIds?.length
    ? Array.from(new Set(trackIds))
    : trackId != null
      ? [trackId]
      : [];

  const completeAddition = useCallback(async (
    state: NonNullable<typeof duplicateState>,
    approved: Set<number>,
    skipped: Set<number>,
  ) => {
    const result = await addTracksToPlaylist({
      playlistId: state.playlistId,
      trackIds: state.trackIds.filter((id) => !skipped.has(id)),
      allowedDuplicateTrackIds: [...approved],
    });
    if (result.status === 'needs_confirmation') {
      setDuplicateState({ ...state, duplicates: result.duplicates, currentIndex: 0, approved, skipped });
      return;
    }
    setDuplicateState(null);
    showToast(t('addedToPlaylist', { name: state.playlistName }), 'success');
    onClose();
  }, [onClose, t]);

  const handleSelect = useCallback(async (playlistId: number, playlistName: string) => {
    if (resolvedTrackIds.length === 0) {
      return;
    }

    const result = await addTracksToPlaylist({ playlistId, trackIds: resolvedTrackIds });
    if (result.status === 'needs_confirmation') {
      setDuplicateState({
        playlistId,
        playlistName,
        trackIds: resolvedTrackIds,
        duplicates: result.duplicates,
        currentIndex: 0,
        approved: new Set(),
        skipped: new Set(),
        isBulk: resolvedTrackIds.length > 1,
      });
      return;
    }
    showToast(t('addedToPlaylist', { name: playlistName }), 'success');
    onClose();
  }, [resolvedTrackIds, t, onClose]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || resolvedTrackIds.length === 0) return;
    const playlist = await createPlaylist(name);
    await addTracksToPlaylist({ playlistId: playlist.id, trackIds: resolvedTrackIds });
    showToast(t('addedToPlaylist', { name }), 'success');
    setNewName('');
    setShowCreate(false);
    onClose();
  }, [newName, resolvedTrackIds, t, onClose]);

  const handleClose = useCallback(() => {
    setDuplicateState(null);
    setShowCreate(false);
    setNewName('');
    onClose();
  }, [onClose]);

  const resolveDuplicate = useCallback((mode: 'add' | 'skip' | 'all') => {
    if (!duplicateState) return;
    const approved = new Set(duplicateState.approved);
    const skipped = new Set(duplicateState.skipped);
    const current = duplicateState.duplicates[duplicateState.currentIndex];
    if (mode === 'add' || mode === 'all') approved.add(current.trackId);
    else skipped.add(current.trackId);
    if (mode === 'all') {
      for (const duplicate of duplicateState.duplicates.slice(duplicateState.currentIndex + 1)) {
        approved.add(duplicate.trackId);
      }
      void completeAddition(duplicateState, approved, skipped);
      return;
    }
    const nextIndex = duplicateState.currentIndex + 1;
    if (nextIndex < duplicateState.duplicates.length) {
      setDuplicateState({ ...duplicateState, currentIndex: nextIndex, approved, skipped });
      return;
    }
    void completeAddition(duplicateState, approved, skipped);
  }, [completeAddition, duplicateState]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={handleClose}>
        <Pressable
          className="bg-bg-surface rounded-t-2xl max-h-[60%]"
          onPress={() => {}}
        >
          <View className="px-5 pt-5 pb-3">
            <Text className="text-white text-lg font-bold">{t('addToPlaylist')}</Text>
          </View>

          {duplicateState ? (
            <View className="px-5 pb-5">
              {duplicateState.isBulk && (
                <Text className="text-red-400 text-xs font-semibold mb-2">
                  {t('duplicatePlaylistProgress', {
                    current: duplicateState.currentIndex + 1,
                    total: duplicateState.duplicates.length,
                  })}
                </Text>
              )}
              <Text className="text-white text-[15px] leading-5">
                {t('duplicatePlaylistMessage', {
                  title: duplicateState.duplicates[duplicateState.currentIndex].title,
                })}
              </Text>
              {duplicateState.duplicates[duplicateState.currentIndex].artist && (
                <Text className="text-text-secondary text-xs mt-1">
                  {duplicateState.duplicates[duplicateState.currentIndex].artist}
                </Text>
              )}
              <View className="flex-row flex-wrap justify-end gap-2 mt-5">
                {!duplicateState.isBulk ? (
                  <>
                    <Pressable onPress={handleClose} className="border border-border rounded-full px-4 py-2.5">
                      <Text className="text-text-secondary text-[13px] font-semibold">{t('cancel')}</Text>
                    </Pressable>
                    <Pressable onPress={() => resolveDuplicate('add')} className="bg-white rounded-full px-4 py-2.5">
                      <Text className="text-black text-[13px] font-semibold">{t('duplicatePlaylistAddAgain')}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={() => resolveDuplicate('skip')} className="border border-border rounded-full px-4 py-2.5">
                      <Text className="text-text-secondary text-[13px] font-semibold">{t('duplicatePlaylistSkip')}</Text>
                    </Pressable>
                    <Pressable onPress={() => resolveDuplicate('add')} className="border border-white rounded-full px-4 py-2.5">
                      <Text className="text-white text-[13px] font-semibold">{t('duplicatePlaylistAddThis')}</Text>
                    </Pressable>
                    <Pressable onPress={() => resolveDuplicate('all')} className="bg-white rounded-full px-4 py-2.5">
                      <Text className="text-black text-[13px] font-semibold">{t('duplicatePlaylistAddAll')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ) : showCreate ? (
            <PlaylistPickerCreateForm
              newName={newName}
              onChangeName={setNewName}
              onCancel={() => { setShowCreate(false); setNewName(''); }}
              onCreate={() => { void handleCreate(); }}
            />
          ) : (
            <PlaylistPickerList
              playlists={playlists}
              onShowCreate={() => setShowCreate(true)}
              onSelect={(playlistId, playlistName) => {
                void handleSelect(playlistId, playlistName);
              }}
              bottomSpacerHeight={Math.max(insets.bottom, 16) + 4}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
