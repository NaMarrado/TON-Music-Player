import { LUFS_TARGET_DEFAULT } from '@ton/core';
import { Platform } from 'react-native';
import { startAndroidFfmpegLoudnessAnalysis } from './android-ffmpeg';
import { startIosNativeLoudnessAnalysis } from './ios-native';
import type { LoudnessAnalysisRun } from './types';

export async function startLoudnessAnalysisSession(
  filePath: string,
  targetLufs: number = LUFS_TARGET_DEFAULT,
): Promise<LoudnessAnalysisRun> {
  if (Platform.OS === 'ios') {
    return startIosNativeLoudnessAnalysis(filePath, targetLufs);
  }

  if (Platform.OS === 'android') {
    return startAndroidFfmpegLoudnessAnalysis(filePath, targetLufs);
  }

  return {
    cancel: async () => {},
    result: Promise.resolve({ state: 'failed' }),
  };
}
