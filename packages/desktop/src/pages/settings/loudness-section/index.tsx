import { usePlaybackStore } from '../../../stores/playback-store';
import { toggleLoudnessNorm } from '../../../audio/playback-service';
import { LoudnessProgressView } from './progress-view';
import { LoudnessSectionHeader } from './section-header-content';
import { useLoudnessStats } from './use-loudness-stats';
import type { SettingsLayout } from '../use-settings-layout';

export function LoudnessSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const loudnessNormEnabled = usePlaybackStore((state) => state.loudnessNormEnabled);
  const { analyzing, handleAnalyzeAll, progress, stats } = useLoudnessStats();

  return (
    <section>
      <LoudnessSectionHeader
        compact={layout.compact}
        enabled={loudnessNormEnabled}
        onToggle={toggleLoudnessNorm}
        t={t}
      />
      <div className="flex items-center gap-2" style={{ paddingLeft: layout.sectionIndent }}>
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: loudnessNormEnabled ? '#4ade80' : 'var(--text-secondary)',
            transition: 'background var(--transition)',
          }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t('loudnessTarget')}
        </span>
      </div>
      <LoudnessProgressView
        analyzing={analyzing}
        onAnalyzeAll={() => void handleAnalyzeAll()}
        progress={progress}
        stats={stats}
        t={t}
      />
    </section>
  );
}
