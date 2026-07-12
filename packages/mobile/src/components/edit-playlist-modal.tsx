import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { updatePlaylist } from '../stores/playlist-store';
import { showToast } from '../stores/toast-store';

interface Props {
  visible: boolean;
  playlistId: number;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
}

export function EditPlaylistModal({
  visible,
  playlistId,
  initialName,
  initialDescription,
  onClose,
}: Props) {
  const { t } = useTranslation('playlist');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setDescription(initialDescription);
    }
  }, [visible, initialName, initialDescription]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await updatePlaylist(playlistId, {
      name: trimmed,
      description: description.trim() || null,
    });
    showToast(t('playlistUpdated'), 'success');
    onClose();
  }, [name, description, playlistId, t, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={onClose}>
        <Pressable className="bg-bg-surface rounded-2xl p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-bold mb-4">{t('editPlaylist')}</Text>

          <Text className="text-text-secondary text-xs mb-1">{t('playlistName')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            className="bg-bg-elevated text-text-primary rounded-lg px-3 py-2.5 text-sm mb-3"
            placeholderTextColor="#555"
            placeholder={t('playlistName')}
          />

          <Text className="text-text-secondary text-xs mb-1">{t('playlistDescription')}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            className="bg-bg-elevated text-text-primary rounded-lg px-3 py-2.5 text-sm mb-4"
            placeholderTextColor="#555"
            placeholder={t('playlistDescriptionPlaceholder')}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View className="flex-row gap-3">
            <Pressable
              onPress={onClose}
              className="flex-1 py-2.5 rounded-lg bg-bg-elevated items-center"
            >
              <Text className="text-text-secondary text-sm font-semibold">{tc('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              className="flex-1 py-2.5 rounded-lg bg-white items-center"
              disabled={!name.trim()}
              style={{ opacity: name.trim() ? 1 : 0.5 }}
            >
              <Text className="text-black text-sm font-semibold">{tc('save')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
