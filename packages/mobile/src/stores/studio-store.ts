import { create } from 'zustand';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import TrackPlayer from 'react-native-track-player';
import {
  addAsset,
  addClipToTrack,
  addTrack,
  clipBpm,
  clipEndSec,
  connectClip,
  createClip,
  createEmptyProject,
  createTrack,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  placeTransition,
  projectDurationSec,
  STUDIO_NEW_LANE_VOLUME,
  secondsPerBar,
  setAssetAnalysis,
  splitClip,
  updateAssetDuration,
  updateClip,
  type SearchResult,
  type StudioAsset,
  type StudioFadeCurve,
  type StudioProject,
  type Track,
} from '@ton/core';
import { analyseSong } from '../services/studio/studio-analysis';
import { clearStudioFiles } from '../services/studio/studio-files';
import { downloadTemporarySong, saveMixToLibrary, startRender, type StudioRender } from '../services/studio/studio-render';
import { upsertTrackById, useLibraryStore } from './library-store';
import { showToast } from './toast-store';

const MAX_HISTORY = 40;
const COALESCE_MS = 700;
/** Length of one rendered preview window. The next window is rendered when one ends. */
const PREVIEW_SECONDS = 30;
/** The phone plays rendered previews, so an edit made while playing restarts the preview once the finger rests this long. */
const EDIT_RESTART_MS = 250;

export type AssetPhase = 'loading' | 'ready' | 'error';

export interface StudioState {
  project: StudioProject;
  past: StudioProject[];
  future: StudioProject[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
  playheadSec: number;
  playing: boolean;
  /** True while a preview window is being rendered. */
  rendering: boolean;
  pxPerSec: number;
  transitionBars: number;
  transitionCurve: StudioFadeCurve;
  assetPhase: Record<string, AssetPhase>;
  downloads: Record<string, number>;
  exporting: { progress: number } | null;
  peaksRevision: number;
  /** Visible width of the timeline in pixels, reported by the timeline. */
  viewWidthPx: number;
  /** True until the user zooms by hand: the whole project then stays fitted to the screen. */
  autoFit: boolean;
  /** Counts the times the user picked a clip, so the bottom panel can show Edit for it. */
  editRequest: number;
}

export const useStudioStore = create<StudioState>()(() => ({
  project: createEmptyProject(),
  past: [],
  future: [],
  selectedClipId: null,
  selectedTrackId: null,
  playheadSec: 0,
  playing: false,
  rendering: false,
  pxPerSec: 12,
  transitionBars: 8,
  transitionCurve: 'equal-power',
  assetPhase: {},
  downloads: {},
  exporting: null,
  peaksRevision: 0,
  viewWidthPx: 0,
  autoFit: true,
  editRequest: 0,
}));

const get = useStudioStore.getState;
const set = useStudioStore.setState;

/** Waveforms are big typed arrays, so they live outside the store; `peaksRevision` tells the views to redraw. */
const peaksByAsset: Record<string, Float32Array> = {};
export function getPeaks(assetId: string): Float32Array | undefined {
  return peaksByAsset[assetId];
}

export function newStudioId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

// ---- edits with undo --------------------------------------------------------------------------------------------------

let lastCoalesce: { key: string; at: number } | null = null;

export function editProject(change: (project: StudioProject) => StudioProject, coalesceKey?: string): void {
  const { project, past } = get();
  const next = change(project);
  if (next === project) return;
  const now = Date.now();
  const coalesce = coalesceKey !== undefined && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
  lastCoalesce = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
  set({ project: next, past: coalesce ? past : [...past, project].slice(-MAX_HISTORY), future: [] });
}

/** Analysis results are not user edits, so they are applied to every history snapshot instead of creating a step. */
function applySilently(change: (project: StudioProject) => StudioProject): void {
  const { project, past, future } = get();
  const next = change(project);
  if (next === project) return;
  set({ project: next, past: past.map(change), future: future.map(change) });
}

export function undo(): void {
  const { past, future, project } = get();
  const previous = past[past.length - 1];
  if (!previous) return;
  lastCoalesce = null;
  set({ project: previous, past: past.slice(0, -1), future: [project, ...future] });
}

export function redo(): void {
  const { past, future, project } = get();
  const [next, ...rest] = future;
  if (!next) return;
  lastCoalesce = null;
  set({ project: next, past: [...past, project], future: rest });
}

/** Selects a clip the user picked. Adding a song also selects its clip, but that must not pull the user away from Songs. */
export function selectClip(clipId: string | null): void {
  const found = clipId ? findClip(get().project, clipId) : null;
  set((state) => ({
    selectedClipId: clipId,
    selectedTrackId: found ? found.track.id : state.selectedTrackId,
    editRequest: clipId ? state.editRequest + 1 : state.editRequest,
  }));
}

export function selectTrack(trackId: string | null): void {
  set({ selectedTrackId: trackId, selectedClipId: null });
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 200;
/** Space kept free on the right of a fitted project so its end is not glued to the edge. */
const FIT_MARGIN_PX = 16;

/** Sets the scale by hand. This also stops the timeline from re-fitting itself when songs are added. */
export function setZoom(pxPerSec: number): void {
  set({ pxPerSec: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pxPerSec)), autoFit: false });
}

/** Scales the timeline so the whole project exactly fills the visible width. */
export function fitToWindow(): void {
  const { project, viewWidthPx } = get();
  const duration = projectDurationSec(project);
  if (duration <= 0 || viewWidthPx <= 0) return;
  set({ pxPerSec: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (viewWidthPx - FIT_MARGIN_PX) / duration)), autoFit: true });
}

/** Called by the timeline whenever its visible width changes; a project that is still fitted follows the screen. */
export function setViewWidth(viewWidthPx: number): void {
  if (Math.abs(viewWidthPx - get().viewWidthPx) < 1) return;
  set({ viewWidthPx });
  if (get().autoFit) fitToWindow();
}

export function setTransitionBars(transitionBars: number): void {
  set({ transitionBars });
}

export function setTransitionCurve(transitionCurve: StudioFadeCurve): void {
  set({ transitionCurve });
}

export function seek(sec: number): void {
  const target = Math.max(0, sec);
  set({ playheadSec: target });
  if (get().playing) void playFrom(target);
}

// ---- adding songs -----------------------------------------------------------------------------------------------------

function addLane(asset: StudioAsset): void {
  const clipId = newStudioId('c');
  const trackId = newStudioId('t');
  editProject((project) => {
    const withAsset = project.assets[asset.id] ? project : addAsset(project, asset);
    return addClipToTrack(addTrack(withAsset, createTrack(trackId, [], STUDIO_NEW_LANE_VOLUME)), trackId, createClip(clipId, withAsset.assets[asset.id], get().playheadSec));
  });
  set({ selectedClipId: clipId, selectedTrackId: trackId });
  if (get().autoFit) fitToWindow();
}

async function analyse(asset: StudioAsset): Promise<StudioAsset | null> {
  set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'loading' } }));
  const analysis = await analyseSong(asset.path, asset.durationSec).catch(() => null);
  if (!analysis) {
    set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'error' } }));
    return null;
  }
  peaksByAsset[asset.id] = analysis.peaks;
  applySilently((project) => (project.assets[asset.id]
    ? setAssetAnalysis(updateAssetDuration(project, asset.id, analysis.durationSec), asset.id, analysis)
    : project));
  set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'ready' }, peaksRevision: state.peaksRevision + 1 }));
  if (get().autoFit) fitToWindow();
  return { ...asset, durationSec: analysis.durationSec, bpm: analysis.bpm, key: analysis.key };
}

export function libraryAssetFor(track: Track): StudioAsset {
  return {
    id: `lib-${track.id}`,
    path: track.file_path,
    title: track.title || 'Untitled',
    artist: track.artist || '',
    durationSec: (track.duration_ms ?? 0) / 1000,
    bpm: null,
    key: null,
    coverPath: track.cover_art_path,
    temporary: false,
  };
}

export async function addLibraryTrackToStudio(track: Track): Promise<void> {
  const existing = get().project.assets[`lib-${track.id}`];
  if (existing) {
    addLane(existing);
    return;
  }
  const draft = libraryAssetFor(track);
  // The lane appears at once; the waveform, length, tempo and key fill in when the analysis finishes.
  if (draft.durationSec > 0) addLane(draft);
  const analysed = await analyse(draft);
  if (!analysed) {
    showToast('Could not read this song.', 'error');
    return;
  }
  if (draft.durationSec <= 0) addLane(analysed);
}

export function resultKey(result: SearchResult): string {
  return `${result.source}:${result.id}`;
}

/** Downloads an online result into the Studio cache and adds it as a lane. It never reaches the Library. */
export async function addOnlineResultToStudio(result: SearchResult): Promise<void> {
  const key = resultKey(result);
  if (key in get().downloads && get().downloads[key] >= 0) return;
  const assetId = `tmp-${key}`;
  const existing = get().project.assets[assetId];
  if (existing) {
    addLane(existing);
    return;
  }
  set((state) => ({ downloads: { ...state.downloads, [key]: 0 } }));
  try {
    const path = await downloadTemporarySong(result, (fraction) => set((state) => ({ downloads: { ...state.downloads, [key]: fraction } })));
    if (!path) throw new Error('download failed');
    const analysed = await analyse({
      id: assetId, path, title: result.title, artist: result.artist, durationSec: (result.duration_ms ?? 0) / 1000, bpm: null, key: null, coverPath: null, temporary: true,
    });
    if (!analysed) throw new Error('unreadable');
    addLane(analysed);
    set((state) => {
      const downloads = { ...state.downloads };
      delete downloads[key];
      return { downloads };
    });
  } catch {
    set((state) => ({ downloads: { ...state.downloads, [key]: -1 } }));
    showToast('Could not download this song.', 'error');
  }
}

// ---- timeline operations ----------------------------------------------------------------------------------------------

export function splitAtPlayhead(): void {
  const { project, playheadSec, selectedClipId, selectedTrackId } = get();
  let clipId: string | null = selectedClipId && findClip(project, selectedClipId) ? selectedClipId : null;
  if (!clipId) {
    const tracks = selectedTrackId ? project.tracks.filter((track) => track.id === selectedTrackId) : project.tracks;
    for (const track of tracks) {
      const hit = track.clips.find((clip) => clip.startSec < playheadSec && clipEndSec(clip) > playheadSec);
      if (hit) { clipId = hit.id; break; }
    }
  }
  if (!clipId) return;
  const target = clipId;
  const newId = newStudioId('c');
  editProject((current) => splitClip(current, target, playheadSec, newId));
  if (findClip(get().project, newId)) set({ selectedClipId: newId });
}

export function duplicateSelectedClip(): void {
  const { selectedClipId, project } = get();
  if (!selectedClipId || !findClip(project, selectedClipId)) return;
  const newId = newStudioId('c');
  editProject((current) => duplicateClip(current, selectedClipId, newId));
  set({ selectedClipId: newId });
}

export function deleteSelectedClip(): void {
  const { selectedClipId, project } = get();
  if (!selectedClipId || !findClip(project, selectedClipId)) return;
  editProject((current) => deleteClip(current, selectedClipId));
  set({ selectedClipId: null });
}

export function removeLane(trackId: string): void {
  editProject((project) => ({ ...project, tracks: project.tracks.filter((track) => track.id !== trackId) }));
  if (get().selectedTrackId === trackId) set({ selectedTrackId: null, selectedClipId: null });
  if (get().autoFit) fitToWindow();
}

/** The reverse of Cut here: joins the selected piece with the rest of its song, or puts it right after the clip before it. */
export function connectSelectedClip(): void {
  const { selectedClipId, project } = get();
  if (selectedClipId && findClip(project, selectedClipId)) editProject((current) => connectClip(current, selectedClipId));
}

/** Moves a clip `rows` lanes up (negative) or down, keeping its time. Used when a dragged clip is let go over another lane. */
export function moveClipByLanes(clipId: string, rows: number): void {
  const { project } = get();
  const found = findClip(project, clipId);
  if (!found || rows === 0) return;
  const index = project.tracks.findIndex((track) => track.id === found.track.id);
  const target = project.tracks[Math.min(project.tracks.length - 1, Math.max(0, index + rows))];
  if (target.id === found.track.id) return;
  editProject((current) => moveClip(current, clipId, found.clip.startSec, target.id), `move:${clipId}`);
  set({ selectedTrackId: target.id });
}

/** Overlaps the selected clip with the clip that ends nearest to where it starts, over the chosen number of bars. */
export function transitionIntoSelected(): boolean {
  const { project, transitionBars, transitionCurve, selectedClipId } = get();
  const incoming = selectedClipId ? findClip(project, selectedClipId) : null;
  if (!incoming) return false;
  let outgoing: { id: string; distance: number; bpm: number | null } | null = null;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === incoming.clip.id) continue;
      const distance = Math.abs(clipEndSec(clip) - incoming.clip.startSec);
      if (!outgoing || distance < outgoing.distance) outgoing = { id: clip.id, distance, bpm: clipBpm(clip, project.assets[clip.assetId]) };
    }
  }
  if (!outgoing) return false;
  const outgoingId = outgoing.id;
  const bpm = outgoing.bpm ?? project.gridBpm ?? 120;
  editProject((current) => placeTransition(current, outgoingId, incoming.clip.id, transitionBars * secondsPerBar(bpm), transitionCurve));
  return true;
}

// ---- preview: a rendered window of the mix is played -----------------------------------------------------------------

let sound: Audio.Sound | null = null;
let previewRender: StudioRender | null = null;
let previewToken = 0;

async function releaseSound(): Promise<void> {
  const current = sound;
  sound = null;
  if (current) await current.unloadAsync().catch(() => undefined);
}

async function playWindow(startSec: number, token: number): Promise<void> {
  const { project } = get();
  const total = projectDurationSec(project);
  if (startSec >= total) {
    set({ playing: false, rendering: false, playheadSec: total });
    return;
  }
  set({ rendering: true, playheadSec: startSec });
  const render = await startRender(project, { name: `preview-${token}`, range: { startSec, endSec: Math.min(total, startSec + PREVIEW_SECONDS) } });
  previewRender = render;
  const finished = render ? await render.done : false;
  if (token !== previewToken) return;
  previewRender = null;
  if (!render || !finished) {
    set({ playing: false, rendering: false });
    showToast('Could not play the mix.', 'error');
    return;
  }
  await releaseSound();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
  const { sound: created } = await Audio.Sound.createAsync({ uri: render.outputUri }, { shouldPlay: true, progressUpdateIntervalMillis: 100 });
  if (token !== previewToken) {
    await created.unloadAsync().catch(() => undefined);
    return;
  }
  sound = created;
  set({ rendering: false });
  created.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
    if (token !== previewToken || !status.isLoaded) return;
    set({ playheadSec: startSec + status.positionMillis / 1000 });
    if (status.didJustFinish) void playWindow(startSec + render.durationSec, token);
  });
}

export async function playFrom(startSec: number): Promise<void> {
  if (projectDurationSec(get().project) <= 0) return;
  await TrackPlayer.pause().catch(() => undefined);
  previewToken += 1;
  // A preview that is still being rendered for an older position or project is no longer needed.
  const stale = previewRender;
  previewRender = null;
  void stale?.cancel().catch(() => undefined);
  set({ playing: true });
  await playWindow(startSec >= projectDurationSec(get().project) ? 0 : startSec, previewToken);
}

export async function stopPlayback(rewind: boolean): Promise<void> {
  previewToken += 1;
  const render = previewRender;
  previewRender = null;
  await render?.cancel().catch(() => undefined);
  await releaseSound();
  set({ playing: false, rendering: false, ...(rewind ? { playheadSec: 0 } : {}) });
}

export async function togglePlay(): Promise<void> {
  if (get().playing) await stopPlayback(false);
  else await playFrom(get().playheadSec);
}

/** Counts edits made while playing; only the last edit of a burst restarts the preview. */
let playingEdits = 0;

// While the preview plays, an edit (a slider, a cut, a moved clip) renders a new preview from the current position once
// the finger rests, so the change is heard without pressing Play again. The old render is cancelled, not finished.
useStudioStore.subscribe((state, previous) => {
  if (state.project === previous.project || !state.playing) return;
  playingEdits += 1;
  const edit = playingEdits;
  setTimeout(() => {
    if (edit !== playingEdits || !get().playing) return;
    // Removing the last clip leaves nothing to play: stop instead of keeping the old preview running.
    if (projectDurationSec(get().project) <= 0) void stopPlayback(true);
    else void playFrom(get().playheadSec);
  }, EDIT_RESTART_MS);
});

// ---- export -----------------------------------------------------------------------------------------------------------

let exportRender: StudioRender | null = null;

export async function cancelExport(): Promise<void> {
  await exportRender?.cancel().catch(() => undefined);
}

/** Renders the whole mix and saves it to the Library. Resolves with the new track id, or null when it failed or was cancelled. */
export async function exportMix(title: string, artist: string): Promise<number | null> {
  if (get().exporting) return null;
  await stopPlayback(false);
  set({ exporting: { progress: 0 } });
  try {
    const render = await startRender(get().project, {
      name: 'export',
      metadata: { title, artist },
      onProgress: (progress) => set({ exporting: { progress } }),
    });
    exportRender = render;
    if (!render || !(await render.done)) return null;
    const trackId = await saveMixToLibrary(render.outputUri, title, artist, render.durationSec);
    await upsertTrackById(trackId);
    return trackId;
  } catch {
    showToast('Could not save the mix.', 'error');
    return null;
  } finally {
    exportRender = null;
    set({ exporting: null });
  }
}

/**
 * Clear all: empties the Studio as one undoable step, so a mistaken Clear can be taken back with Undo. Waveforms and
 * temporary downloads stay until the app starts again (cleaned up below), because Undo may need them.
 */
export async function resetProject(): Promise<void> {
  await stopPlayback(true);
  editProject(() => createEmptyProject());
  set({ selectedClipId: null, selectedTrackId: null, downloads: {}, autoFit: true });
}

// Nothing from an earlier session can be undone any more, so its work files and temporary songs are deleted at start.
void clearStudioFiles(true).catch(() => undefined);

export function libraryTrackById(id: number): Track | undefined {
  return useLibraryStore.getState().tracks.find((track) => track.id === id);
}

/** Sets the fade-in or fade-out length of a clip, keeping the curve it already has. */
export function setClipFade(clipId: string, which: 'fadeIn' | 'fadeOut', seconds: number): void {
  editProject((project) => {
    const found = findClip(project, clipId);
    return found ? updateClip(project, clipId, { [which]: { curve: found.clip[which].curve, seconds: Math.max(0, seconds) } }) : project;
  }, `fade:${clipId}:${which}`);
}
