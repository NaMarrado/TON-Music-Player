import { useCallback, useEffect, useState } from 'react';
import type { AnalyzeProgress, LoudnessStats } from './types';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;

export function useLoudnessStats() {
  const [stats, setStats] = useState<LoudnessStats | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const result = (await ipc('library:loudness-stats')) as LoudnessStats;
      setStats(result);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      setProgress(args[0] as AnalyzeProgress);
    };
    window.api.on('library:loudness-progress', handler);
    return () => window.api.off('library:loudness-progress', handler);
  }, []);

  const handleAnalyzeAll = useCallback(async () => {
    setAnalyzing(true);
    setProgress(null);
    try {
      const result = (await ipc('library:analyze-loudness-all')) as {
        analyzed: number;
        failed: number;
        total: number;
        noFfmpeg: boolean;
      };

      if (result.noFfmpeg) {
        console.warn('[Loudness] ffmpeg not found — cannot analyze tracks');
      } else {
        console.log(
          `[Loudness] Analyzed ${result.analyzed}/${result.total} tracks (${result.failed} failed)`,
        );
      }
    } catch (error) {
      console.error('[Loudness] Analysis failed:', error);
    } finally {
      setAnalyzing(false);
      setProgress(null);
      void loadStats();
    }
  }, [loadStats]);

  return {
    analyzing,
    handleAnalyzeAll,
    progress,
    stats,
  };
}
