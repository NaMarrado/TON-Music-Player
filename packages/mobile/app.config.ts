import type { ExpoConfig } from 'expo/config';

// Icon fonts are bundled into the app so icons show on the first frame instead of after a runtime font load.
const ICON_FONT_DIR = '../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts';
const ICON_FONTS = ['Feather', 'FontAwesome', 'MaterialCommunityIcons']
  .map((name) => `${ICON_FONT_DIR}/${name}.ttf`);

const config: ExpoConfig = {
  name: 'TON',
  slug: 'ton-player',
  version: '1.0.49',
  icon: './assets/icon.png',
  scheme: 'ton',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  android: {
    package: 'com.ton.player',
    versionCode: 1000049,
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
    bundleIdentifier: 'cz.ton.player',
    buildNumber: '1000049',
    icon: './assets/icon.png',
    infoPlist: {
      LSSupportsOpeningDocumentsInPlace: true,
      NSSupportsLiveActivities: true,
      UIBackgroundModes: ['audio', 'processing'],
      UIFileSharingEnabled: true,
    },
  },
  androidStatusBar: {
    barStyle: 'light-content',
    backgroundColor: '#050505',
  },
  plugins: [
    'expo-sqlite',
    ['expo-font', { fonts: ICON_FONTS }],
    'expo-localization',
    'expo-notifications',
    'expo-background-task',
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
