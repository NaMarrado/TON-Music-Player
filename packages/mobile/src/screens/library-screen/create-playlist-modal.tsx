import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

export function CreatePlaylistModal({
  visible,
  title,
  cancelLabel,
  createLabel,
  onClose,
  onCreate,
}: {
  visible: boolean;
  title: string;
  cancelLabel: string;
  createLabel: string;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
}) {
  const [draftName, setDraftName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDraftName('');
      setIsSubmitting(false);
    }
  }, [visible]);

  const trimmedName = draftName.trim();

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    setDraftName('');
    onClose();
  };

  const handleCreate = async () => {
    if (!trimmedName || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate(trimmedName);
      setDraftName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable
        className="flex-1 bg-black/60 justify-center px-8"
        onPress={handleClose}
      >
        <Pressable className="bg-bg-surface rounded-2xl p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-bold mb-4">{title}</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            className="bg-bg-elevated text-text-primary rounded-lg px-3 py-2.5 text-sm mb-4 border border-border"
            placeholderTextColor="#555"
            placeholder={title}
            autoFocus
            editable={!isSubmitting}
            onSubmitEditing={() => {
              void handleCreate();
            }}
          />
          <View className="flex-row gap-3">
            <Pressable
              onPress={handleClose}
              className="flex-1 py-2.5 rounded-lg bg-bg-elevated items-center"
              disabled={isSubmitting}
            >
              <Text className="text-text-secondary text-sm font-semibold">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleCreate();
              }}
              className="flex-1 py-2.5 rounded-lg bg-white items-center"
              disabled={!trimmedName || isSubmitting}
              style={{ opacity: trimmedName && !isSubmitting ? 1 : 0.5 }}
            >
              <Text className="text-black text-sm font-semibold">{createLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
