import {
  addPlaybackRuntimeEventListener,
  pausePlayback,
  PlaybackEvent,
  playPlayback,
  seekPlayback,
  stopPlayback,
} from './playback-runtime';
import {
  nextTrack,
  prevTrack,
  setRepeatMode,
  setShuffleEnabled,
} from './playback-bridge/controls';
import { setupPlayer } from './audio-player';
import { playCarMediaId } from './car-playback';
import { Platform } from 'react-native';

let listenersRegistered = false;

function logRemote(event: string, details?: string): void {
  console.log(`[RNTP Remote] ${event}${details ? ` ${details}` : ''}`);
}

export async function PlaybackService(): Promise<void> {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;
  console.log('[RNTP Remote] service ready');

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePlay, async () => {
    logRemote('play');
    await playPlayback();
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePlayId, async ({ id }) => {
    logRemote('play-id');
    try {
      await playCarMediaId(id);
    } catch (error) {
      console.warn('[RNTP Remote] play-id failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePause, async () => {
    logRemote('pause');
    await pausePlayback();
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteNext, async () => {
    logRemote('next');
    try {
      await nextTrack();
    } catch (error) {
      console.warn('[RNTP Remote] next failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePrevious, async () => {
    logRemote('previous');
    try {
      await prevTrack();
    } catch (error) {
      console.warn('[RNTP Remote] previous failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteShuffle, async ({ enabled }) => {
    logRemote('shuffle', `enabled=${enabled}`);
    try {
      await setShuffleEnabled(enabled);
    } catch (error) {
      console.warn('[RNTP Remote] shuffle failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteRepeat, async ({ mode }) => {
    logRemote('repeat', `mode=${mode}`);
    try {
      await setRepeatMode(mode);
    } catch (error) {
      console.warn('[RNTP Remote] repeat failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteSeek, async ({ position }) => {
    logRemote('seek', `position=${position}`);
    await seekPlayback(position);
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteStop, async () => {
    logRemote('stop');
    await stopPlayback();
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteDuck, async ({ paused, permanent }) => {
    logRemote('duck', `paused=${paused} permanent=${permanent}`);
    if (permanent) {
      await stopPlayback();
      return;
    }
    if (paused) {
      await pausePlayback();
    } else {
      await playPlayback();
    }
  });

  if (Platform.OS === 'android') {
    await setupPlayer();
  }

}
