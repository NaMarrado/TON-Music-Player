import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  PlaybackRuntimeProgress,
  PlaybackRuntimeTrack,
  PlaybackRuntimeUpdateOptions,
} from './types';
import type {
  IosPlaybackRuntimeEvent,
  IosPlaybackRuntimeModule,
  IosPlaybackRuntimeStateSnapshot,
} from './ios-types';

const IOS_PLAYBACK_EVENT = 'iosPlaybackEvent';

function getIosPlaybackRuntimeModule(): IosPlaybackRuntimeModule {
  const module = NativeModules.IosPlaybackEngine as IosPlaybackRuntimeModule | undefined;
  if (!module) {
    throw new Error('IosPlaybackEngine native module is not available');
  }

  return module;
}

let eventEmitter: NativeEventEmitter | null = null;

function getIosPlaybackEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(NativeModules.IosPlaybackEngine);
  }

  return eventEmitter;
}

export function getIosPlaybackRuntimeModuleUnsafe(): IosPlaybackRuntimeModule | null {
  return (NativeModules.IosPlaybackEngine as IosPlaybackRuntimeModule | undefined) ?? null;
}

export function subscribeToIosPlaybackEvents(
  listener: (event: IosPlaybackRuntimeEvent) => void,
): { remove: () => void } {
  return getIosPlaybackEventEmitter().addListener(IOS_PLAYBACK_EVENT, listener);
}

export async function setupIosPlaybackRuntimePlayer(): Promise<void> {
  await getIosPlaybackRuntimeModule().setupPlayer();
}

export async function configureDefaultIosPlaybackRuntimeOptions(
  options: PlaybackRuntimeUpdateOptions,
): Promise<void> {
  await getIosPlaybackRuntimeModule().updateOptions(options as Record<string, unknown>);
}

export async function setIosPlaybackQueue(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await getIosPlaybackRuntimeModule().setQueue(tracks);
}

export async function addIosPlaybackTracks(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await getIosPlaybackRuntimeModule().add(tracks);
}

export async function loadIosPlaybackTrack(track: PlaybackRuntimeTrack): Promise<void> {
  await getIosPlaybackRuntimeModule().load(track);
}

export async function playIosPlayback(): Promise<void> {
  await getIosPlaybackRuntimeModule().play();
}

export async function pauseIosPlayback(): Promise<void> {
  await getIosPlaybackRuntimeModule().pause();
}

export async function stopIosPlayback(): Promise<void> {
  await getIosPlaybackRuntimeModule().stop();
}

export async function seekIosPlayback(position: number): Promise<void> {
  await getIosPlaybackRuntimeModule().seekTo(position);
}

export async function setIosPlaybackVolume(volume: number): Promise<void> {
  await getIosPlaybackRuntimeModule().setVolume(volume);
}

export async function setIosPlaybackRepeatMode(mode: number): Promise<void> {
  await getIosPlaybackRuntimeModule().setRepeatMode(mode);
}

export async function skipIosPlaybackIndex(index: number): Promise<void> {
  await getIosPlaybackRuntimeModule().skip(index);
}

export async function skipToNextIosPlayback(): Promise<void> {
  await getIosPlaybackRuntimeModule().skipToNext();
}

export async function skipToPreviousIosPlayback(): Promise<void> {
  await getIosPlaybackRuntimeModule().skipToPrevious();
}

export async function removeUpcomingIosPlaybackTracks(): Promise<void> {
  await getIosPlaybackRuntimeModule().removeUpcomingTracks();
}

export async function getIosPlaybackPosition(): Promise<number> {
  return getIosPlaybackRuntimeModule().getPosition();
}

export async function getIosPlaybackProgress(): Promise<PlaybackRuntimeProgress> {
  return getIosPlaybackRuntimeModule().getProgress();
}

export async function getIosPlaybackState(): Promise<IosPlaybackRuntimeStateSnapshot> {
  return getIosPlaybackRuntimeModule().getPlaybackState();
}

export async function getActiveIosPlaybackTrack(): Promise<PlaybackRuntimeTrack | undefined> {
  return (await getIosPlaybackRuntimeModule().getActiveTrack()) ?? undefined;
}

export async function getActiveIosPlaybackTrackIndex(): Promise<number | undefined> {
  const index = await getIosPlaybackRuntimeModule().getActiveTrackIndex();
  return index == null ? undefined : index;
}
