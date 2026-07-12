import * as FileSystem from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';
import type { DownloadFormat } from '../downloader/types';

type IosAudioNormalizerModule = {
  normalize(filePath: string): Promise<{
    filePath?: string;
    format?: string;
  }>;
};

export interface DownloadedAudioAsset {
  filePath: string;
  format: DownloadFormat;
}

const IOS_NORMALIZED_FORMATS = new Set<DownloadFormat>(['m4a']);

function getIosAudioNormalizerModule(): IosAudioNormalizerModule | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (NativeModules.IosAudioNormalizer as IosAudioNormalizerModule | undefined) ?? null;
}

export async function normalizeDownloadedAudioForPlayback(
  asset: DownloadedAudioAsset,
): Promise<DownloadedAudioAsset> {
  if (Platform.OS !== 'ios' || !IOS_NORMALIZED_FORMATS.has(asset.format)) {
    return asset;
  }

  const normalizer = getIosAudioNormalizerModule();
  if (!normalizer) {
    throw new Error('ios_audio_normalizer_unavailable');
  }

  const normalized = await normalizer.normalize(asset.filePath);
  const filePath = normalized.filePath || asset.filePath;
  if (filePath !== asset.filePath) {
    await FileSystem.deleteAsync(asset.filePath, { idempotent: true }).catch(() => {});
  }

  return {
    filePath,
    format: normalized.format === 'm4a' ? 'm4a' : asset.format,
  };
}
