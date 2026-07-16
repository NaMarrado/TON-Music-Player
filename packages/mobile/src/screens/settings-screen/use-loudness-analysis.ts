import { useCallback, useEffect, useState } from 'react';
import {
  beginAnalyzeAllTrackLoudness,
  getMobileLoudnessStats,
  type LoudnessAnalysisProgress,
} from '../../services/loudness-analysis';

export function useLoudnessAnalysis() {
  const [stats, setStats] = useState<{ total: number; analyzed: number; missing: number } | null>(null);
  const [progress, setProgress] = useState<LoudnessAnalysisProgress | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [cancelAnalysis, setCancelAnalysis] = useState<(() => Promise<void>) | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const nextStats = await getMobileLoudnessStats();
      setStats(nextStats);
    } catch {
      // Stats are informational only.
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const analyzeAll = useCallback(async () => {
    if (isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setProgress(null);
    setFailedCount(0);

    try {
      const task = await beginAnalyzeAllTrackLoudness((nextProgress) => {
        setProgress(nextProgress);
      });
      setCancelAnalysis(() => task.cancel);
      const result = await task.result;
      if (result) {
        setFailedCount(result.failed);
      }
    } finally {
      setCancelAnalysis(null);
      setIsAnalyzing(false);
      await loadStats();
      setProgress(null);
    }
  }, [isAnalyzing, loadStats]);

  return {
    analyzeAll,
    cancelAnalysis,
    failedCount,
    isAnalyzing,
    progress,
    refreshLoudnessStats: loadStats,
    stats,
  };
}
