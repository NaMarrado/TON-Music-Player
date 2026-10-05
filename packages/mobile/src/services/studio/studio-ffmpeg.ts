import { NativeModules } from 'react-native';
import type { FFmpegKitModule } from './studio-types';

export interface FfmpegRun {
  cancel: () => Promise<void>;
  /** Resolves true when ffmpeg finished successfully, false when it failed or was cancelled. */
  done: Promise<boolean>;
}

function hasNativeFfmpegKit(): boolean {
  const native = Reflect.get(NativeModules, 'FFmpegKitReactNativeModule');
  return typeof native === 'object' && native !== null && typeof Reflect.get(native, 'ffmpegSession') === 'function';
}

async function loadFfmpegKit(): Promise<FFmpegKitModule | null> {
  return hasNativeFfmpegKit() ? import('ffmpeg-kit-react-native') : null;
}

/**
 * Runs ffmpeg with an argument list. `onTimeMs` receives how much output has been written so far, which together with
 * the known output length gives a progress value.
 */
export async function runFfmpeg(args: string[], onTimeMs?: (timeMs: number) => void): Promise<FfmpegRun> {
  const kit = await loadFfmpegKit();
  if (!kit) return { cancel: async () => undefined, done: Promise.resolve(false) };

  let sessionId = 0;
  let cancelled = false;
  const done = new Promise<boolean>((resolve) => {
    kit.FFmpegKit.executeWithArgumentsAsync(
      args,
      async (session) => {
        const code = await session.getReturnCode();
        resolve(!cancelled && kit.ReturnCode.isSuccess(code));
      },
      undefined,
      (statistics) => onTimeMs?.(statistics.getTime()),
    ).then((session) => {
      sessionId = session.getSessionId();
      if (cancelled) void kit.FFmpegKit.cancel(sessionId);
    }).catch(() => resolve(false));
  });

  return {
    cancel: async () => {
      cancelled = true;
      if (sessionId !== 0) await kit.FFmpegKit.cancel(sessionId);
    },
    done,
  };
}
