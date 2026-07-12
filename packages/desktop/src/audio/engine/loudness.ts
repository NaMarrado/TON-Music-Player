import { getEngineState } from './state';

export function setLoudnessGain(dB: number): void {
  const { loudnessGain } = getEngineState();
  if (!loudnessGain) {
    return;
  }

  const clamped = Math.max(-20, Math.min(20, dB));
  loudnessGain.gain.value = Math.pow(10, clamped / 20);
}
