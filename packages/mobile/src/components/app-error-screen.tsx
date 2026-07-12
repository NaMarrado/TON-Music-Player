import { Pressable, Text, View } from 'react-native';

export function AppErrorScreen({
  error,
  retryLabel,
  onRetry,
}: {
  error: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <View className="flex-1 bg-bg-deep items-center justify-center px-6">
      <Text className="text-white text-xl font-bold mb-4">TON</Text>
      <Text className="text-red-400 text-center text-sm mb-6">{error}</Text>
      <Pressable
        onPress={onRetry}
        className="px-6 py-3 rounded-lg bg-bg-elevated border border-border"
      >
        <Text className="text-white text-sm font-medium">{retryLabel}</Text>
      </Pressable>
    </View>
  );
}
