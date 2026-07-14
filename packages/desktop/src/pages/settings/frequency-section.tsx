import {
  DEFAULT_FREQUENCY_HZ,
  FREQUENCY_PRESETS,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
} from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { setFrequency, toggleFrequencyTuning } from '../../audio/playback-service';
import { SectionHeader, ToggleSwitch } from './helpers';
import type { SettingsLayout } from './use-settings-layout';

export function FrequencySection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const frequencyHz = usePlaybackStore((s) => s.frequencyHz);
  const frequencyEnabled = usePlaybackStore((s) => s.frequencyEnabled);

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12h4l3-9 4 18 3-9h4" />
          </svg>
        }
        title={t('frequencySection')}
        description={t('frequencyDescription')}
        right={
          <div className="flex items-center gap-3">
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color:
                  frequencyHz === DEFAULT_FREQUENCY_HZ ? 'var(--text-secondary)' : 'var(--white)',
                fontVariantNumeric: 'tabular-nums',
                transition: 'color var(--transition)',
              }}
            >
              {frequencyHz} Hz
            </span>
            <ToggleSwitch enabled={frequencyEnabled} onClick={toggleFrequencyTuning} />
          </div>
        }
      />

      <div
        aria-disabled={!frequencyEnabled}
        style={{
          opacity: frequencyEnabled ? 1 : 0.5,
          transition: 'opacity var(--transition)',
        }}
      >
        {/* Slider */}
        <div style={{ marginBottom: '14px' }}>
          <input
            type="range"
            min={MIN_FREQUENCY_HZ}
            max={MAX_FREQUENCY_HZ}
            step={1}
            value={frequencyHz}
            disabled={!frequencyEnabled}
            onChange={(e) => setFrequency(parseInt(e.target.value))}
            className="range-slider w-full"
          />
          <div className="flex justify-between" style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              {MIN_FREQUENCY_HZ} Hz
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              {MAX_FREQUENCY_HZ} Hz
            </span>
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-1.5 flex-wrap">
          {FREQUENCY_PRESETS.map((preset) => (
            <button
              key={preset.hz}
              className={`preset-btn ${frequencyEnabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              disabled={!frequencyEnabled}
              onClick={() => setFrequency(preset.hz)}
              style={{
                padding: '5px 14px',
                borderRadius: '14px',
                background: frequencyHz === preset.hz ? 'var(--white)' : 'transparent',
                border: `1px solid ${frequencyHz === preset.hz ? 'var(--white)' : 'var(--border)'}`,
                color: frequencyHz === preset.hz ? 'var(--bg-deep)' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: frequencyHz === preset.hz ? 600 : 400,
                fontFamily: 'inherit',
                transition: 'all var(--transition)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {preset.hz} Hz
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
