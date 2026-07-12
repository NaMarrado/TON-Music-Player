import type { EqInfo } from '../native-equalizer';

export type AudioEffectsStatus = 'idle' | 'deferred' | 'attached' | 'unsupported';

const runtimeState: {
  attachedSessionId: number;
  eqInfo: EqInfo | null;
  status: AudioEffectsStatus;
} = {
  attachedSessionId: 0,
  eqInfo: null,
  status: 'idle',
};

export function getEqInfo(): EqInfo | null {
  return runtimeState.eqInfo;
}

export function setEqRuntimeInfo(info: EqInfo | null): void {
  runtimeState.eqInfo = info;
}

export function getAudioEffectsStatus(): AudioEffectsStatus {
  return runtimeState.status;
}

export function setAudioEffectsStatus(status: AudioEffectsStatus): void {
  runtimeState.status = status;
}

export function getAttachedAudioSessionId(): number {
  return runtimeState.attachedSessionId;
}

export function setAttachedAudioSessionId(sessionId: number): void {
  runtimeState.attachedSessionId = sessionId;
}
