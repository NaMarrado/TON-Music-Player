import * as FileSystem from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';
import type { DownloadFormat } from '../downloader/types';
import type { DownloadQualityProfile } from '@ton/core';
import { transcodeAndroidAac96 } from './android-aac';

type IosAudioNormalizerModule = {
  normalize(filePath: string, targetBitRate: number, operationId: string): Promise<{
    filePath?: string;
    format?: string;
  }>;
  cancel(operationId: string): Promise<void>;
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
  options: {
    qualityProfile: DownloadQualityProfile;
    onCancelable?: (cancel: () => Promise<void>) => void;
  },
): Promise<DownloadedAudioAsset> {
  if (!IOS_NORMALIZED_FORMATS.has(asset.format)) {
    throw new Error(`incompatible_download_format:${asset.format}`);
  }

  if (Platform.OS === 'android') {
    if (options.qualityProfile === 'normal') {
      return {
        filePath: await transcodeAndroidAac96(asset.filePath, options.onCancelable),
        format: 'm4a',
      };
    }
    return asset;
  }

  if (Platform.OS !== 'ios') return asset;

  const normalizer = getIosAudioNormalizerModule();
  if (!normalizer) {
    throw new Error('ios_audio_normalizer_unavailable');
  }

  const operationId = `aac-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  options.onCancelable?.(() => normalizer.cancel(operationId));
  const normalized = await normalizer.normalize(
    asset.filePath,
    options.qualityProfile === 'normal' ? 96_000 : 0,
    operationId,
  );
  const filePath = normalized.filePath || asset.filePath;
  if (filePath !== asset.filePath) {
    await FileSystem.deleteAsync(asset.filePath, { idempotent: true }).catch(() => {});
  }

  return {
    filePath,
    format: normalized.format === 'm4a' ? 'm4a' : asset.format,
  };
}
