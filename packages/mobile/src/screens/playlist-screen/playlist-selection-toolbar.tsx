import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';

export function PlaylistSelectionToolbar({
  selectedCountLabel,
  onPlaySelection,
  onAddSelectionToLibrary,
  onRemoveSelection,
  onClearSelection,
}: {
  selectedCountLabel: string;
  onPlaySelection: () => void;
  onAddSelectionToLibrary: () => void;
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
        <Pressable onPress={onAddSelectionToLibrary} hitSlop={8} className="ml-4">
          <Feather name="plus-circle" size={20} color="#e8e8e8" />
        </Pressable>
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
