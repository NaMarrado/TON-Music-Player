import { View, ScrollView, Text } from 'react-native';
import { EQ_PRESETS } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  CANONICAL_EQ_FREQUENCIES,
  DEFAULT_EQ_BANDS,
  getEqFrequencyLabel,
  setEqBand,
  setEqPresetByName,
  toggleEq,
} from '../../services/audio-settings';
import { EqualizerBandControl } from './equalizer-band-control';
import { CompactToggle, PillButton, SectionHeader, SettingsCard } from './primitives';

const EQ_FREQUENCY_LABELS = CANONICAL_EQ_FREQUENCIES.map((frequency) => getEqFrequencyLabel(frequency));

export function EqualizerCard({
  title,
  description,
  disabled = false,
  disabledLabel = null,
  eqEnabled,
  eqBands,
  eqPreset,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  disabledLabel?: string | null;
  eqEnabled: boolean;
  eqBands: number[];
  eqPreset: string | null;
}) {
  const { t: tc } = useTranslation('common');
  const presetNames = Object.keys(EQ_PRESETS);
  const resolvedBands = eqBands.length > 0 ? eqBands : DEFAULT_EQ_BANDS;
  const active = !disabled && eqEnabled;

  return (
    <SettingsCard>
      <SectionHeader
        icon="sliders"
        title={title}
        description={description}
        right={(
          <CompactToggle
            accessibilityLabel={title}
            disabled={disabled}
            value={active}
            onValueChange={toggleEq}
          />
        )}
      />
      {disabledLabel && (
        <Text className="text-[#d6aa6a] text-xs ml-[38px] mb-3">{disabledLabel}</Text>
      )}

      <View
        pointerEvents={active ? 'auto' : 'none'}
        style={{ opacity: active ? 1 : 0.35 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8, marginBottom: 14, alignItems: 'center' }}
        >
          {presetNames.map((name) => (
            <PillButton
              key={name}
              label={tc(`eq_${name}`)}
              active={eqPreset === name}
              disabled={disabled || !eqEnabled}
              onPress={() => {
                void setEqPresetByName(name);
              }}
            />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingRight: 4 }}
        >
          <View className="flex-row" style={{ gap: 10 }}>
            {resolvedBands.map((gain, index) => (
              <EqualizerBandControl
                key={`${EQ_FREQUENCY_LABELS[index]}-${index}`}
                disabled={disabled || !eqEnabled}
                label={EQ_FREQUENCY_LABELS[index]}
                value={gain}
                onCommit={(nextValue) => {
                  void setEqBand(index, nextValue);
                }}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </SettingsCard>
  );
}
