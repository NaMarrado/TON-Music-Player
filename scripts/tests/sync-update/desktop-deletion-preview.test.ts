import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { loadSyncModule } from './bundle-module.ts';

test('desktop zero-exclusion preview avoids a redundant R2 manifest request', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE cloud_sync_local_exclusions(scope_id TEXT, content_hash_sha256 TEXT)');
  class ForbiddenNetwork {
    constructor() { throw new Error('Empty local exclusion preview must not access the network'); }
  }
  try {
    const api = await loadSyncModule<{ previewDesktopCloudLocalDeletions(): Promise<{deletedTracks:number;reclaimableBytes:number}> }>(
      'packages/desktop/src-main/services/cloud-sync/local-exclusions.ts', {
        '/services/database': { getDb: () => db },
        '/cloud-sync/config': { getDesktopCloudConfig: () => ({ prefix: 'ton' }), activateDesktopCloudScope: () => 'test' },
        '/cloud-sync/r2-client': { DesktopR2Client: ForbiddenNetwork },
      },
    );
    assert.deepEqual(await api.previewDesktopCloudLocalDeletions(), { deletedTracks: 0, reclaimableBytes: 0 });
  } finally { db.close(); }
});
