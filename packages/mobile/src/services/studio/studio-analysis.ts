import * as FileSystem from 'expo-file-system';
import { computePeaks, detectBpm, detectKey } from '@ton/core';
import { base64ToUint8, ensureWorkDir, toFfmpegPath } from './studio-files';
import { runFfmpeg } from './studio-ffmpeg';

const PEAK_RATE = 2000;
const ANALYSIS_RATE = 8000;
const PEAK_MAX_SEC = 20 * 60;
const ANALYSIS_WINDOW_SEC = 90;
const PEAKS_PER_SEC = 20;
const MAX_PEAK_BUCKETS = 12000;
/** A weak estimate is worse than none: the BPM chip drives tempo sync, so only confident values are used. */
const MIN_BPM_CONFIDENCE = 0.15;

export interface AssetAnalysis {
  durationSec: number;
  peaks: Float32Array;
  bpm: number | null;
  key: string | null;
}

async function readPcm(uri: string): Promise<Float32Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToUint8(base64);
  const view = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const samples = new Float32Array(view.length);
  for (let index = 0; index < view.length; index += 1) samples[index] = view[index] / 32768;
  return samples;
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Decodes a song once at a very low sample rate (two outputs in a single ffmpeg pass) and derives the waveform,
 * the length, the tempo and the key. Returns null when the file cannot be decoded.
 */
export async function analyseSong(path: string, knownDurationSec: number): Promise<AssetAnalysis | null> {
  const directory = await ensureWorkDir();
  const id = Math.random().toString(36).slice(2, 10);
  const peaksUri = `${directory}${id}-peaks.pcm`;
  const analysisUri = `${directory}${id}-analysis.pcm`;
  const windowStart = knownDurationSec > ANALYSIS_WINDOW_SEC * 2 ? Math.floor(knownDurationSec * 0.25) : 0;
  const run = await runFfmpeg([
    '-hide_banner', '-y', '-i', toFfmpegPath(path),
    '-vn', '-ac', '1', '-ar', String(PEAK_RATE), '-t', String(PEAK_MAX_SEC), '-f', 's16le', toFfmpegPath(peaksUri),
    '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE), '-ss', String(windowStart), '-t', String(ANALYSIS_WINDOW_SEC), '-f', 's16le', toFfmpegPath(analysisUri),
  ]);
  try {
    if (!(await run.done)) return null;
    const peakSamples = await readPcm(peaksUri);
    if (peakSamples.length === 0) return null;
    const durationSec = knownDurationSec > 0 ? knownDurationSec : peakSamples.length / PEAK_RATE;
    const peaks = computePeaks(peakSamples, Math.min(MAX_PEAK_BUCKETS, Math.max(16, Math.round(durationSec * PEAKS_PER_SEC))));
    await yieldToUi();
    const analysisSamples = await readPcm(analysisUri);
    await yieldToUi();
    const bpm = detectBpm(analysisSamples, ANALYSIS_RATE);
    await yieldToUi();
    const key = detectKey(analysisSamples, ANALYSIS_RATE);
    return { durationSec, peaks, bpm: bpm && bpm.confidence >= MIN_BPM_CONFIDENCE ? bpm.bpm : null, key: key ? key.camelot : null };
  } finally {
    await FileSystem.deleteAsync(peaksUri, { idempotent: true });
    await FileSystem.deleteAsync(analysisUri, { idempotent: true });
  }
}
