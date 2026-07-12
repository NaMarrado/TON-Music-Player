import { useCallback, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
  const resolvedTrackIds = trackIds?.length
    ? Array.from(new Set(trackIds))
    : trackId != null
      ? [trackId]
      : [];

  const handleSelect = useCallback(async (playlistId: number, playlistName: string) => {
    if (resolvedTrackIds.length === 0) {
      return;
    }

    await addTracksToPlaylist(playlistId, resolvedTrackIds);
    showToast(t('addedToPlaylist', { name: playlistName }), 'success');
    onClose();
  }, [resolvedTrackIds, t, onClose]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || resolvedTrackIds.length === 0) return;
    const playlist = await createPlaylist(name);
    await addTracksToPlaylist(playlist.id, resolvedTrackIds);
    showToast(t('addedToPlaylist', { name }), 'success');
    setNewName('');
    setShowCreate(false);
    onClose();
  }, [newName, resolvedTrackIds, t, onClose]);

  const handleClose = useCallback(() => {
    setShowCreate(false);
    setNewName('');
    onClose();
  }, [onClose]);

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

          {showCreate ? (
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
