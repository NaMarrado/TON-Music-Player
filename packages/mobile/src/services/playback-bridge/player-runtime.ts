import { usePlaybackStore } from '../../stores/playback-store';
import { incrementTrackPlayCount } from '../db-queries';
import { ensureAudioEffectsAttached } from '../audio-settings';
import {
  PlaybackRepeatModeValue,
  setPlaybackRepeatMode,
  setPlaybackShuffleEnabled,
} from '../playback-runtime';
import { initializeVolumeBoost } from './volume';

let firstPlayDone = false;

export function incrementPlayCount(trackId: number): void {
  incrementTrackPlayCount(trackId).catch(() => {});
}

export async function syncRepeatMode(mode: 'all' | 'one'): Promise<void> {
  try {
    if (mode === 'one') {
      await setPlaybackRepeatMode(PlaybackRepeatModeValue.Track);
    } else {
      // The JS rolling queue refills from the full source pool at its boundary.
      await setPlaybackRepeatMode(PlaybackRepeatModeValue.Off);
    }
  } catch {
    // RNTP may not be ready yet.
  }
}

export function runFirstPlaySetup(): void {
  if (!firstPlayDone) {
    firstPlayDone = true;
    const { repeat, shuffle } = usePlaybackStore.getState();

    syncRepeatMode(repeat).catch(() => {});
    setPlaybackShuffleEnabled(shuffle).catch(() => {});
    initializeVolumeBoost().catch(() => {
      firstPlayDone = false;
    });
  }

  ensureAudioEffectsAttached().catch(() => {});
}
