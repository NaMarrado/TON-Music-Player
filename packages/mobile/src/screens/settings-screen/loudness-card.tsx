import { Pressable, Text, View } from 'react-native';
import { setLoudnessNormalizationEnabled } from '../../services/audio-settings';
import { CompactToggle, SectionHeader, SettingsCard } from './primitives';

export function LoudnessCard({
  analyzeAllLabel,
  analyzingLabel,
  cancelLabel,
  title,
  description,
  disabled = false,
  failedLabel,
  isAnalyzeDisabled,
  isAnalyzing,
  loudnessNormEnabled,
  noteLabel,
  onAnalyzeAll,
  onCancelAnalysis,
  progressLabel,
  statsLabel,
  targetLabel,
}: {
  analyzeAllLabel: string;
  analyzingLabel: string;
  cancelLabel: string;
  title: string;
  description: string;
  disabled?: boolean;
  failedLabel: string | null;
  isAnalyzeDisabled: boolean;
  isAnalyzing: boolean;
  loudnessNormEnabled: boolean;
  noteLabel: string | null;
  onAnalyzeAll: () => void;
  onCancelAnalysis: (() => void) | null;
  progressLabel: string | null;
  statsLabel: string | null;
  targetLabel: string;
}) {
  return (
    <SettingsCard>
      <SectionHeader
        icon="volume-2"
        title={title}
        description={description}
        right={(
          <CompactToggle
            accessibilityLabel={title}
            disabled={disabled}
            value={!disabled && loudnessNormEnabled}
            onValueChange={(value) => {
              void setLoudnessNormalizationEnabled(value);
            }}
          />
        )}
      />

      <View className="ml-[38px] gap-3">
        <View className="flex-row items-center">
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: !disabled && loudnessNormEnabled ? '#4ade80' : '#666',
              marginRight: 8,
            }}
          />
          <Text className="text-text-secondary text-xs">
            {targetLabel}
          </Text>
        </View>

        {statsLabel && (
          <Text className="text-text-secondary text-xs">{statsLabel}</Text>
        )}

        {progressLabel && (
          <Text className="text-text-secondary text-xs">{progressLabel}</Text>
        )}

        {failedLabel && (
          <Text className="text-[#d6aa6a] text-xs">{failedLabel}</Text>
        )}

        {noteLabel && (
          <Text className="text-[#d6aa6a] text-xs">{noteLabel}</Text>
        )}

        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={onAnalyzeAll}
            disabled={isAnalyzeDisabled}
            className="border border-border"
            style={{
              borderRadius: 999,
              paddingVertical: 9,
              paddingHorizontal: 14,
              opacity: isAnalyzeDisabled ? 0.55 : 1,
            }}
          >
            <Text className="text-text-primary text-[13px] font-semibold">
              {isAnalyzing ? analyzingLabel : analyzeAllLabel}
            </Text>
          </Pressable>

          {isAnalyzing && onCancelAnalysis && (
            <Pressable
              onPress={onCancelAnalysis}
              className="border border-border"
              style={{
                borderRadius: 999,
                paddingVertical: 9,
                paddingHorizontal: 14,
              }}
            >
              <Text className="text-text-secondary text-[13px] font-semibold">
                {cancelLabel}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SettingsCard>
  );
}
