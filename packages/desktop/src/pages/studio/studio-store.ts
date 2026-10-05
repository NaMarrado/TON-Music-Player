import { create } from 'zustand';
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
  placeTransition,
  projectDurationSec,
  STUDIO_NEW_CLIP_GAIN_DB,
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
import { pause as pauseMainPlayback } from '../../audio/playback-service';
import { showToast } from '../../stores/toast-store';
import { loadTracks, useLibraryStore } from '../../stores/library-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { loadPlaylists, reloadPlaylistViews } from '../../stores/playlist-store';
import { studioEngine } from './studio-engine';

const MAX_HISTORY = 60;
const COALESCE_MS = 700;
const LIVE_REBUILD_INTERVAL_MS = 120;

export type AssetPhase = 'loading' | 'ready' | 'error';

export interface StudioState {
  project: StudioProject;
  past: StudioProject[];
  future: StudioProject[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
  playheadSec: number;
  playing: boolean;
  pxPerSec: number;
  /** Beat grid division the timeline snaps to: 0 = free, 1 = every beat, 4 = every bar. */
  snapBeats: number;
  transitionBars: number;
  transitionCurve: StudioFadeCurve;
  assetPhase: Record<string, AssetPhase>;
  /** Online results being downloaded into the temp folder, by result key (0..1, or -1 after a failure). */
  downloads: Record<string, number>;
  exporting: { progress: number } | null;
  /** Bumps whenever waveform data arrives so canvases redraw. */
  peaksRevision: number;
  /** Visible width of the timeline lanes in pixels, reported by the timeline. */
  viewWidthPx: number;
  /** True until the user zooms by hand: the whole project then stays fitted to the window. */
  autoFit: boolean;
  /** Counts the times the user picked a clip, so the side panel can show Edit for it. */
  editRequest: number;
  /** The Library song opened with Edit in Studio; saving can replace its audio in place. */
  editTarget: { trackId: number; title: string } | null;
}

export const useStudioStore = create<StudioState>()(() => ({
  project: createEmptyProject(),
  past: [],
  future: [],
  selectedClipId: null,
  selectedTrackId: null,
  playheadSec: 0,
  playing: false,
  pxPerSec: 24,
  snapBeats: 1,
  transitionBars: 8,
  transitionCurve: 'equal-power',
  assetPhase: {},
  downloads: {},
  exporting: null,
  peaksRevision: 0,
  viewWidthPx: 0,
  autoFit: true,
  editRequest: 0,
  editTarget: null,
}));

const get = useStudioStore.getState;
const set = useStudioStore.setState;

export function newStudioId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
}

// ---- project edits with undo -----------------------------------------------------------------------------------------

let lastCoalesce: { key: string; at: number } | null = null;

/** Applies an edit and records one undo step. Repeated edits with the same key (a slider drag) share a single step. */
export function editProject(change: (project: StudioProject) => StudioProject, coalesceKey?: string): void {
  const { project, past } = get();
  const next = change(project);
  if (next === project) return;
  const now = performance.now();
  const coalesce = coalesceKey !== undefined && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
  lastCoalesce = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
  set({ project: next, past: coalesce ? past : [...past, project].slice(-MAX_HISTORY), future: [] });
}

/** Changes that are not user edits (analysis results) must not create undo steps. */
function applySilently(change: (project: StudioProject) => StudioProject): void {
  const { project, past, future } = get();
  const next = change(project);
  if (next === project) return;
  const swap = (snapshot: StudioProject) => change(snapshot);
  set({ project: next, past: past.map(swap), future: future.map(swap) });
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

// ---- selection and view ----------------------------------------------------------------------------------------------

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
export const ZOOM_MAX = 400;
/** Space kept free on the right of a fitted project so its end is not glued to the edge. */
const FIT_MARGIN_PX = 24;

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

/** Called by the timeline whenever its visible width changes; a project that is still fitted follows the window. */
export function setViewWidth(viewWidthPx: number): void {
  if (Math.abs(viewWidthPx - get().viewWidthPx) < 1) return;
  set({ viewWidthPx });
  if (get().autoFit) fitToWindow();
}

/** The zoom slider is logarithmic: equal slider steps are equal ratios, so it feels the same from 1 s to 10 min views. */
export function zoomToSlider(pxPerSec: number): number {
  return Math.log(pxPerSec / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
}
export function sliderToZoom(value: number): number {
  return ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** Math.min(1, Math.max(0, value));
}

export function setSnap(snapBeats: number): void {
  set({ snapBeats });
}

export function setTransitionBars(transitionBars: number): void {
  set({ transitionBars });
}

export function setTransitionCurve(transitionCurve: StudioFadeCurve): void {
  set({ transitionCurve });
}

// ---- adding songs ----------------------------------------------------------------------------------------------------

/** `fullLevel` keeps the song exactly as loud as the original (quick edits); mixes start quieter. */
function addLane(asset: StudioAsset, fullLevel = false): void {
  const clipId = newStudioId('c');
  const trackId = newStudioId('t');
  editProject((project) => {
    const withAsset = project.assets[asset.id] ? project : addAsset(project, asset);
    const stored = withAsset.assets[asset.id];
    return addClipToTrack(
      addTrack(withAsset, createTrack(trackId, [], fullLevel ? 1 : STUDIO_NEW_LANE_VOLUME)),
      trackId,
      { ...createClip(clipId, stored, get().playheadSec), gainDb: fullLevel ? 0 : STUDIO_NEW_CLIP_GAIN_DB },
    );
  });
  set({ selectedClipId: clipId, selectedTrackId: trackId });
  if (get().autoFit) fitToWindow();
}

function analyse(asset: StudioAsset): void {
  set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'loading' } }));
  studioEngine.loadAsset(asset).then((analysis) => {
    applySilently((project) => setAssetAnalysis(updateAssetDuration(project, asset.id, analysis.durationSec), asset.id, analysis));
    set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'ready' } }));
  }).catch(() => {
    set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'error' } }));
    showToast('Could not read this song.', 'error');
  });
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

export function addLibraryTrackToStudio(track: Track, fullLevel = false): void {
  const asset = get().project.assets[`lib-${track.id}`] ?? libraryAssetFor(track);
  if ((track.duration_ms ?? 0) > 0) {
    addLane(asset, fullLevel);
    if (!get().project.assets[asset.id]?.bpm) analyse(asset);
    return;
  }
  // Without a stored duration the clip length is only known once the file is decoded.
  set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'loading' } }));
  studioEngine.loadAsset(asset).then((analysis) => {
    addLane({ ...asset, durationSec: analysis.durationSec, bpm: analysis.bpm, key: analysis.key }, fullLevel);
    set((state) => ({ assetPhase: { ...state.assetPhase, [asset.id]: 'ready' } }));
  }).catch(() => showToast('Could not read this song.', 'error'));
}

export function resultKey(result: SearchResult): string {
  return `${result.source}:${result.id}`;
}

/** Downloads an online result into the Studio temp folder and adds it as a lane. It never reaches the Library. */
export async function addOnlineResultToStudio(result: SearchResult): Promise<void> {
  const key = resultKey(result);
  if (key in get().downloads && get().downloads[key] >= 0) return;
  const assetId = `tmp-${key}`;
  const existing = get().project.assets[assetId];
  if (existing) {
    addLane(existing);
    return;
  }
  if (result.source === 'local' || result.source === 'playlist') return;
  set((state) => ({ downloads: { ...state.downloads, [key]: 0 } }));
  try {
    const { path } = await window.api.invoke('studio:download-temp', key, {
      source: result.source,
      url: result.url,
      title: result.title,
      artist: result.artist,
      durationMs: result.duration_ms,
    });
    const draft: StudioAsset = {
      id: assetId,
      path,
      title: result.title,
      artist: result.artist,
      durationSec: (result.duration_ms ?? 0) / 1000,
      bpm: null,
      key: null,
      coverPath: null,
      temporary: true,
    };
    const analysis = await studioEngine.loadAsset(draft);
    addLane({ ...draft, durationSec: analysis.durationSec, bpm: analysis.bpm, key: analysis.key });
    set((state) => ({ assetPhase: { ...state.assetPhase, [assetId]: 'ready' } }));
    set((state) => {
      const downloads = { ...state.downloads };
      delete downloads[key];
      return { downloads };
    });
  } catch (error) {
    set((state) => ({ downloads: { ...state.downloads, [key]: -1 } }));
    if (!(error instanceof Error && /cancel/i.test(error.message))) showToast(error instanceof Error ? error.message : 'Download failed.', 'error');
  }
}

// ---- timeline operations ---------------------------------------------------------------------------------------------

function selectedClip(): { trackId: string; clipId: string } | null {
  const { project, selectedClipId } = get();
  const found = selectedClipId ? findClip(project, selectedClipId) : null;
  return found ? { trackId: found.track.id, clipId: found.clip.id } : null;
}

export function splitAtPlayhead(): void {
  const { project, playheadSec, selectedTrackId } = get();
  const chosen = selectedClip();
  let clipId = chosen?.clipId ?? null;
  if (!clipId) {
    const tracks = selectedTrackId ? project.tracks.filter((track) => track.id === selectedTrackId) : project.tracks;
    for (const track of tracks) {
      const hit = track.clips.find((clip) => clip.startSec < playheadSec && clipEndSec(clip) > playheadSec);
      if (hit) { clipId = hit.id; break; }
    }
  }
  if (!clipId) return;
  const newId = newStudioId('c');
  editProject((current) => splitClip(current, clipId, playheadSec, newId));
  if (findClip(get().project, newId)) set({ selectedClipId: newId });
}

export function duplicateSelectedClip(): void {
  const chosen = selectedClip();
  if (!chosen) return;
  const newId = newStudioId('c');
  editProject((project) => duplicateClip(project, chosen.clipId, newId));
  set({ selectedClipId: newId });
}

export function deleteSelectedClip(): void {
  const chosen = selectedClip();
  if (!chosen) return;
  editProject((project) => deleteClip(project, chosen.clipId));
  set({ selectedClipId: null });
}

export function removeLane(trackId: string): void {
  editProject((project) => ({ ...project, tracks: project.tracks.filter((track) => track.id !== trackId) }));
  const { selectedTrackId } = get();
  if (selectedTrackId === trackId) set({ selectedTrackId: null, selectedClipId: null });
  if (get().autoFit) fitToWindow();
}

/** The reverse of Cut here: joins the selected piece with the rest of its song, or puts it right after the clip before it. */
export function connectSelectedClip(): void {
  const chosen = selectedClip();
  if (chosen) editProject((project) => connectClip(project, chosen.clipId));
}

/**
 * Overlaps the selected clip with the clip that ends nearest to where it starts on another lane, over the chosen number
 * of bars, using the tempo of the outgoing song.
 */
export function transitionIntoSelected(): boolean {
  const { project, transitionBars, transitionCurve } = get();
  const chosen = selectedClip();
  const incoming = chosen ? findClip(project, chosen.clipId) : null;
  if (!incoming) return false;
  let outgoing: { id: string; distance: number; bpm: number | null } | null = null;
  for (const track of project.tracks) {
    if (track.id === incoming.track.id && track.clips.length < 2) continue;
    for (const clip of track.clips) {
      if (clip.id === incoming.clip.id) continue;
      const distance = Math.abs(clipEndSec(clip) - incoming.clip.startSec);
      if (!outgoing || distance < outgoing.distance) outgoing = { id: clip.id, distance, bpm: clipBpm(clip, project.assets[clip.assetId]) };
    }
  }
  if (!outgoing) return false;
  const bpm = outgoing.bpm ?? project.gridBpm ?? 120;
  const outgoingId = outgoing.id;
  editProject((current) => placeTransition(current, outgoingId, incoming.clip.id, transitionBars * secondsPerBar(bpm), transitionCurve));
  return true;
}

// ---- playback --------------------------------------------------------------------------------------------------------

let ticker = 0;

function tick(): void {
  if (!studioEngine.isPlaying) return;
  const position = studioEngine.position();
  if (position >= projectDurationSec(get().project) + 0.05) {
    studioEngine.pause();
    set({ playing: false, playheadSec: projectDurationSec(get().project) });
    return;
  }
  set({ playheadSec: position });
  ticker = requestAnimationFrame(tick);
}

export async function playFrom(sec: number): Promise<void> {
  const project = get().project;
  if (project.tracks.length === 0) return;
  pauseMainPlayback();
  cancelAnimationFrame(ticker);
  set({ playing: true, playheadSec: sec });
  try {
    await studioEngine.play(project, sec);
  } catch (error) {
    set({ playing: false });
    showToast(error instanceof Error ? error.message : 'Playback failed.', 'error');
    return;
  }
  ticker = requestAnimationFrame(tick);
}

export function pausePlayback(): void {
  cancelAnimationFrame(ticker);
  const position = studioEngine.isPlaying ? studioEngine.pause() : get().playheadSec;
  set({ playing: false, playheadSec: position });
}

export function togglePlay(): void {
  const { playing, playheadSec, project } = get();
  if (playing) pausePlayback();
  else void playFrom(playheadSec >= projectDurationSec(project) - 0.05 ? 0 : playheadSec);
}

export function stopPlayback(): void {
  cancelAnimationFrame(ticker);
  if (studioEngine.isPlaying) studioEngine.pause();
  set({ playing: false, playheadSec: 0 });
}

export function seek(sec: number): void {
  const target = Math.max(0, sec);
  if (get().playing) void playFrom(target);
  else set({ playheadSec: target });
}

let rebuildTimer: number | undefined;
let lastRebuildAt = 0;

// While playing, every edit reaches the sound at once, also in the middle of a slider drag: volume/tone/pan/echo/reverb
// amounts change the running graph in place; anything structural (speed, a cut, an effect switched on) rebuilds the
// graph, at most once per LIVE_REBUILD_INTERVAL_MS, always with the latest project.
useStudioStore.subscribe((state, previous) => {
  if (state.project === previous.project || !state.playing || !studioEngine.isPlaying) return;
  if (studioEngine.updateLive(state.project) || rebuildTimer !== undefined) return;
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = undefined;
    lastRebuildAt = performance.now();
    if (studioEngine.isPlaying) void playFrom(studioEngine.position());
  }, Math.max(0, lastRebuildAt + LIVE_REBUILD_INTERVAL_MS - performance.now()));
});

studioEngine.subscribe(() => set((state) => ({ peaksRevision: state.peaksRevision + 1 })));

// ---- export and reset ------------------------------------------------------------------------------------------------

const EXPORT_JOB = 'studio-export';

window.api.on('studio:progress', (event) => {
  if (event.kind === 'export' && event.id === EXPORT_JOB) set({ exporting: { progress: event.progress } });
  else if (event.kind === 'download') set((state) => (event.id in state.downloads ? { downloads: { ...state.downloads, [event.id]: event.progress } } : {}));
});

// The project only lives in this window's memory, so any temporary song found when the window (re)starts belongs to a
// project that no longer exists.
void window.api.invoke('studio:cleanup-temp', []).catch(() => 0);

/** Renders the mix and saves it to the Library. Resolves with the new track id, or null when it failed or was cancelled. */
export async function exportMix(title: string, artist: string): Promise<number | null> {
  const project = get().project;
  if (get().exporting || projectDurationSec(project) <= 0) return null;
  pausePlayback();
  set({ exporting: { progress: 0 } });
  try {
    const result = await window.api.invoke('studio:export', EXPORT_JOB, { project, title, artist });
    await loadTracks({ force: true });
    return result.trackId;
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) showToast(error instanceof Error ? error.message : 'Export failed.', 'error');
    return null;
  } finally {
    set({ exporting: null });
  }
}

/**
 * Opens one Library song alone in Studio for a quick edit. Earlier work is still reachable with Undo; Replace original
 * is only offered while the project actually contains the edited song (see `activeEditTarget`).
 */
export function editTrackInStudio(track: Track): void {
  stopPlayback();
  editProject(() => createEmptyProject());
  set({ selectedClipId: null, selectedTrackId: null, playheadSec: 0, autoFit: true, editTarget: { trackId: track.id, title: track.title || 'Untitled' } });
  addLibraryTrackToStudio(track, true);
}

/** The song a save would replace, or null when Undo/Clear left a project that no longer uses it. */
export function activeEditTarget(state: Pick<StudioState, 'editTarget' | 'project'>): StudioState['editTarget'] {
  const target = state.editTarget;
  if (!target) return null;
  const assetId = `lib-${target.trackId}`;
  return state.project.tracks.some((lane) => lane.clips.some((clip) => clip.assetId === assetId)) ? target : null;
}

/**
 * Saves the edit over the original song: same Library entry, same playlists, new audio. Studio is emptied afterwards,
 * because its undo history points at audio that no longer exists. Resolves with true when the song was replaced.
 */
export async function replaceEditedTrack(): Promise<boolean> {
  const { project, exporting } = get();
  const editTarget = activeEditTarget(get());
  if (!editTarget || exporting || projectDurationSec(project) <= 0) return false;
  pausePlayback();
  if (usePlaybackStore.getState().currentTrack?.id === editTarget.trackId) pauseMainPlayback();
  set({ exporting: { progress: 0 } });
  try {
    const original = libraryTrackById(editTarget.trackId);
    await window.api.invoke('studio:export', EXPORT_JOB, {
      project,
      title: original?.title || editTarget.title,
      artist: original?.artist || '',
      replaceTrackId: editTarget.trackId,
    });
    await Promise.all([loadTracks({ force: true }), loadPlaylists({ force: true }), reloadPlaylistViews()]);
    studioEngine.forget([]);
    set({ project: createEmptyProject(), past: [], future: [], selectedClipId: null, selectedTrackId: null, playheadSec: 0, autoFit: true, editTarget: null, assetPhase: {} });
    return true;
  } catch (error) {
    if (!(error instanceof Error && /cancel/i.test(error.message))) showToast(error instanceof Error ? error.message : 'Saving failed.', 'error');
    return false;
  } finally {
    set({ exporting: null });
  }
}

export function cancelExport(): void {
  void window.api.invoke('studio:cancel', EXPORT_JOB);
}

/**
 * Clear all: empties the project as one undoable step, so a mistaken Clear can be taken back with Undo. Decoded audio and
 * temporary downloads stay until the app restarts (they are cleaned up at start), because Undo may need them again.
 */
export function resetProject(): void {
  stopPlayback();
  editProject(() => createEmptyProject());
  set({ selectedClipId: null, selectedTrackId: null, downloads: {}, playheadSec: 0, autoFit: true, editTarget: null });
}

export function librarySnapshot(): Track[] {
  return useLibraryStore.getState().tracks;
}

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
