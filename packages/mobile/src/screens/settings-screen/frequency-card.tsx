import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  FREQUENCY_PRESETS,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  normalizeFrequencyHz,
} from '@ton/core';
import { setFrequency } from '../../services/audio-settings';
import { PillButton, SectionHeader, SettingsCard } from './primitives';

export function FrequencyCard({
  title,
  description,
  disabled = false,
  disabledLabel = null,
  frequencyHz,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  disabledLabel?: string | null;
  frequencyHz: number;
}) {
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(frequencyHz);

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
      />
      {disabledLabel && (
        <Text className="text-[#d6aa6a] text-xs ml-[38px] mb-3">{disabledLabel}</Text>
      )}
      <View
        pointerEvents={disabled ? 'none' : 'auto'}
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        <Text className="text-white text-lg font-bold mb-3">{draftFrequencyHz} Hz</Text>

        <View className="mb-3">
          <Slider
            disabled={disabled}
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
              disabled={disabled}
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
