import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAsset, addClipToTrack, addTrack, applyPreset, audibleTracks, buildRenderArgs, camelotFor, clipDurationSec, clipEndSec, clipPitchRatio,
  computePeaks, createClip, createEmptyProject, createTrack, deleteClip, detectBpm, detectKey, duplicateClip, fadeInGain, fadeOutGain,
  generateReverbImpulse, moveClip, placeTransition, planPlayback, projectDurationSec, requiredImpulseKeys, reverbDecaySeconds,
  reverbImpulseKey, reverbImpulseSpec, sampleFadeCurve, setAssetAnalysis, snapToBeat, sourceTimeAt, splitClip, syncClipTempo,
  trimClipEnd, trimClipStart, updateAssetDuration, updateClip, updateTrack, updateTrackEffects,
} from '../../packages/core/src/studio/index.ts';
import type { StudioAsset, StudioProject } from '../../packages/core/src/studio/index.ts';

const asset = (id: string, durationSec = 100, extra: Partial<StudioAsset> = {}): StudioAsset => ({
  id, path: `/music/${id}.m4a`, title: id, artist: 'x', durationSec, bpm: null, key: null, coverPath: null, temporary: false, ...extra,
});

function projectWith(...assets: StudioAsset[]): StudioProject {
  let project = createEmptyProject();
  for (const item of assets) project = addAsset(project, item);
  return project;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('clip length, pitch and source position follow speed, pitch lock, semitones and reverse', () => {
  const song = asset('a');
  let project = addTrack(projectWith(song), createTrack('t1'));
  project = addClipToTrack(project, 't1', createClip('c1', song, 10));
  const slowed = updateClip(project, 'c1', { speed: 0.5 }).tracks[0].clips[0];
  assert.equal(clipDurationSec(slowed), 200, 'half speed doubles the length');
  assert.equal(clipEndSec(slowed), 210);
  assert.equal(clipPitchRatio(slowed), 0.5, 'vinyl slowdown lowers pitch with speed');
  assert.equal(clipPitchRatio({ ...slowed, pitchLock: true }), 1, 'pitch lock keeps pitch');
  assert.ok(Math.abs(clipPitchRatio({ ...slowed, pitchLock: true, semitones: 12 }) - 2) < 1e-12, '+12 semitones doubles pitch');
  assert.equal(sourceTimeAt(slowed, 110), 50, 'source position advances at half speed');
  const reversed = { ...slowed, reverse: true };
  assert.equal(sourceTimeAt(reversed, 10), 100, 'reverse starts at the end of the window');
  assert.equal(sourceTimeAt(reversed, 110), 50);
  assert.equal(sourceTimeAt(slowed, 5), 0, 'before the clip the position is clamped to the window start');
});

test('project length ignores nothing and mute/solo select the audible tracks', () => {
  const song = asset('a', 30);
  let project = projectWith(song);
  for (const [id, start] of [['t1', 0], ['t2', 20], ['t3', 5]] as const) {
    project = addClipToTrack(addTrack(project, createTrack(id)), id, createClip('c' + id, song, start));
  }
  assert.equal(projectDurationSec(project), 50);
  assert.deepEqual(audibleTracks(updateTrack(project, 't2', { muted: true })).map((t) => t.id), ['t1', 't3']);
  assert.deepEqual(audibleTracks(updateTrack(updateTrack(project, 't2', { muted: true }), 't3', { solo: true })).map((t) => t.id), ['t3'], 'solo overrides mute');
});

test('snapping goes to the nearest beat or bar', () => {
  assert.equal(snapToBeat(1.26, 120), 1.5);
  assert.equal(snapToBeat(1.26, 120, 4), 2);
  assert.equal(snapToBeat(0.2, 120, 1), 0);
  assert.ok(Math.abs(snapToBeat(3.1, 128, 1, 0.1) - (0.1 + Math.round(3.0 / (60 / 128)) * (60 / 128))) < 1e-9);
});

test('fade curves: equal power keeps constant loudness across a crossfade, others are monotonic', () => {
  for (let step = 0; step <= 20; step += 1) {
    const x = step / 20;
    const power = fadeInGain('equal-power', x) ** 2 + fadeOutGain('equal-power', x) ** 2;
    assert.ok(Math.abs(power - 1) < 1e-12, `power at ${x} was ${power}`);
    assert.ok(Math.abs(fadeInGain('linear', x) + fadeOutGain('linear', x) - 1) < 1e-12);
  }
  for (const curve of ['linear', 'equal-power', 'exponential'] as const) {
    assert.equal(fadeInGain(curve, 0), 0);
    assert.equal(fadeInGain(curve, 1), 1);
    assert.equal(fadeInGain(curve, -3), 0, 'clamped below');
    assert.equal(fadeInGain(curve, 9), 1, 'clamped above');
    const rising = sampleFadeCurve(curve, 64, true);
    const falling = sampleFadeCurve(curve, 64, false);
    for (let index = 1; index < rising.length; index += 1) {
      assert.ok(rising[index] >= rising[index - 1], curve + ' rises');
      assert.ok(falling[index] <= falling[index - 1], curve + ' falls');
    }
    assert.equal(falling[0], 1);
    assert.equal(falling[63], 0);
  }
});

test('operations never mutate the previous project', () => {
  const song = asset('a');
  let project = addTrack(addTrack(projectWith(song), createTrack('t1')), createTrack('t2'));
  project = addClipToTrack(project, 't1', createClip('c1', song, 0));
  const frozen = deepFreeze(structuredClone(project));
  assert.doesNotThrow(() => {
    splitClip(frozen, 'c1', 40, 'c2');
    trimClipStart(frozen, 'c1', 5);
    trimClipEnd(frozen, 'c1', 60);
    moveClip(frozen, 'c1', 7, 't2');
    duplicateClip(frozen, 'c1', 'c9');
    deleteClip(frozen, 'c1');
    updateTrackEffects(frozen, 't1', { bassDb: 6 });
    syncClipTempo(setAssetAnalysis(frozen, 'a', { bpm: 100, key: null }), 'c1', 128);
  });
});

test('split keeps every sample of the source exactly once, forward and reversed', () => {
  const song = asset('a', 100);
  for (const reverse of [false, true]) {
    for (const speed of [1, 0.5, 2]) {
      let project = addClipToTrack(addTrack(projectWith(song), createTrack('t')), 't', { ...createClip('c1', song, 10), speed, reverse });
      const before = project.tracks[0].clips[0];
      const cut = before.startSec + clipDurationSec(before) * 0.3;
      project = splitClip(project, 'c1', cut, 'c2');
      const [first, second] = project.tracks[0].clips;
      assert.equal(project.tracks[0].clips.length, 2);
      assert.ok(Math.abs(clipDurationSec(first) + clipDurationSec(second) - clipDurationSec(before)) < 1e-9, 'timeline length preserved');
      assert.ok(Math.abs(second.startSec - cut) < 1e-9 && Math.abs(clipEndSec(first) - cut) < 1e-9, 'pieces touch at the cut');
      if (reverse) {
        assert.ok(Math.abs(first.inSec - second.outSec) < 1e-9, 'reverse: pieces meet in the source');
        assert.equal(first.outSec, before.outSec);
        assert.equal(second.inSec, before.inSec);
      } else {
        assert.ok(Math.abs(first.outSec - second.inSec) < 1e-9, 'forward: pieces meet in the source');
        assert.equal(first.inSec, before.inSec);
        assert.equal(second.outSec, before.outSec);
      }
      // The same source moment plays at the same timeline moment before and after the cut.
      for (const probe of [before.startSec + 0.1, cut - 0.01, cut + 0.01, clipEndSec(before) - 0.1]) {
        const piece = probe < cut ? first : second;
        assert.ok(Math.abs(sourceTimeAt(piece, probe) - sourceTimeAt(before, probe)) < 1e-9, `reverse=${reverse} speed=${speed} at ${probe}`);
      }
    }
  }
  assert.equal(splitClip(addClipToTrack(addTrack(projectWith(song), createTrack('t')), 't', createClip('c1', song, 0)), 'c1', 0.001, 'c2').tracks[0].clips.length, 1, 'a cut at the very edge is refused');
});

test('trimming moves one edge without shifting the audio that stays', () => {
  const song = asset('a', 100);
  let project = addClipToTrack(addTrack(projectWith(song), createTrack('t')), 't', { ...createClip('c1', song, 20), inSec: 10, outSec: 60 });
  const original = project.tracks[0].clips[0];
  project = trimClipStart(project, 'c1', 30);
  let clip = project.tracks[0].clips[0];
  assert.equal(clip.startSec, 30);
  assert.equal(clip.inSec, 20);
  assert.equal(sourceTimeAt(clip, 40), sourceTimeAt(original, 40), 'the same moment still plays the same source');
  project = trimClipEnd(project, 'c1', 50);
  clip = project.tracks[0].clips[0];
  assert.equal(clipEndSec(clip), 50);
  assert.equal(clip.outSec, 40);
  clip = trimClipStart(project, 'c1', -500).tracks[0].clips[0];
  assert.ok(clip.startSec >= 0 && clip.inSec >= 0, 'cannot trim before the start of the file or the timeline');
  clip = trimClipEnd(project, 'c1', 9999).tracks[0].clips[0];
  assert.ok(clip.outSec <= 100, 'cannot extend past the end of the file');
  clip = trimClipStart(project, 'c1', 9999).tracks[0].clips[0];
  assert.ok(clipDurationSec(clip) > 0, 'a clip never collapses to nothing');
});

test('moving, duplicating and deleting clips', () => {
  const song = asset('a', 10);
  let project = addTrack(addClipToTrack(addTrack(projectWith(song), createTrack('t1')), 't1', createClip('c1', song, 0)), createTrack('t2'));
  project = moveClip(project, 'c1', 3, 't2');
  assert.equal(project.tracks[0].clips.length, 0);
  assert.equal(project.tracks[1].clips[0].startSec, 3);
  assert.equal(moveClip(project, 'c1', -5).tracks[1].clips[0].startSec, 0, 'cannot move before zero');
  assert.equal(moveClip(project, 'c1', 1, 'missing'), project, 'unknown target track is ignored');
  project = duplicateClip(project, 'c1', 'c2');
  assert.equal(project.tracks[1].clips[1].startSec, 13, 'the copy sits right after the original');
  assert.equal(deleteClip(project, 'c1').tracks[1].clips.length, 1);
});

test('a transition overlaps the clips by the requested length with matching fades', () => {
  const a = asset('a', 60);
  const b = asset('b', 60);
  let project = projectWith(a, b);
  project = addClipToTrack(addTrack(project, createTrack('t1')), 't1', createClip('out', a, 0));
  project = addClipToTrack(addTrack(project, createTrack('t2')), 't2', createClip('in', b, 5));
  project = placeTransition(project, 'out', 'in', 8, 'equal-power');
  const outgoing = project.tracks[0].clips[0];
  const incoming = project.tracks[1].clips[0];
  assert.equal(incoming.startSec, 52, 'incoming starts 8 s before the outgoing ends');
  assert.equal(clipEndSec(outgoing) - incoming.startSec, 8);
  assert.deepEqual(outgoing.fadeOut, { seconds: 8, curve: 'equal-power' });
  assert.deepEqual(incoming.fadeIn, { seconds: 8, curve: 'equal-power' });
  const clamped = placeTransition(project, 'out', 'in', 500, 'linear');
  assert.ok(clamped.tracks[1].clips[0].startSec >= 0 && clamped.tracks[0].clips[0].fadeOut.seconds < 60);
});

test('presets change only the speed and effects of their own lane and reset restores the defaults', () => {
  const song = asset('a', 100);
  let project = projectWith(song);
  for (const id of ['t1', 't2']) project = addClipToTrack(addTrack(project, createTrack(id)), id, createClip('c' + id, song, 0));
  project = updateClip(project, 'ct1', { fadeIn: { seconds: 3, curve: 'linear' }, gainDb: -3 });
  const slowed = applyPreset(project, 't1', 'slowed');
  const clip = slowed.tracks[0].clips[0];
  assert.equal(clip.speed, 0.85);
  assert.equal(clip.pitchLock, false, 'slowed is the vinyl style: pitch follows speed');
  assert.equal(clip.fadeIn.seconds, 3, 'fades are kept');
  assert.equal(clip.gainDb, -3, 'clip volume is kept');
  assert.equal(slowed.tracks[1].clips[0].speed, 1, 'the other lane is untouched');
  const dreamy = applyPreset(project, 't1', 'slowedReverb').tracks[0];
  assert.equal(dreamy.clips[0].speed, 0.85);
  assert.ok(dreamy.effects.reverb && dreamy.effects.reverb.mix > 0);
  assert.equal(applyPreset(project, 't1', 'spedUp').tracks[0].clips[0].speed, 1.25);
  assert.equal(applyPreset(project, 't1', 'bassBoost').tracks[0].effects.bassDb, 9);
  assert.equal(applyPreset(project, 't1', 'bassBoost').tracks[0].clips[0].speed, 1, 'bass boost leaves speed alone');
  assert.deepEqual(applyPreset(project, 't1', 'muffled').tracks[0].effects.filter, { type: 'lowpass', hz: 1200 });
  const messy = applyPreset(applyPreset(updateClip(project, 'ct1', { semitones: 5, reverse: true }), 't1', 'slowedReverb'), 't1', 'bassBoost');
  const reset = applyPreset(messy, 't1', 'reset').tracks[0];
  assert.equal(reset.clips[0].speed, 1);
  assert.equal(reset.clips[0].semitones, 0);
  assert.equal(reset.clips[0].reverse, false);
  assert.deepEqual(reset.effects, { bassDb: 0, trebleDb: 0, reverb: null, echo: null, filter: null, pan: 0 });
  assert.equal(applyPreset(project, 'missing', 'slowed'), project, 'an unknown lane is ignored');
  assert.equal(applyPreset(applyPreset(project, 't1', 'slowed'), 't1', 'slowed').tracks[0].clips[0].speed, 0.85, 'applying twice does not slow it down twice');
});

test('a shorter decoded duration pulls every clip of that asset back inside the audio', () => {
  const song = asset('a', 100);
  let project = addClipToTrack(addTrack(projectWith(song), createTrack('t')), 't', createClip('c', song, 0));
  project = updateAssetDuration(project, 'a', 97.5);
  assert.equal(project.assets.a.durationSec, 97.5);
  assert.equal(project.tracks[0].clips[0].outSec, 97.5, 'the clip no longer plays past the end of the file');
  assert.equal(updateAssetDuration(project, 'a', 97.5), project, 'no change returns the same project');
  assert.equal(updateAssetDuration(project, 'ghost', 10), project);
  assert.equal(updateAssetDuration(project, 'a', Number.NaN), project);
  const longer = updateAssetDuration(project, 'a', 120);
  assert.equal(longer.tracks[0].clips[0].outSec, 97.5, 'a longer file does not stretch an already trimmed clip');
});

test('tempo sync matches the reference BPM and folds half/double time', () => {
  const a = asset('a', 60, { bpm: 100 });
  const base = addClipToTrack(addTrack(projectWith(a), createTrack('t')), 't', createClip('c', a, 0));
  const same = syncClipTempo(base, 'c', 120).tracks[0].clips[0];
  assert.ok(Math.abs(same.speed - 1.2) < 1e-9 && same.pitchLock);
  assert.ok(Math.abs(syncClipTempo(base, 'c', 220).tracks[0].clips[0].speed - 1.1) < 1e-9, '220 is double time of 110');
  assert.ok(Math.abs(syncClipTempo(base, 'c', 60).tracks[0].clips[0].speed - 1.2) < 1e-9, '60 is half time of 120');
  assert.equal(syncClipTempo(addClipToTrack(addTrack(projectWith(asset('n', 60)), createTrack('t')), 't', createClip('c', asset('n', 60), 0)), 'c', 120).tracks[0].clips[0].speed, 1, 'unknown BPM is left alone');
});

function clickTrack(bpm: number, seconds: number, sampleRate = 44100): Float32Array {
  const samples = new Float32Array(seconds * sampleRate);
  const period = (60 / bpm) * sampleRate;
  let seed = 7;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let index = 0; index < samples.length; index += 1) samples[index] = noise() * 0.02;
  for (let beat = 0; beat * period < samples.length; beat += 1) {
    const start = Math.round(beat * period);
    for (let offset = 0; offset < 400 && start + offset < samples.length; offset += 1) samples[start + offset] += Math.sin(offset * 0.3) * Math.exp(-offset / 80) * 0.8;
  }
  return samples;
}

test('BPM detection finds the tempo of synthetic click tracks', () => {
  for (const bpm of [90, 120, 128, 140, 174]) {
    const estimate = detectBpm(clickTrack(bpm, 30), 44100);
    assert.ok(estimate, `no estimate for ${bpm}`);
    // Tempo may be reported at the half/double octave; the folded value must match.
    const folded = [estimate.bpm, estimate.bpm * 2, estimate.bpm / 2].reduce((best, value) => (Math.abs(value - bpm) < Math.abs(best - bpm) ? value : best));
    assert.ok(Math.abs(folded - bpm) < 1, `${bpm} BPM detected as ${estimate.bpm}`);
  }
  assert.equal(detectBpm(new Float32Array(44100 * 30), 44100), null, 'silence has no tempo');
  assert.equal(detectBpm(clickTrack(120, 2), 44100), null, 'too short to judge');
  const started = performance.now();
  detectBpm(clickTrack(124, 240), 44100);
  assert.ok(performance.now() - started < 5000, 'a four minute track is analysed in a few seconds at most');
});

function chord(frequencies: { hz: number; weight: number }[], seconds: number, sampleRate = 44100): Float32Array {
  const samples = new Float32Array(seconds * sampleRate);
  for (const { hz, weight } of frequencies) {
    for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
      const step = (2 * Math.PI * hz * harmonic) / sampleRate;
      for (let index = 0; index < samples.length; index += 1) samples[index] += (weight / harmonic) * Math.sin(step * index) * 0.1;
    }
  }
  return samples;
}

test('key detection finds major and minor keys and maps them to the Camelot wheel', () => {
  const aMinor = detectKey(chord([{ hz: 220, weight: 3 }, { hz: 261.63, weight: 2 }, { hz: 329.63, weight: 2 }], 12), 44100);
  assert.equal(aMinor?.camelot, '8A');
  assert.equal(aMinor?.mode, 'minor');
  const cMajor = detectKey(chord([{ hz: 261.63, weight: 3 }, { hz: 329.63, weight: 2 }, { hz: 392, weight: 2 }], 12), 44100);
  assert.equal(cMajor?.camelot, '8B');
  const gMajor = detectKey(chord([{ hz: 196, weight: 3 }, { hz: 246.94, weight: 2 }, { hz: 293.66, weight: 2 }], 12), 44100);
  assert.equal(gMajor?.camelot, '9B', 'G major is one step clockwise of C major');
  assert.equal(detectKey(new Float32Array(44100), 44100), null, 'too short');
  assert.equal(camelotFor(0, 'major'), '8B');
  assert.equal(camelotFor(9, 'minor'), '8A');
  assert.equal(camelotFor(7, 'minor'), '6A');
  assert.equal(camelotFor(6, 'major'), '2B');
});

test('waveform peaks cover the whole signal', () => {
  const samples = new Float32Array(1000);
  samples[10] = 0.5;
  samples[990] = -0.9;
  const peaks = computePeaks(samples, 10);
  assert.equal(peaks.length, 10);
  assert.equal(peaks[0], 0.5);
  assert.ok(Math.abs(peaks[9] - 0.9) < 1e-6);
  assert.equal(peaks[5], 0);
});

test('reverb impulse is deterministic, decays, darkens with damping and has unit energy', () => {
  const [left, right] = generateReverbImpulse(0.5, 0.3, 44100);
  const [again] = generateReverbImpulse(0.5, 0.3, 44100);
  assert.deepEqual(Array.from(left.slice(0, 2000)), Array.from(again.slice(0, 2000)), 'same inputs, same samples');
  assert.notDeepEqual(Array.from(left.slice(1000, 1100)), Array.from(right.slice(1000, 1100)), 'left and right differ for width');
  assert.equal(left.length, Math.floor(reverbDecaySeconds(0.5) * 44100));
  const energy = (data: Float32Array, from: number, to: number) => { let sum = 0; for (let index = from; index < to; index += 1) sum += data[index] ** 2; return sum; };
  assert.ok(Math.abs(energy(left, 0, left.length) - 1) < 1e-6, 'each channel carries unit energy');
  assert.ok(energy(left, 0, left.length / 2) > 5 * energy(left, left.length / 2, left.length), 'the tail decays');
  assert.equal(left[100], 0, 'there is a pre-delay');
  const brightness = (data: Float32Array) => { let diff = 0; let total = 0; for (let index = 1; index < data.length; index += 1) { diff += (data[index] - data[index - 1]) ** 2; total += data[index] ** 2; } return diff / total; };
  assert.ok(brightness(generateReverbImpulse(0.5, 0.9, 44100)[0]) < brightness(left) * 0.8, 'more damping is darker');
  assert.ok(generateReverbImpulse(0.9, 0.3, 44100)[0].length > left.length, 'bigger rooms are longer');
  const key = reverbImpulseKey({ size: 0.5, damping: 0.3 });
  assert.deepEqual(reverbImpulseSpec(key), { size: 0.5, damping: 0.3 });
  assert.throws(() => reverbImpulseSpec('nonsense'));
});

test('playback plan continues running clips and schedules the rest', () => {
  const song = asset('a', 100);
  let project = projectWith(song);
  project = addClipToTrack(addTrack(project, createTrack('t1')), 't1', { ...createClip('slow', song, 0), outSec: 40, speed: 0.8, pitchLock: true });
  project = addClipToTrack(addTrack(project, createTrack('t2')), 't2', { ...createClip('later', song, 30), outSec: 20, reverse: true, semitones: 2 });
  const items = planPlayback(project, 10);
  const slow = items.find((item) => item.clipId === 'slow')!;
  const later = items.find((item) => item.clipId === 'later')!;
  assert.equal(slow.delaySec, 0);
  assert.ok(Math.abs(slow.sourceOffsetSec - 8) < 1e-9, 'ten timeline seconds at 0.8x is 8 s of source');
  assert.ok(Math.abs(slow.sourceLengthSec - 32) < 1e-9);
  assert.equal(slow.playbackRate, 0.8);
  assert.ok(Math.abs(slow.pitchCorrection - 1 / 0.8) < 1e-12, 'pitch lock cancels the pitch change of the playback rate');
  assert.equal(later.delaySec, 20);
  assert.equal(later.reverse, true);
  assert.ok(Math.abs(later.pitchCorrection - 2 ** (2 / 12)) < 1e-12);
  assert.deepEqual(planPlayback(project, 1000), [], 'nothing left after the end');
  const vinyl = planPlayback(updateClip(project, 'slow', { pitchLock: false }), 0).find((item) => item.clipId === 'slow')!;
  assert.equal(vinyl.pitchCorrection, 1, 'vinyl slowdown needs no correction');
  assert.equal(planPlayback(updateTrack(project, 't2', { muted: true }), 0).some((item) => item.trackId === 't2'), false);
});

test('render arguments: nothing audible gives no render, reverb needs its impulse, long slowdowns are chained', () => {
  const song = asset('a', 20);
  let project = addClipToTrack(addTrack(projectWith(song), createTrack('t')), 't', createClip('c', song, 0));
  const output = { path: 'out.m4a', format: 'm4a' as const };
  assert.equal(buildRenderArgs(createEmptyProject(), { output }), null);
  assert.equal(buildRenderArgs(updateTrack(project, 't', { muted: true }), { output }), null);
  project = updateTrackEffects(project, 't', { reverb: { mix: 0.4, size: 0.5, damping: 0.3 } });
  assert.deepEqual(requiredImpulseKeys(project), [reverbImpulseKey({ size: 0.5, damping: 0.3 })]);
  assert.throws(() => buildRenderArgs(project, { output }), /Missing reverb impulse/);
  const planned = buildRenderArgs(project, { output, impulsePaths: { [reverbImpulseKey({ size: 0.5, damping: 0.3 })]: 'ir.wav' } })!;
  assert.ok(planned.durationSec > 20, 'the reverb tail extends the render');
  const slow = buildRenderArgs(updateClip(createProject(song), 'c', { speed: 0.25, pitchLock: true }), { output })!;
  assert.equal((slow.filterGraph.match(/atempo=0\.5/g) ?? []).length, 2, '0.25x is two 0.5x stages');
  function createProject(item: StudioAsset): StudioProject {
    return addClipToTrack(addTrack(projectWith(item), createTrack('t')), 't', createClip('c', item, 0));
  }
});
