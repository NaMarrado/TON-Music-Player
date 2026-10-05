import type { StudioReverb } from './types';

/** The dry signal is lowered a little as the wet amount rises so the overall level stays steady. */
export const REVERB_DRY_FACTOR = 0.4;
export const REVERB_MIN_SECONDS = 0.4;
export const REVERB_MAX_SECONDS = 4;

export function reverbDecaySeconds(size: number): number {
  return REVERB_MIN_SECONDS + (REVERB_MAX_SECONDS - REVERB_MIN_SECONDS) * Math.min(1, Math.max(0, size));
}

export function reverbDryGain(mix: number): number {
  return 1 - REVERB_DRY_FACTOR * Math.min(1, Math.max(0, mix));
}

/** Quantised key so the preview and the render share (and cache) the same impulse response. */
export function reverbImpulseKey(reverb: Pick<StudioReverb, 'size' | 'damping'>): string {
  return `size${Math.round(reverb.size * 20)}_damp${Math.round(reverb.damping * 20)}`;
}

export function reverbImpulseSpec(key: string): { size: number; damping: number } {
  const match = /^size(\d+)_damp(\d+)$/.exec(key);
  if (!match) throw new Error('Invalid reverb impulse key: ' + key);
  return { size: Number(match[1]) / 20, damping: Number(match[2]) / 20 };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stereo impulse response: noise with an exponential 60 dB decay, a short pre-delay, and a low-pass that closes over
 * time (damping). The same seed always gives the same samples, so every platform convolves with identical data.
 */
export function generateReverbImpulse(size: number, damping: number, sampleRate: number): [Float32Array, Float32Array] {
  const decay = reverbDecaySeconds(size);
  const length = Math.floor(decay * sampleRate);
  const preDelay = Math.floor(0.012 * sampleRate);
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < 2; channel += 1) {
    const random = mulberry32(0x9e3779b1 + channel * 7919 + Math.round(size * 20) * 131 + Math.round(damping * 20));
    const impulse = new Float32Array(length);
    let filtered = 0;
    for (let index = preDelay; index < length; index += 1) {
      const t = (index - preDelay) / sampleRate;
      const envelope = Math.exp((-6.9078 * t) / decay);
      const attack = Math.min(1, (index - preDelay) / (0.02 * sampleRate));
      // One-pole low-pass: coefficient 1 = open, smaller = darker. Damping applies from the first reflection and
      // strengthens as the tail ages, like air absorption.
      const coefficient = 1 - damping * 0.95 * (0.3 + 0.7 * Math.min(1, t / decay));
      filtered += coefficient * ((random() * 2 - 1) - filtered);
      impulse[index] = filtered * envelope * attack;
    }
    channels.push(impulse);
  }
  for (const channel of channels) {
    let energy = 0;
    for (let index = 0; index < channel.length; index += 1) energy += channel[index] * channel[index];
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 1;
    for (let index = 0; index < channel.length; index += 1) channel[index] *= scale;
  }
  return [channels[0], channels[1]];
}
