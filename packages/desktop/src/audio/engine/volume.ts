import { volumePercentToDesktopGain } from '@ton/core';
import { getEngineState } from './state';

export function setVolume(value: number): void {
  applyVolumeGain(value, false);
}

export function setVolumeImmediate(value: number): void {
  applyVolumeGain(value, true);
}

function applyVolumeGain(value: number, immediate: boolean): void {
  const state = getEngineState();
  if (!state.volumeGain || !state.ctx) {
    return;
  }

  const gain = volumePercentToDesktopGain(value);
  const now = state.ctx.currentTime;
  state.volumeGain.gain.cancelScheduledValues(now);
  if (immediate) {
    state.volumeGain.gain.setValueAtTime(gain, now);
    return;
  }

  state.volumeGain.gain.setValueAtTime(state.volumeGain.gain.value, now);
  state.volumeGain.gain.linearRampToValueAtTime(gain, now + 0.08);
}
