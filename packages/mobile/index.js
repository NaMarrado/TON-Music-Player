import './src/polyfills';
import './src/services/cloud-sync/background-task';
import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';
import App from './src/app';

if (global.__TON_DOWNLOAD_TASK_REGISTERED__ == null) {
  global.__TON_DOWNLOAD_TASK_REGISTERED__ = false;
}

try {
  const { PlaybackService } = require('./src/services/playback-service');
  if (Platform.OS === 'android') {
    const TrackPlayer = require('react-native-track-player').default;
    TrackPlayer.registerPlaybackService(() => PlaybackService);
  } else if (Platform.OS === 'ios') {
    void PlaybackService().catch((error) => {
      console.warn('iOS playback service init failed:', error?.message ?? error);
    });
  }
} catch (e) {
  console.warn('TrackPlayer registration failed:', e.message);
}

try {
  if (!global.__TON_DOWNLOAD_TASK_REGISTERED__) {
    AppRegistry.registerHeadlessTask(
      'TONDownloadTask',
      () => require('./src/services/download-headless-task'),
    );
    global.__TON_DOWNLOAD_TASK_REGISTERED__ = true;
  }
} catch (e) {
  console.warn('Download task registration failed:', e.message);
}

registerRootComponent(App);
