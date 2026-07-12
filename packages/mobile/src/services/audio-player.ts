import {
  configureDefaultPlaybackRuntimeOptions,
  setupPlaybackRuntimePlayer,
} from './playback-runtime';

let isSetup = false;
let setupPromise: Promise<void> | null = null;

export async function setupPlayer(): Promise<void> {
  if (isSetup) return;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    try {
      await setupPlaybackRuntimePlayer();
      await configureDefaultPlaybackRuntimeOptions();
      isSetup = true;
    } catch (e) {
      setupPromise = null;
      throw e;
    }
  })();

  return setupPromise;
}

export function isPlayerReady(): boolean {
  return isSetup;
}
