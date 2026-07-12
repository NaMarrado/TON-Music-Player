import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'TON',
  slug: 'ton-player',
  version: '1.0.20',
  icon: './assets/icon.png',
  scheme: 'ton',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  android: {
    package: 'com.ton.player',
    versionCode: 1000020,
    icon: './assets/android-icon.png',
    permissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.INTERNET',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.REQUEST_INSTALL_PACKAGES',
      'android.permission.WAKE_LOCK',
    ],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-foreground.png',
      backgroundColor: '#000000',
    },
  },
  ios: {
    bundleIdentifier: 'com.ton.player',
    buildNumber: '1000020',
    icon: './assets/icon.png',
    infoPlist: {
      NSSupportsLiveActivities: true,
    },
  },
  androidStatusBar: {
    barStyle: 'light-content',
    backgroundColor: '#050505',
  },
  plugins: [
    'expo-sqlite',
    'expo-localization',
    'expo-notifications',
    ['expo-system-ui', { backgroundColor: '#050505' }],
    ['expo-splash-screen', {
      backgroundColor: '#050505',
      image: './assets/splash-icon.png',
      imageWidth: 220,
      resizeMode: 'contain',
    }],
    './plugins/with-ton-ios-build.js',
    './plugins/with-ton-android-build.js',
  ],
};

export default config;
