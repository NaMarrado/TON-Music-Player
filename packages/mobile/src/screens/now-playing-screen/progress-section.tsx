import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { formatTime } from '@ton/core';

type ProgressSectionProps = {
  position: number;
  duration: number;
  onSeekComplete: (value: number) => Promise<void> | void;
};

export function ProgressSection({
  position,
  duration,
  onSeekComplete,
}: ProgressSectionProps) {
  const [displayPosition, setDisplayPosition] = useState(position);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<{ target: number; expiresAt: number } | null>(null);

  useEffect(() => {
    if (scrubbingRef.current) return;
    const pending = pendingSeekRef.current;
    if (pending) {
      if (Math.abs(position - pending.target) <= 1 || Date.now() >= pending.expiresAt) {
        pendingSeekRef.current = null;
        setDisplayPosition(position);
      }
      return;
    }
    setDisplayPosition(position);
  }, [position]);

  const handleSlidingStart = useCallback(() => {
    scrubbingRef.current = true;
    pendingSeekRef.current = null;
  }, []);

  const handleValueChange = useCallback((value: number) => {
    if (scrubbingRef.current) {
      setDisplayPosition(value);
    }
  }, []);

  const handleSlidingComplete = useCallback((value: number) => {
    scrubbingRef.current = false;
    pendingSeekRef.current = { target: value, expiresAt: Date.now() + 1_500 };
    setDisplayPosition(value);
    void Promise.resolve(onSeekComplete(value)).catch(() => {
      pendingSeekRef.current = null;
    });
  }, [onSeekComplete]);

  return (
    <View className="px-6 mt-5">
      <Slider
        style={{ width: '100%', height: 28 }}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        value={displayPosition}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor="#fff"
        maximumTrackTintColor="#333"
        thumbTintColor="#fff"
      />
      <View className="flex-row justify-between mt-0.5">
        <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(displayPosition * 1000)}
        </Text>
        <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(duration * 1000)}
        </Text>
      </View>
    </View>
  );
}
