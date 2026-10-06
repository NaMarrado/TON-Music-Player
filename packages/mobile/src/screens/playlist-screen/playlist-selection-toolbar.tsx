import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';

export function PlaylistSelectionToolbar({
  selectedCountLabel,
  onPlaySelection,
  onEditSelectionInStudio,
  editInStudioLabel,
  onRemoveSelection,
  onClearSelection,
}: {
  selectedCountLabel: string;
  onPlaySelection: () => void;
  /** Present only when exactly one song is selected. */
  onEditSelectionInStudio?: () => void;
  editInStudioLabel: string;
  onRemoveSelection: () => void;
  onClearSelection: () => void;
}) {
  const topPadding = useScreenTopPadding(8);

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-1"
      style={{ paddingTop: topPadding }}
    >
      <Text className="text-white text-xl font-bold">
        {selectedCountLabel}
      </Text>
      <View className="flex-row items-center">
        <Pressable onPress={onPlaySelection} hitSlop={8} className="ml-4">
          <Feather name="play" size={20} color="#e8e8e8" />
        </Pressable>
        {onEditSelectionInStudio && (
          <Pressable onPress={onEditSelectionInStudio} hitSlop={8} className="ml-4" accessibilityRole="button" accessibilityLabel={editInStudioLabel}>
            <Feather name="scissors" size={20} color="#e8e8e8" />
          </Pressable>
        )}
        <Pressable onPress={onRemoveSelection} hitSlop={8} className="ml-4">
          <Feather name="trash-2" size={20} color="#ef4444" />
        </Pressable>
        <Pressable onPress={onClearSelection} hitSlop={8} className="ml-4">
          <Feather name="x" size={20} color="#e8e8e8" />
        </Pressable>
      </View>
    </View>
  );
}
