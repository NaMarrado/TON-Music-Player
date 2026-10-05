import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAsset, addClipToTrack, addTrack, clipEndSec, connectClip, createClip, createEmptyProject, createTrack, moveClip, splitClip, updateClip,
} from '../../packages/core/src/studio/index.ts';
import type { StudioAsset, StudioClip, StudioProject } from '../../packages/core/src/studio/index.ts';

const asset = (id: string, durationSec = 100): StudioAsset => ({
  id, path: `/music/${id}.m4a`, title: id, artist: 'x', durationSec, bpm: null, key: null, coverPath: null, temporary: false,
});

/** One lane with song `a` starting at 10 s, with a fade at both ends so we can see which ends survive a join. */
function oneClip(patch: Partial<StudioClip> = {}): StudioProject {
  const song = asset('a');
  let project = addAsset(createEmptyProject(), song);
  project = addAsset(project, asset('b', 30));
  project = addTrack(project, createTrack('t1'));
  project = addClipToTrack(project, 't1', createClip('c1', song, 10));
  return updateClip(project, 'c1', { fadeIn: { seconds: 2, curve: 'linear' }, fadeOut: { seconds: 3, curve: 's-curve' }, ...patch });
}

const clips = (project: StudioProject, track = 0) => project.tracks[track].clips;
function sameClip(actual: StudioClip, expected: StudioClip) {
  for (const key of ['startSec', 'inSec', 'outSec'] as const) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} != ${expected[key]}`);
  assert.deepEqual(actual.fadeIn, expected.fadeIn);
  assert.deepEqual(actual.fadeOut, expected.fadeOut);
  assert.equal(actual.reverse, expected.reverse);
  assert.equal(actual.speed, expected.speed);
}

test('Connect undoes Cut here: one clip, the original position and audio, the outer fades kept', () => {
  const original = oneClip();
  const cut = splitClip(original, 'c1', 40, 'c2');
  assert.equal(clips(cut).length, 2);
  for (const id of ['c1', 'c2']) {
    const joined = connectClip(cut, id);
    assert.equal(clips(joined).length, 1, `joining from ${id}`);
    sameClip(clips(joined)[0], clips(original)[0]);
  }
});

test('Connect snaps a piece that was dragged away back to where the audio continues', () => {
  const original = oneClip();
  const moved = moveClip(splitClip(original, 'c1', 40, 'c2'), 'c2', 40.37);
  assert.notEqual(clips(moved).find((clip) => clip.id === 'c2')?.startSec, 40, 'the piece really moved');
  const joined = connectClip(moved, 'c2');
  assert.equal(clips(joined).length, 1);
  sameClip(clips(joined)[0], clips(original)[0]);
});

test('Connect works for reversed and slowed clips and for three pieces in a row', () => {
  for (const patch of [{ reverse: true }, { speed: 0.8 }, { reverse: true, speed: 1.25 }]) {
    const original = oneClip(patch);
    const three = splitClip(splitClip(original, 'c1', 30, 'c2'), 'c2', 50, 'c3');
    assert.equal(clips(three).length, 3);
    const once = connectClip(three, 'c3');
    assert.equal(clips(once).length, 2, JSON.stringify(patch));
    const twice = connectClip(once, clips(once)[0].id);
    assert.equal(clips(twice).length, 1, JSON.stringify(patch));
    sameClip(clips(twice)[0], clips(original)[0]);
  }
});

test('pieces that are not the same audio are not merged but placed right after the clip before them, with no gap', () => {
  const cut = moveClip(splitClip(oneClip(), 'c1', 40, 'c2'), 'c2', 47);
  const cases: Array<[string, StudioProject]> = [
    ['a gap in the audio', updateClip(cut, 'c2', { inSec: clips(cut)[1].inSec + 1 })],
    ['an overlap in the audio', updateClip(cut, 'c2', { inSec: clips(cut)[1].inSec - 1 })],
    ['a different song', { ...cut, tracks: [{ ...cut.tracks[0], clips: [clips(cut)[0], { ...clips(cut)[1], assetId: 'b', inSec: 0, outSec: 20 }] }] }],
    ['a different direction', updateClip(cut, 'c2', { reverse: true })],
    ['a different speed', updateClip(cut, 'c2', { speed: 1.5 })],
  ];
  for (const [label, project] of cases) {
    const connected = connectClip(project, 'c2');
    assert.equal(clips(connected).length, 2, label + ': nothing is merged');
    const [first, second] = clips(connected);
    assert.ok(Math.abs(second.startSec - clipEndSec(first)) < 1e-9, `${label}: starts at ${second.startSec}, the clip before ends at ${clipEndSec(first)}`);
    assert.equal(second.inSec, clips(project)[1].inSec, label + ': the audio of the piece is unchanged');
    assert.equal(connectClip(connected, 'c2'), connected, label + ': connecting again changes nothing');
  }
});

test('a lone first clip moves to touch the clip after it; a lone clip has nothing to connect', () => {
  const cut = moveClip(splitClip(oneClip(), 'c1', 40, 'c2'), 'c1', 0);
  const lone = updateClip(cut, 'c1', { outSec: 10 });
  const connected = connectClip(lone, 'c1');
  assert.ok(Math.abs(clipEndSec(clips(connected)[0]) - clips(lone)[1].startSec) < 1e-9, 'the first clip ends where the second starts');
  const single = oneClip();
  assert.equal(connectClip(single, 'c1'), single, 'a clip alone on its lane has nothing to connect');
  assert.equal(connectClip(single, 'missing'), single, 'an unknown clip changes nothing');
});

test('a piece dropped onto another lane connects to the song on that lane, not to its old partner', () => {
  let project = oneClip();
  project = addTrack(project, createTrack('t2'));
  project = addClipToTrack(project, 't2', createClip('b1', asset('b', 30), 0));
  const cut = splitClip(project, 'c1', 40, 'c2');
  const dropped = moveClip(cut, 'c2', 33, 't2');
  assert.equal(clips(dropped, 1).length, 2, 'the piece is on the second lane');
  const connected = connectClip(dropped, 'c2');
  assert.equal(clips(connected, 0).length, 1, 'the first lane keeps its piece');
  const onSecond = clips(connected, 1);
  assert.equal(onSecond.length, 2, 'nothing was merged across lanes');
  const piece = onSecond.find((clip) => clip.id === 'c2')!;
  assert.ok(Math.abs(piece.startSec - 30) < 1e-9, `the piece starts where song b ends (${piece.startSec})`);
});
