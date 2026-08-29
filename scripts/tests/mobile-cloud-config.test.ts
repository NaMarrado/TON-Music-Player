import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudStorageConfig } from '../../packages/core/src/types/cloud-sync';
import {
  loadMobileCloudConfig,
  loadMobileCloudPublicConfig,
  saveMobileCloudConfigToStorage,
  type MobileCloudConfigStorage,
} from '../../packages/mobile/src/services/cloud-sync/config-repository';

const persisted = JSON.stringify({
  accountId: 'account',
  bucket: 'bucket',
  prefix: 'ton',
  accessKeyId: 'access',
  jurisdiction: 'default',
  hasSecretAccessKey: true,
});

test('public R2 fields do not wait for secure storage', async () => {
  let releaseSecret!: (value: string | null) => void;
  const blockedSecret = new Promise<string | null>((resolve) => {
    releaseSecret = resolve;
  });
  const storage = {
    readPublicConfig: async () => persisted,
    readSecret: () => blockedSecret,
  };

  const fullConfig = loadMobileCloudConfig(storage);
  assert.deepEqual(await loadMobileCloudPublicConfig(storage), {
    accountId: 'account',
    bucket: 'bucket',
    prefix: 'ton',
    accessKeyId: 'access',
    jurisdiction: 'default',
    hasSecretAccessKey: true,
  });
  releaseSecret('secret');
  assert.equal((await fullConfig)?.secretAccessKey, 'secret');
});

test('legacy public R2 fields remain available without a secret marker', async () => {
  const legacy = JSON.stringify({
    accountId: 'legacy-account',
    bucket: 'legacy-bucket',
    prefix: 'ton',
    accessKeyId: 'legacy-access',
    jurisdiction: 'default',
  });
  const config = await loadMobileCloudPublicConfig({
    readPublicConfig: async () => legacy,
  });
  assert.equal(config?.accountId, 'legacy-account');
  assert.equal(config?.hasSecretAccessKey, true);
});

test('failed secure write never publishes new public R2 fields', async () => {
  let publicConfig = persisted;
  const storage: MobileCloudConfigStorage = {
    readPublicConfig: async () => publicConfig,
    readSecret: async () => 'old-secret',
    writePublicConfig: async (value) => {
      publicConfig = value;
    },
    writeSecret: async () => {
      throw new Error('keychain unavailable');
    },
  };
  const next: CloudStorageConfig = {
    accountId: 'next-account',
    bucket: 'next-bucket',
    prefix: 'next-prefix',
    accessKeyId: 'next-access',
    secretAccessKey: 'next-secret',
    jurisdiction: 'eu',
  };

  await assert.rejects(saveMobileCloudConfigToStorage(storage, next));
  assert.equal(publicConfig, persisted);
});
