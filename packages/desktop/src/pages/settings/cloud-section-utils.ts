import { normalizeCloudStorageErrorKey } from '@ton/core';
import type {
  CloudAutoSyncStatus,
  CloudStoragePublicConfig,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import { EMPTY_CLOUD_FORM, type CloudFormState, type Translator } from './cloud-section-types';

export function toCloudForm(config: CloudStoragePublicConfig | null): CloudFormState {
  if (!config) return EMPTY_CLOUD_FORM;
  return {
    accountId: config.accountId,
    bucket: config.bucket,
    prefix: config.prefix || 'ton',
    accessKeyId: config.accessKeyId,
    secretAccessKey: '',
    jurisdiction: config.jurisdiction,
  };
}

export function formatCloudProgress(
  progress: CloudSyncProgress | null,
  result: CloudSyncResult | null,
  t: Translator,
): string | null {
  if (progress) {
    return t('cloudProgress', {
      phase: t(`cloudPhase_${progress.phase}`),
      current: progress.current,
      total: progress.total,
      uploaded: progress.uploaded,
      downloaded: progress.downloaded,
      skipped: progress.skipped,
      failed: progress.failed,
    });
  }
  return result ? t('cloudResult', {
    uploaded: result.uploaded,
    downloaded: result.downloaded,
    skipped: result.skipped,
    playlists: result.importedPlaylists,
  }) : null;
}

export function formatCloudError(error: unknown, t: Translator): string {
  if (!(error instanceof Error)) return t('cloudFailed');
  const errorKey = normalizeCloudStorageErrorKey(error.message);
  if (error.message.startsWith('cloud_cleanup_')) return t(error.message);
  return errorKey ? t(errorKey) : error.message || t('cloudFailed');
}

export function formatCloudAutoSyncTime(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(milliseconds));
}

export function cloudAutoSyncStateKey(state: CloudAutoSyncStatus['state']): string {
  return `cloudAutoSyncState_${state}`;
}
