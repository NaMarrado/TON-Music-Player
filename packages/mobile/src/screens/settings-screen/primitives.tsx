import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';

export function SettingsGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center px-4 mb-3">
        <Text className="text-text-secondary text-[10px] uppercase tracking-[2px] font-semibold mr-3">
          {label}
        </Text>
        <View className="flex-1 h-px bg-border" />
      </View>
      <View className="px-4 gap-3">{children}</View>
    </View>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-bg-surface border border-border rounded-xl p-4">
      {children}
    </View>
  );
}

export function SectionHeader({
  icon,
  title,
  description,
  right,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className={description ? 'mb-3' : 'mb-2'}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-7 h-7 rounded-lg bg-bg-elevated items-center justify-center mr-2.5">
            <Feather name={icon} size={14} color="#888" />
          </View>
          <Text className="text-white text-[15px] font-medium">{title}</Text>
        </View>
        {right}
      </View>
      {description && (
        <Text className="text-text-secondary text-xs mt-1.5 ml-[38px]">{description}</Text>
      )}
    </View>
  );
}

export function PillButton({
  label,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="items-center justify-center"
      style={{ minHeight: 44, opacity: disabled ? 0.45 : 1 }}
    >
      <View className={`px-3 py-1 rounded-full border ${
        active ? 'bg-white border-white' : 'bg-transparent border-border'
      }`}>
        <Text className={`text-[11px] font-semibold ${active ? 'text-black' : 'text-text-secondary'}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
