import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  addAsset, addClipToTrack, addTrack, buildRenderArgs, createClip, createEmptyProject, createTrack, encodeWavFloat32, generateReverbImpulse,
  placeTransition, requiredImpulseKeys, reverbImpulseSpec, updateClip, updateTrack, updateTrackEffects,
} from '../../packages/core/src/studio/index.ts';
import type { StudioAsset, StudioClip, StudioEffects, StudioProject } from '../../packages/core/src/studio/index.ts';
import { createFftPlan, fft, hannWindow } from '../../packages/core/src/studio/dsp/fft.ts';

// The exact ffmpeg build the desktop app downloads (binary-manager/urls.ts). Fetch it with .unlazy/studio/fetch-shipped-ffmpeg.mjs.
const FFMPEG = path.resolve(process.env.STUDIO_FFMPEG ?? '.unlazy/studio/bin/ffmpeg.exe');
const SR = 44100;
const work = mkdtempSync(path.join(tmpdir(), 'studio-render-'));
after(() => rmSync(work, { recursive: true, force: true }));
assert.ok(existsSync(FFMPEG), `shipped ffmpeg missing at ${FFMPEG}; run node .unlazy/studio/fetch-shipped-ffmpeg.mjs`);

let counter = 0;
const file = (name: string) => path.join(work, `${counter++}-${name}`);

interface Decoded { left: Float32Array; right: Float32Array; sampleRate: number }

function decodeWav(buffer: Buffer): Decoded {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  let offset = 12;
  let channels = 2;
  let sampleRate = SR;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = buffer.readUInt16LE(offset + 10); sampleRate = buffer.readUInt32LE(offset + 12); }
    if (id === 'data') {
      const frames = Math.floor(Math.min(size, buffer.length - offset - 8) / (2 * channels));
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame += 1) {
        left[frame] = buffer.readInt16LE(offset + 8 + frame * channels * 2) / 32768;
        right[frame] = channels > 1 ? buffer.readInt16LE(offset + 8 + frame * channels * 2 + 2) / 32768 : left[frame];
      }
      return { left, right, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

function run(args: string[]) {
  const result = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: result.status, text: (result.stdout ?? '') + (result.stderr ?? '') };
}

type Signal = (time: number) => number;
const sine = (hz: number, amplitude: number): Signal => (t) => amplitude * Math.sin(2 * Math.PI * hz * t);
const sum = (...signals: Signal[]): Signal => (t) => signals.reduce((total, signal) => total + signal(t), 0);

function makeAsset(id: string, durationSec: number, signal: Signal, extra: Partial<StudioAsset> = {}): StudioAsset {
  const frames = Math.round(durationSec * SR);
  const channel = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) channel[index] = signal(index / SR);
  const location = file(`${id}.wav`);
  writeFileSync(location, encodeWavFloat32([channel, channel], SR));
  return { id, path: location, title: id, artist: 'test', durationSec, bpm: null, key: null, coverPath: null, temporary: false, ...extra };
}

interface LaneSpec { asset: StudioAsset; start?: number; clip?: Partial<StudioClip>; track?: { volume?: number; muted?: boolean; solo?: boolean }; effects?: Partial<StudioEffects> }

function buildProject(lanes: LaneSpec[]): StudioProject {
  let project = createEmptyProject();
  lanes.forEach((lane, index) => {
    project = addAsset(project, lane.asset);
    project = addTrack(project, createTrack(`t${index}`));
    project = addClipToTrack(project, `t${index}`, { ...createClip(`c${index}`, lane.asset, lane.start ?? 0), ...lane.clip });
    if (lane.track) project = updateTrack(project, `t${index}`, lane.track);
    if (lane.effects) project = updateTrackEffects(project, `t${index}`, lane.effects);
  });
  return project;
}

function render(project: StudioProject, extra: { range?: { startSec: number; endSec: number }; scriptFile?: boolean } = {}) {
  const impulsePaths: Record<string, string> = {};
  for (const key of requiredImpulseKeys(project)) {
    const spec = reverbImpulseSpec(key);
    const impulse = generateReverbImpulse(spec.size, spec.damping, SR);
    impulsePaths[key] = file(`${key}.wav`);
    writeFileSync(impulsePaths[key], encodeWavFloat32(impulse, SR));
  }
  const output = file('out.wav');
  const scriptPath = extra.scriptFile ? file('graph.txt') : undefined;
  const plan = buildRenderArgs(project, { output: { path: output, format: 'wav' }, impulsePaths, range: extra.range, filterScriptPath: scriptPath });
  assert.ok(plan, 'a render was planned');
  if (scriptPath) writeFileSync(scriptPath, plan.filterGraph);
  const result = run(plan.args);
  assert.equal(result.status, 0, 'ffmpeg failed:\n' + result.text.split('\n').slice(-12).join('\n') + '\nGRAPH:\n' + plan.filterGraph);
  return { audio: decodeWav(readFileSync(output)), plan };
}

function window(data: Float32Array, from: number, to: number): Float32Array {
  return data.subarray(Math.round(from * SR), Math.round(to * SR));
}

function toneAmplitude(data: Float32Array, hz: number): number {
  let real = 0;
  let imag = 0;
  let weight = 0;
  const size = data.length;
  for (let index = 0; index < size; index += 1) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
    real += w * data[index] * Math.cos((2 * Math.PI * hz * index) / SR);
    imag += w * data[index] * Math.sin((2 * Math.PI * hz * index) / SR);
    weight += w;
  }
  return (2 * Math.hypot(real, imag)) / weight;
}

function dominantHz(data: Float32Array): number {
  const size = 32768;
  const plan = createFftPlan(size);
  const hann = hannWindow(size);
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  const start = Math.max(0, Math.floor(data.length / 2 - size / 2));
  for (let index = 0; index < size; index += 1) real[index] = (data[start + index] ?? 0) * hann[index];
  fft(plan, real, imag);
  let best = 1;
  let bestMagnitude = 0;
  for (let bin = 1; bin < size / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin], imag[bin]);
    if (magnitude > bestMagnitude) { bestMagnitude = magnitude; best = bin; }
  }
  const a = Math.hypot(real[best - 1], imag[best - 1]);
  const b = bestMagnitude;
  const c = Math.hypot(real[best + 1], imag[best + 1]);
  const shift = (0.5 * (a - c)) / (a - 2 * b + c);
  return ((best + shift) * SR) / size;
}

const db = (ratio: number) => 20 * Math.log10(ratio);
const rms = (data: Float32Array) => Math.sqrt(data.reduce((total, value) => total + value * value, 0) / data.length);
const peak = (data: Float32Array) => data.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
const near = (actual: number, expected: number, tolerance: number, message: string) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected} ± ${tolerance}`);

test('one clip comes out at unity gain, two equal clips sum to exactly double', () => {
  const a = makeAsset('a', 4, sine(440, 0.2));
  const single = render(buildProject([{ asset: a }])).audio;
  near(toneAmplitude(window(single.left, 1, 3), 440), 0.2, 0.004, 'a single track keeps its level');
  near(single.left.length / SR, 4, 0.01, 'length of a plain clip');
  const both = render(buildProject([{ asset: a }, { asset: a }])).audio;
  near(toneAmplitude(window(both.left, 1, 3), 440) / toneAmplitude(window(single.left, 1, 3), 440), 2, 0.02, 'two tracks add up');
  const many = render(buildProject([{ asset: a }, { asset: a }, { asset: a }, { asset: a }].map((lane) => ({ ...lane, track: { volume: 0.25 } })))).audio;
  near(toneAmplitude(window(many.left, 1, 3), 440), 0.2, 0.004, 'four quarter-volume copies add to the original level');
});

test('a track ending does not change the loudness of the others', () => {
  const longTone = makeAsset('long', 4, sine(440, 0.2));
  const shortTone = makeAsset('short', 2, sine(880, 0.2));
  const { audio } = render(buildProject([{ asset: longTone }, { asset: shortTone }]));
  const during = toneAmplitude(window(audio.left, 0.5, 1.5), 440);
  const after = toneAmplitude(window(audio.left, 2.5, 3.5), 440);
  near(during, 0.2, 0.004, '440 Hz while both play');
  near(after, during, 0.004, '440 Hz after the other track ended');
  assert.ok(toneAmplitude(window(audio.left, 2.5, 3.5), 880) < 0.002, 'the short track is silent after it ends');
});

test('speed changes length; vinyl speed moves pitch, pitch lock and semitones control pitch separately', () => {
  const a = makeAsset('a', 4, sine(440, 0.3));
  const slowVinyl = render(buildProject([{ asset: a, clip: { speed: 0.5, pitchLock: false } }])).audio;
  near(slowVinyl.left.length / SR, 8, 0.02, 'half speed doubles the length');
  near(dominantHz(slowVinyl.left), 220, 2, 'vinyl slowdown lowers pitch an octave');
  const slowLocked = render(buildProject([{ asset: a, clip: { speed: 0.5, pitchLock: true } }])).audio;
  near(slowLocked.left.length / SR, 8, 0.05, 'pitch-locked slowdown also doubles the length');
  near(dominantHz(slowLocked.left), 440, 4, 'pitch lock keeps 440 Hz');
  const fast = render(buildProject([{ asset: a, clip: { speed: 2, pitchLock: false } }])).audio;
  near(fast.left.length / SR, 2, 0.02, 'double speed halves the length');
  near(dominantHz(fast.left), 880, 6, 'vinyl speed-up raises pitch an octave');
  const shifted = render(buildProject([{ asset: a, clip: { speed: 1, pitchLock: true, semitones: 12 } }])).audio;
  near(shifted.left.length / SR, 4, 0.02, 'semitones do not change the length');
  near(dominantHz(shifted.left), 880, 6, '+12 semitones doubles the frequency');
  const nightcore = render(buildProject([{ asset: a, clip: { speed: 1.25, pitchLock: false, semitones: 0 } }])).audio;
  near(nightcore.left.length / SR, 3.2, 0.02, '1.25x speed');
  near(dominantHz(nightcore.left), 550, 4, 'vinyl 1.25x is 550 Hz');
  const quarter = render(buildProject([{ asset: a, clip: { speed: 0.25, pitchLock: true } }])).audio;
  near(quarter.left.length / SR, 16, 0.1, 'a quarter speed needs chained tempo stages and still has the right length');
});

test('bass and treble boosts, low-pass and high-pass filters change the right frequencies', () => {
  const lowAndMid = makeAsset('lm', 3, sum(sine(60, 0.1), sine(2000, 0.1)));
  const reference = render(buildProject([{ asset: lowAndMid }])).audio;
  const boosted = render(buildProject([{ asset: lowAndMid, effects: { bassDb: 12 } }])).audio;
  const gain = (data: Decoded, hz: number) => toneAmplitude(window(data.left, 1, 2.5), hz);
  const bassGain = db(gain(boosted, 60) / gain(reference, 60));
  const midGain = db(gain(boosted, 2000) / gain(reference, 2000));
  assert.ok(bassGain > 8 && bassGain < 13.5, `bass +12 dB raised 60 Hz by ${bassGain.toFixed(1)} dB`);
  assert.ok(Math.abs(midGain) < 0.7, `bass boost left 2 kHz alone (${midGain.toFixed(2)} dB)`);
  const highAndMid = makeAsset('hm', 3, sum(sine(500, 0.1), sine(12000, 0.1)));
  const trebleRef = render(buildProject([{ asset: highAndMid }])).audio;
  const trebleUp = render(buildProject([{ asset: highAndMid, effects: { trebleDb: 12 } }])).audio;
  const trebleGain = db(gain(trebleUp, 12000) / gain(trebleRef, 12000));
  assert.ok(trebleGain > 8 && trebleGain < 13.5, `treble +12 dB raised 12 kHz by ${trebleGain.toFixed(1)} dB`);
  assert.ok(Math.abs(db(gain(trebleUp, 500) / gain(trebleRef, 500))) < 0.7, 'treble boost left 500 Hz alone');
  const high = makeAsset('hi', 3, sine(4000, 0.2));
  const lowpassed = render(buildProject([{ asset: high, effects: { filter: { type: 'lowpass', hz: 800 } } }])).audio;
  assert.ok(db(gain(lowpassed, 4000) / 0.2) < -24, 'low-pass at 800 Hz removes 4 kHz');
  const low = makeAsset('lo', 3, sine(150, 0.2));
  const highpassed = render(buildProject([{ asset: low, effects: { filter: { type: 'highpass', hz: 1500 } } }])).audio;
  assert.ok(db(gain(highpassed, 150) / 0.2) < -24, 'high-pass at 1.5 kHz removes 150 Hz');
  const passed = render(buildProject([{ asset: low, effects: { filter: { type: 'lowpass', hz: 5000 } } }])).audio;
  near(gain(passed, 150), 0.2, 0.01, 'a low-pass far above the tone leaves it alone');
});

test('an equal-power crossfade hands over from one tone to the other without a loudness dip', () => {
  const a = makeAsset('a', 6, sine(440, 0.3));
  const b = makeAsset('b', 4, sine(880, 0.3));
  let project = buildProject([{ asset: a }, { asset: b, start: 5 }]);
  project = placeTransition(project, 'c0', 'c1', 2, 'equal-power');
  const { audio } = render(project);
  const amplitudes = (from: number, to: number) => [toneAmplitude(window(audio.left, from, to), 440), toneAmplitude(window(audio.left, from, to), 880)];
  const [aBefore, bBefore] = amplitudes(2.5, 3.5);
  near(aBefore, 0.3, 0.006, '440 Hz before the transition');
  assert.ok(bBefore < 0.003, 'the incoming tone is silent before the transition');
  const [aMid, bMid] = amplitudes(4.9, 5.1);
  near(aMid, 0.3 * Math.SQRT1_2, 0.03, '440 Hz halfway through the crossfade');
  near(bMid, 0.3 * Math.SQRT1_2, 0.03, '880 Hz halfway through the crossfade');
  const [aAfter, bAfter] = amplitudes(6.5, 7.5);
  assert.ok(aAfter < 0.003, 'the outgoing tone is gone after the transition');
  near(bAfter, 0.3, 0.006, '880 Hz after the transition');
  for (const centre of [4.25, 4.5, 5, 5.5, 5.75]) {
    const [x, y] = amplitudes(centre - 0.1, centre + 0.1);
    near(Math.hypot(x, y), 0.3, 0.035, `combined power at ${centre}s stays constant`);
  }
});

test('trims, delays, reverse and cropped ranges are sample exact', () => {
  const ramp = makeAsset('ramp', 4, (t) => (t / 4) * 0.8);
  const { audio } = render(buildProject([{ asset: ramp, start: 1.5, clip: { inSec: 1, outSec: 2 } }]));
  const first = audio.left.findIndex((value) => Math.abs(value) > 1e-4);
  assert.equal(first, Math.round(1.5 * SR), `the delayed clip starts on the exact sample (first=${first}, expected=${Math.round(1.5 * SR)}, value there=${audio.left[first]}, next=${audio.left[first + 1]}, before=${audio.left[first - 1]})`);
  near(audio.left[first + 10], (1 / 4) * 0.8 + (10 / SR / 4) * 0.8, 3e-4, 'it plays the trimmed window of the source');
  near(audio.left[first + SR - 5], (2 / 4) * 0.8 - (5 / SR / 4) * 0.8, 3e-4, 'and ends at the end of the window');
  near(audio.left.length / SR, 2.5, 0.01, 'length is delay plus window');
  const reversed = render(buildProject([{ asset: ramp, clip: { inSec: 1, outSec: 2, reverse: true } }])).audio;
  near(reversed.left[10], (2 / 4) * 0.8 - (10 / SR / 4) * 0.8, 4e-4, 'reverse starts at the end of the window');
  assert.ok(reversed.left[SR - 10] < reversed.left[10], 'and falls');
  near(reversed.left[SR - 10], (1 / 4) * 0.8 + (10 / SR / 4) * 0.8, 4e-4, 'reverse ends at the start of the window');
});

test('fades follow the chosen curve and a cropped render continues a fade that was already running', () => {
  const tone = makeAsset('tone', 10, sine(440, 0.5));
  const levelAt = (clip: Partial<StudioClip>, from: number, to: number, range?: { startSec: number; endSec: number }) => {
    const { audio } = render(buildProject([{ asset: tone, clip }]), { range });
    return toneAmplitude(window(audio.left, from, to), 440) / 0.5;
  };
  near(levelAt({ fadeIn: { seconds: 4, curve: 'linear' } }, 1.9, 2.1), 0.5, 0.03, 'linear fade-in at 50%');
  near(levelAt({ fadeIn: { seconds: 4, curve: 'equal-power' } }, 1.9, 2.1), Math.SQRT1_2, 0.03, 'equal-power fade-in at 50%');
  near(levelAt({ fadeIn: { seconds: 4, curve: 'exponential' } }, 1.9, 2.1), 0.25, 0.03, 'exponential fade-in at 50%');
  near(levelAt({ fadeOut: { seconds: 4, curve: 'linear' } }, 7.9, 8.1), 0.5, 0.03, 'linear fade-out at 50%');
  near(levelAt({ fadeOut: { seconds: 4, curve: 'linear' } }, 1, 2), 1, 0.01, 'full level before the fade-out');
  near(levelAt({ gainDb: -6.0206 }, 1, 2), 0.5, 0.01, 'clip gain of -6 dB');
  const cropped = levelAt({ fadeIn: { seconds: 4, curve: 'linear' } }, 0, 0.2, { startSec: 2, endSec: 6 });
  near(cropped, 0.5, 0.06, 'a render starting in the middle of a fade starts at the faded level');
  near(levelAt({ fadeIn: { seconds: 4, curve: 'linear' } }, 2.9, 3.1, { startSec: 2, endSec: 6 }), 1, 0.03, 'and reaches full level when the fade ends');
  const { audio } = render(buildProject([{ asset: tone }]), { range: { startSec: 2, endSec: 6 } });
  near(audio.left.length / SR, 4, 0.01, 'a cropped render has exactly the requested length');
});

test('pan, track volume, mute and solo shape the stereo result', () => {
  const tone = makeAsset('tone', 3, sine(440, 0.4));
  const levels = (project: StudioProject) => { const { audio } = render(project); return [toneAmplitude(window(audio.left, 1, 2), 440), toneAmplitude(window(audio.right, 1, 2), 440)]; };
  const [hardLeftL, hardLeftR] = levels(buildProject([{ asset: tone, effects: { pan: -1 } }]));
  near(hardLeftL, 0.4, 0.008, 'hard left keeps the left channel');
  assert.ok(hardLeftR < 0.002, 'hard left silences the right channel');
  const [halfL, halfR] = levels(buildProject([{ asset: tone, effects: { pan: 0.5 } }]));
  near(halfL, 0.2, 0.006, 'pan 0.5 halves the left channel');
  near(halfR, 0.4, 0.008, 'and leaves the right alone');
  near(levels(buildProject([{ asset: tone, track: { volume: 0.5 } }]))[0], 0.2, 0.006, 'track volume 0.5');
  const quiet = makeAsset('quiet', 3, sine(880, 0.4));
  const mixed = buildProject([{ asset: tone, track: { muted: true } }, { asset: quiet }]);
  const { audio } = render(mixed);
  assert.ok(toneAmplitude(window(audio.left, 1, 2), 440) < 0.002, 'a muted track is not rendered');
  near(toneAmplitude(window(audio.left, 1, 2), 880), 0.4, 0.008, 'the other track is unchanged');
  const solo = render(buildProject([{ asset: tone, track: { solo: true } }, { asset: quiet }])).audio;
  assert.ok(toneAmplitude(window(solo.left, 1, 2), 880) < 0.002, 'solo silences the other tracks');
  assert.equal(buildRenderArgs(buildProject([{ asset: tone, track: { muted: true } }]), { output: { path: 'x.wav', format: 'wav' } }), null);
});

test('echo repeats the sound and reverb adds a decaying tail; both extend the render', () => {
  const click = makeAsset('click', 2, (t) => (t >= 0.5 && t < 0.5 + 40 / SR ? 0.6 : 0));
  const dry = render(buildProject([{ asset: click }])).audio;
  assert.ok(peak(window(dry.left, 0.6, 2)) < 0.01, 'the dry click has no repeats');
  const echoed = render(buildProject([{ asset: click, effects: { echo: { mix: 0.5, seconds: 0.25, feedback: 0.5 } } }])).audio;
  const firstRepeat = peak(window(echoed.left, 0.74, 0.8));
  const secondRepeat = peak(window(echoed.left, 0.99, 1.05));
  assert.ok(firstRepeat > 0.6 * 0.5 * 0.7 && firstRepeat < 0.6 * 0.5 * 1.3, `first echo is about the mix level (${firstRepeat.toFixed(3)})`);
  assert.ok(secondRepeat > 0.6 * 0.25 * 0.6 && secondRepeat < 0.6 * 0.25 * 1.4, `second echo is quieter by the feedback (${secondRepeat.toFixed(3)})`);
  const wet = render(buildProject([{ asset: click, effects: { reverb: { mix: 0.5, size: 0.5, damping: 0.3 } } }]));
  const tailEarly = rms(window(wet.audio.left, 0.7, 1.2));
  const tailLate = rms(window(wet.audio.left, 1.9, 2.4));
  assert.ok(tailEarly > 0.002, `reverb tail is audible (${tailEarly.toFixed(4)})`);
  assert.ok(tailLate < tailEarly, 'and it decays');
  assert.ok(wet.audio.left.length / SR > 2.5, 'the render is extended so the tail is not cut off');
  assert.ok(peak(window(wet.audio.left, 0.5, 0.52)) < 0.6 * 1.05, 'the direct sound is not boosted by the wet signal');
});

test('exporting to m4a produces a real AAC file of the expected length', () => {
  const a = makeAsset('a', 5, sine(440, 0.3));
  const project = buildProject([{ asset: a, clip: { speed: 0.5 } }]);
  const output = file('result.m4a');
  const plan = buildRenderArgs(project, { output: { path: output, format: 'm4a' }, metadata: { title: 'My mix', artist: 'Studio' } })!;
  assert.equal(run(plan.args).status, 0);
  const info = run(['-hide_banner', '-i', output]).text;
  assert.match(info, /Audio: aac/, 'AAC audio stream');
  assert.match(info, /title\s*: My mix/);
  assert.match(info, /artist\s*: Studio/);
  const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(info)!;
  const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  near(duration, plan.durationSec, 0.12, 'file duration matches the plan');
  near(plan.durationSec, 10, 0.01, 'half speed makes a 5 second clip 10 seconds long');
});

test('the limiter keeps loud mixes from clipping', () => {
  const loud = makeAsset('loud', 3, sine(440, 0.6));
  const lanes = Array.from({ length: 6 }, () => ({ asset: loud }));
  const { audio } = render(buildProject(lanes));
  assert.ok(peak(audio.left) <= 0.96, `peak ${peak(audio.left).toFixed(3)} stays under the limiter ceiling`);
  assert.ok(peak(window(audio.left, 1, 2)) > 0.9, 'and the mix is still loud');
});

test('48 lanes mix without any level collapse and the graph can be passed as a script file', () => {
  const lanes = Array.from({ length: 48 }, (_, index) => ({
    asset: makeAsset(`m${index}`, 2, sine(200 + index * 97, 0.02)),
    start: index % 3 === 0 ? 0.2 : 0,
  }));
  const project = buildProject(lanes);
  const inline = render(project).audio;
  const scripted = render(project, { scriptFile: true }).audio;
  assert.equal(scripted.left.length, inline.left.length);
  for (let index = 0; index < 48; index += 4) {
    const hz = 200 + index * 97;
    near(toneAmplitude(window(inline.left, 0.6, 1.8), hz), 0.02, 0.002, `lane ${index} (${hz} Hz) keeps its level among 48`);
    near(toneAmplitude(window(scripted.left, 0.6, 1.8), hz), toneAmplitude(window(inline.left, 0.6, 1.8), hz), 1e-4, `scripted graph matches inline at ${hz} Hz`);
  }
  mkdirSync(path.join(work, 'keep'), { recursive: true });
});
