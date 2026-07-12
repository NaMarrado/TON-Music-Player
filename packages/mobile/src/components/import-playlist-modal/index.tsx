import { Modal, Pressable, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ModalActions } from './modal-actions';
import { useImportPlaylistModal } from './use-import-playlist-modal';
import type { ImportPlaylistModalProps } from './types';

export function ImportPlaylistModal({ visible, onClose }: ImportPlaylistModalProps) {
  const { t } = useTranslation('downloads');
  const {
    handleClose,
    handleImport,
    importing,
    setUrl,
    url,
  } = useImportPlaylistModal({ onClose, t });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={handleClose}>
        <Pressable className="bg-bg-surface rounded-2xl p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-bold mb-1">{t('importPlaylist')}</Text>

          <TextInput
            value={url}
            onChangeText={setUrl}
            className="bg-bg-elevated text-text-primary rounded-lg px-3 py-2.5 text-sm mt-3 mb-4"
            placeholderTextColor="#555"
            placeholder="https://..."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!importing}
          />

          <ModalActions
            importing={importing}
            isValid={Boolean(url.trim())}
            t={t}
            onClose={handleClose}
            onImport={() => {
              void handleImport();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
