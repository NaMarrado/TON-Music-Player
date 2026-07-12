import * as FileSystem from 'expo-file-system';
import { LUFS_TARGET_DEFAULT } from '@ton/core';
import { NativeEventEmitter, NativeModules } from 'react-native';
import type { LoudnessAnalysisRun, LoudnessAnalysisRunResult } from './types';

const IOS_LOUDNESS_EVENT = 'iosLoudnessAnalysisEvent';

type IosLoudnessAnalyzerModule = {
  cancelAnalysis(taskId: string): Promise<void>;
  startAnalysis(filePath: string, targetLufs: number): Promise<string>;
};

type IosLoudnessEvent = {
  taskId: string;
  state: 'completed' | 'failed' | 'cancelled';
  lufs?: number;
  gain?: number;
};

type PendingTask = {
  resolve: (value: LoudnessAnalysisRunResult) => void;
};

const pendingTasks = new Map<string, PendingTask>();
let subscription: { remove: () => void } | null = null;

export async function startIosNativeLoudnessAnalysis(
  filePath: string,
  targetLufs: number = LUFS_TARGET_DEFAULT,
): Promise<LoudnessAnalysisRun> {
  const module = getIosLoudnessAnalyzerModule();
  if (!module) {
    return {
      cancel: async () => {},
      result: Promise.resolve({ state: 'failed' }),
    };
  }

  const fileInfo = await FileSystem.getInfoAsync(filePath).catch(() => ({ exists: false }));
  if (!fileInfo.exists) {
    return {
      cancel: async () => {},
      result: Promise.resolve({ state: 'failed' }),
    };
  }

  ensureSubscription(module);
  const taskId = await module.startAnalysis(filePath, targetLufs);
  const result = new Promise<LoudnessAnalysisRunResult>((resolve) => {
    pendingTasks.set(taskId, { resolve });
  });

  return {
    cancel: async () => {
      await module.cancelAnalysis(taskId).catch(() => {});
    },
    result,
  };
}

function getIosLoudnessAnalyzerModule(): IosLoudnessAnalyzerModule | null {
  return (NativeModules.IosLoudnessAnalyzer as IosLoudnessAnalyzerModule | undefined) ?? null;
}

function ensureSubscription(module: IosLoudnessAnalyzerModule): void {
  if (subscription) {
    return;
  }

  const emitter = new NativeEventEmitter(module as never);
  subscription = emitter.addListener(IOS_LOUDNESS_EVENT, (event: IosLoudnessEvent) => {
    const pending = pendingTasks.get(event.taskId);
    if (!pending) {
      return;
    }

    pendingTasks.delete(event.taskId);
    if (event.state === 'cancelled') {
      pending.resolve({ state: 'cancelled' });
      return;
    }

    if (
      event.state === 'completed'
      && typeof event.lufs === 'number'
      && typeof event.gain === 'number'
    ) {
      pending.resolve({
        state: 'success',
        data: {
          lufs: event.lufs,
          gain: event.gain,
        },
      });
      return;
    }

    pending.resolve({ state: 'failed' });
  });
}
