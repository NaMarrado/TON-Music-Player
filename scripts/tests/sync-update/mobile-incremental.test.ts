import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { CloudLibraryManifestV1, CloudLibraryManifestV2, CloudStorageConfig, CloudTrackEntry, CloudSyncResult } from '../../../packages/core/src/types/cloud-sync.ts';
import { createEmptyCloudLibraryManifestV2, createCloudLiveTrackRecordV2, buildCloudV2ManifestObjectKey } from '../../../packages/core/src/index.ts';
import type { MobileCloudV2SyncOptions } from '../../../packages/mobile/src/services/cloud-sync/v2-common.ts';
import { loadSyncModule } from './bundle-module.ts';

const config: CloudStorageConfig = {
  accountId: 'test', accessKeyId: 'test', secretAccessKey: 'test',
  bucket: 'isolated', prefix: 'ton', jurisdiction: 'default',
};
const scope = 'test-scope';
const clone = <T>(value: T): T => structuredClone(value);
function entry(index: number, rating: number | null = null): CloudTrackEntry {
  const hash = index.toString(16).padStart(64, '0');
  return {
    content_hash_sha256: hash, object_key: `ton/library/${hash}.m4a`,
    file_name: `${hash}.m4a`, file_size: 100, format: 'm4a',
    artwork_hash_sha256: null, artwork_object_key: null, artwork_file_name: null,
    youtube_id: null, spotify_id: null, soundcloud_id: null, source_url: null,
    downloaded_at: 1, added_at: 1, updated_at: 1,
    metadata: {
      title: `Track ${index}`, artist: 'Fixture', album: null, album_artist: null,
      track_number: null, disc_number: null, duration_ms: 12_000,
      genre: null, year: null, bitrate: null, sample_rate: null,
      loudness_lufs: null, loudness_gain: null, rating,
    },
  };
}

async function fixture(count = 1) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE tracks (
      id INTEGER PRIMARY KEY, content_hash_sha256 TEXT, file_path TEXT, file_size INTEGER,
      title TEXT, artist TEXT, album TEXT, album_artist TEXT, track_number INTEGER,
      disc_number INTEGER, duration_ms INTEGER, genre TEXT, year INTEGER, bitrate INTEGER,
      sample_rate INTEGER, format TEXT, cover_art_path TEXT, loudness_lufs REAL,
      loudness_gain REAL, youtube_id TEXT, spotify_id TEXT, soundcloud_id TEXT, source_url TEXT,
      rating INTEGER, added_at INTEGER, scanned_at INTEGER, downloaded_at INTEGER, in_library INTEGER
    );
    CREATE TABLE playlists (id INTEGER PRIMARY KEY, cloud_id TEXT UNIQUE, name TEXT,
      description TEXT, cover_path TEXT, is_smart INTEGER, smart_rules TEXT, sort_order INTEGER,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE playlist_tracks (id INTEGER PRIMARY KEY, playlist_id INTEGER, track_id INTEGER, position INTEGER);
    CREATE TABLE cloud_sync_control (id INTEGER PRIMARY KEY, active_scope_id TEXT, suppress_outbox INTEGER, generation INTEGER);
    INSERT INTO cloud_sync_control VALUES (1, '${scope}', 0, 0);
    CREATE TABLE cloud_sync_state (
      scope_id TEXT PRIMARY KEY, revision TEXT, etag TEXT, lamport_counter INTEGER DEFAULT 0,
      last_success_at INTEGER, last_error TEXT, next_retry_at INTEGER, last_cleanup_at INTEGER,
      needs_full_reconcile INTEGER DEFAULT 0, pending_downloads INTEGER DEFAULT 0,
      pending_assets INTEGER DEFAULT 0, activation_marker_confirmed INTEGER DEFAULT 1, updated_at INTEGER
    );
    CREATE TABLE cloud_sync_outbox (scope_id TEXT, entity_type TEXT, entity_key TEXT, local_id INTEGER,
      operation TEXT, payload_json TEXT, generation INTEGER, created_at INTEGER,
      UNIQUE(scope_id, entity_type, entity_key));
    CREATE TABLE cloud_sync_entities (scope_id TEXT, entity_type TEXT, entity_key TEXT,
      version_counter INTEGER, version_device_id TEXT, record_json TEXT, deleted INTEGER, updated_at INTEGER,
      PRIMARY KEY(scope_id, entity_type, entity_key));
    CREATE TABLE cloud_sync_local_exclusions (scope_id TEXT, content_hash_sha256 TEXT);
    CREATE TABLE cloud_sync_download_failures (scope_id TEXT, content_hash_sha256 TEXT,
      manifest_revision TEXT, next_retry_at INTEGER, attempt_count INTEGER, error_message TEXT, failed_at INTEGER,
      PRIMARY KEY(scope_id, content_hash_sha256));
    CREATE TABLE cloud_sync_blob_gc (scope_id TEXT, object_key TEXT, eligible_at INTEGER,
      PRIMARY KEY(scope_id, object_key));
  `);
  let remote: CloudLibraryManifestV2 = { ...createEmptyCloudLibraryManifestV2('remote'), revision: 'r1' };
  remote.tracks = Array.from({ length: count }, (_, i) => createCloudLiveTrackRecordV2(entry(i + 1), { counter: i + 1, device_id: 'remote' }));
  remote.max_counter = count;
  let etag = 'etag-1';
  const operations = { reads: 0, conditional: 0, writes: 0, uploads: 0, heads: 0, stats: 0, hashes: 0, trackReads: 0, mirrorWrites: 0, gcDeletes: 0 };
  let conflicts = 0;
  const missingPaths = new Set<string>();
  let afterWrite: (() => void) | null = null;
  const adapter = {
    async getAllAsync(query: string, params: unknown[] = []) { return sql.prepare(query).all(...params as never[]); },
    async getFirstAsync(query: string, params: unknown[] = []) { return sql.prepare(query).get(...params as never[]) ?? null; },
    async runAsync(query: string, params: unknown[] = []) {
      if (query.includes('INSERT INTO cloud_sync_entities')) operations.mirrorWrites += 1;
      if (query.includes('DELETE FROM cloud_sync_blob_gc')) operations.gcDeletes += 1;
      const result = sql.prepare(query).run(...params as never[]);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withExclusiveTransactionAsync(run: (db: typeof adapter) => Promise<void>) {
      sql.exec('BEGIN');
      try { await run(adapter); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  class PreconditionFailed extends Error {}
  class R2Client {
    async getJsonConditional(_key: string, conditional?: string) {
      operations.reads += 1;
      if (conditional) operations.conditional += 1;
      return conditional === etag ? { status: 'not-modified', etag }
        : { status: 'ok', value: clone(remote), etag };
    }
    async putJsonConditional(key: string, value: CloudLibraryManifestV2, condition: { ifMatch?: string }) {
      if (key !== buildCloudV2ManifestObjectKey(config.prefix)) return { etag: 'marker' };
      operations.writes += 1;
      if (conflicts-- > 0) {
        remote.max_counter += 1;
        const other = remote.tracks[1];
        if (other && !other.deleted) {
          other.entry.metadata.rating = 1;
          other.version.counter = remote.max_counter;
        }
        etag = `conflict-${remote.max_counter}`;
        throw new PreconditionFailed();
      }
      if (condition.ifMatch !== etag) throw new PreconditionFailed();
      remote = clone(value); etag = `etag-${remote.max_counter}`;
      afterWrite?.(); afterWrite = null;
      return { etag };
    }
    async putJson() {}
    async uploadFile() { operations.uploads += 1; return 'uploaded'; }
    async headObject() { operations.heads += 1; return true; }
  }
  const insert = sql.prepare(`INSERT INTO tracks (id, content_hash_sha256, file_path, file_size,
    title, artist, rating, added_at, scanned_at, downloaded_at, format, duration_ms, in_library)
    VALUES (?, ?, ?, 100, ?, 'Fixture', ?, 1, 1, 1, 'm4a', 12000, 1)`);
  const mirror = sql.prepare(`INSERT INTO cloud_sync_entities VALUES (?, 'track', ?, ?, 'remote', ?, 0, 1)`);
  for (let i = 0; i < count; i += 1) {
    const record = remote.tracks[i];
    if (record.deleted) continue;
    insert.run(i + 1, record.content_hash_sha256, `/music/${i + 1}.m4a`, record.entry.metadata.title, record.entry.metadata.rating);
    mirror.run(scope, record.content_hash_sha256, record.version.counter, JSON.stringify(record));
  }
  sql.prepare('INSERT INTO cloud_sync_state(scope_id, revision, etag) VALUES (?, ?, ?)').run(scope, remote.revision, etag);
  const noop = async () => {};
  const common = {
    normalizeDownloadedAt: (value: number | null) => value,
    fileExists: async (path: string | null) => { if (path) operations.stats += 1; return Boolean(path); },
    ensureTrackContentHash: async (track: { id: number; content_hash_sha256: string | null }) => {
      if (track.content_hash_sha256) return track.content_hash_sha256;
      operations.hashes += 1;
      const hash = track.id.toString(16).padStart(64, '0');
      sql.prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?').run(hash, track.id);
      return hash;
    },
    ensurePlaylistCloudId: async (_id: number, id: string) => id,
  };
  const boundaries: Record<string, Record<string, unknown>> = {
    '/cloud-sync/db-lane': { runMobileCloudDbLane: async (run: (db: typeof adapter) => unknown) => run(adapter) },
    '/cloud-sync/config': { getMobileCloudDeviceId: async () => 'local', buildMobileCloudScopeId: () => scope, getMobileCloudConfig: async () => config },
    '/cloud-sync/r2-client': { MobileR2Client: R2Client, MobileR2PreconditionFailedError: PreconditionFailed },
    '/cloud-sync/hash': { hashFileSha256: async () => { operations.hashes += 1; return 'f'.repeat(64); }, hashCloudArtworkCached: async () => { operations.hashes += 1; return 'e'.repeat(64); } },
    '/cloud-sync/v1-common': common,
    '/cloud-sync/v1-fetch': { fetchCloudLibrary: async () => { throw new Error('audio path not expected in metadata test'); } },
    '/services/job-scheduler': { scheduleMobileJob: async (job: { run: () => unknown }) => job.run() },
    '/services/db-queries': {
      getTrackById: async (id: number) => { operations.trackReads += 1; return sql.prepare('SELECT * FROM tracks WHERE id = ?').get(id); },
      getPlaylistById: async (id: number) => sql.prepare('SELECT * FROM playlists WHERE id = ?').get(id),
      getPlaylistTracks: async (id: number) => sql.prepare('SELECT t.* FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position').all(id),
    },
    '/listening-profile/store': {
      syncMobileProfile: async () => ({ published_days: 0, imported_days: 0, imported_devices: 0 }),
      getMobileProfilePendingCount: async () => 0,
    },
    '/stores/library-store': { reconcileLibraryTracks: noop },
    '/stores/playlist-store': { loadPlaylists: noop, reloadLoadedPlaylistDetails: noop },
    '/downloader/filesystem': { MUSIC_DIR: '/music/' },
    'expo-file-system': { getInfoAsync: async (path: string) => { operations.stats += 1; return { exists: !missingPaths.has(path) }; }, deleteAsync: noop },
  };
  const api = await loadSyncModule<{
    runMobileCloudV2Sync(options: MobileCloudV2SyncOptions): Promise<CloudSyncResult>;
  }>('packages/mobile/src/services/cloud-sync/v2-sync.ts', boundaries);
  return {
    sql, operations, missingPaths,
    run: (mode: 'sync' | 'fetch' | 'upload' = 'sync', origin: 'manual' | 'auto' | 'background' = 'manual') => api.runMobileCloudV2Sync({ config, mode, origin, allowAudioDownloads: false }),
    remote: () => remote,
    mutateRemote: (index: number, rating: number | null) => {
      const record = remote.tracks[index];
      if (record.deleted) throw new Error('unexpected deleted fixture');
      record.entry.metadata.rating = rating;
      record.version.counter = ++remote.max_counter;
      remote.revision = `r${remote.max_counter}`; etag = `etag-${remote.max_counter}`;
    },
    pending: (id: number, generation = 1) => sql.prepare(`INSERT OR REPLACE INTO cloud_sync_outbox VALUES (?, 'track', ?, ?, 'upsert', NULL, ?, 1)`).run(scope, String(id), id, generation),
    onWrite: (callback: () => void) => { afterWrite = callback; },
    conflict: () => { conflicts = 1; },
    resetCounts: () => { for (const key of Object.keys(operations) as Array<keyof typeof operations>) operations[key] = 0; },
    fetchArtwork: async (fail: boolean) => {
      const { fetchV1Tracks } = await loadSyncModule<{
        fetchV1Tracks(input: {
          client: R2Client; manifest: CloudLibraryManifestV1; result: CloudSyncResult;
          failureContext: { scopeId: string; manifestRevision: string; retryFailed: boolean };
        }): Promise<Map<string, number>>;
      }>('packages/mobile/src/services/cloud-sync/v1-fetch-tracks.ts', {
        ...boundaries,
        '/services/db-queries': { insertTrack: async () => { throw new Error('existing fixture must not insert'); } },
        '/library-transfer/file-helpers': { ensureUniqueLocalFilePathAsync: async (_directory: string, name: string) => `/art/${name}` },
        '/library-transfer/media': { audioFormatFromExtension: () => 'm4a' },
        '/cloud-sync/v1-common': {
          ...common, ARTWORK_DIR: '/art/', buildImportedFileName: () => 'new.m4a',
          normalizeCloudAudioForPlayback: async () => { throw new Error('existing audio must not normalize'); },
          throwIfCancelled: () => {}, emitProgress: () => {},
          downloadVerifiedCloudFile: async () => { if (fail) throw new Error('artwork fixture failure'); },
        },
      });
      const result: CloudSyncResult = { uploaded: 0, downloaded: 0, skipped: 0, failed: 0, importedTracks: 0, importedPlaylists: 0, revision: remote.revision };
      await fetchV1Tracks({
        client: new R2Client(), result,
        failureContext: { scopeId: scope, manifestRevision: remote.revision, retryFailed: true },
        manifest: {
          schema_version: 1, app: 'TON', device_id: 'remote', created_at: 1,
          updated_at: 2, revision: remote.revision, playlists: [],
          library_track_hashes: remote.tracks.map((record) => record.content_hash_sha256),
          tracks: remote.tracks.flatMap((record) => record.deleted ? [] : [record.entry]),
        },
      });
      return result;
    },
  };
}

test('1750-track steady-state manual and auto each use one conditional manifest GET and zero media operations', async () => {
  const f = await fixture(1_750);
  try {
    for (const origin of ['manual', 'auto', 'background'] as const) {
      f.resetCounts(); await f.run('sync', origin);
      assert.deepEqual(f.operations, { reads: 1, conditional: 1, writes: 0, uploads: 0, heads: 0, stats: 0, hashes: 0, trackReads: 0, mirrorWrites: 0, gcDeletes: 0 });
    }
  } finally { f.sql.close(); }
});

test('a remote star updates an existing local track with no audio rehash/upload and one mirror write', async () => {
  const f = await fixture(1_750);
  try {
    f.mutateRemote(12, 1); f.resetCounts(); await f.run();
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 13').get()?.rating, 1);
    assert.equal(f.operations.reads, 1);
    assert.equal(f.operations.hashes, 0); assert.equal(f.operations.uploads, 0); assert.equal(f.operations.heads, 0);
    assert.equal(f.operations.stats, 0); assert.equal(f.operations.mirrorWrites, 1);
    assert.equal(f.operations.gcDeletes, 0);
  } finally { f.sql.close(); }
});

test('a 1750-member playlist edit never opens or hashes its unchanged member files', async () => {
  const f = await fixture(1_750);
  try {
    f.sql.exec(`INSERT INTO playlists VALUES (1, 'playlist', 'Edited', NULL, NULL, 0, NULL, 0, 1, 1);
      INSERT INTO playlist_tracks(playlist_id, track_id, position) SELECT 1, id, id - 1 FROM tracks;
      INSERT INTO cloud_sync_outbox VALUES ('${scope}', 'playlist', '1', 1, 'upsert', NULL, 1, 1);`);
    f.resetCounts(); await f.run();
    const playlist = f.remote().playlists.find((record) => record.cloud_id === 'playlist');
    assert.ok(playlist && !playlist.deleted);
    assert.deepEqual(playlist.entry.track_hashes, f.remote().tracks.map((record) => record.content_hash_sha256));
    assert.equal(f.operations.trackReads, 0); assert.equal(f.operations.hashes, 0); assert.equal(f.operations.stats, 0);
    assert.equal(f.operations.uploads, 0); assert.equal(f.operations.heads, 0);
  } finally { f.sql.close(); }
});

test('fetch protects queued stars instead of overwriting them before their eventual publication', async () => {
  const f = await fixture();
  try {
    f.sql.exec('UPDATE tracks SET rating = 1 WHERE id = 1'); f.pending(1);
    f.mutateRemote(0, null); await f.run('fetch');
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count, 1);
    await f.run('sync', 'auto');
    const track = f.remote().tracks[0]; assert.ok(!track.deleted);
    assert.equal(track.entry.metadata.rating, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count, 0);
  } finally { f.sql.close(); }
});

test('a precondition retry preserves the local star and a concurrent remote star without probing blobs', async (t) => {
  // Conflict merging is under test, not the platform clock. Resolve its retry
  // delay deterministically without wall-clock sleeps.
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => {
    queueMicrotask(callback);
    return 0;
  });
  const f = await fixture(2);
  try {
    f.sql.exec('UPDATE tracks SET rating = 1 WHERE id = 1'); f.pending(1); f.conflict();
    await f.run('sync', 'auto');
    assert.deepEqual(f.remote().tracks.map((record) => record.deleted ? null : record.entry.metadata.rating), [1, 1]);
    assert.equal(f.operations.writes, 2); assert.equal(f.operations.reads, 2);
    assert.equal(f.operations.uploads, 0); assert.equal(f.operations.heads, 0); assert.equal(f.operations.hashes, 0);
  } finally { f.sql.close(); }
});

test('a local unstar during publication survives apply and generation acknowledgement', async () => {
  const f = await fixture();
  try {
    f.sql.exec('UPDATE tracks SET rating = 1 WHERE id = 1'); f.pending(1);
    f.onWrite(() => { f.sql.exec('UPDATE tracks SET rating = NULL WHERE id = 1'); f.pending(1, 2); });
    await f.run('sync', 'auto');
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, null);
    assert.equal(f.sql.prepare('SELECT generation FROM cloud_sync_outbox').get()?.generation, 2);
    await f.run('sync', 'auto');
    const track = f.remote().tracks[0]; assert.ok(!track.deleted); assert.equal(track.entry.metadata.rating, null);
  } finally { f.sql.close(); }
});

test('upload-only cannot mark foreign metadata applied or hide it behind a cached ETag', async () => {
  const f = await fixture();
  try {
    f.mutateRemote(0, 1); await f.run('upload');
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, null);
    await f.run('sync');
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, 1);
  } finally { f.sql.close(); }
});

test('first-import identity migration hashes once; subsequent ordinary sync never hashes the library again', async () => {
  const f = await fixture(1_750);
  try {
    f.sql.exec(`UPDATE tracks SET content_hash_sha256 = NULL;
      UPDATE cloud_sync_state SET needs_full_reconcile = 1;`);
    await f.run();
    assert.equal(f.operations.hashes, 1_750);
    assert.equal(f.sql.prepare('SELECT needs_full_reconcile FROM cloud_sync_state').get()?.needs_full_reconcile, 0);
    f.resetCounts(); await f.run();
    assert.equal(f.operations.reads, 1); assert.equal(f.operations.conditional, 1);
    assert.equal(f.operations.hashes, 0); assert.equal(f.operations.stats, 0); assert.equal(f.operations.trackReads, 0);
  } finally { f.sql.close(); }
});

test('an unhashable pending local track fails without discarding its durable upload mutation', async () => {
  const f = await fixture();
  try {
    f.sql.exec('UPDATE tracks SET content_hash_sha256 = NULL WHERE id = 1');
    f.missingPaths.add('/music/1.m4a'); f.pending(1);
    await assert.rejects(f.run(), /cloud_sync_local_file_missing/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get()?.count, 1);
    assert.equal(f.operations.writes, 0); assert.equal(f.operations.uploads, 0);
  } finally { f.sql.close(); }
});

test('metered metadata application keeps changed artwork pending instead of silently accepting an old cover', async () => {
  const f = await fixture();
  try {
    f.sql.exec("UPDATE tracks SET cover_art_path = '/art/old.jpg' WHERE id = 1");
    const record = f.remote().tracks[0]; assert.ok(!record.deleted);
    record.entry.artwork_hash_sha256 = 'a'.repeat(64);
    record.entry.artwork_object_key = 'ton/art/new.jpg';
    record.entry.artwork_file_name = 'new.jpg';
    f.mutateRemote(0, 1); await f.run();
    assert.equal(f.sql.prepare('SELECT cover_art_path FROM tracks WHERE id = 1').get()?.cover_art_path, null);
    assert.equal(f.sql.prepare('SELECT pending_assets FROM cloud_sync_state').get()?.pending_assets, 1);
    f.resetCounts(); await f.run();
    assert.equal(f.sql.prepare('SELECT pending_assets FROM cloud_sync_state').get()?.pending_assets, 1);
    assert.equal(f.operations.conditional, 0);
    assert.equal(f.operations.hashes, 0);
  } finally { f.sql.close(); }
});

test('failed changed artwork remains a durable retry while stars apply; recovery clears only the successful failure', async () => {
  const f = await fixture();
  try {
    f.sql.exec("UPDATE tracks SET cover_art_path = '/art/old.jpg' WHERE id = 1");
    const record = f.remote().tracks[0]; assert.ok(!record.deleted);
    record.entry.artwork_hash_sha256 = 'a'.repeat(64);
    record.entry.artwork_object_key = 'ton/art/new.jpg';
    record.entry.artwork_file_name = 'new.jpg';
    f.mutateRemote(0, 1);
    const failed = await f.fetchArtwork(true);
    assert.equal(failed.failed, 1); assert.equal(failed.downloaded, 0);
    assert.equal(f.sql.prepare('SELECT rating FROM tracks WHERE id = 1').get()?.rating, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_download_failures').get()?.count, 1);
    const recovered = await f.fetchArtwork(false);
    assert.equal(recovered.failed, 0);
    assert.equal(f.sql.prepare('SELECT cover_art_path FROM tracks WHERE id = 1').get()?.cover_art_path, '/art/new.jpg');
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_download_failures').get()?.count, 0);
  } finally { f.sql.close(); }
});

test('empty mobile first fetch retains remote tracks as pending audio rather than treating initial reconcile as an apply ban', async () => {
  const f = await fixture();
  try {
    f.sql.exec(`DELETE FROM tracks; DELETE FROM cloud_sync_entities;
      UPDATE cloud_sync_state SET revision = NULL, etag = NULL, needs_full_reconcile = 1;`);
    await f.run('fetch');
    assert.equal(f.sql.prepare('SELECT pending_downloads FROM cloud_sync_state').get()?.pending_downloads, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM cloud_sync_entities WHERE deleted = 0').get()?.count, 1);
    assert.equal(f.operations.hashes, 0);
    assert.equal(f.sql.prepare('SELECT needs_full_reconcile FROM cloud_sync_state').get()?.needs_full_reconcile, 1);
  } finally { f.sql.close(); }
});
