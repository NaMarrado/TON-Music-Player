import { useCallback, useEffect, useState } from 'react';
import type { SupportedLanguage } from '@ton/core';
import { useTranslation } from 'react-i18next';
import { getSetting, setSetting } from '../../services/db-queries';
import { applyStoredLanguagePreference } from '../../i18n';
import { detectDeviceLanguage } from './constants';

export function useLanguageSettings() {
  const { i18n } = useTranslation('settings');
  const [language, setLanguage] = useState<string>('auto');
  const [languageLoaded, setLanguageLoaded] = useState(false);

  const loadLanguage = useCallback(async () => {
    if (languageLoaded) {
      return;
    }

    const saved = await getSetting('language');
    const resolved = saved ?? 'auto';
    setLanguage(resolved);
    await applyStoredLanguagePreference(resolved);
    setLanguageLoaded(true);
  }, [languageLoaded]);

  useEffect(() => {
    void loadLanguage();
  }, [loadLanguage]);

  const handleLanguageChange = useCallback(
    async (value: string) => {
      setLanguage(value);
      await setSetting('language', value);
      const lang: SupportedLanguage =
        value === 'auto'
          ? (detectDeviceLanguage() as SupportedLanguage)
          : (value as SupportedLanguage);
      await i18n.changeLanguage(lang);
    },
    [i18n],
  );

  return {
    language,
    handleLanguageChange,
  };
}
