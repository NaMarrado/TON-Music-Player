import * as SecureStore from 'expo-secure-store';
import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudStoragePublicConfig,
} from '@ton/core';
import { normalizeCloudPrefix, sha256Hex } from '@ton/core';
import { getSetting, setSetting } from '../db-queries';

const CONFIG_KEY = 'cloud_r2_config';
const SECRET_KEY = 'cloud_r2_secret_access_key';
const DEVICE_ID_KEY = 'cloud_r2_device_id';
const LAST_REVISION_KEY = 'cloud_r2_last_revision';
const AUTO_SYNC_ENABLED_KEY = 'cloud_auto_sync_enabled';

function normalizeJurisdiction(value: unknown): CloudStorageJurisdiction {
  return value === 'eu' || value === 'fedramp' ? value : 'default';
}

export async function getMobileCloudDeviceId(): Promise<string> {
  const existing = await getSetting(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const next = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await setSetting(DEVICE_ID_KEY, next);
  return next;
}

export async function getMobileCloudLastRevision(): Promise<string> {
  return await getSetting(LAST_REVISION_KEY) ?? '';
}

export async function setMobileCloudLastRevision(revision: string): Promise<void> {
  await setSetting(LAST_REVISION_KEY, revision);
}

export async function getMobileCloudAutoSyncEnabled(): Promise<boolean> {
  // Missing is intentionally enabled so existing installations receive the
  // same default as a fresh install without a destructive settings migration.
  return (await getSetting(AUTO_SYNC_ENABLED_KEY)) !== 'false';
}

export async function setMobileCloudAutoSyncEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUTO_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function buildMobileCloudScopeId(config: Pick<
  CloudStorageConfig,
  'accountId' | 'bucket' | 'jurisdiction' | 'prefix'
>): string {
  return sha256Hex(JSON.stringify([
    config.accountId.trim().toLowerCase(),
    normalizeJurisdiction(config.jurisdiction),
    config.bucket.trim(),
    normalizeCloudPrefix(config.prefix),
  ]));
}

export async function getMobileCloudConfig(): Promise<CloudStorageConfig | null> {
  const rawConfig = await getSetting(CONFIG_KEY);
  if (!rawConfig) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<CloudStorageConfig>;
    const secretAccessKey = await SecureStore.getItemAsync(SECRET_KEY) ?? '';
    if (!parsed.accountId || !parsed.bucket || !parsed.accessKeyId || !secretAccessKey) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      bucket: parsed.bucket,
      prefix: normalizeCloudPrefix(parsed.prefix),
      accessKeyId: parsed.accessKeyId,
      secretAccessKey,
      jurisdiction: normalizeJurisdiction(parsed.jurisdiction),
    };
  } catch {
    return null;
  }
}

export async function getMobileCloudPublicConfig(): Promise<CloudStoragePublicConfig | null> {
  const rawConfig = await getSetting(CONFIG_KEY);
  if (!rawConfig) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<CloudStorageConfig>;
    const secret = await SecureStore.getItemAsync(SECRET_KEY);
    if (!parsed.accountId || !parsed.bucket || !parsed.accessKeyId) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      bucket: parsed.bucket,
      prefix: normalizeCloudPrefix(parsed.prefix),
      accessKeyId: parsed.accessKeyId,
      jurisdiction: normalizeJurisdiction(parsed.jurisdiction),
      hasSecretAccessKey: Boolean(secret),
    };
  } catch {
    return null;
  }
}

export async function saveMobileCloudConfig(config: CloudStorageConfig): Promise<CloudStoragePublicConfig> {
  const existingSecret = await SecureStore.getItemAsync(SECRET_KEY) ?? '';
  const normalized: CloudStorageConfig = {
    accountId: config.accountId.trim(),
    bucket: config.bucket.trim(),
    prefix: normalizeCloudPrefix(config.prefix),
    accessKeyId: config.accessKeyId.trim(),
    secretAccessKey: config.secretAccessKey.trim() || existingSecret.trim(),
    jurisdiction: normalizeJurisdiction(config.jurisdiction),
  };
  if (!normalized.secretAccessKey) {
    throw new Error('R2 secret access key is required');
  }
  await setSetting(CONFIG_KEY, JSON.stringify({
    accountId: normalized.accountId,
    bucket: normalized.bucket,
    prefix: normalized.prefix,
    accessKeyId: normalized.accessKeyId,
    jurisdiction: normalized.jurisdiction,
  }));
  if (config.secretAccessKey.trim() || !existingSecret) {
    try {
      await SecureStore.setItemAsync(SECRET_KEY, normalized.secretAccessKey);
    } catch {
      throw new Error('cloudStorageErrorSecureStorageUnavailable');
    }
  }
  return {
    accountId: normalized.accountId,
    bucket: normalized.bucket,
    prefix: normalized.prefix,
    accessKeyId: normalized.accessKeyId,
    jurisdiction: normalized.jurisdiction,
    hasSecretAccessKey: true,
  };
}
