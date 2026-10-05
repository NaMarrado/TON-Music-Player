/** In-place iterative radix-2 FFT. `size` must be a power of two; `real`/`imag` hold `size` samples. */
export interface FftPlan {
  size: number;
  cos: Float64Array;
  sin: Float64Array;
  reverse: Uint32Array;
}

export function createFftPlan(size: number): FftPlan {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two');
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((2 * Math.PI * index) / size);
    sin[index] = -Math.sin((2 * Math.PI * index) / size);
  }
  const bits = Math.log2(size);
  const reverse = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let result = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      result = (result << 1) | (value & 1);
      value >>= 1;
    }
    reverse[index] = result;
  }
  return { size, cos, sin, reverse };
}

export function fft(plan: FftPlan, real: Float64Array, imag: Float64Array): void {
  const { size, cos, sin, reverse } = plan;
  for (let index = 0; index < size; index += 1) {
    const target = reverse[index];
    if (target > index) {
      const r = real[index]; real[index] = real[target]; real[target] = r;
      const i = imag[index]; imag[index] = imag[target]; imag[target] = i;
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const half = length >> 1;
    const step = size / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < half; offset += 1) {
        const wr = cos[offset * step];
        const wi = sin[offset * step];
        const a = start + offset;
        const b = a + half;
        const tr = real[b] * wr - imag[b] * wi;
        const ti = real[b] * wi + imag[b] * wr;
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
      }
    }
  }
}

export function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  return window;
}
