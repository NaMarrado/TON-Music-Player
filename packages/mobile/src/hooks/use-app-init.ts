import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { initDatabase } from '../services/database';
import { getSetting } from '../services/db-queries';
import {
  ensureDownloadRuntimePermission,
  initializeDownloadRuntime,
} from '../services/download-runtime';
import { setupPlayer } from '../services/audio-player';
import { restoreAudioSettings } from '../services/audio-settings';
import { applyStoredLanguagePreference } from '../i18n';
import { getDownloadQueue } from '../services/download-queue';
import {
  startDownloadNetworkMonitor,
  type DownloadNetworkMonitor,
} from '../services/download-queue/network-monitor';
import { repairIosSandboxPaths } from '../services/ios-sandbox-path-repair';
import {
  startMobileCloudAutoSync,
  stopMobileCloudAutoSync,
} from '../services/cloud-sync/auto-sync';
import { markPerf, measurePerfAsync } from '../services/perf';
import { subscribeToDownloads } from '../stores/download-store';
import { loadTracks } from '../stores/library-store';
import { loadPlaylists } from '../stores/playlist-store';
import {
  restoreMobilePlaybackSession,
  startMobilePlaybackSessionPersistence,
} from '../services/playback-session';

export function useAppInit() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postReadyTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const downloadNetworkMonitorRef = useRef<DownloadNetworkMonitor | null>(null);
  const stopPlaybackPersistenceRef = useRef<(() => void) | null>(null);

  const init = useCallback(async () => {
    postReadyTaskRef.current?.cancel();
    postReadyTaskRef.current = null;
    downloadNetworkMonitorRef.current?.stop();
    downloadNetworkMonitorRef.current = null;
    stopPlaybackPersistenceRef.current?.();
    stopPlaybackPersistenceRef.current = null;
    stopMobileCloudAutoSync();
    setError(null);
    setReady(false);
    try {
      markPerf('app-init:start');
      await measurePerfAsync('app-init:database', () => initDatabase());
      await measurePerfAsync('app-init:ios-sandbox-path-repair', () => repairIosSandboxPaths());
      await measurePerfAsync('app-init:language', async () => {
        const storedLanguage = await getSetting('language');
        await applyStoredLanguagePreference(storedLanguage);
      });
      await Promise.all([
        measurePerfAsync('app-init:audio-settings', () => restoreAudioSettings()),
        measurePerfAsync('app-init:library', () => loadTracks()),
        measurePerfAsync('app-init:playlists', () => loadPlaylists()),
      ]);
      await measurePerfAsync('app-init:playback-session', async () => {
        await setupPlayer();
        await restoreMobilePlaybackSession();
        stopPlaybackPersistenceRef.current = startMobilePlaybackSessionPersistence();
      });
      setReady(true);
      markPerf('app-init:ready');
      postReadyTaskRef.current = InteractionManager.runAfterInteractions(() => {
        void measurePerfAsync('app-init:player-deferred', () => setupPlayer()).catch(() => {});
        initializeDownloadRuntime();
        if (Platform.OS !== 'ios') {
          void ensureDownloadRuntimePermission(false).catch(() => {});
        }
        subscribeToDownloads();
        void startMobileCloudAutoSync().catch(() => {});
        const networkMonitor = startDownloadNetworkMonitor();
        downloadNetworkMonitorRef.current = networkMonitor;
        void networkMonitor.ready.then(() => {
          if (downloadNetworkMonitorRef.current !== networkMonitor) {
            return;
          }
          return getDownloadQueue().resumeOnStartup();
        }).catch(() => {});
        postReadyTaskRef.current = null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Init failed');
    }
  }, []);

  useEffect(() => {
    init();
    return () => {
      postReadyTaskRef.current?.cancel();
      postReadyTaskRef.current = null;
      downloadNetworkMonitorRef.current?.stop();
      downloadNetworkMonitorRef.current = null;
      stopPlaybackPersistenceRef.current?.();
      stopPlaybackPersistenceRef.current = null;
      stopMobileCloudAutoSync();
    };
  }, [init]);

  return { ready, error, retry: init };
}
