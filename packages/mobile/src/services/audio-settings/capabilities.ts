import { NativeModules, Platform } from 'react-native';

export function supportsPitchAdjustment(): boolean {
  const iosPlaybackModule = NativeModules.IosPlaybackEngine as { setPitch?: unknown } | undefined;
  if (Platform.OS === 'ios') {
    return typeof iosPlaybackModule?.setPitch === 'function';
  }

  const trackPlayerModule = NativeModules.TrackPlayerModule as { setPitch?: unknown } | undefined;
  return typeof trackPlayerModule?.setPitch === 'function';
}

export function supportsEqualizerEffects(): boolean {
  const module = NativeModules.AudioEqualizer as { attach?: unknown } | undefined;
  const iosPlaybackModule = NativeModules.IosPlaybackEngine as { attachEqualizer?: unknown } | undefined;
  return typeof module?.attach === 'function'
    || typeof iosPlaybackModule?.attachEqualizer === 'function';
}

export function supportsLoudnessBoost(): boolean {
  const module = NativeModules.AudioBoost as {
    attach?: unknown;
    setTargetGainMb?: unknown;
  } | undefined;
  const iosPlaybackModule = NativeModules.IosPlaybackEngine as {
    attachAudioBoost?: unknown;
    setAudioBoostTargetGain?: unknown;
  } | undefined;
  return (
    typeof module?.attach === 'function'
    && typeof module?.setTargetGainMb === 'function'
  ) || (
    typeof iosPlaybackModule?.attachAudioBoost === 'function'
    && typeof iosPlaybackModule?.setAudioBoostTargetGain === 'function'
  );
}

export function supportsLoudnessAnalysis(): boolean {
  const ffmpegModule = NativeModules.FFmpegKitReactNativeModule as {
    ffmpegSession?: unknown;
  } | undefined;
  const iosAnalyzerModule = NativeModules.IosLoudnessAnalyzer as {
    startAnalysis?: unknown;
  } | undefined;

  return typeof ffmpegModule?.ffmpegSession === 'function'
    || typeof iosAnalyzerModule?.startAnalysis === 'function';
}
