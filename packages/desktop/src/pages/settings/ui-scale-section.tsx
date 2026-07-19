import { useCallback, useEffect, useState } from 'react';
import {
  DESKTOP_UI_SCALE_DEFAULT,
  DESKTOP_UI_SCALE_MAX,
  DESKTOP_UI_SCALE_MIN,
  DESKTOP_UI_SCALE_STEP,
  normalizeDesktopUiScale,
} from '../../shared/ui-scale';
import { SectionHeader } from './helpers';
import type { SettingsLayout } from './use-settings-layout';

export function UiScaleSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [scale, setScale] = useState(DESKTOP_UI_SCALE_DEFAULT);

  useEffect(() => {
    let cancelled = false;
    void window.api.invoke('app:get-ui-scale').then((value) => {
      if (!cancelled) setScale(normalizeDesktopUiScale(value));
    });
    return () => { cancelled = true; };
  }, []);

  const applyScale = useCallback(async (value: number) => {
    const normalized = normalizeDesktopUiScale(value);
    setScale(normalized);
    const saved = await window.api.invoke('app:set-ui-scale', normalized);
    setScale(normalizeDesktopUiScale(saved));
  }, []);

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={(
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
        title={t('uiScaleTitle')}
        description={t('uiScaleDescription')}
        right={(
          <span
            style={{
              color: 'var(--white)',
              fontSize: '0.88rem',
              fontWeight: 650,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {scale}%
          </span>
        )}
      />

      <div style={{ marginLeft: layout.sectionIndent }}>
        <input
          aria-label={t('uiScaleTitle')}
          className="range-slider w-full"
          type="range"
          min={DESKTOP_UI_SCALE_MIN}
          max={DESKTOP_UI_SCALE_MAX}
          step={DESKTOP_UI_SCALE_STEP}
          value={scale}
          onChange={(event) => { void applyScale(Number(event.target.value)); }}
        />
        <div className="flex items-center justify-between" style={{ marginTop: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
            {DESKTOP_UI_SCALE_MIN}%
          </span>
          <button
            type="button"
            onClick={() => { void applyScale(DESKTOP_UI_SCALE_DEFAULT); }}
            style={{
              border: '1px solid var(--border)',
              borderRadius: '999px',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '6px 12px',
            }}
          >
            {t('uiScaleReset')}
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
            {DESKTOP_UI_SCALE_MAX}%
          </span>
        </div>
      </div>
    </section>
  );
}
