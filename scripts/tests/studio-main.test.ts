import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { addAsset, addClipToTrack, addTrack, createClip, createEmptyProject, createTrack } from '../../packages/core/src/studio/index.ts';
import { assertAssetsReadable, parseStudioProject } from '../../packages/desktop/src-main/services/studio/validate.ts';
import { parseTempDownloadRequest } from '../../packages/desktop/src-main/services/studio/request.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'studio-main-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const song = path.join(dir, 'song.m4a');
writeFileSync(song, Buffer.alloc(2000));

function valid() {
  const asset = { id: 'a', path: song, title: 'T', artist: 'A', durationSec: 30, bpm: null, key: null, coverPath: null, temporary: true };
  return addClipToTrack(addTrack(addAsset(createEmptyProject(), asset), createTrack('t')), 't', createClip('c', asset, 0));
}

test('a normal project passes and unknown fields are dropped', () => {
  const parsed = parseStudioProject({ ...valid(), injected: 'x', gridBpm: 999 });
  assert.equal(parsed.tracks[0].clips[0].assetId, 'a');
  assert.equal(Reflect.get(parsed, 'injected'), undefined);
  assert.equal(parsed.gridBpm, null);
});

test('malformed numbers, curves and shapes are rejected before they reach ffmpeg', () => {
  const clone = () => structuredClone(valid());
  const bad: Array<[string, (p: ReturnType<typeof clone>) => void]> = [
    ['NaN speed', (p) => { p.tracks[0].clips[0].speed = NaN; }],
    ['speed out of range', (p) => { p.tracks[0].clips[0].speed = 40; }],
    ['negative start', (p) => { p.tracks[0].clips[0].startSec = -1; }],
    ['empty window', (p) => { p.tracks[0].clips[0].outSec = p.tracks[0].clips[0].inSec; }],
    ['unknown curve', (p) => { Object.assign(p.tracks[0].clips[0].fadeIn, { curve: 'drop table' }); }],
    ['volume too loud', (p) => { p.tracks[0].volume = 50; }],
    ['filter type', (p) => { Object.assign(p.tracks[0].effects, { filter: { type: 'evil', hz: 100 } }); }],
    ['echo feedback runaway', (p) => { p.tracks[0].effects.echo = { mix: 1, seconds: 0.5, feedback: 5 }; }],
    ['clips not an array', (p) => { Object.assign(p.tracks[0], { clips: 'x' }); }],
  ];
  for (const [name, mutate] of bad) {
    const project = clone();
    mutate(project);
    assert.throws(() => parseStudioProject(project), /Invalid Studio project/, name);
  }
  assert.throws(() => parseStudioProject(null));
  assert.throws(() => parseStudioProject({ tracks: Array.from({ length: 600 }, (_, i) => ({ ...valid().tracks[0], id: 't' + i })), assets: {} }), /too many tracks/);
});

test('every used asset must be an absolute, existing, supported audio file', async () => {
  await assert.doesNotReject(assertAssetsReadable(parseStudioProject(valid())));
  const relative = valid();
  relative.assets.a.path = 'song.m4a';
  await assert.rejects(assertAssetsReadable(parseStudioProject(relative)), /absolute/);
  const wrongType = valid();
  wrongType.assets.a.path = path.join(dir, 'notes.txt');
  writeFileSync(wrongType.assets.a.path, 'x');
  await assert.rejects(assertAssetsReadable(parseStudioProject(wrongType)), /unsupported/);
  const missing = valid();
  missing.assets.a.path = path.join(dir, 'gone.m4a');
  await assert.rejects(assertAssetsReadable(parseStudioProject(missing)), /not readable/);
  const dangling = valid();
  dangling.tracks[0].clips[0].assetId = 'ghost';
  await assert.rejects(assertAssetsReadable(parseStudioProject(dangling)), /missing asset/);
});

test('temporary download requests accept only supported sources and web addresses', () => {
  assert.equal(parseTempDownloadRequest({ source: 'youtube', url: 'https://youtu.be/x', title: 't', artist: 'a', durationMs: 1000 }).url, 'https://youtu.be/x');
  for (const request of [null, { source: 'local', url: 'https://x' }, { source: 'youtube', url: 'file:///c:/secret.wav' }, { source: 'youtube', url: '--exec=calc' }, { source: 'youtube' }]) {
    assert.throws(() => parseTempDownloadRequest(request), undefined, JSON.stringify(request));
  }
});
