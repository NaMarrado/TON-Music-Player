import { destroyPitchShifter } from '../pitch-shifter';
import { getEngineState, resetEngineState } from './state';

export function muteHead(): void {
  const { headGain } = getEngineState();
  if (!headGain) {
    return;
  }

  headGain.gain.cancelScheduledValues(0);
  headGain.gain.value = 0;
}

export function unmuteHead(): void {
  const state = getEngineState();
  if (!state.headGain) {
    return;
  }

  if (state.ctx && state.ctx.state === 'running') {
    const now = state.ctx.currentTime;
    state.headGain.gain.cancelScheduledValues(now);
    state.headGain.gain.setValueAtTime(0, now);
    state.headGain.gain.linearRampToValueAtTime(1, now + 0.005);
  } else {
    state.headGain.gain.value = 1;
  }
}

export function resumeContext(): Promise<void> {
  const { ctx } = getEngineState();
  if (ctx && ctx.state === 'suspended') {
    return ctx.resume();
  }

  return Promise.resolve();
}

export function destroyAudioEngine(): void {
  const state = getEngineState();
  if (state.pitchHandle) {
    destroyPitchShifter(state.pitchHandle);
  }

  if (state.ctx) {
    void state.ctx.close();
  }

  resetEngineState();
}
