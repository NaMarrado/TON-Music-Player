import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudStoragePublicConfig,
} from '@ton/core';
import { normalizeCloudPrefix } from '@ton/core';

export interface MobileCloudConfigStorage {
  readPublicConfig(): Promise<string | null>;
  readSecret(): Promise<string | null>;
  writePublicConfig(value: string): Promise<void>;
  writeSecret(value: string): Promise<void>;
}

type PersistedMobileCloudConfig = Partial<CloudStorageConfig> & {
  hasSecretAccessKey?: boolean;
};

export function normalizeMobileCloudJurisdiction(value: unknown): CloudStorageJurisdiction {
  return value === 'eu' || value === 'fedramp' ? value : 'default';
}

function parsePersistedConfig(rawConfig: string | null): PersistedMobileCloudConfig | null {
  if (!rawConfig) return null;
  try {
    const parsed = JSON.parse(rawConfig) as PersistedMobileCloudConfig;
    if (!parsed.accountId || !parsed.bucket || !parsed.accessKeyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadMobileCloudPublicConfig(
  storage: Pick<MobileCloudConfigStorage, 'readPublicConfig'>,
): Promise<CloudStoragePublicConfig | null> {
  const parsed = parsePersistedConfig(await storage.readPublicConfig());
  if (!parsed) return null;
  return {
    accountId: parsed.accountId!,
    bucket: parsed.bucket!,
    prefix: normalizeCloudPrefix(parsed.prefix),
    accessKeyId: parsed.accessKeyId!,
    jurisdiction: normalizeMobileCloudJurisdiction(parsed.jurisdiction),
    // Legacy rows predate this marker but were only returned after a successful save.
    hasSecretAccessKey: parsed.hasSecretAccessKey !== false,
  };
}

export async function loadMobileCloudConfig(
  storage: Pick<MobileCloudConfigStorage, 'readPublicConfig' | 'readSecret'>,
): Promise<CloudStorageConfig | null> {
  const parsed = parsePersistedConfig(await storage.readPublicConfig());
  if (!parsed) return null;
  const secretAccessKey = (await storage.readSecret() ?? '').trim();
  if (!secretAccessKey) return null;
  return {
    accountId: parsed.accountId!,
    bucket: parsed.bucket!,
    prefix: normalizeCloudPrefix(parsed.prefix),
    accessKeyId: parsed.accessKeyId!,
    secretAccessKey,
    jurisdiction: normalizeMobileCloudJurisdiction(parsed.jurisdiction),
  };
}

export async function saveMobileCloudConfigToStorage(
  storage: MobileCloudConfigStorage,
  config: CloudStorageConfig,
): Promise<CloudStoragePublicConfig> {
  const existingSecret = await storage.readSecret() ?? '';
  const normalized: CloudStorageConfig = {
    accountId: config.accountId.trim(),
    bucket: config.bucket.trim(),
    prefix: normalizeCloudPrefix(config.prefix),
    accessKeyId: config.accessKeyId.trim(),
    secretAccessKey: config.secretAccessKey.trim() || existingSecret.trim(),
    jurisdiction: normalizeMobileCloudJurisdiction(config.jurisdiction),
  };
  if (!normalized.secretAccessKey) {
    throw new Error('R2 secret access key is required');
  }

  if (config.secretAccessKey.trim() || !existingSecret) {
    await storage.writeSecret(normalized.secretAccessKey);
  }
  await storage.writePublicConfig(JSON.stringify({
    accountId: normalized.accountId,
    bucket: normalized.bucket,
    prefix: normalized.prefix,
    accessKeyId: normalized.accessKeyId,
    jurisdiction: normalized.jurisdiction,
    hasSecretAccessKey: true,
  }));

  return {
    accountId: normalized.accountId,
    bucket: normalized.bucket,
    prefix: normalized.prefix,
    accessKeyId: normalized.accessKeyId,
    jurisdiction: normalized.jurisdiction,
    hasSecretAccessKey: true,
  };
}
