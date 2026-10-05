import { computePeaks, detectBpm, detectKey } from '@ton/core';

/** Number of waveform buckets per zoom level, coarse to fine. The fine level resolves a few samples per pixel at max zoom. */
const PEAK_LEVELS = [4096, 32768, 262144];
const MAX_ANALYSIS_SECONDS = 20 * 60;

export interface AnalysisRequest {
  id: string;
  mono: Float32Array;
  sampleRate: number;
}

export interface AnalysisResult {
  id: string;
  bpm: number | null;
  key: string | null;
  peaks: Float32Array[];
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, mono, sampleRate } = event.data;
  const peaks = PEAK_LEVELS.map((buckets) => computePeaks(mono, Math.min(buckets, Math.max(1, mono.length))));
  const analysable = mono.length / sampleRate <= MAX_ANALYSIS_SECONDS;
  const tempo = analysable ? detectBpm(mono, sampleRate) : null;
  const key = analysable ? detectKey(mono, sampleRate) : null;
  const result: AnalysisResult = {
    id,
    // A weak estimate is worse than none: the BPM chip drives tempo sync, so only confident values are shown.
    bpm: tempo && tempo.confidence >= 0.15 ? tempo.bpm : null,
    key: key ? key.camelot : null,
    peaks,
  };
  self.postMessage(result, { transfer: peaks.map((level) => level.buffer) });
};
