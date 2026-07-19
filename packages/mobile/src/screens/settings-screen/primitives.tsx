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

export function SettingsCard({
  attention = false,
  children,
}: {
  attention?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className="bg-bg-surface border rounded-xl p-4"
      style={{
        borderColor: attention ? '#ff3b3b' : '#272727',
        backgroundColor: attention ? '#160b0b' : '#111111',
        shadowColor: attention ? '#ff3b3b' : 'transparent',
        shadowOpacity: attention ? 0.18 : 0,
        shadowRadius: attention ? 12 : 0,
      }}
    >
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
        <View className="flex-1 flex-row items-center pr-3">
          <View className="w-7 h-7 rounded-lg bg-bg-elevated items-center justify-center mr-2.5">
            <Feather name={icon} size={14} color="#888" />
          </View>
          <Text className="flex-1 text-white text-[15px] font-medium">{title}</Text>
        </View>
        {right ? <View className="flex-shrink-0">{right}</View> : null}
      </View>
      {description && (
        <Text className="text-text-secondary text-xs mt-1.5 ml-[38px]">{description}</Text>
      )}
    </View>
  );
}

export function CompactToggle({
  accessibilityLabel,
  disabled = false,
  value,
  onValueChange,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className="items-center justify-center"
      style={{ width: 46, height: 44, opacity: disabled ? 0.45 : 1 }}
    >
      <View
        className="justify-center rounded-full border"
        style={{
          width: 38,
          height: 22,
          borderColor: value ? '#ffffff' : '#4a4a4a',
          backgroundColor: value ? '#ffffff' : '#1a1a1a',
        }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            marginLeft: 2,
            borderRadius: 999,
            backgroundColor: value ? '#000000' : '#888888',
            transform: [{ translateX: value ? 16 : 0 }],
          }}
        />
      </View>
    </Pressable>
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
