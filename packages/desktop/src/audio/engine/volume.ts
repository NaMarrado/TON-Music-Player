import { volumePercentToDesktopGain } from '@ton/core';
import { getEngineState } from './state';

export const VOLUME_RAMP_SECONDS = 0.03;

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
  scheduleVolumeGain(state.volumeGain.gain, gain, now, immediate);
}

export function scheduleVolumeGain(
  param: AudioParam,
  targetGain: number,
  now: number,
  immediate = false,
): void {
  if (immediate || targetGain <= 0) {
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0, targetGain), now);
    return;
  }

  param.cancelAndHoldAtTime(now);
  param.linearRampToValueAtTime(targetGain, now + VOLUME_RAMP_SECONDS);
}
