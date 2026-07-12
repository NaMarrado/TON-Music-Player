import { EQ_BAND_FREQUENCIES } from '@ton/core';
import { setEqBand } from '../../../audio/playback-service';
import { FREQ_LABELS } from './constants';

export function EqualizerSliderGrid({
  compact,
  eqBands,
}: {
  compact: boolean;
  eqBands: number[];
}) {
  return (
    <div
      className="overflow-x-auto"
      style={{
        padding: '8px 0 12px',
        background: 'var(--bg-deep)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex justify-center"
        style={{
          minWidth: compact ? `${EQ_BAND_FREQUENCIES.length * 48}px` : undefined,
          width: compact ? 'max-content' : '100%',
        }}
      >
        {EQ_BAND_FREQUENCIES.map((freq, index) => (
          <div
            key={freq}
            className="flex flex-col items-center"
            style={{ width: '48px', gap: '4px' }}
          >
          <span
            style={{
              fontSize: '0.68rem',
              color: eqBands[index] !== 0 ? 'var(--white)' : 'var(--text-secondary)',
              fontWeight: eqBands[index] !== 0 ? 600 : 400,
              fontVariantNumeric: 'tabular-nums',
              transition: 'color var(--transition)',
              minWidth: '28px',
              textAlign: 'center',
            }}
          >
            {eqBands[index] > 0 ? `+${eqBands[index]}` : eqBands[index]}
          </span>
          <div className="relative flex items-center justify-center" style={{ height: '120px' }}>
            <div
              className="absolute"
              style={{
                left: '4px',
                right: '4px',
                top: '50%',
                height: '1px',
                background: 'var(--border)',
              }}
            />
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={eqBands[index]}
              onChange={(event) => setEqBand(index, parseInt(event.target.value, 10))}
              className="eq-slider"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                height: '120px',
                width: '28px',
                cursor: 'pointer',
                accentColor: 'var(--white)',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '0.6rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em',
            }}
          >
            {FREQ_LABELS[index]}
          </span>
          </div>
        ))}
      </div>
    </div>
  );
}
