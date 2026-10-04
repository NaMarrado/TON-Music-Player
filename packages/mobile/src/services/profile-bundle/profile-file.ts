import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { parseProfileBundle, type ParsedProfileBundle } from '@ton/core';
import { requestDirectoryUriAsync } from '../library-transfer/android-storage-access';
import { applyMobileProfile, collectMobileProfile, type MobileProfileImportResult } from './profile-data';

const PROFILE_MIME = 'application/json';
/** A profile with years of listening history is a few megabytes; anything near this size is not a TON profile. */
const MAX_PROFILE_BYTES = 256 * 1024 * 1024;

export interface MobileProfileExportResult {
  /** False when the user left the folder picker without choosing. */
  saved: boolean;
  starred: number;
  playlists: number;
  sessions: number;
  unidentified: number;
}

function fileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `TON profile ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Android asks for a folder and writes the file there; iOS hands the file to the share sheet. */
export async function exportMobileProfile(): Promise<MobileProfileExportResult> {
  const name = fileName();
  let directoryUri: string | null = null;
  if (Platform.OS === 'android') {
    directoryUri = await requestDirectoryUriAsync();
    if (!directoryUri) return { saved: false, starred: 0, playlists: 0, sessions: 0, unidentified: 0 };
  }
  const { bundle, unidentified } = await collectMobileProfile();
  const content = JSON.stringify(bundle);
  if (directoryUri) {
    const target = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, name, PROFILE_MIME);
    await FileSystem.writeAsStringAsync(target, content);
  } else {
    const target = `${FileSystem.cacheDirectory}${name}`;
    await FileSystem.writeAsStringAsync(target, content);
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device');
    await Sharing.shareAsync(target, { mimeType: PROFILE_MIME, UTI: 'public.json' });
  }
  return { saved: true, starred: bundle.starred.length, playlists: bundle.playlists.length, sessions: bundle.listening.length, unidentified };
}

export interface MobileProfileImportOutcome extends MobileProfileImportResult {
  /** False when the user left the file picker without choosing. */
  imported: boolean;
  /** The language the file asked for, so the screen can apply it at once. */
  language: string | null;
}

/** Lets the user pick a profile file and merges it into this phone. Throws for a file that is not a valid TON profile. */
export async function importMobileProfile(): Promise<MobileProfileImportOutcome> {
  const picked = await DocumentPicker.getDocumentAsync({ type: Platform.OS === 'ios' ? ['*/*'] : [PROFILE_MIME, 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || picked.assets.length === 0) {
    return { imported: false, language: null, settings: 0, ignoredSettings: 0, starred: 0, starsMissing: 0, playlistsCreated: 0, playlistsSkipped: 0, playlistTracksMissing: 0, sessions: 0, sessionsRejected: 0 };
  }
  const [asset] = picked.assets;
  const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
  if (info.exists && typeof info.size === 'number' && info.size > MAX_PROFILE_BYTES) throw new Error('This is not a TON profile file');
  const parsed: ParsedProfileBundle = parseProfileBundle(await FileSystem.readAsStringAsync(asset.uri));
  const result = await applyMobileProfile(parsed);
  await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  return { imported: true, language: parsed.bundle.settings.language ?? null, ...result };
}
