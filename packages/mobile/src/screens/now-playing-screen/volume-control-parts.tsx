import { memo } from 'react';
import { Pressable, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { NORMAL_ZONE_RATIO } from '@ton/core';
import {
  styles,
  VOLUME_SLIDER_MAX_TRACK_COLOR,
  VOLUME_SLIDER_MIN_TRACK_COLOR,
  VOLUME_SLIDER_THUMB_COLOR,
  VOLUME_STEP_BUTTON_DIMENSIONS,
  type VolumeControlVariant,
} from './volume-control-styles';

export const VolumeStepButton = memo(function VolumeStepButton({
  disabled,
  direction,
  label,
  onPress,
  variant,
}: {
  disabled: boolean;
  direction: 'down' | 'up';
  label: string;
  onPress: () => void;
  variant: VolumeControlVariant;
}) {
  const { size, iconSize } = VOLUME_STEP_BUTTON_DIMENSIONS[variant];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.stepButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Feather name={direction === 'down' ? 'minus' : 'plus'} size={iconSize} color="#e8e8e8" />
    </Pressable>
  );
});

export const VolumeSliderTrack = memo(function VolumeSliderTrack({
  committedSliderValue,
  onSlidingStart,
  onValueChange,
  onSlidingComplete,
}: {
  committedSliderValue: number;
  onSlidingStart: (value: number) => void;
  onValueChange: (value: number) => void;
  onSlidingComplete: (value: number) => void;
}) {
  return (
    <View style={styles.sliderTrack}>
      <View
        pointerEvents="none"
        style={[styles.normalZoneMarker, { left: `${NORMAL_ZONE_RATIO * 100}%` }]}
      />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.001}
        value={committedSliderValue}
        onSlidingStart={onSlidingStart}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor={VOLUME_SLIDER_MIN_TRACK_COLOR}
        maximumTrackTintColor={VOLUME_SLIDER_MAX_TRACK_COLOR}
        thumbTintColor={VOLUME_SLIDER_THUMB_COLOR}
      />
    </View>
  );
});
