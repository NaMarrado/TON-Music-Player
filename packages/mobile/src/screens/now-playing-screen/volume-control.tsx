import {
  formatVolumePercentLabel,
  MAX_VOLUME_PERCENT,
  MIN_VOLUME_PERCENT,
  MOBILE_VOLUME_BUTTON_STEP_PERCENT,
  NORMAL_ZONE_RATIO,
  sliderPositionToVolumePercent,
  volumePercentToSliderPosition,
} from '@ton/core';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  decreaseVolumeByStep,
  increaseVolumeByStep,
  previewVolume,
  setVolume,
} from '../../services/playback-bridge';

// Android's native slider defaults to 128 total steps when `step` is unset.
// Our boost zone lives in the last 20% of the track, so without an explicit
// step the 100-200% range gets compressed into ~25 native steps and jitters
// badly at the far right edge. A 0.001 step yields 1000 total steps.
const VOLUME_SLIDER_STEP = 0.001;
const VOLUME_SLIDER_MIN = 0;
const VOLUME_SLIDER_MAX = 1;
const MAX_VOLUME_LABEL = formatVolumePercentLabel(MAX_VOLUME_PERCENT);
type VolumeControlVariant = 'full' | 'compact';
const VOLUME_STEP_BUTTON_DIMENSIONS = {
  compact: { size: 24, iconSize: 13 },
  full: { size: 30, iconSize: 15 },
} as const;
const VOLUME_STEP_BUTTON_ICON_BY_DIRECTION = {
  down: 'minus',
  up: 'plus',
} as const;
const VOLUME_STEP_BUTTON_HIT_SLOP = 8;
const VOLUME_STEP_BUTTON_ICON_COLOR = '#e8e8e8';
const VOLUME_STEP_BUTTON_ACTIVE_OPACITY = 1;
const VOLUME_STEP_BUTTON_DISABLED_OPACITY = 0.35;
const VOLUME_STEP_BUTTON_RADIUS_DIVISOR = 2;
const VOLUME_ICON_SIZE_BY_VARIANT = {
  compact: 12,
  full: 14,
} as const;
const VOLUME_LABEL_FONT_SIZE_BY_VARIANT = {
  compact: 11,
  full: 12,
} as const;

const VolumeStepButton = memo(function VolumeStepButton({
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
      hitSlop={VOLUME_STEP_BUTTON_HIT_SLOP}
      onPress={onPress}
      style={[
        styles.stepButton,
        {
          width: size,
          height: size,
          borderRadius: size / VOLUME_STEP_BUTTON_RADIUS_DIVISOR,
          opacity: disabled ? VOLUME_STEP_BUTTON_DISABLED_OPACITY : VOLUME_STEP_BUTTON_ACTIVE_OPACITY,
        },
      ]}
    >
      <Feather
        name={VOLUME_STEP_BUTTON_ICON_BY_DIRECTION[direction]}
        size={iconSize}
        color={VOLUME_STEP_BUTTON_ICON_COLOR}
      />
    </Pressable>
  );
});

const VolumeSliderTrack = memo(function VolumeSliderTrack({
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
        minimumValue={VOLUME_SLIDER_MIN}
        maximumValue={VOLUME_SLIDER_MAX}
        step={VOLUME_SLIDER_STEP}
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

export const VolumeControl = memo(function VolumeControl({
  volumePercent,
  isMuted,
  variant,
}: {
  volumePercent: number;
  isMuted: boolean;
  variant: VolumeControlVariant;
}) {
  const { t } = useTranslation('common');
  const frameRef = useRef<number | null>(null);
  const pendingVolumeRef = useRef(volumePercent);
  const isScrubbingRef = useRef(false);
  const hasScrubbedRef = useRef(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [committedSliderValue, setCommittedSliderValue] = useState(() =>
    volumePercentToSliderPosition(volumePercent),
  );
  const [displayVolumePercent, setDisplayVolumePercent] = useState(volumePercent);

  const flushPreview = useCallback(() => {
    frameRef.current = null;
    previewVolume(pendingVolumeRef.current);
  }, []);

  const updateScrubbingState = useCallback((value: number) => {
    const nextVolumePercent = sliderPositionToVolumePercent(value);
    pendingVolumeRef.current = nextVolumePercent;
    setDisplayVolumePercent(nextVolumePercent);
    return nextVolumePercent;
  }, []);

  const handleSlidingStart = useCallback(() => {
    isScrubbingRef.current = true;
    hasScrubbedRef.current = false;
    setIsScrubbing(true);
  }, []);

  const handleVolumeChange = useCallback((value: number) => {
    if (!isScrubbingRef.current) {
      return;
    }

    hasScrubbedRef.current = true;
    updateScrubbingState(value);
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(flushPreview);
    }
  }, [flushPreview, updateScrubbingState]);

  const handleVolumeComplete = useCallback((value: number) => {
    if (!isScrubbingRef.current) {
      return;
    }

    if (!hasScrubbedRef.current) {
      isScrubbingRef.current = false;
      hasScrubbedRef.current = false;
      setIsScrubbing(false);
      setDisplayVolumePercent(volumePercent);
      setCommittedSliderValue(volumePercentToSliderPosition(volumePercent));
      return;
    }

    const nextVolumePercent = updateScrubbingState(value);
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    setCommittedSliderValue(value);
    setDisplayVolumePercent(nextVolumePercent);
    isScrubbingRef.current = false;
    hasScrubbedRef.current = false;
    setIsScrubbing(false);
    void setVolume(nextVolumePercent);
  }, [updateScrubbingState, volumePercent]);

  useEffect(() => {
    pendingVolumeRef.current = volumePercent;
    if (!isScrubbingRef.current) {
      setDisplayVolumePercent(volumePercent);
      setCommittedSliderValue(volumePercentToSliderPosition(volumePercent));
    }
  }, [volumePercent]);

  useEffect(() => () => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }
    isScrubbingRef.current = false;
    hasScrubbedRef.current = false;
  }, []);

  const effectiveVolumePercent = isScrubbing ? displayVolumePercent : volumePercent;
  const effectiveMuted = isScrubbing ? effectiveVolumePercent <= MIN_VOLUME_PERCENT : isMuted;
  const iconSize = VOLUME_ICON_SIZE_BY_VARIANT[variant];
  const labelFontSize = VOLUME_LABEL_FONT_SIZE_BY_VARIANT[variant];
  const minVolumeReached = effectiveVolumePercent <= MIN_VOLUME_PERCENT;
  const maxVolumeReached = effectiveVolumePercent >= MAX_VOLUME_PERCENT;
  const containerStyle = VOLUME_CONTROL_CONTAINER_STYLE_BY_VARIANT[variant];
  const handleDecreasePress = useCallback(() => {
    void decreaseVolumeByStep(MOBILE_VOLUME_BUTTON_STEP_PERCENT);
  }, []);
  const handleIncreasePress = useCallback(() => {
    void increaseVolumeByStep(MOBILE_VOLUME_BUTTON_STEP_PERCENT);
  }, []);

  return (
    <View style={containerStyle}>
      <View className="flex-row items-center">
        <Feather
          name={effectiveMuted ? 'volume-x' : 'volume-2'}
          size={iconSize}
          color={VOLUME_ICON_COLOR}
        />
        <View style={styles.stepButtonBeforeSlider}>
          <VolumeStepButton
            disabled={minVolumeReached}
            direction="down"
            label={t('volume_decrease_step', { step: MOBILE_VOLUME_BUTTON_STEP_PERCENT })}
            onPress={handleDecreasePress}
            variant={variant}
          />
        </View>
        <VolumeSliderTrack
          committedSliderValue={committedSliderValue}
          onSlidingStart={handleSlidingStart}
          onValueChange={handleVolumeChange}
          onSlidingComplete={handleVolumeComplete}
        />
        <View style={styles.stepButtonAfterSlider}>
          <VolumeStepButton
            disabled={maxVolumeReached}
            direction="up"
            label={t('volume_increase_step', { step: MOBILE_VOLUME_BUTTON_STEP_PERCENT })}
            onPress={handleIncreasePress}
            variant={variant}
          />
        </View>
        <View style={styles.volumeLabelContainer}>
          <Text
            style={[styles.volumeLabelSizer, { fontSize: labelFontSize }]}
          >
            {MAX_VOLUME_LABEL}
          </Text>
          <Text
            style={[styles.volumeLabel, { fontSize: labelFontSize }]}
          >
            {formatVolumePercentLabel(effectiveVolumePercent)}
          </Text>
        </View>
      </View>
    </View>
  );
});

const VOLUME_ICON_COLOR = '#888';
const VOLUME_SLIDER_TRACK_HEIGHT = 24;
const VOLUME_SLIDER_HORIZONTAL_MARGIN = 8;
const VOLUME_NORMAL_MARKER_INSET = 2;
const VOLUME_NORMAL_MARKER_WIDTH = 1;
const VOLUME_NORMAL_MARKER_COLOR = '#666';
const VOLUME_NORMAL_MARKER_OPACITY = 0.45;
const VOLUME_SLIDER_MIN_TRACK_COLOR = '#888';
const VOLUME_SLIDER_MAX_TRACK_COLOR = '#333';
const VOLUME_SLIDER_THUMB_COLOR = '#ccc';
const VOLUME_STEP_BUTTON_BACKGROUND = 'rgba(255,255,255,0.07)';
const VOLUME_STEP_BUTTON_BORDER = 'rgba(255,255,255,0.1)';
const VOLUME_STEP_BUTTON_BORDER_WIDTH = 1;
const VOLUME_STEP_BUTTON_SIDE_GAP = 8;
const VOLUME_COMPACT_CONTAINER_HORIZONTAL_PADDING = 16;
const VOLUME_COMPACT_CONTAINER_TOP_PADDING = 2;
const VOLUME_COMPACT_CONTAINER_BOTTOM_PADDING = 10;
const VOLUME_FULL_CONTAINER_HORIZONTAL_PADDING = 24;
const VOLUME_FULL_CONTAINER_VERTICAL_MARGIN = 16;
const VOLUME_LABEL_FONT_WEIGHT = '600';
const VOLUME_LABEL_HIDDEN_COLOR = 'transparent';
const VOLUME_LABEL_HIDDEN_OPACITY = 0;
const VOLUME_LABEL_COLOR = '#cfcfcf';
const VOLUME_LABEL_OFFSET = 0;

const styles = StyleSheet.create({
  compactContainer: {
    paddingHorizontal: VOLUME_COMPACT_CONTAINER_HORIZONTAL_PADDING,
    paddingTop: VOLUME_COMPACT_CONTAINER_TOP_PADDING,
    paddingBottom: VOLUME_COMPACT_CONTAINER_BOTTOM_PADDING,
  },
  fullContainer: {
    paddingHorizontal: VOLUME_FULL_CONTAINER_HORIZONTAL_PADDING,
    marginTop: VOLUME_FULL_CONTAINER_VERTICAL_MARGIN,
    marginBottom: VOLUME_FULL_CONTAINER_VERTICAL_MARGIN,
  },
  stepButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VOLUME_STEP_BUTTON_BACKGROUND,
    borderWidth: VOLUME_STEP_BUTTON_BORDER_WIDTH,
    borderColor: VOLUME_STEP_BUTTON_BORDER,
  },
  stepButtonBeforeSlider: {
    marginLeft: VOLUME_STEP_BUTTON_SIDE_GAP,
  },
  stepButtonAfterSlider: {
    marginRight: VOLUME_STEP_BUTTON_SIDE_GAP,
  },
  sliderTrack: {
    flex: 1,
    height: VOLUME_SLIDER_TRACK_HEIGHT,
    marginHorizontal: VOLUME_SLIDER_HORIZONTAL_MARGIN,
    justifyContent: 'center',
  },
  normalZoneMarker: {
    position: 'absolute',
    top: VOLUME_NORMAL_MARKER_INSET,
    bottom: VOLUME_NORMAL_MARKER_INSET,
    width: VOLUME_NORMAL_MARKER_WIDTH,
    backgroundColor: VOLUME_NORMAL_MARKER_COLOR,
    opacity: VOLUME_NORMAL_MARKER_OPACITY,
  },
  slider: {
    flex: 1,
    height: VOLUME_SLIDER_TRACK_HEIGHT,
  },
  volumeLabelContainer: {
    position: 'relative',
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  volumeLabelSizer: {
    color: VOLUME_LABEL_HIDDEN_COLOR,
    fontWeight: VOLUME_LABEL_FONT_WEIGHT,
    opacity: VOLUME_LABEL_HIDDEN_OPACITY,
    fontVariant: ['tabular-nums'],
  },
  volumeLabel: {
    position: 'absolute',
    right: VOLUME_LABEL_OFFSET,
    top: VOLUME_LABEL_OFFSET,
    bottom: VOLUME_LABEL_OFFSET,
    color: VOLUME_LABEL_COLOR,
    fontWeight: VOLUME_LABEL_FONT_WEIGHT,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

const VOLUME_CONTROL_CONTAINER_STYLE_BY_VARIANT = {
  compact: styles.compactContainer,
  full: styles.fullContainer,
} as const;
