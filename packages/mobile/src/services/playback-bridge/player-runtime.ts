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
      // Keep the bounded native window cycling if JS is briefly suspended;
      // active-track events refill it from the full source when JS resumes.
      await setPlaybackRepeatMode(PlaybackRepeatModeValue.Queue);
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
