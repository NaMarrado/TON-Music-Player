import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchema } from '../../../packages/desktop/src-main/services/database/schema.ts';
import { createCloudAutoSyncSchema } from '../../../packages/desktop/src-main/services/database/cloud-auto-sync-schema.ts';
import { buildCloudV2ManifestObjectKey, createEmptyCloudLibraryManifestV2, createCloudLiveTrackRecordV2 } from '../../../packages/core/src/index.ts';
import type { CloudLibraryManifestV2, CloudSyncResult, CloudTrackEntry, CloudAutoSyncStatus } from '../../../packages/core/src/types/cloud-sync.ts';
import type { V2SyncOptions } from '../../../packages/desktop/src-main/services/cloud-sync/v2-types.ts';
import { loadSyncModule } from './bundle-module.ts';

async function fixture(empty = false) {
  const directory = await mkdtemp(join(tmpdir(), 'ton-sync-update-'));
  const filePath = join(directory, 'track.m4a');
  await writeFile(filePath, 'existing-audio-no-download');
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    prepare: (sql: string) => sqlite.prepare(sql),
    exec: (sql: string) => sqlite.exec(sql),
    transaction: (run: () => void) => () => {
      sqlite.exec('BEGIN');
      try { run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  createSchema(db as never); createCloudAutoSyncSchema(db as never);
  const hash = createHash('sha256').update('existing-audio-no-download').digest('hex');
  const entry: CloudTrackEntry = {
    content_hash_sha256: hash, object_key: 'ton/library/original.m4a', file_name: 'track.m4a',
    file_size: 26, format: 'm4a', artwork_hash_sha256: null, artwork_object_key: null,
    artwork_file_name: null, youtube_id: null, spotify_id: null, soundcloud_id: null,
    source_url: null, downloaded_at: 1, added_at: 1, updated_at: 1,
    metadata: { title: 'Fixture', artist: null, album: null, album_artist: null,
      track_number: null, disc_number: null, duration_ms: 12000, genre: null, year: null,
      bitrate: null, sample_rate: null, loudness_lufs: null, loudness_gain: null, rating: null },
  };
  let remote: CloudLibraryManifestV2 = {
    ...createEmptyCloudLibraryManifestV2('remote'), revision: 'r1', max_counter: 1,
    tracks: [createCloudLiveTrackRecordV2(entry, { counter: 1, device_id: 'remote' })],
  };
  let etag = 'etag-1';
  const scope = 'test-scope';
  sqlite.prepare('UPDATE cloud_sync_control SET active_scope_id = ? WHERE id = 1').run(scope);
  if (!empty) {
    sqlite.prepare('INSERT INTO tracks(file_path, content_hash_sha256, title, format, file_size) VALUES (?, ?, ?, ?, ?)')
      .run(filePath, hash, 'Fixture', 'm4a', 26);
  }
  sqlite.exec('DELETE FROM cloud_sync_outbox');
  sqlite.prepare(`INSERT INTO cloud_sync_state(scope_id, needs_full_reconcile, revision, etag,
    lamport_counter, activation_marker_confirmed, last_commit_cleanup_at) VALUES (?, 0, 'r1', ?, 1, 1, ?)`)
    .run(scope, etag, Date.now());
  if (!empty) {
    sqlite.prepare(`INSERT INTO cloud_sync_entities(scope_id, entity_type, entity_key,
      record_json, version_counter, version_device_id, is_deleted, updated_at) VALUES (?, 'track', ?, ?, 1, 'remote', 0, 1)`)
      .run(scope, hash, JSON.stringify(remote.tracks[0]));
  } else {
    sqlite.prepare('UPDATE cloud_sync_state SET revision = NULL, etag = NULL, needs_full_reconcile = 1 WHERE scope_id = ?').run(scope);
    sqlite.exec("UPDATE cloud_sync_control SET generation = 1 WHERE id = 1");
    sqlite.prepare(`INSERT INTO cloud_sync_outbox(scope_id, entity_type, entity_key, operation, generation)
      VALUES (?, 'library', 'full', 'reconcile', 1)`).run(scope);
  }
  const config = { accountId: 'test', accessKeyId: 'test', secretAccessKey: 'test', bucket: 'isolated', prefix: 'ton', jurisdiction: 'default' };
  const counts = { reads: 0, writes: 0, uploads: 0, downloads: 0, heads: 0 };
  let duringDownload: (() => void) | null = null;
  class R2Client {
    async getJsonConditional(_key: string, options: { ifNoneMatch?: string } = {}) {
      counts.reads += 1;
      return options.ifNoneMatch === etag ? { status: 'not-modified', etag }
        : { status: 'ok', value: structuredClone(remote), etag };
    }
    async putJsonConditional(key: string, value: CloudLibraryManifestV2, options: { ifMatch?: string }) {
      if (key !== buildCloudV2ManifestObjectKey('ton')) return { status: 'ok', etag: 'marker' };
      counts.writes += 1;
      if (options.ifMatch !== etag) return { status: 'precondition-failed', etag };
      remote = structuredClone(value); etag = `etag-${remote.max_counter}`;
      return { status: 'ok', etag };
    }
    async putJson() {}
    async headObject() { counts.heads += 1; return true; }
    async uploadFile() { counts.uploads += 1; throw new Error('metadata must not upload audio'); }
    async downloadFile(_key: string, path: string) {
      counts.downloads += 1;
      if (!empty) throw new Error('existing audio must not download');
      await writeFile(path, 'existing-audio-no-download');
      duringDownload?.();
    }
  }
  const boundaries: Record<string, Record<string, unknown>> = {
    '/services/database': { getDb: () => db },
    '/services/library-paths': { getLibraryDir: () => directory, findNonCollidingFileAsync: async () => join(directory, 'new.m4a') },
    '/metadata-reader/artwork': { ensureArtworkDir: async () => {}, getArtworkDir: () => directory },
    '/cloud-sync/config': {
      activateDesktopCloudScope: () => scope, getDesktopCloudConfig: () => config,
      getDesktopCloudDeviceId: () => 'local', getDesktopCloudAutoSyncEnabled: () => true,
      setDesktopCloudAutoSyncEnabled: () => {}, setDesktopCloudLastRevision: () => {},
    },
    '/cloud-sync/r2-client': { DesktopR2Client: R2Client },
    '/cloud-sync/sync-common': {
      EMPTY_RESULT: { uploaded: 0, downloaded: 0, skipped: 0, failed: 0, importedTracks: 0, importedPlaylists: 0, revision: null },
      requireConfig: () => config,
      emitProgress: () => {},
      normalizeDownloadedAt: (value: number | null) => value,
      pathExists: async (path: string | null) => path ? access(path).then(() => true, () => false) : false,
      buildImportedFileName: () => 'track.m4a',
    },
    '/cloud-sync/v1-local-manifest': {
      ensureTrackContentHash: async () => { throw new Error('cached track must not hash'); },
      ensurePlaylistCloudId: async () => { throw new Error('no playlist in fixture'); },
    },
    '/cloud-sync/hash-cache': { hashCloudArtworkFile: async () => { throw new Error('no artwork in fixture'); } },
    '/cloud-sync/v2-bootstrap': { bootstrapMissingV2Manifest: async () => { throw new Error('no bootstrap in fixture'); } },
    '/cloud-sync/profile-sync': { syncDesktopProfile: async () => ({ published_days: 0, imported_days: 0, imported_devices: 0 }) },
    '/services/listening-profile/store': { subscribeDesktopProfileChanges: () => () => {} },
  };
  const api = await loadSyncModule<{ syncCloudLibraryV2ForDesktop(options: V2SyncOptions): Promise<CloudSyncResult> }>(
    'packages/desktop/src-main/services/cloud-sync/v2-sync.ts', boundaries,
  );
  let notify: (status: CloudAutoSyncStatus) => void = () => {};
  const runtimeApi = await loadSyncModule<{ getDesktopCloudAutoSyncRuntime(): {
    start(): void; stop(): void; runManual(mode: 'fetch'): Promise<CloudSyncResult | null>;
  } }>('packages/desktop/src-main/services/cloud-sync/auto-sync-runtime.ts', {
    ...boundaries,
    electron: { net: { online: true } },
    '/cloud-sync/index': { syncCloudLibraryV2ForDesktop: api.syncCloudLibraryV2ForDesktop },
    '/services/job-scheduler': { scheduleMainProcessJob: async (job: { run: () => unknown }) => job.run() },
    '/cloud-sync/auto-sync-runtime-support': {
      getDesktopCloudPendingCount: () => Number(sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count ?? 0),
      classifyDesktopCloudError: () => 'transient',
      broadcastCloudEvent: (name: string, status: CloudAutoSyncStatus) => { if (name === 'cloud:state') notify(status); },
    },
  });
  return {
    sqlite, counts, api, runtime: runtimeApi.getDesktopCloudAutoSyncRuntime(), remote: () => remote,
    onDownload: (callback: () => void) => { duringDownload = callback; },
    completed: () => new Promise<void>((resolve) => {
      let syncing = false;
      notify = (status) => { if (status.state === 'syncing') syncing = true; else if (syncing && status.state === 'idle') resolve(); };
    }),
    close: async () => { sqlite.close(); await rm(directory, { recursive: true, force: true }); },
    remoteStar: () => { const record = remote.tracks[0]; if (!record.deleted) { record.entry.metadata.rating = 1; record.version.counter += 1; } remote.max_counter += 1; remote.revision = 'r2'; etag = 'etag-2'; },
  };
}

test('the actual desktop automatic lifecycle publishes durable stars, then settles with no pending mutations', async (t) => {
  // The automatic transfer itself is real production orchestration; periodic
  // watcher timers are isolated because their platform clock is not under test.
  t.mock.method(globalThis, 'setInterval', () => 0);
  const f = await fixture();
  try {
    f.sqlite.exec('UPDATE tracks SET rating = 1 WHERE id = 1');
    const done = f.completed(); f.runtime.start(); await done; f.runtime.stop();
    const record = f.remote().tracks[0]; assert.ok(!record.deleted);
    assert.equal(record.entry.metadata.rating, 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count, 0);
    assert.equal(f.counts.writes, 1); assert.equal(f.counts.uploads, 0); assert.equal(f.counts.downloads, 0); assert.equal(f.counts.heads, 0);
  } finally { f.runtime.stop(); await f.close(); }
});

test('desktop remote star applies to unchanged local audio, but fetch preserves an already pending local unstar', async () => {
  const f = await fixture();
  try {
    f.remoteStar(); await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    assert.equal(f.sqlite.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, 1);
    assert.equal(f.counts.downloads, 0);
    f.sqlite.exec('UPDATE tracks SET rating = NULL WHERE id = 1');
    f.remoteStar();
    await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    assert.equal(f.sqlite.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, null);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count, 1);
    await f.api.syncCloudLibraryV2ForDesktop({ mode: 'sync' });
    const record = f.remote().tracks[0]; assert.ok(!record.deleted); assert.equal(record.entry.metadata.rating, null);
  } finally { await f.close(); }
});

test('an empty first client imports remote audio despite its pre-existing configuration reconcile, without acknowledging it', async () => {
  const f = await fixture(true);
  try {
    const result = await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    assert.equal(result.importedTracks, 1); assert.equal(result.downloaded, 1);
    assert.equal(f.counts.downloads, 1);
    assert.equal(f.sqlite.prepare('SELECT title FROM tracks').get()?.title, 'Fixture');
    const pending = f.sqlite.prepare('SELECT entity_type, operation, generation FROM cloud_sync_outbox').all();
    assert.deepEqual(pending.map((row) => [row.entity_type, row.operation, row.generation]), [['library', 'reconcile', 1]]);
  } finally { await f.close(); }
});

test('a genuinely newer reconcile arriving during first import still protects apply and remains pending', async () => {
  const f = await fixture(true);
  try {
    f.onDownload(() => {
      f.sqlite.exec(`UPDATE cloud_sync_control SET generation = 2 WHERE id = 1;
        UPDATE cloud_sync_outbox SET generation = 2 WHERE entity_type = 'library';`);
    });
    const result = await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    assert.equal(f.counts.downloads, 1);
    assert.equal(result.importedTracks, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM tracks').get()?.count, 0);
    assert.equal(f.sqlite.prepare('SELECT generation FROM cloud_sync_outbox').get()?.generation, 2);
  } finally { await f.close(); }
});

test('explicit restoration of a locally deleted track bypasses 304 and reapplies an unchanged mirrored record', async () => {
  const f = await fixture(true);
  try {
    await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    f.sqlite.exec('DELETE FROM cloud_sync_outbox');
    f.sqlite.exec('DELETE FROM tracks');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_sync_local_exclusions').get()?.count, 1);
    await f.api.syncCloudLibraryV2ForDesktop({ mode: 'fetch' });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM tracks').get()?.count, 0);
    assert.equal(f.counts.downloads, 1);

    const restored = await f.api.syncCloudLibraryV2ForDesktop({
      mode: 'fetch',
      restoreLocallyDeleted: true,
    });
    assert.equal(restored.restoredLocallyDeleted, 1);
    assert.equal(restored.importedTracks, 1);
    assert.equal(restored.downloaded, 1);
    assert.equal(f.sqlite.prepare('SELECT title FROM tracks').get()?.title, 'Fixture');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_sync_local_exclusions').get()?.count, 0);
    assert.equal(f.counts.downloads, 2);
  } finally {
    await f.close();
  }
});
