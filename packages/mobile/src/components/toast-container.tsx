import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useToastStore, dismissToast } from '../stores/toast-store';
import type { ToastType } from '../stores/toast-store';

const ICON_MAP: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const COLOR_MAP: Record<ToastType, string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#e8e8e8',
};

export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <View
      className="absolute left-4 right-4"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <Pressable
          key={toast.id}
          onPress={() => dismissToast(toast.id)}
          className="flex-row items-center bg-bg-surface rounded-lg px-4 py-3 mb-2"
          style={{ elevation: 8 }}
        >
          <Feather
            name={ICON_MAP[toast.type]}
            size={18}
            color={COLOR_MAP[toast.type]}
          />
          <Text className="flex-1 text-text-primary text-sm ml-3" numberOfLines={2}>
            {toast.message}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
