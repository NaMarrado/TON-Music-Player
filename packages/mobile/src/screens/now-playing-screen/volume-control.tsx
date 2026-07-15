import {
  formatVolumePercentLabel,
  MAX_VOLUME_PERCENT,
  MIN_VOLUME_PERCENT,
  MOBILE_VOLUME_BUTTON_STEP_PERCENT,
  sliderPositionToVolumePercent,
  volumePercentToSliderPosition,
} from '@ton/core';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  decreaseVolumeByStep,
  increaseVolumeByStep,
  previewVolume,
  setVolume,
} from '../../services/playback-bridge';
import { VolumeSliderTrack, VolumeStepButton } from './volume-control-parts';
import {
  styles,
  VOLUME_CONTROL_CONTAINER_STYLE_BY_VARIANT,
  VOLUME_ICON_COLOR,
  VOLUME_ICON_SIZE_BY_VARIANT,
  VOLUME_LABEL_FONT_SIZE_BY_VARIANT,
  type VolumeControlVariant,
} from './volume-control-styles';

const MAX_VOLUME_LABEL = formatVolumePercentLabel(MAX_VOLUME_PERCENT);

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
  const [committedSliderValue, setCommittedSliderValue] = useState(() => (
    volumePercentToSliderPosition(volumePercent)
  ));
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
    if (!isScrubbingRef.current) return;
    hasScrubbedRef.current = true;
    updateScrubbingState(value);
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(flushPreview);
  }, [flushPreview, updateScrubbingState]);
  const handleVolumeComplete = useCallback((value: number) => {
    if (!isScrubbingRef.current) return;
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
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    isScrubbingRef.current = false;
    hasScrubbedRef.current = false;
  }, []);

  const effectiveVolumePercent = isScrubbing ? displayVolumePercent : volumePercent;
  const effectiveMuted = isScrubbing ? effectiveVolumePercent <= MIN_VOLUME_PERCENT : isMuted;
  const labelFontSize = VOLUME_LABEL_FONT_SIZE_BY_VARIANT[variant];
  const handleDecreasePress = useCallback(() => {
    void decreaseVolumeByStep(MOBILE_VOLUME_BUTTON_STEP_PERCENT);
  }, []);
  const handleIncreasePress = useCallback(() => {
    void increaseVolumeByStep(MOBILE_VOLUME_BUTTON_STEP_PERCENT);
  }, []);

  return (
    <View style={VOLUME_CONTROL_CONTAINER_STYLE_BY_VARIANT[variant]}>
      <View className="flex-row items-center">
        <Feather
          name={effectiveMuted ? 'volume-x' : 'volume-2'}
          size={VOLUME_ICON_SIZE_BY_VARIANT[variant]}
          color={VOLUME_ICON_COLOR}
        />
        <View style={styles.stepButtonBeforeSlider}>
          <VolumeStepButton
            disabled={effectiveVolumePercent <= MIN_VOLUME_PERCENT}
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
            disabled={effectiveVolumePercent >= MAX_VOLUME_PERCENT}
            direction="up"
            label={t('volume_increase_step', { step: MOBILE_VOLUME_BUTTON_STEP_PERCENT })}
            onPress={handleIncreasePress}
            variant={variant}
          />
        </View>
        <View style={styles.volumeLabelContainer}>
          <Text style={[styles.volumeLabelSizer, { fontSize: labelFontSize }]}>
            {MAX_VOLUME_LABEL}
          </Text>
          <Text style={[styles.volumeLabel, { fontSize: labelFontSize }]}>
            {formatVolumePercentLabel(effectiveVolumePercent)}
          </Text>
        </View>
      </View>
    </View>
  );
});
