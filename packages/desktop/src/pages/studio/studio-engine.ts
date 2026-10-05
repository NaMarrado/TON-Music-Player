import {
  CUSTOM_PROTOCOL,
  STUDIO_SAMPLE_RATE,
  audibleTracks,
  fadeInGain,
  fadeOutGain,
  generateReverbImpulse,
  planPlayback,
  reverbDryGain,
  reverbImpulseKey,
  reverbImpulseSpec,
  type PlaybackItem,
  type StudioAsset,
  type StudioFadeCurve,
  type StudioProject,
  type StudioTrack,
} from '@ton/core';
import type { AnalysisRequest, AnalysisResult } from './analysis-worker';

/** Decoded audio is by far the biggest cost (a 5 minute stereo song is ~212 MB), so it is kept under a budget. */
const MEMORY_BUDGET_BYTES = 900 * 1024 * 1024;
const BASE_LOOKAHEAD_SEC = 0.15;
const FADE_POINTS = 96;
const MAX_PARALLEL_DECODES = 2;

export interface AssetAnalysis {
  durationSec: number;
  bpm: number | null;
  key: string | null;
}

interface DecodedAsset {
  buffer: AudioBuffer;
  reversed: AudioBuffer | null;
  lastUsed: number;
}

interface TrackChain {
  input: GainNode;
  filter: BiquadFilterNode | null;
  bass: BiquadFilterNode;
  treble: BiquadFilterNode;
  echo: { delay: DelayNode; feedback: GainNode; wet: GainNode } | null;
  reverb: { dry: GainNode; wet: GainNode } | null;
  panLeft: GainNode;
  panRight: GainNode;
  volume: GainNode;
}

interface PlayingGraph {
  startedAt: number;
  fromSec: number;
  signature: string;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  chains: Record<string, TrackChain>;
  sources: AudioBufferSourceNode[];
  nodes: AudioNode[];
}

type Listener = () => void;

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** Anything that changes which nodes exist or when clips play. Everything else is applied to the running graph in place. */
function structureSignature(project: StudioProject): string {
  return JSON.stringify(audibleTracks(project).map((track) => [
    track.id,
    track.effects.filter?.type ?? '',
    track.effects.echo !== null && track.effects.echo.mix > 0,
    track.effects.reverb !== null && track.effects.reverb.mix > 0 ? reverbImpulseKey(track.effects.reverb) : '',
    track.clips.map((clip) => [
      clip.id, clip.assetId, clip.startSec, clip.inSec, clip.outSec, clip.speed, clip.pitchLock, clip.semitones, clip.reverse,
      clip.gainDb, clip.fadeIn.seconds, clip.fadeIn.curve, clip.fadeOut.seconds, clip.fadeOut.curve,
    ]),
  ]));
}

function curveValues(rising: boolean, curve: StudioFadeCurve, fromProgress: number, base: number): Float32Array {
  const values = new Float32Array(FADE_POINTS);
  for (let index = 0; index < FADE_POINTS; index += 1) {
    const progress = fromProgress + ((1 - fromProgress) * index) / (FADE_POINTS - 1);
    values[index] = base * (rising ? fadeInGain(curve, progress) : fadeOutGain(curve, progress));
  }
  return values;
}

export class StudioEngine {
  private readonly decodeContext = new OfflineAudioContext(2, 1, STUDIO_SAMPLE_RATE);
  private readonly decoded = new Map<string, DecodedAsset>();
  private readonly pending = new Map<string, Promise<AssetAnalysis>>();
  private readonly peaks = new Map<string, Float32Array[]>();
  private readonly impulses = new Map<string, AudioBuffer>();
  private readonly listeners = new Set<Listener>();
  private readonly waiting: Array<() => void> = [];
  private activeDecodes = 0;
  private worker: Worker | null = null;
  private readonly analysisWaiters = new Map<string, (result: AnalysisResult) => void>();
  private context: AudioContext | null = null;
  private contextReady: Promise<AudioContext> | null = null;
  private workletLatencySec = 0;
  private graph: PlayingGraph | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  getPeaks(assetId: string): Float32Array[] | undefined {
    return this.peaks.get(assetId);
  }

  isDecoded(assetId: string): boolean {
    return this.decoded.has(assetId);
  }

  get isPlaying(): boolean {
    return this.graph !== null;
  }

  /** Seconds of latency the pitch-lock stage adds (measured once, used to keep those clips on the beat). */
  get shifterLatencySec(): number {
    return this.workletLatencySec;
  }

  position(): number {
    if (!this.graph || !this.context) return 0;
    return this.graph.fromSec + Math.max(0, this.context.currentTime - this.graph.startedAt);
  }

  // ---- decoding and analysis -------------------------------------------------------------------------------------

  /** Decodes the file, then analyses it in a worker. Calling it again for the same asset shares the work. */
  loadAsset(asset: StudioAsset): Promise<AssetAnalysis> {
    const existing = this.pending.get(asset.id);
    if (existing) return existing;
    const job = this.decodeAndAnalyse(asset).finally(() => this.pending.delete(asset.id));
    this.pending.set(asset.id, job);
    return job;
  }

  private async slot(): Promise<void> {
    if (this.activeDecodes >= MAX_PARALLEL_DECODES) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.activeDecodes += 1;
  }

  private release(): void {
    this.activeDecodes -= 1;
    this.waiting.shift()?.();
  }

  private async decodeAndAnalyse(asset: StudioAsset): Promise<AssetAnalysis> {
    await this.slot();
    let decoded: AudioBuffer;
    try {
      const response = await fetch(`${CUSTOM_PROTOCOL}://${encodeURIComponent(asset.path)}`);
      if (!response.ok) throw new Error(`Cannot read ${asset.title}`);
      decoded = await this.decodeContext.decodeAudioData(await response.arrayBuffer());
    } finally {
      this.release();
    }
    this.decoded.set(asset.id, { buffer: decoded, reversed: null, lastUsed: performance.now() });
    this.evictOverBudget([asset.id]);
    if (this.peaks.has(asset.id) && asset.bpm !== null) {
      this.notify();
      return { durationSec: decoded.duration, bpm: asset.bpm, key: asset.key };
    }
    const result = await this.analyse(asset.id, decoded);
    this.peaks.set(asset.id, result.peaks);
    this.notify();
    return { durationSec: decoded.duration, bpm: result.bpm, key: result.key };
  }

  private analyse(id: string, buffer: AudioBuffer): Promise<AnalysisResult> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<AnalysisResult>) => {
        this.analysisWaiters.get(event.data.id)?.(event.data);
        this.analysisWaiters.delete(event.data.id);
      };
    }
    const mono = new Float32Array(buffer.length);
    const channels = buffer.numberOfChannels;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / channels;
    }
    return new Promise<AnalysisResult>((resolve) => {
      this.analysisWaiters.set(id, resolve);
      const request: AnalysisRequest = { id, mono, sampleRate: buffer.sampleRate };
      this.worker?.postMessage(request, { transfer: [mono.buffer] });
    });
  }

  private usedBytes(): number {
    let total = 0;
    for (const entry of this.decoded.values()) total += bufferBytes(entry.buffer) + (entry.reversed ? bufferBytes(entry.reversed) : 0);
    return total;
  }

  /** Drops the least recently used decoded audio until the budget fits; dropped assets decode again when needed. */
  private evictOverBudget(keep: string[]): void {
    if (this.usedBytes() <= MEMORY_BUDGET_BYTES) return;
    const candidates = [...this.decoded.entries()].filter(([id]) => !keep.includes(id)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id] of candidates) {
      this.decoded.delete(id);
      if (this.usedBytes() <= MEMORY_BUDGET_BYTES) break;
    }
  }

  /** Forgets everything about assets that no project references any more. */
  forget(keepIds: string[]): void {
    for (const id of [...this.decoded.keys()]) if (!keepIds.includes(id)) this.decoded.delete(id);
    for (const id of [...this.peaks.keys()]) if (!keepIds.includes(id)) this.peaks.delete(id);
  }

  private reversedBuffer(entry: DecodedAsset): AudioBuffer {
    if (entry.reversed) return entry.reversed;
    const source = entry.buffer;
    const reversed = new AudioBuffer({ length: source.length, numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate });
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const from = source.getChannelData(channel);
      const to = reversed.getChannelData(channel);
      for (let index = 0, last = from.length - 1; index <= last; index += 1) to[index] = from[last - index];
    }
    entry.reversed = reversed;
    return reversed;
  }

  // ---- audio context ---------------------------------------------------------------------------------------------

  private async ensureContext(): Promise<AudioContext> {
    this.contextReady ??= (async () => {
      const context = new AudioContext({ sampleRate: STUDIO_SAMPLE_RATE, latencyHint: 'playback' });
      const workletUrl = new URL('./soundtouch-worklet.js', window.location.href).toString();
      await context.audioWorklet.addModule(workletUrl);
      this.context = context;
      this.workletLatencySec = await this.measureShifterLatency(workletUrl);
      return context;
    })();
    const context = await this.contextReady;
    if (context.state === 'suspended') await context.resume();
    return context;
  }

  /** Renders a click through the pitch shifter and reports how late it comes out. */
  private async measureShifterLatency(workletUrl: string): Promise<number> {
    const offline = new OfflineAudioContext(1, STUDIO_SAMPLE_RATE, STUDIO_SAMPLE_RATE);
    await offline.audioWorklet.addModule(workletUrl);
    const click = offline.createBuffer(1, 4096, STUDIO_SAMPLE_RATE);
    const clickAt = 1000;
    for (let index = 0; index < 64; index += 1) click.getChannelData(0)[clickAt + index] = Math.sin(index * 0.5) * Math.exp(-index / 12);
    const source = offline.createBufferSource();
    source.buffer = click;
    const shifter = new AudioWorkletNode(offline, 'soundtouch-processor');
    shifter.parameters.get('pitch')!.value = 0.9;
    source.connect(shifter);
    shifter.connect(offline.destination);
    source.start(0);
    const rendered = (await offline.startRendering()).getChannelData(0);
    let peak = 0;
    for (const value of rendered) peak = Math.max(peak, Math.abs(value));
    if (peak < 1e-4) return 0;
    const first = rendered.findIndex((value) => Math.abs(value) > peak * 0.25);
    return Math.max(0, (first - clickAt) / STUDIO_SAMPLE_RATE);
  }

  private impulseBuffer(context: BaseAudioContext, key: string): AudioBuffer {
    const cached = this.impulses.get(key);
    if (cached) return cached;
    const spec = reverbImpulseSpec(key);
    const [left, right] = generateReverbImpulse(spec.size, spec.damping, STUDIO_SAMPLE_RATE);
    const buffer = context.createBuffer(2, left.length, STUDIO_SAMPLE_RATE);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right);
    this.impulses.set(key, buffer);
    return buffer;
  }

  // ---- playback --------------------------------------------------------------------------------------------------

  /** Decodes every asset the audible clips need from `fromSec` on, so playback starts without gaps. */
  async prepare(project: StudioProject, fromSec: number): Promise<void> {
    const needed: StudioAsset[] = [];
    for (const item of planPlayback(project, fromSec)) {
      const asset = project.assets[item.assetId];
      if (asset && !needed.includes(asset)) needed.push(asset);
    }
    await Promise.all(needed.map((asset) => (this.decoded.has(asset.id) ? Promise.resolve() : this.loadAsset(asset).then(() => undefined))));
    for (const asset of needed) {
      const entry = this.decoded.get(asset.id);
      if (entry) entry.lastUsed = performance.now();
    }
    this.evictOverBudget(needed.map((asset) => asset.id));
  }

  async play(project: StudioProject, fromSec: number): Promise<void> {
    const context = await this.ensureContext();
    await this.prepare(project, fromSec);
    this.teardown();
    const lookahead = Math.max(BASE_LOOKAHEAD_SEC, this.workletLatencySec + 0.05);
    const startAt = context.currentTime + lookahead;
    const master = context.createGain();
    master.gain.value = 10 ** (project.masterGainDb / 20);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    master.connect(limiter);
    limiter.connect(context.destination);

    const graph: PlayingGraph = {
      startedAt: startAt,
      fromSec,
      signature: structureSignature(project),
      master,
      limiter,
      chains: {},
      sources: [],
      nodes: [master, limiter],
    };
    for (const track of audibleTracks(project)) graph.chains[track.id] = this.buildChain(context, track, master, graph.nodes);

    for (const item of planPlayback(project, fromSec)) {
      const entry = this.decoded.get(item.assetId);
      const chain = graph.chains[item.trackId];
      if (!entry || !chain) continue;
      this.startClip(context, graph, item, entry, chain, startAt);
    }
    this.graph = graph;
    this.notify();
  }

  private buildChain(context: AudioContext, track: StudioTrack, destination: AudioNode, nodes: AudioNode[]): TrackChain {
    const effects = track.effects;
    const input = context.createGain();
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    let tail: AudioNode = input;
    let filter: BiquadFilterNode | null = null;
    if (effects.filter) {
      filter = context.createBiquadFilter();
      filter.type = effects.filter.type;
      filter.frequency.value = effects.filter.hz;
      filter.Q.value = 0.7071;
      tail.connect(filter);
      tail = filter;
    }
    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 100;
    bass.gain.value = effects.bassDb;
    tail.connect(bass);
    const treble = context.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 8000;
    treble.gain.value = effects.trebleDb;
    bass.connect(treble);
    tail = treble;

    const echoSum = context.createGain();
    tail.connect(echoSum);
    let echo: TrackChain['echo'] = null;
    if (effects.echo && effects.echo.mix > 0) {
      const delay = context.createDelay(2);
      delay.delayTime.value = effects.echo.seconds;
      const feedback = context.createGain();
      feedback.gain.value = effects.echo.feedback;
      const wet = context.createGain();
      wet.gain.value = effects.echo.mix;
      tail.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(echoSum);
      echo = { delay, feedback, wet };
      nodes.push(delay, feedback, wet);
    }

    const reverbSum = context.createGain();
    let reverb: TrackChain['reverb'] = null;
    if (effects.reverb && effects.reverb.mix > 0) {
      const dry = context.createGain();
      dry.gain.value = reverbDryGain(effects.reverb.mix);
      const wet = context.createGain();
      wet.gain.value = effects.reverb.mix;
      const convolver = context.createConvolver();
      convolver.normalize = false;
      convolver.buffer = this.impulseBuffer(context, reverbImpulseKey(effects.reverb));
      echoSum.connect(dry);
      dry.connect(reverbSum);
      echoSum.connect(convolver);
      convolver.connect(wet);
      wet.connect(reverbSum);
      reverb = { dry, wet };
      nodes.push(dry, wet, convolver);
    } else {
      echoSum.connect(reverbSum);
    }

    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    const panLeft = context.createGain();
    const panRight = context.createGain();
    reverbSum.connect(splitter);
    splitter.connect(panLeft, 0);
    splitter.connect(panRight, 1);
    panLeft.connect(merger, 0, 0);
    panRight.connect(merger, 0, 1);
    const volume = context.createGain();
    merger.connect(volume);
    volume.connect(destination);
    nodes.push(input, bass, treble, echoSum, reverbSum, splitter, merger, panLeft, panRight, volume);
    if (filter) nodes.push(filter);
    const chain: TrackChain = { input, filter, bass, treble, echo, reverb, panLeft, panRight, volume };
    this.applyTrackParams(chain, track);
    return chain;
  }

  private applyTrackParams(chain: TrackChain, track: StudioTrack): void {
    const effects = track.effects;
    chain.volume.gain.value = track.volume;
    chain.bass.gain.value = effects.bassDb;
    chain.treble.gain.value = effects.trebleDb;
    chain.panLeft.gain.value = Math.min(1, 1 - effects.pan);
    chain.panRight.gain.value = Math.min(1, 1 + effects.pan);
    if (chain.filter && effects.filter) chain.filter.frequency.value = effects.filter.hz;
    if (chain.echo && effects.echo) {
      chain.echo.delay.delayTime.value = effects.echo.seconds;
      chain.echo.feedback.gain.value = effects.echo.feedback;
      chain.echo.wet.gain.value = effects.echo.mix;
    }
    if (chain.reverb && effects.reverb) {
      chain.reverb.dry.gain.value = reverbDryGain(effects.reverb.mix);
      chain.reverb.wet.gain.value = effects.reverb.mix;
    }
  }

  private startClip(context: AudioContext, graph: PlayingGraph, item: PlaybackItem, entry: DecodedAsset, chain: TrackChain, startAt: number): void {
    const buffer = item.reverse ? this.reversedBuffer(entry) : entry.buffer;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = item.playbackRate;
    let tail: AudioNode = source;
    let latency = 0;
    if (Math.abs(item.pitchCorrection - 1) > 1e-4) {
      const shifter = new AudioWorkletNode(context, 'soundtouch-processor');
      shifter.parameters.get('pitch')!.value = item.pitchCorrection;
      source.connect(shifter);
      tail = shifter;
      latency = this.workletLatencySec;
      graph.nodes.push(shifter);
    }
    const gain = context.createGain();
    tail.connect(gain);
    gain.connect(chain.input);
    graph.nodes.push(gain);

    const audibleStart = startAt + item.delaySec;
    this.scheduleEnvelope(gain.gain, item, audibleStart);

    let offset = item.reverse ? buffer.duration - (item.sourceOffsetSec + item.sourceLengthSec) : item.sourceOffsetSec;
    let length = item.sourceLengthSec;
    let when = audibleStart - latency;
    const now = context.currentTime;
    if (when < now) {
      const skipped = (now - when) * item.playbackRate;
      offset += skipped;
      length -= skipped;
      when = now;
    }
    if (length <= 0) return;
    source.start(when, offset);
    source.stop(when + length / item.playbackRate);
    graph.sources.push(source);
  }

  private scheduleEnvelope(param: AudioParam, item: PlaybackItem, audibleStart: number): void {
    const base = item.gain;
    const elapsed = item.clipOffsetSec;
    const total = item.clipDurationSec;
    const fadeIn = item.fadeIn;
    const fadeOut = item.fadeOut;
    const fadeOutStart = total - fadeOut.seconds;
    let initial = base;
    if (fadeIn.seconds > 0 && elapsed < fadeIn.seconds) initial *= fadeInGain(fadeIn.curve, elapsed / fadeIn.seconds);
    if (fadeOut.seconds > 0 && elapsed > fadeOutStart) initial *= fadeOutGain(fadeOut.curve, (elapsed - fadeOutStart) / fadeOut.seconds);
    param.setValueAtTime(initial, audibleStart);
    const schedule = (values: Float32Array, when: number, duration: number) => {
      if (duration <= 0) return;
      try {
        param.setValueCurveAtTime(values, when, duration);
      } catch {
        param.setValueAtTime(values[values.length - 1], when + duration);
      }
    };
    if (fadeIn.seconds > 0 && elapsed < fadeIn.seconds) {
      schedule(curveValues(true, fadeIn.curve, elapsed / fadeIn.seconds, base), audibleStart, fadeIn.seconds - elapsed);
    }
    if (fadeOut.seconds > 0) {
      const fadeStart = Math.max(elapsed, fadeOutStart);
      schedule(curveValues(false, fadeOut.curve, (fadeStart - fadeOutStart) / fadeOut.seconds, base), audibleStart + (fadeStart - elapsed), total - fadeStart);
    }
  }

  /** Applies volume, tone, pan, echo and reverb amounts to the running graph. False when the graph must be rebuilt. */
  updateLive(project: StudioProject): boolean {
    const graph = this.graph;
    if (!graph || graph.signature !== structureSignature(project)) return false;
    graph.master.gain.value = 10 ** (project.masterGainDb / 20);
    for (const track of audibleTracks(project)) {
      const chain = graph.chains[track.id];
      if (chain) this.applyTrackParams(chain, track);
    }
    return true;
  }

  /** Stops playback and returns where it stopped. */
  pause(): number {
    const position = this.position();
    this.teardown();
    this.notify();
    return position;
  }

  private teardown(): void {
    const graph = this.graph;
    if (!graph) return;
    for (const source of graph.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    for (const node of graph.nodes) node.disconnect();
    this.graph = null;
  }

  dispose(): void {
    this.teardown();
    this.decoded.clear();
    this.peaks.clear();
    this.worker?.terminate();
    this.worker = null;
    void this.context?.close();
    this.context = null;
    this.contextReady = null;
  }
}

export const studioEngine = new StudioEngine();
