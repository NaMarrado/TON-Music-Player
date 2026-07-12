import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { formatTime } from '@ton/core';

type ProgressSectionProps = {
  position: number;
  duration: number;
  onSeekComplete: (value: number) => void;
};

export function ProgressSection({
  position,
  duration,
  onSeekComplete,
}: ProgressSectionProps) {
  return (
    <View className="px-6 mt-5">
      <Slider
        style={{ width: '100%', height: 28 }}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        value={position}
        onSlidingComplete={onSeekComplete}
        minimumTrackTintColor="#fff"
        maximumTrackTintColor="#333"
        thumbTintColor="#fff"
      />
      <View className="flex-row justify-between mt-0.5">
        <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(position * 1000)}
        </Text>
        <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(duration * 1000)}
        </Text>
      </View>
    </View>
  );
}
