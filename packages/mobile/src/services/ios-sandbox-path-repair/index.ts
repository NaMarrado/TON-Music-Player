import { Platform } from 'react-native';
import { withMobileCloudOutboxSuppressed } from '../cloud-sync/local-state';
import {
  applyPlaylistCoverSandboxPathRepairs,
  collectPlaylistCoverSandboxPathRepairs,
} from './playlist-cover-paths';
import {
  applyTrackSandboxPathRepairs,
  collectTrackSandboxPathRepairs,
} from './track-paths';

let repairPromise: Promise<void> | null = null;

export async function repairIosSandboxPaths(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  if (repairPromise) {
    return repairPromise;
  }

  repairPromise = (async () => {
    const [trackRepairs, playlistRepairs] = await Promise.all([
      collectTrackSandboxPathRepairs(),
      collectPlaylistCoverSandboxPathRepairs(),
    ]);
    if (trackRepairs.length === 0 && playlistRepairs.length === 0) return;

    await withMobileCloudOutboxSuppressed(async (db) => {
      await applyTrackSandboxPathRepairs(db, trackRepairs);
      await applyPlaylistCoverSandboxPathRepairs(db, playlistRepairs);
    });
  })().finally(() => {
    repairPromise = null;
  });

  return repairPromise;
}
