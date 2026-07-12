import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';

type FFmpegKitModule = typeof import('ffmpeg-kit-react-native');
type FFmpegSession = import('ffmpeg-kit-react-native').FFmpegSession;

export async function transcodeAndroidAac96(
  filePath: string,
  onCancelable?: (cancel: () => Promise<void>) => void,
): Promise<string> {
  const ffmpeg = await getFfmpegKit();
  if (!ffmpeg) throw new Error('android_aac_encoder_unavailable');

  const inputPath = toNativePath(filePath);
  const outputUri = filePath.replace(/\.m4a$/i, '')
    + `.normal-${Date.now()}-${Math.random().toString(16).slice(2)}.m4a`;
  const outputPath = toNativePath(outputUri);
  let resolveCompleted!: (session: FFmpegSession) => void;
  let rejectCompleted!: (error: unknown) => void;
  const completed = new Promise<FFmpegSession>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const sessionPromise = ffmpeg.FFmpegKit.executeWithArgumentsAsync(
    [
      '-hide_banner', '-y', '-i', inputPath,
      '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart', outputPath,
    ],
    (session) => resolveCompleted(session),
  );

  onCancelable?.(async () => {
    try {
      const session = await sessionPromise;
      await ffmpeg.FFmpegKit.cancel(session.getSessionId());
    } catch (error) {
      rejectCompleted(error);
    }
  });

  try {
    await sessionPromise;
    const completedSession = await completed;
    const returnCode = await completedSession.getReturnCode();
    if (ffmpeg.ReturnCode.isCancel(returnCode)) throw new Error('download_cancelled');
    if (!ffmpeg.ReturnCode.isSuccess(returnCode)) {
      const logs = await completedSession.getAllLogsAsString().catch(() => '');
      throw new Error(logs || 'android_aac_conversion_failed');
    }

    const outputInfo = await FileSystem.getInfoAsync(outputUri, { size: true });
    if (!outputInfo.exists || (outputInfo.size ?? 0) < 1000) {
      throw new Error('android_aac_conversion_output_invalid');
    }

    await replaceFileSafely(outputUri, filePath);
    return filePath;
  } catch (error) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => {});
    throw error;
  }
}

async function replaceFileSafely(sourceUri: string, destinationUri: string): Promise<void> {
  const backupUri = `${destinationUri}.source-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await FileSystem.moveAsync({ from: destinationUri, to: backupUri });
  try {
    await FileSystem.moveAsync({ from: sourceUri, to: destinationUri });
    await FileSystem.deleteAsync(backupUri, { idempotent: true });
  } catch (error) {
    await FileSystem.moveAsync({ from: backupUri, to: destinationUri }).catch(() => {});
    throw error;
  }
}

function toNativePath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
}

async function getFfmpegKit(): Promise<FFmpegKitModule | null> {
  const nativeModule = (NativeModules as Record<string, unknown>).FFmpegKitReactNativeModule as {
    ffmpegSession?: unknown;
  } | undefined;
  if (typeof nativeModule?.ffmpegSession !== 'function') return null;
  return import('ffmpeg-kit-react-native');
}
