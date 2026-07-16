import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  FREQUENCY_PRESETS,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  normalizeFrequencyHz,
} from '@ton/core';
import { setFrequency, setFrequencyEnabled } from '../../services/audio-settings';
import { CompactToggle, PillButton, SectionHeader, SettingsCard } from './primitives';

export function FrequencyCard({
  title,
  description,
  disabled = false,
  disabledLabel = null,
  frequencyEnabled,
  frequencyHz,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  disabledLabel?: string | null;
  frequencyEnabled: boolean;
  frequencyHz: number;
}) {
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(frequencyHz);
  const controlsEnabled = !disabled && frequencyEnabled;

  useEffect(() => {
    setDraftFrequencyHz(frequencyHz);
  }, [frequencyHz]);

  async function commitFrequency(nextFrequencyHz: number): Promise<void> {
    const normalizedFrequencyHz = normalizeFrequencyHz(nextFrequencyHz);
    setDraftFrequencyHz(normalizedFrequencyHz);
    await setFrequency(normalizedFrequencyHz);
  }

  return (
    <SettingsCard>
      <SectionHeader
        icon="radio"
        title={title}
        description={description}
        right={(
          <CompactToggle
            accessibilityLabel={title}
            disabled={disabled}
            value={controlsEnabled}
            onValueChange={(enabled) => {
              void setFrequencyEnabled(enabled);
            }}
          />
        )}
      />
      {disabledLabel && (
        <Text className="text-[#d6aa6a] text-xs ml-[38px] mb-3">{disabledLabel}</Text>
      )}
      <View
        pointerEvents={controlsEnabled ? 'auto' : 'none'}
        style={{ opacity: controlsEnabled ? 1 : 0.35 }}
      >
        <Text className="text-white text-lg font-bold mb-3">{draftFrequencyHz} Hz</Text>

        <View className="mb-3">
          <Slider
            disabled={!controlsEnabled}
            minimumValue={MIN_FREQUENCY_HZ}
            maximumValue={MAX_FREQUENCY_HZ}
            step={1}
            value={draftFrequencyHz}
            onValueChange={(value) => {
              setDraftFrequencyHz(normalizeFrequencyHz(value));
            }}
            onSlidingComplete={(value) => {
              void commitFrequency(value);
            }}
            minimumTrackTintColor="#fff"
            maximumTrackTintColor="#333"
            thumbTintColor="#fff"
          />
          <View className="flex-row justify-between mt-1 px-1">
            <Text className="text-text-secondary text-[11px]">{MIN_FREQUENCY_HZ} Hz</Text>
            <Text className="text-text-secondary text-[11px]">{MAX_FREQUENCY_HZ} Hz</Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {FREQUENCY_PRESETS.map((preset) => (
            <PillButton
              key={preset.hz}
              label={`${preset.hz} Hz`}
              active={draftFrequencyHz === preset.hz}
              disabled={!controlsEnabled}
              onPress={() => {
                void commitFrequency(preset.hz);
              }}
            />
          ))}
        </View>
      </View>
    </SettingsCard>
  );
}
