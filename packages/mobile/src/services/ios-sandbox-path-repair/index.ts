import { Platform } from 'react-native';
import { repairPlaylistCoverSandboxPaths } from './playlist-cover-paths';
import { repairTrackSandboxPaths } from './track-paths';

let repairPromise: Promise<void> | null = null;

export async function repairIosSandboxPaths(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  if (repairPromise) {
    return repairPromise;
  }

  repairPromise = (async () => {
    await Promise.all([
      repairTrackSandboxPaths(),
      repairPlaylistCoverSandboxPaths(),
    ]);
  })().finally(() => {
    repairPromise = null;
  });

  return repairPromise;
}
