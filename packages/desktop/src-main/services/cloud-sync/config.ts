import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudStoragePublicConfig,
} from '@ton/core';
import { normalizeCloudPrefix } from '@ton/core';
import { getDb } from '../database';

const CONFIG_KEY = 'cloud_r2_config';
const SECRET_KEY = 'cloud_r2_secret_access_key';
const DEVICE_ID_KEY = 'cloud_r2_device_id';
const LAST_REVISION_KEY = 'cloud_r2_last_revision';

function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function normalizeJurisdiction(value: unknown): CloudStorageJurisdiction {
  return value === 'eu' || value === 'fedramp' ? value : 'default';
}

function encryptSecret(secret: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('cloudStorageErrorSecureStorageUnavailable');
  }
  return JSON.stringify({
    mode: 'safeStorage',
    value: safeStorage.encryptString(secret).toString('base64'),
  });
}

function decryptSecret(raw: string): string {
  if (!raw) {
    return '';
  }
  try {
    const parsed = JSON.parse(raw) as { mode?: string; value?: string };
    if (parsed.mode === 'safeStorage' && parsed.value) {
      return safeStorage.decryptString(Buffer.from(parsed.value, 'base64'));
    }
  } catch {
    return '';
  }
  return '';
}

export function getDesktopCloudDeviceId(): string {
  const existing = getSetting(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const next = `desktop-${randomUUID()}`;
  setSetting(DEVICE_ID_KEY, next);
  return next;
}

export function getDesktopCloudLastRevision(): string {
  return getSetting(LAST_REVISION_KEY);
}

export function setDesktopCloudLastRevision(revision: string): void {
  setSetting(LAST_REVISION_KEY, revision);
}

export function getDesktopCloudConfig(): CloudStorageConfig | null {
  const rawConfig = getSetting(CONFIG_KEY);
  if (!rawConfig) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<CloudStorageConfig>;
    const secretAccessKey = decryptSecret(getSetting(SECRET_KEY));
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

export function getDesktopCloudPublicConfig(): CloudStoragePublicConfig | null {
  const rawConfig = getSetting(CONFIG_KEY);
  if (!rawConfig) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<CloudStorageConfig>;
    if (!parsed.accountId || !parsed.bucket || !parsed.accessKeyId) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      bucket: parsed.bucket,
      prefix: normalizeCloudPrefix(parsed.prefix),
      accessKeyId: parsed.accessKeyId,
      jurisdiction: normalizeJurisdiction(parsed.jurisdiction),
      hasSecretAccessKey: Boolean(decryptSecret(getSetting(SECRET_KEY))),
    };
  } catch {
    return null;
  }
}

export function saveDesktopCloudConfig(config: CloudStorageConfig): CloudStoragePublicConfig {
  const existingSecret = decryptSecret(getSetting(SECRET_KEY));
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
  setSetting(CONFIG_KEY, JSON.stringify({
    accountId: normalized.accountId,
    bucket: normalized.bucket,
    prefix: normalized.prefix,
    accessKeyId: normalized.accessKeyId,
    jurisdiction: normalized.jurisdiction,
  }));
  if (config.secretAccessKey.trim() || !existingSecret) {
    setSetting(SECRET_KEY, encryptSecret(normalized.secretAccessKey));
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
