import { setEqPreset } from '../../../audio/playback-service';
import { PRESET_KEYS } from './constants';

export function EqualizerPresetButtons({
  eqPreset,
  t,
}: {
  eqPreset: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div style={{ marginTop: '14px' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t('eqPresets')}
        </span>
        {eqPreset === 'custom' && (
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}
          >
            {t('custom')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_KEYS.map(({ key, label }) => (
          <button
            key={key}
            className="preset-btn cursor-pointer"
            onClick={() => setEqPreset(key)}
            style={{
              padding: '5px 12px',
              borderRadius: '14px',
              background: eqPreset === key ? 'var(--white)' : 'transparent',
              border: `1px solid ${eqPreset === key ? 'var(--white)' : 'var(--border)'}`,
              color: eqPreset === key ? 'var(--bg-deep)' : 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: eqPreset === key ? 600 : 400,
              fontFamily: 'inherit',
              transition: 'all var(--transition)',
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
