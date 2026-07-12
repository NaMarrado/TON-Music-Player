import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type SearchLoadMoreFooterProps = {
  disabled: boolean;
  label: string;
  loading: boolean;
  loadingLabel: string;
  onPress: () => void;
  visible: boolean;
};

export function SearchLoadMoreFooter({
  disabled,
  label,
  loading,
  loadingLabel,
  onPress,
  visible,
}: SearchLoadMoreFooterProps) {
  if (!visible) {
    return null;
  }

  return (
    <View className="px-4 pt-2 pb-6">
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        className="border border-border bg-bg-elevated"
        style={{
          borderRadius: 999,
          opacity: disabled || loading ? 0.6 : 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <View className="flex-row items-center justify-center gap-2">
          {loading && <ActivityIndicator color="#e8e8e8" size="small" />}
          <Text className="text-text-primary text-[13px] font-semibold">
            {loading ? loadingLabel : label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
