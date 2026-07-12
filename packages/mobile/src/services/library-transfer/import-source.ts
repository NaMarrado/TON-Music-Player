import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { SUPPORTED_LIBRARY_ARCHIVE_MIME_TYPES } from './naming';

function getImportArchiveDocumentTypes(): string[] {
  if (Platform.OS === 'ios') {
    return ['*/*'];
  }

  return [...SUPPORTED_LIBRARY_ARCHIVE_MIME_TYPES];
}

export async function pickImportArchiveAsync(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: getImportArchiveDocumentTypes(),
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0];
}
