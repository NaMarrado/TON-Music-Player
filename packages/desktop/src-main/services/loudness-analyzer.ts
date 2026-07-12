/**
 * Loudness Analyzer - measures integrated loudness (LUFS) via ffmpeg ebur128.
 *
 * Spawns ffmpeg with the ebur128 audio filter and parses the integrated
 * loudness from its stderr output. Returns LUFS value and the gain offset
 * needed to reach the target loudness.
 */

import { execFile } from 'child_process';
import { LUFS_TARGET_DEFAULT } from '@ton/core';

export interface LoudnessResult {
  lufs: number;
  gain: number;
}

/**
 * Analyze integrated loudness of an audio file.
 * @param filePath  Absolute path to the audio file
 * @param ffmpegPath  Absolute path to ffmpeg binary
 * @param targetLufs  Target LUFS level (default -14)
 * @returns LUFS measurement and gain offset, or null on failure
 */
export function analyzeLoudness(
  filePath: string,
  ffmpegPath: string,
  targetLufs: number = LUFS_TARGET_DEFAULT,
): Promise<LoudnessResult | null> {
  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      ['-i', filePath, '-af', 'ebur128', '-f', 'null', '-'],
      { timeout: 120000 },
      (error, _stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }

        // ebur128 outputs per-frame "I: -70.0 LUFS" lines AND a summary.
        // We need the LAST match (the summary integrated loudness).
        const matches = [...stderr.matchAll(/I:\s+(-?\d+\.?\d*)\s+LUFS/g)];
        const lastMatch = matches[matches.length - 1];
        if (!lastMatch) {
          resolve(null);
          return;
        }

        const lufs = parseFloat(lastMatch[1]);
        if (!isFinite(lufs)) {
          resolve(null);
          return;
        }

        const gain = Math.max(-20, Math.min(20, targetLufs - lufs));
        resolve({ lufs, gain });
      },
    );
  });
}
