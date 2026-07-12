import { View, Text } from 'react-native';

interface SectionLabelProps {
  label: string;
}

export function SectionLabel({ label }: SectionLabelProps) {
  return (
    <View className="flex-row items-center px-4 mt-4 mb-2">
      <Text
        className="text-text-secondary font-semibold mr-3"
        style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}
      >
        {label}
      </Text>
      <View className="flex-1 h-px bg-border" />
    </View>
  );
}
