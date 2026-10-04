export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  const scale = 1 / channels.length;
  for (const channel of channels) for (let index = 0; index < length; index += 1) mono[index] += channel[index] * scale;
  return mono;
}

/** Box-filter decimation (average of `factor` samples), cheap and adequate for tempo/key analysis. */
export function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const length = Math.floor(samples.length / factor);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    const base = index * factor;
    for (let offset = 0; offset < factor; offset += 1) sum += samples[base + offset];
    output[index] = sum / factor;
  }
  return output;
}

/** Maximum absolute sample value per bucket, 0..1 (for drawing a waveform). */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Float32Array(count);
  const per = samples.length / count;
  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor(bucket * per);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((bucket + 1) * per)));
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const value = Math.abs(samples[index]);
      if (value > peak) peak = value;
    }
    peaks[bucket] = Math.min(1, peak);
  }
  return peaks;
}

/** 32-bit float WAV (format 3), little endian. */
export function encodeWavFloat32(channels: Float32Array[], sampleRate: number): Uint8Array {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * channelCount * 4;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 4, true);
  view.setUint16(32, channelCount * 4, true);
  view.setUint16(34, 32, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      view.setFloat32(offset, channels[channel][frame], true);
      offset += 4;
    }
  }
  return new Uint8Array(buffer);
}
