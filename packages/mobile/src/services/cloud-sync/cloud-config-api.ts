import type { CloudStorageConfig, CloudStoragePublicConfig } from '@ton/core';
import { getMobileCloudPublicConfig, saveMobileCloudConfig } from './config';
import { MobileR2Client } from './r2-client';
import { requireConfig } from './v1-common';

export async function getMobileCloudSyncConfig(): Promise<CloudStoragePublicConfig | null> {
  return getMobileCloudPublicConfig();
}

export async function saveMobileCloudSyncConfig(
  config: CloudStorageConfig,
): Promise<CloudStoragePublicConfig> {
  return saveMobileCloudConfig(config);
}

export async function testMobileCloudConnection(config?: CloudStorageConfig): Promise<void> {
  const resolvedConfig = config ?? await requireConfig();
  await new MobileR2Client(resolvedConfig).testConnection();
}
