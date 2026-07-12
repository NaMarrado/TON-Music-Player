import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

export function NowPlayingHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Pressable onPress={onBack} hitSlop={12}>
        <Feather name="chevron-down" size={28} color="#e8e8e8" />
      </Pressable>
      <Text
        className="flex-1 text-center text-text-secondary font-semibold"
        style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}
      >
        {title}
      </Text>
      <View style={{ width: 28 }} />
    </View>
  );
}
