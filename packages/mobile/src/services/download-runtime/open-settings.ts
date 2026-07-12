import { Linking } from 'react-native';

export async function openDownloadRuntimeSettings(): Promise<void> {
  await Linking.openSettings();
}
