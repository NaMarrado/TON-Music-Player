import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export interface ActionSheetOption {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  description?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, description, options, onClose }: ActionSheetProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        <View className="mt-auto" onStartShouldSetResponder={() => true}>
          <View className="bg-bg-surface rounded-t-2xl pt-2" style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
            <View className="w-10 h-1 bg-bg-elevated rounded-full self-center mb-3" />
            {title && (
              <Text className="text-text-primary text-base font-semibold px-5 pb-2" numberOfLines={1}>
                {title}
              </Text>
            )}
            {description && (
              <Text className="text-text-secondary text-sm leading-5 px-5 pb-3">
                {description}
              </Text>
            )}
            {options.map((opt, i) => (
              <Pressable
                key={i}
                onPress={opt.disabled ? undefined : () => {
                  onClose();
                  opt.onPress();
                }}
                disabled={opt.disabled}
                className="flex-row items-center px-5 py-3"
                android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                style={{ opacity: opt.disabled ? 0.45 : 1 }}
              >
                <Feather
                  name={opt.icon}
                  size={20}
                  color={opt.disabled ? '#666666' : opt.destructive ? '#ef4444' : '#e8e8e8'}
                />
                <Text
                  className={`ml-3 text-base ${opt.disabled ? 'text-text-muted' : opt.destructive ? 'text-red-500' : 'text-text-primary'}`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={onClose}
              className="flex-row items-center px-5 py-3 mt-1 border-t border-border"
            >
              <Feather name="x" size={20} color="#888" />
              <Text className="ml-3 text-base text-text-secondary">{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
