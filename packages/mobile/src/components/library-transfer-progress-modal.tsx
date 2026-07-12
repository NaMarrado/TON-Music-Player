import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

type LibraryTransferProgressModalProps = {
  visible: boolean;
  title: string;
  message: string;
  progress: number | null;
  canCancel: boolean;
  cancelLabel: string;
  onCancel: () => void;
};

export function LibraryTransferProgressModal({
  visible,
  title,
  message,
  progress,
  canCancel,
  cancelLabel,
  onCancel,
}: LibraryTransferProgressModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={canCancel ? onCancel : undefined}>
      <View className="flex-1 bg-black/60 justify-center px-6">
        <View className="bg-bg-surface rounded-2xl p-5 gap-4">
          <View className="gap-2">
            <Text className="text-white text-lg font-bold">{title}</Text>
            <Text className="text-text-secondary text-sm">{message}</Text>
          </View>

          <View className="gap-3">
            <ActivityIndicator color="#ffffff" />
            {progress != null ? (
              <View
                className="w-full rounded-full overflow-hidden"
                style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.12)' }}
              >
                <View
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#ffffff',
                  }}
                />
              </View>
            ) : null}
          </View>

          <Pressable
            disabled={!canCancel}
            onPress={onCancel}
            className="py-2.5 rounded-lg bg-bg-elevated items-center"
            style={{ opacity: canCancel ? 1 : 0.5 }}
          >
            <Text className="text-text-secondary text-sm font-semibold">{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
