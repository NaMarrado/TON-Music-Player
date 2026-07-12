import { NativeModules } from 'react-native';

type AudioEqualizerModule = {
  attach(sessionId: number): Promise<EqInfo>;
  detach(): Promise<void>;
  getBandCount(): Promise<number>;
  getBandFrequencies(): Promise<number[]>;
  getBandLevelRange(): Promise<{ min: number; max: number }>;
  setBandLevel(band: number, level: number): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
};

type IosPlaybackEngineModule = {
  attachEqualizer(sessionId: number): Promise<EqInfo>;
  setEqEnabled(enabled: boolean): Promise<void>;
  setEqBandLevel(band: number, level: number): Promise<void>;
  getEqBandCount(): Promise<number>;
  getEqBandFrequencies(): Promise<number[]>;
  getEqBandLevelRange(): Promise<{ min: number; max: number }>;
};

export interface EqInfo {
  bandCount: number;
  frequencies: number[];
  levelRange: { min: number; max: number };
}

function getAudioEqualizerModule(): AudioEqualizerModule | null {
  return NativeModules.AudioEqualizer as AudioEqualizerModule | undefined ?? null;
}

function getIosPlaybackEngineModule(): IosPlaybackEngineModule | null {
  return NativeModules.IosPlaybackEngine as IosPlaybackEngineModule | undefined ?? null;
}

function getEqualizerBackend():
  | AudioEqualizerModule
  | {
    attach: IosPlaybackEngineModule['attachEqualizer'];
    setEnabled: IosPlaybackEngineModule['setEqEnabled'];
    setBandLevel: IosPlaybackEngineModule['setEqBandLevel'];
    getBandCount: IosPlaybackEngineModule['getEqBandCount'];
    getBandFrequencies: IosPlaybackEngineModule['getEqBandFrequencies'];
    getBandLevelRange: IosPlaybackEngineModule['getEqBandLevelRange'];
    detach?: () => Promise<void>;
  }
  | null {
  const nativeModule = getAudioEqualizerModule();
  if (nativeModule) {
    return nativeModule;
  }

  const iosModule = getIosPlaybackEngineModule();
  if (!iosModule) {
    return null;
  }

  return {
    attach: iosModule.attachEqualizer.bind(iosModule),
    setEnabled: iosModule.setEqEnabled.bind(iosModule),
    setBandLevel: iosModule.setEqBandLevel.bind(iosModule),
    getBandCount: iosModule.getEqBandCount.bind(iosModule),
    getBandFrequencies: iosModule.getEqBandFrequencies.bind(iosModule),
    getBandLevelRange: iosModule.getEqBandLevelRange.bind(iosModule),
  };
}

export async function attachEqualizer(sessionId: number): Promise<EqInfo> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  return module.attach(sessionId);
}

export async function detachEqualizer(): Promise<void> {
  const module = getEqualizerBackend();
  if (!module?.detach) {
    return;
  }

  await module.detach();
}

export async function setEqEnabled(enabled: boolean): Promise<void> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  await module.setEnabled(enabled);
}

export async function setEqBandLevel(band: number, level: number): Promise<void> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  await module.setBandLevel(band, Math.round(level));
}

export async function getEqBandCount(): Promise<number> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  return module.getBandCount();
}

export async function getEqBandFrequencies(): Promise<number[]> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  return module.getBandFrequencies();
}

export async function getEqBandLevelRange(): Promise<{ min: number; max: number }> {
  const module = getEqualizerBackend();
  if (!module) {
    throw new Error('AudioEqualizer native module is not available');
  }

  return module.getBandLevelRange();
}
