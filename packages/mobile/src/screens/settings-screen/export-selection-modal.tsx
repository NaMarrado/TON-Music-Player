import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryExportSelection } from '../../services/library-transfer';

type PlaylistOption = {
  id: number;
  name: string;
};

export function ExportSelectionModal({
  visible,
  playlists,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  playlists: PlaylistOption[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (selection: LibraryExportSelection) => void;
}) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [includeLibrary, setIncludeLibrary] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setIncludeLibrary(false);
    setSelectedPlaylistIds([]);
  }, [playlists, visible]);

  const canConfirm = includeLibrary || selectedPlaylistIds.length > 0;
  const selectedPlaylistIdsSet = useMemo(() => new Set(selectedPlaylistIds), [selectedPlaylistIds]);

  const togglePlaylist = (playlistId: number) => {
    setSelectedPlaylistIds((current) => (
      current.includes(playlistId)
        ? current.filter((value) => value !== playlistId)
        : [...current, playlistId]
    ));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onClose}
    >
      <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={busy ? undefined : onClose}>
        <Pressable className="bg-bg-surface rounded-2xl p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-bold mb-4">{t('exportPickerTitle')}</Text>

          <Pressable
            onPress={() => setIncludeLibrary((value) => !value)}
            disabled={busy}
            className="flex-row items-center py-3"
          >
            <Feather
              name={includeLibrary ? 'check-square' : 'square'}
              size={18}
              color={includeLibrary ? '#ffffff' : '#888888'}
            />
            <Text className="text-text-primary text-sm font-medium ml-3">
              {t('exportPickerLibrary')}
            </Text>
          </Pressable>

          <ScrollView
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {playlists.map((playlist) => (
              <Pressable
                key={playlist.id}
                onPress={() => togglePlaylist(playlist.id)}
                disabled={busy}
                className="flex-row items-center py-3"
              >
                <Feather
                  name={selectedPlaylistIdsSet.has(playlist.id) ? 'check-square' : 'square'}
                  size={18}
                  color={selectedPlaylistIdsSet.has(playlist.id) ? '#ffffff' : '#888888'}
                />
                <Text className="text-text-primary text-sm font-medium ml-3" numberOfLines={1}>
                  {playlist.name}
                </Text>
              </Pressable>
            ))}

            {playlists.length === 0 ? (
              <Text className="text-text-secondary text-sm py-3">
                {t('exportPickerNoPlaylists')}
              </Text>
            ) : null}
          </ScrollView>

          <View className="flex-row gap-3 pt-2">
            <Pressable
              onPress={onClose}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg bg-bg-elevated items-center"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <Text className="text-text-secondary text-sm font-semibold">{tc('cancel')}</Text>
            </Pressable>

            <Pressable
              onPress={() => onConfirm({ includeLibrary, playlistIds: selectedPlaylistIds })}
              disabled={busy || !canConfirm}
              className="flex-1 py-2.5 rounded-lg bg-white items-center"
              style={{ opacity: busy || !canConfirm ? 0.5 : 1 }}
            >
              <Text className="text-black text-sm font-semibold">
                {busy ? t('exportingButton') : t('exportButton')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
