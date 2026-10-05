import * as SecureStore from 'expo-secure-store';
import type {
  CloudStorageConfig,
  CloudStoragePublicConfig,
} from '@ton/core';
import { normalizeCloudPrefix, sha256Hex } from '@ton/core';
import { getSetting, setSetting } from '../db-queries';
import {
  loadMobileCloudConfig,
  loadMobileCloudPublicConfig,
  normalizeMobileCloudJurisdiction,
  saveMobileCloudConfigToStorage,
  type MobileCloudConfigStorage,
} from './config-repository';

const CONFIG_KEY = 'cloud_r2_config';
const SECRET_KEY = 'cloud_r2_secret_access_key';
const DEVICE_ID_KEY = 'cloud_r2_device_id';
const LAST_REVISION_KEY = 'cloud_r2_last_revision';
const AUTO_SYNC_ENABLED_KEY = 'cloud_auto_sync_enabled';
const AUDIO_OVER_CELLULAR_KEY = 'sync_audio_over_cellular';
let secretCache: string | null | undefined;
let secretReadPromise: Promise<string | null> | null = null;

async function readSecret(): Promise<string | null> {
  if (secretCache !== undefined) return secretCache;
  if (!secretReadPromise) {
    secretReadPromise = SecureStore.getItemAsync(SECRET_KEY)
      .then((value) => {
        secretCache = value;
        return value;
      })
      .finally(() => {
        secretReadPromise = null;
      });
  }
  return secretReadPromise;
}

const configStorage: MobileCloudConfigStorage = {
  readPublicConfig: () => getSetting(CONFIG_KEY),
  readSecret,
  writePublicConfig: (value) => setSetting(CONFIG_KEY, value),
  writeSecret: async (value) => {
    try {
      await SecureStore.setItemAsync(SECRET_KEY, value);
    } catch {
      throw new Error('cloudStorageErrorSecureStorageUnavailable');
    }
    secretCache = value;
  },
};

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
  return (await getSetting(AUTO_SYNC_ENABLED_KEY)) === 'true';
}

export async function setMobileCloudAutoSyncEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUTO_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function getMobileCloudAudioOverCellularEnabled(): Promise<boolean> {
  return (await getSetting(AUDIO_OVER_CELLULAR_KEY)) === 'true';
}

export async function setMobileCloudAudioOverCellularEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUDIO_OVER_CELLULAR_KEY, enabled ? 'true' : 'false');
}

export function buildMobileCloudScopeId(config: Pick<
  CloudStorageConfig,
  'accountId' | 'bucket' | 'jurisdiction' | 'prefix'
>): string {
  return sha256Hex(JSON.stringify([
    config.accountId.trim().toLowerCase(),
    normalizeMobileCloudJurisdiction(config.jurisdiction),
    config.bucket.trim(),
    normalizeCloudPrefix(config.prefix),
  ]));
}

export async function getMobileCloudConfig(): Promise<CloudStorageConfig | null> {
  try {
    return await loadMobileCloudConfig(configStorage);
  } catch {
    return null;
  }
}

export async function getMobileCloudPublicConfig(): Promise<CloudStoragePublicConfig | null> {
  return loadMobileCloudPublicConfig(configStorage);
}

export async function saveMobileCloudConfig(config: CloudStorageConfig): Promise<CloudStoragePublicConfig> {
  return saveMobileCloudConfigToStorage(configStorage, config);
}
