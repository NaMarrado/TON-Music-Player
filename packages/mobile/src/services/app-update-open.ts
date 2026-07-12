import { Linking } from 'react-native';

export async function openMobileUpdateUrl(url: string): Promise<void> {
  await Linking.openURL(url);
}
