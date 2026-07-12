import { createPitchShifter, destroyPitchShifter, setPitchRatio as pitchSetRatio } from '../pitch-shifter';
import { getEngineState } from './state';

export function enablePitchShifter(ratio: number): void {
  const state = getEngineState();
  if (!state.ctx || !state.headGain || !state.eq) {
    return;
  }

  if (state.pitchHandle) {
    pitchSetRatio(state.pitchHandle, ratio);
    return;
  }

  state.pitchHandle = createPitchShifter(state.ctx, ratio);
  state.headGain.disconnect();
  state.headGain.connect(state.pitchHandle.node);
  state.pitchHandle.node.connect(state.eq.input);
}

export function disablePitchShifter(): void {
  const state = getEngineState();
  if (!state.headGain || !state.eq || !state.pitchHandle) {
    return;
  }

  state.headGain.disconnect();
  destroyPitchShifter(state.pitchHandle);
  state.pitchHandle = null;
  state.headGain.connect(state.eq.input);
}

export function setPitchRatio(ratio: number): void {
  const { pitchHandle } = getEngineState();
  if (pitchHandle) {
    pitchSetRatio(pitchHandle, ratio);
  }
}
