import type { LoudnessData } from '@ton/core';
import { acquireMobileJob, scheduleMobileJob } from '../job-scheduler';
import {
  getTrackById,
  getTrackLoudnessStats,
  getTracksMissingLoudness,
  updateTrackLoudness,
} from '../db-queries';
import { syncVolumeOutputToState } from '../playback-bridge/volume';
import { usePlaybackStore } from '../../stores/playback-store';
import { supportsLoudnessAnalysis } from '../audio-settings/capabilities';
import { startLoudnessAnalysisSession } from './ffmpeg';
import { syncAnalyzedTrackById } from './store-sync';

export interface LoudnessAnalysisProgress {
  phase: 'queued' | 'analyzing' | 'done';
  current: number;
  total: number;
  analyzed: number;
  failed: number;
}

export interface LoudnessAnalysisTask {
  cancel: () => Promise<void>;
  result: Promise<{ analyzed: number; failed: number; total: number } | null>;
}

export async function analyzeTrackLoudness(
  trackId: number,
): Promise<LoudnessData | null> {
  if (!supportsLoudnessAnalysis()) {
    return null;
  }

  const track = await getTrackById(trackId);
  if (!track) {
    return null;
  }

  if (track.loudness_lufs != null && track.loudness_gain != null) {
    return {
      lufs: track.loudness_lufs,
      gain: track.loudness_gain,
    };
  }

  const run = await startLoudnessAnalysisSession(track.file_path);
  const outcome = await run.result;
  if (outcome.state !== 'success') {
    return null;
  }

  await persistLoudnessResult(trackId, outcome.data);
  return outcome.data;
}

export function scheduleTrackLoudnessAnalysis(trackId: number): void {
  if (!supportsLoudnessAnalysis()) {
    return;
  }

  void scheduleMobileJob({
    kind: 'loudness-analysis',
    lane: 'cpu-heavy',
    priority: 'background',
    run: async () => {
      const track = await getTrackById(trackId);
      if (!track || track.loudness_gain != null) {
        return;
      }

      const run = await startLoudnessAnalysisSession(track.file_path);
      const outcome = await run.result;
      if (outcome.state !== 'success') {
        return;
      }

      await persistLoudnessResult(trackId, outcome.data);
    },
  }).catch((error) => {
    console.warn('[Loudness] Background analysis failed:', error);
  });
}

export function beginAnalyzeAllTrackLoudness(
  onProgress?: (progress: LoudnessAnalysisProgress) => void,
): LoudnessAnalysisTask {
  if (!supportsLoudnessAnalysis()) {
    return {
      cancel: async () => {},
      result: Promise.resolve(null),
    };
  }

  const lease = acquireMobileJob({
    kind: 'loudness-analysis',
    lane: 'cpu-heavy',
    priority: 'user-visible',
    onQueued: () => {
      onProgress?.({
        phase: 'queued',
        current: 0,
        total: 0,
        analyzed: 0,
        failed: 0,
      });
    },
  });

  let activeRun: Awaited<ReturnType<typeof startLoudnessAnalysisSession>> | null = null;
  let cancelRequested = false;
  let released = false;

  const releaseLease = () => {
    if (released) {
      return;
    }
    released = true;
    lease.release();
  };

  return {
    cancel: async () => {
      if (!lease.isActive()) {
        lease.cancelQueued();
        return;
      }

      cancelRequested = true;
      if (activeRun) {
        await activeRun.cancel();
      }
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) {
        return null;
      }

      try {
        const rows = await getTracksMissingLoudness();
        const total = rows.length;
        let analyzed = 0;
        let failed = 0;

        if (total === 0) {
          onProgress?.({ phase: 'done', current: 0, total: 0, analyzed: 0, failed: 0 });
          return { analyzed: 0, failed: 0, total: 0 };
        }

        onProgress?.({ phase: 'analyzing', current: 0, total, analyzed, failed });

        for (let index = 0; index < rows.length; index += 1) {
          if (cancelRequested) {
            return null;
          }

          const row = rows[index];
          const latestTrack = await getTrackById(row.id);
          if (!latestTrack || latestTrack.loudness_gain != null) {
            analyzed += 1;
            onProgress?.({ phase: 'analyzing', current: index + 1, total, analyzed, failed });
            continue;
          }

          activeRun = await startLoudnessAnalysisSession(latestTrack.file_path);
          if (cancelRequested) {
            await activeRun.cancel();
          }

          const outcome = await activeRun.result;
          activeRun = null;

          if (outcome.state === 'cancelled') {
            return null;
          }

          if (outcome.state === 'success') {
            await persistLoudnessResult(row.id, outcome.data);
            analyzed += 1;
          } else {
            failed += 1;
          }

          onProgress?.({ phase: 'analyzing', current: index + 1, total, analyzed, failed });
        }

        onProgress?.({ phase: 'done', current: total, total, analyzed, failed });
        return { analyzed, failed, total };
      } finally {
        activeRun = null;
        releaseLease();
      }
    })(),
  };
}

export async function getMobileLoudnessStats(): Promise<{
  total: number;
  analyzed: number;
  missing: number;
}> {
  return getTrackLoudnessStats();
}

async function persistLoudnessResult(trackId: number, data: LoudnessData): Promise<void> {
  await updateTrackLoudness(trackId, data.lufs, data.gain);
  const { updatedCurrentTrack } = await syncAnalyzedTrackById(trackId);
  if (updatedCurrentTrack && usePlaybackStore.getState().loudnessNormEnabled) {
    await syncVolumeOutputToState().catch(() => {});
  }
}
