import { Text } from 'react-native';
import { getLanguageNativeName } from '@ton/core';
import type { SupportedLanguage } from '@ton/core';
import { LanguageDropdown } from './language-dropdown';
import { SectionHeader, SettingsCard } from './primitives';

export function LanguageCard({
  title,
  autoLabel,
  detectedText,
  language,
  detectedLang,
  onChange,
}: {
  title: string;
  autoLabel: string;
  detectedText: string;
  language: string;
  detectedLang: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingsCard>
      <SectionHeader icon="globe" title={title} />
      <LanguageDropdown
        language={language}
        autoLabel={autoLabel}
        title={title}
        onChange={onChange}
      />
      {language === 'auto' && (
        <Text className="text-text-muted text-xs mt-2">
          {detectedText.replace(
            /\{\{lang\}\}/g,
            getLanguageNativeName(detectedLang as SupportedLanguage),
          )}
        </Text>
      )}
    </SettingsCard>
  );
}
