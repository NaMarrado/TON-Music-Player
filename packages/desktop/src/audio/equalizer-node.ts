/**
 * Equalizer Node - 10-band parametric EQ using BiquadFilterNodes.
 *
 * Frequencies: 31, 62, 125, 250, 500, 1K, 2K, 4K, 8K, 16K Hz
 * Each band: type "peaking", Q=1.4, gain range -12 to +12 dB.
 * At gain=0 every band is a transparent passthrough.
 */

import { EQ_BAND_FREQUENCIES, EQ_GAIN_MIN, EQ_GAIN_MAX } from '@ton/core';

export interface Equalizer {
  bands: BiquadFilterNode[];
  input: AudioNode;
  output: AudioNode;
}

export function createEqualizer(ctx: AudioContext): Equalizer {
  const bands: BiquadFilterNode[] = [];

  for (const freq of EQ_BAND_FREQUENCIES) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    filter.gain.value = 0;
    bands.push(filter);
  }

  // Chain bands in series: band[0] → band[1] → ... → band[9]
  for (let i = 0; i < bands.length - 1; i++) {
    bands[i].connect(bands[i + 1]);
  }

  return {
    bands,
    input: bands[0],
    output: bands[bands.length - 1],
  };
}

export function setEqBandGain(band: BiquadFilterNode, gain: number): void {
  band.gain.value = Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, gain));
}

export function setAllEqBands(bands: BiquadFilterNode[], gains: number[]): void {
  for (let i = 0; i < bands.length; i++) {
    const gain = gains[i] ?? 0;
    bands[i].gain.value = Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, gain));
  }
}
