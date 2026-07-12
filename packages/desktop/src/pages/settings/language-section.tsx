import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_DEFINITIONS,
  getLanguageDisplayName,
  getLanguageNativeName,
  SUPPORTED_LANGUAGES,
} from '@ton/core';
import type { SupportedLanguage } from '@ton/core';
import { SectionHeader } from './helpers';
import { useSetting } from './use-setting';
import type { SettingsLayout } from './use-settings-layout';

function detectSystemLanguage(): string {
  const raw = navigator.language;
  const code = raw.split('-')[0];
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
    return code;
  }
  return 'en';
}

export function LanguageSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const { i18n } = useTranslation();
  const languageSetting = useSetting('language');
  const [selected, setSelected] = useState<string>('auto');

  useEffect(() => {
    if (languageSetting.loaded) {
      setSelected(languageSetting.value || 'auto');
    }
  }, [languageSetting.loaded, languageSetting.value]);

  const handleChange = useCallback(
    async (value: string) => {
      setSelected(value);
      await languageSetting.save(value);

      const lang: SupportedLanguage = value === 'auto'
        ? detectSystemLanguage() as SupportedLanguage
        : value as SupportedLanguage;
      i18n.changeLanguage(lang);
    },
    [languageSetting, i18n],
  );

  const systemLang = detectSystemLanguage();

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        }
        title={t('languageSection')}
      />

      <div style={{ paddingLeft: layout.sectionIndent }}>
        <div style={{ position: 'relative', maxWidth: '320px' }}>
          <select
            aria-label={t('languageSection')}
            value={selected}
            onChange={(event) => void handleChange(event.target.value)}
            style={{
              width: '100%',
              minHeight: '42px',
              padding: '0 42px 0 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.84rem',
              fontWeight: 500,
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            <option value="auto">{t('languageAuto')}</option>
            {LANGUAGE_DEFINITIONS.map(({ code }) => (
              <option key={code} value={code}>{getLanguageDisplayName(code)}</option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: 'absolute',
              right: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {selected === 'auto' && (
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              marginTop: '10px',
            }}
          >
            {t('languageDetected', {
              lang: getLanguageNativeName(systemLang as SupportedLanguage),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
