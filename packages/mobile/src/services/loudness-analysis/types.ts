import type { LoudnessData } from '@ton/core';

export type LoudnessAnalysisRunResult =
  | { state: 'success'; data: LoudnessData }
  | { state: 'failed' }
  | { state: 'cancelled' };

export type LoudnessAnalysisRun = {
  cancel: () => Promise<void>;
  result: Promise<LoudnessAnalysisRunResult>;
};
