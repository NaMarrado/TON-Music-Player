import { NativeModules, Platform } from 'react-native';

type TrackPlayerNativeModule = {
  setPitch?: (ratio: number) => Promise<void>;
  getAudioSessionId?: () => Promise<number>;
};

type IosPlaybackEngineModule = {
  setPitch?: (ratio: number) => Promise<void>;
  getAudioSessionId?: () => Promise<number>;
};

type PitchControlModule = {
  setPitch: (ratio: number) => Promise<void>;
};

type AudioSessionModule = {
  getAudioSessionId: () => Promise<number>;
};

function getTrackPlayerNativeModule(): TrackPlayerNativeModule | null {
  if (Platform.OS === 'ios') {
    return null;
  }

  return (NativeModules.TrackPlayerModule as TrackPlayerNativeModule | undefined) ?? null;
}

function getIosPlaybackEngineModule(): IosPlaybackEngineModule | null {
  return (NativeModules.IosPlaybackEngine as IosPlaybackEngineModule | undefined) ?? null;
}

function getPitchControlModule(): PitchControlModule | null {
  const trackPlayerModule = getTrackPlayerNativeModule();
  if (typeof trackPlayerModule?.setPitch === 'function') {
    return { setPitch: trackPlayerModule.setPitch.bind(trackPlayerModule) };
  }

  const iosModule = getIosPlaybackEngineModule();
  if (typeof iosModule?.setPitch === 'function') {
    return { setPitch: iosModule.setPitch.bind(iosModule) };
  }

  return null;
}

function getAudioSessionModule(): AudioSessionModule | null {
  const trackPlayerModule = getTrackPlayerNativeModule();
  if (typeof trackPlayerModule?.getAudioSessionId === 'function') {
    return { getAudioSessionId: trackPlayerModule.getAudioSessionId.bind(trackPlayerModule) };
  }

  const iosModule = getIosPlaybackEngineModule();
  if (typeof iosModule?.getAudioSessionId === 'function') {
    return { getAudioSessionId: iosModule.getAudioSessionId.bind(iosModule) };
  }

  return null;
}

export async function setPitch(ratio: number): Promise<void> {
  const module = getPitchControlModule();
  if (!module) {
    throw new Error('Pitch control is unavailable');
  }

  await module.setPitch(ratio);
}

export async function getAudioSessionId(): Promise<number> {
  const module = getAudioSessionModule();
  if (!module) {
    throw new Error('Audio session is unavailable');
  }

  return module.getAudioSessionId();
}
