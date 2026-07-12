import { setAllEqBands as eqSetAllBands, setEqBandGain as eqSetBandGain } from '../equalizer-node';
import { getEngineState } from './state';

export function setEqBandGain(index: number, gain: number): void {
  const { eq } = getEngineState();
  if (eq && index >= 0 && index < eq.bands.length) {
    eqSetBandGain(eq.bands[index], gain);
  }
}

export function setAllEqBands(gains: number[]): void {
  const { eq } = getEngineState();
  if (eq) {
    eqSetAllBands(eq.bands, gains);
  }
}
