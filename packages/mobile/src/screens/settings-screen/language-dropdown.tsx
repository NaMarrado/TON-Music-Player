import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  LANGUAGE_DEFINITIONS,
  getLanguageDisplayName,
} from '@ton/core';
import type { SupportedLanguage } from '@ton/core';

export function LanguageDropdown({
  language,
  autoLabel,
  title,
  onChange,
}: {
  language: string;
  autoLabel: string;
  title: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = language === 'auto'
    ? autoLabel
    : getLanguageDisplayName(language as SupportedLanguage);

  const selectLanguage = (value: string) => {
    setOpen(false);
    onChange(value);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityValue={{ text: selectedLabel }}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-bg-elevated px-3.5"
      >
        <Text className="text-white text-sm font-medium">{selectedLabel}</Text>
        <Feather name="chevron-down" size={17} color="#888" />
      </Pressable>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 items-center justify-center px-5">
          <Pressable
            accessibilityLabel={title}
            className="absolute inset-0 bg-black/70"
            onPress={() => setOpen(false)}
          />
          <View
            accessibilityViewIsModal
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-bg-surface"
          >
            <View className="border-b border-border px-4 py-3.5">
              <Text className="text-white text-base font-semibold">{title}</Text>
            </View>
            <ScrollView style={{ maxHeight: 420 }} bounces={false}>
              <LanguageOption
                active={language === 'auto'}
                label={autoLabel}
                onPress={() => selectLanguage('auto')}
              />
              {LANGUAGE_DEFINITIONS.map(({ code }) => (
                <LanguageOption
                  key={code}
                  active={language === code}
                  label={getLanguageDisplayName(code)}
                  onPress={() => selectLanguage(code)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function LanguageOption({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className={`min-h-[48px] flex-row items-center justify-between border-b border-border px-4 ${
        active ? 'bg-white/10' : 'bg-transparent'
      }`}
    >
      <Text className={`text-sm ${active ? 'text-white font-semibold' : 'text-text-secondary'}`}>
        {label}
      </Text>
      {active && <Feather name="check" size={17} color="#fff" />}
    </Pressable>
  );
}
