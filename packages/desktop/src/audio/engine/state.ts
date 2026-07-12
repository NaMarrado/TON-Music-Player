import type { Equalizer } from '../equalizer-node';
import type { PitchShifterHandle } from '../pitch-shifter';

type EngineState = {
  ctx: AudioContext | null;
  headGain: GainNode | null;
  eq: Equalizer | null;
  loudnessGain: GainNode | null;
  limiter: DynamicsCompressorNode | null;
  volumeGain: GainNode | null;
  pitchHandle: PitchShifterHandle | null;
  chainInput: AudioNode | null;
  initPromise: Promise<void> | null;
};

const state: EngineState = {
  ctx: null,
  headGain: null,
  eq: null,
  loudnessGain: null,
  limiter: null,
  volumeGain: null,
  pitchHandle: null,
  chainInput: null,
  initPromise: null,
};

export function getEngineState(): EngineState {
  return state;
}

export function getAudioContext(): AudioContext {
  if (!state.ctx) {
    throw new Error('Audio engine not initialized');
  }

  return state.ctx;
}

export function getChainInput(): AudioNode {
  if (!state.chainInput) {
    throw new Error('Audio engine not initialized');
  }

  return state.chainInput;
}

export function resetEngineState(): void {
  state.ctx = null;
  state.headGain = null;
  state.eq = null;
  state.loudnessGain = null;
  state.limiter = null;
  state.volumeGain = null;
  state.pitchHandle = null;
  state.chainInput = null;
  state.initPromise = null;
}
