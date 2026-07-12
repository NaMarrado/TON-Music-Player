import {
  addPlaybackRuntimeEventListener,
  getPlaybackProgress,
  pausePlayback,
  PlaybackEvent,
  playPlayback,
  seekPlayback,
  skipToNextPlayback,
  skipToPreviousPlayback,
  stopPlayback,
} from './playback-runtime';

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

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePause, async () => {
    logRemote('pause');
    await pausePlayback();
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemoteNext, async () => {
    logRemote('next');
    try {
      await skipToNextPlayback();
    } catch (error) {
      console.warn('[RNTP Remote] next failed:', error);
    }
  });

  addPlaybackRuntimeEventListener(PlaybackEvent.RemotePrevious, async () => {
    logRemote('previous');
    try {
      const progress = await getPlaybackProgress();
      if (progress.position > 3) {
        await seekPlayback(0);
        return;
      }

      await skipToPreviousPlayback();
    } catch (error) {
      console.warn('[RNTP Remote] previous failed:', error);
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

}
