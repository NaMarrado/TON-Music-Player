import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';

const TRACKPLAYER_NOTIFICATION_URL = 'trackplayer://notification.click';
const NORMALIZED_NOW_PLAYING_URL = 'ton://now-playing';

function normalizeIncomingUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  if (url === TRACKPLAYER_NOTIFICATION_URL) {
    return NORMALIZED_NOW_PLAYING_URL;
  }

  return url;
}

function getNotificationResponseUrl(
  response: Notifications.NotificationResponse | null,
): string | null {
  const rawUrl = response?.notification.request.content.data?.url;
  return typeof rawUrl === 'string' ? normalizeIncomingUrl(rawUrl) : null;
}

export const notificationLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['ton://'],
  config: {
    screens: {
      Tabs: {
        screens: {
          HomeTab: {
            screens: {
              Home: 'home',
            },
          },
          SearchTab: {
            screens: {
              Search: 'search',
            },
          },
          LibraryTab: {
            screens: {
              Library: 'library',
            },
          },
          DownloadsTab: {
            screens: {
              Downloads: 'downloads',
            },
          },
          SettingsTab: {
            screens: {
              Settings: 'settings',
            },
          },
        },
      },
      NowPlaying: 'now-playing',
    },
  },
  async getInitialURL() {
    const initialUrl = await Linking.getInitialURL();
    const normalizedUrl = normalizeIncomingUrl(initialUrl);
    if (normalizedUrl) {
      return normalizedUrl;
    }

    const lastNotificationResponse = await Notifications.getLastNotificationResponseAsync();
    return getNotificationResponseUrl(lastNotificationResponse);
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const normalizedUrl = normalizeIncomingUrl(url);
      if (normalizedUrl) {
        listener(normalizedUrl);
      }
    });

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const responseUrl = getNotificationResponseUrl(response);
        if (responseUrl) {
          listener(responseUrl);
        }
      },
    );

    return () => {
      subscription.remove();
      notificationSubscription.remove();
    };
  },
};
