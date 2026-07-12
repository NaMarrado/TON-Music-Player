import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

type ModalActionsProps = {
  importing: boolean;
  isValid: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onImport: () => void;
};

export function ModalActions({
  importing,
  isValid,
  t,
  onClose,
  onImport,
}: ModalActionsProps) {
  return (
    <View className="flex-row gap-3">
      <Pressable
        onPress={onClose}
        className="flex-1 py-2.5 rounded-lg bg-bg-elevated items-center"
        disabled={importing}
      >
        <Text className="text-text-secondary text-sm font-semibold">{t('cancel')}</Text>
      </Pressable>
      <Pressable
        onPress={onImport}
        className="flex-1 py-2.5 rounded-lg bg-white items-center flex-row justify-center"
        disabled={importing || !isValid}
        style={{ opacity: importing || !isValid ? 0.5 : 1 }}
      >
        {importing ? (
          <ActivityIndicator size="small" color="#050505" />
        ) : (
          <>
            <Feather name="download" size={14} color="#050505" />
            <Text className="text-black text-sm font-semibold ml-1">{t('importButton')}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
