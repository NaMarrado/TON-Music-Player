import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudLocalDeletionPreview, CloudTrackEntry } from '../../../packages/core/src/types/cloud-sync.ts';
import { createCloudLiveTrackRecordV2, createEmptyCloudLibraryManifestV2 } from '../../../packages/core/src/index.ts';
import { loadSyncModule } from './bundle-module.ts';

const config = { accountId: 'test', accessKeyId: 'test', secretAccessKey: 'test', bucket: 'isolated', prefix: 'ton', jurisdiction: 'default' };

async function previewFixture(exclusions: Set<string>, Client: unknown) {
  return loadSyncModule<{ previewMobileCloudLocalDeletions(): Promise<CloudLocalDeletionPreview> }>(
    'packages/mobile/src/services/cloud-sync/local-exclusions.ts',
    {
      '/cloud-sync/config': { getMobileCloudConfig: async () => config },
      '/cloud-sync/local-state': {
        ensureMobileCloudScope: async () => 'test-scope',
        getMobileCloudLocalExclusionHashes: async () => exclusions,
        clearMobileCloudLocalExclusions: async () => 0,
        pruneMobileCloudLocalExclusions: async () => {},
      },
      '/cloud-sync/r2-client': { MobileR2Client: Client },
    },
  );
}

test('a device without local deletions can start sync without downloading a redundant full manifest', async () => {
  class ForbiddenNetwork {
    constructor() { throw new Error('Zero-deletion preview must not access R2'); }
  }
  const api = await previewFixture(new Set(), ForbiddenNetwork);
  assert.deepEqual(await api.previewMobileCloudLocalDeletions(), { deletedTracks: 0, reclaimableBytes: 0 });
});

test('positive deletion preview counts only excluded live remote tracks and their real bytes', async () => {
  const hash = 'a'.repeat(64);
  const entry: CloudTrackEntry = {
    content_hash_sha256: hash, object_key: 'ton/library/track.m4a', file_name: 'track.m4a',
    file_size: 127, format: 'm4a', artwork_hash_sha256: null, artwork_object_key: null,
    artwork_file_name: null, youtube_id: null, spotify_id: null, soundcloud_id: null,
    source_url: null, added_at: 1, updated_at: 1,
    metadata: { title: 'Track', artist: 'Artist', album: null, album_artist: null,
      track_number: null, disc_number: null, duration_ms: 12000, genre: null, year: null,
      bitrate: null, sample_rate: null, loudness_lufs: null, loudness_gain: null, rating: null },
  };
  const manifest = { ...createEmptyCloudLibraryManifestV2('remote'), max_counter: 1,
    tracks: [createCloudLiveTrackRecordV2(entry, { counter: 1, device_id: 'remote' })] };
  class TestClient {
    async getJsonConditional() { return { status: 'ok', value: manifest, etag: 'head' }; }
  }
  const api = await previewFixture(new Set([hash, 'b'.repeat(64)]), TestClient);
  assert.deepEqual(await api.previewMobileCloudLocalDeletions(), { deletedTracks: 1, reclaimableBytes: 127 });
});
