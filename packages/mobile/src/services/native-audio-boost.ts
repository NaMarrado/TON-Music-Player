import { NativeModules } from 'react-native';

type AudioBoostModule = {
  attach(sessionId: number): Promise<void>;
  setTargetGainMb(value: number): Promise<void>;
  release(): Promise<void>;
};

type IosPlaybackEngineModule = {
  attachAudioBoost(sessionId: number): Promise<void>;
  setAudioBoostTargetGain(value: number): Promise<void>;
  releaseAudioBoost(): Promise<void>;
};

function getAudioBoostModule(): AudioBoostModule | null {
  return NativeModules.AudioBoost as AudioBoostModule | undefined ?? null;
}

function getIosPlaybackEngineModule(): IosPlaybackEngineModule | null {
  return NativeModules.IosPlaybackEngine as IosPlaybackEngineModule | undefined ?? null;
}

function getAudioBoostBackend():
  | AudioBoostModule
  | {
    attach: IosPlaybackEngineModule['attachAudioBoost'];
    setTargetGainMb: IosPlaybackEngineModule['setAudioBoostTargetGain'];
    release: IosPlaybackEngineModule['releaseAudioBoost'];
  }
  | null {
  const nativeModule = getAudioBoostModule();
  if (nativeModule) {
    return nativeModule;
  }

  const iosModule = getIosPlaybackEngineModule();
  if (!iosModule) {
    return null;
  }

  return {
    attach: iosModule.attachAudioBoost.bind(iosModule),
    setTargetGainMb: iosModule.setAudioBoostTargetGain.bind(iosModule),
    release: iosModule.releaseAudioBoost.bind(iosModule),
  };
}

export async function attachAudioBoost(sessionId: number): Promise<void> {
  const module = getAudioBoostBackend();
  if (!module) {
    throw new Error('AudioBoost native module is not available');
  }

  await module.attach(sessionId);
}

export async function setAudioBoostTargetGain(value: number): Promise<void> {
  const module = getAudioBoostBackend();
  if (!module) {
    throw new Error('AudioBoost native module is not available');
  }

  await module.setTargetGainMb(value);
}

export async function releaseAudioBoost(): Promise<void> {
  const module = getAudioBoostBackend();
  if (!module) {
    return;
  }

  await module.release();
}
