import * as FileSystem from 'expo-file-system';
import { LUFS_TARGET_DEFAULT, type LoudnessData } from '@ton/core';
import { NativeModules } from 'react-native';
import type { LoudnessAnalysisRun } from './types';

type FFmpegKitModule = typeof import('ffmpeg-kit-react-native');
type FFmpegSession = import('ffmpeg-kit-react-native').FFmpegSession;

const LUFS_REGEX = /I:\s+(-?\d+\.?\d*)\s+LUFS/g;

export async function startAndroidFfmpegLoudnessAnalysis(
  filePath: string,
  targetLufs: number = LUFS_TARGET_DEFAULT,
): Promise<LoudnessAnalysisRun> {
  const ffmpegKit = await getFFmpegKitModule();
  if (!ffmpegKit) {
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

  const inputPath = await resolveInputPath(filePath, ffmpegKit);
  const commandArguments = [
    '-hide_banner',
    '-i',
    inputPath,
    '-af',
    'ebur128=framelog=verbose',
    '-f',
    'null',
    '-',
  ];

  let sessionId = 0;
  let logOutput = '';
  let resolveCompleted!: (session: FFmpegSession) => void;
  let rejectCompleted!: (error?: unknown) => void;

  const completed = new Promise<FFmpegSession>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const sessionPromise = ffmpegKit.FFmpegKit.executeWithArgumentsAsync(
    commandArguments,
    (session) => resolveCompleted(session),
    (log) => {
      logOutput += String(log.getMessage());
    },
  );

  const result = (async () => {
    try {
      const session = await sessionPromise;
      sessionId = session.getSessionId();
      const completedSession = await completed;
      const returnCode = await completedSession.getReturnCode().catch(() => null);
      if (!returnCode) {
        return { state: 'failed' } as const;
      }

      if (ffmpegKit.ReturnCode.isCancel(returnCode)) {
        return { state: 'cancelled' } as const;
      }

      if (!ffmpegKit.ReturnCode.isSuccess(returnCode)) {
        return { state: 'failed' } as const;
      }

      const output = await completedSession.getAllLogsAsString().catch(() => logOutput);
      const parsed = parseLoudnessOutput(output || logOutput, targetLufs);
      return parsed
        ? { state: 'success', data: parsed } as const
        : { state: 'failed' } as const;
    } catch {
      return { state: 'failed' } as const;
    }
  })();

  return {
    cancel: async () => {
      try {
        if (sessionId !== 0) {
          await ffmpegKit.FFmpegKit.cancel(sessionId);
          return;
        }

        const session = await sessionPromise;
        await ffmpegKit.FFmpegKit.cancel(session.getSessionId());
      } catch {
        rejectCompleted(new Error('ffmpeg-cancel-failed'));
      }
    },
    result,
  };
}

async function resolveInputPath(
  filePath: string,
  ffmpegKit: FFmpegKitModule,
): Promise<string> {
  if (filePath.startsWith('content://')) {
    return ffmpegKit.FFmpegKitConfig.getSafParameterForRead(filePath);
  }

  if (filePath.startsWith('file://')) {
    return decodeURIComponent(filePath.slice('file://'.length));
  }

  return filePath;
}

async function getFFmpegKitModule(): Promise<FFmpegKitModule | null> {
  if (!hasNativeFfmpegKitModule()) {
    return null;
  }

  return import('ffmpeg-kit-react-native');
}

function hasNativeFfmpegKitModule(): boolean {
  const nativeModule = (NativeModules as Record<string, unknown>).FFmpegKitReactNativeModule as {
    ffmpegSession?: unknown;
  } | undefined;

  return typeof nativeModule?.ffmpegSession === 'function';
}

function parseLoudnessOutput(output: string, targetLufs: number): LoudnessData | null {
  const matches = [...output.matchAll(LUFS_REGEX)];
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) {
    return null;
  }

  const lufs = Number.parseFloat(lastMatch[1]);
  if (!Number.isFinite(lufs)) {
    return null;
  }

  return {
    lufs,
    gain: Math.max(-20, Math.min(20, targetLufs - lufs)),
  };
}
