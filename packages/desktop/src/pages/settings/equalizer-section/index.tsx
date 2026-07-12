import { usePlaybackStore } from '../../../stores/playback-store';
import { toggleEq } from '../../../audio/playback-service';
import { EqualizerPresetButtons } from './preset-buttons';
import { EqualizerSectionHeader } from './section-header-content';
import { EqualizerSliderGrid } from './slider-grid';
import type { SettingsLayout } from '../use-settings-layout';

export function EqualizerSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const eqEnabled = usePlaybackStore((state) => state.eqEnabled);
  const eqBands = usePlaybackStore((state) => state.eqBands);
  const eqPreset = usePlaybackStore((state) => state.eqPreset);

  return (
    <section>
      <EqualizerSectionHeader compact={layout.compact} eqEnabled={eqEnabled} onToggle={toggleEq} t={t} />
      <div
        className="relative"
        style={{
          opacity: eqEnabled ? 1 : 0.3,
          pointerEvents: eqEnabled ? 'auto' : 'none',
          transition: 'opacity var(--transition)',
        }}
      >
        <EqualizerSliderGrid compact={layout.compact} eqBands={eqBands} />
        <EqualizerPresetButtons eqPreset={eqPreset} t={t} />
      </div>
    </section>
  );
}
