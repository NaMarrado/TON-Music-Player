import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PlaylistReorderControlsProps {
  isFirst: boolean;
  isLast: boolean;
  moveDownLabel: string;
  moveUpLabel: string;
  onMoveDown: () => void;
  onMoveUp: () => void;
}

export const PlaylistTrackNumber = memo(function PlaylistTrackNumber({
  index,
}: {
  index: number;
}) {
  return (
    <View
      className="mr-3 items-center justify-center rounded-full bg-bg-surface"
      style={{ width: 28, height: 28 }}
    >
      <Text className="text-[11px] font-semibold text-text-secondary">
        {index + 1}
      </Text>
    </View>
  );
});

export const PlaylistReorderControls = memo(function PlaylistReorderControls({
  isFirst,
  isLast,
  moveDownLabel,
  moveUpLabel,
  onMoveDown,
  onMoveUp,
}: PlaylistReorderControlsProps) {
  return (
    <View className="ml-3 flex-row items-center" style={{ gap: 8 }}>
      <Pressable
        accessibilityLabel={moveUpLabel}
        disabled={isFirst}
        hitSlop={8}
        onPress={onMoveUp}
        className="items-center justify-center rounded-full bg-bg-surface"
        style={{ width: 34, height: 34, opacity: isFirst ? 0.35 : 1 }}
      >
        <Feather name="chevron-up" size={19} color="#fff" />
      </Pressable>
      <Pressable
        accessibilityLabel={moveDownLabel}
        disabled={isLast}
        hitSlop={8}
        onPress={onMoveDown}
        className="items-center justify-center rounded-full bg-bg-surface"
        style={{ width: 34, height: 34, opacity: isLast ? 0.35 : 1 }}
      >
        <Feather name="chevron-down" size={19} color="#fff" />
      </Pressable>
    </View>
  );
});
