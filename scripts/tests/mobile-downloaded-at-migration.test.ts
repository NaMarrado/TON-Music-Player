import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recoverHistoricalDownloadedAt,
  type HistoricalQueueCompletionRow,
  type HistoricalTrackDownloadRow,
} from '../../packages/mobile/src/services/migrations/008-downloaded-at.ts';

const ADDED_AT = 1_720_000_000;

function track(
  patch: Partial<HistoricalTrackDownloadRow> = {},
): HistoricalTrackDownloadRow {
  return {
    id: 1,
    file_mtime: null,
    spotify_id: null,
    youtube_id: 'youtube-1',
    ...patch,
  };
}

function completion(
  patch: Partial<HistoricalQueueCompletionRow> = {},
): HistoricalQueueCompletionRow {
  return {
    completed_at: ADDED_AT + 5,
    id: 1,
    resolved_source_id: null,
    source: 'youtube',
    source_id: 'youtube-1',
    ...patch,
  };
}

test('recovers the unique nearest exact-provider completion', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [track({ file_mtime: ADDED_AT * 1000 })],
      [
        completion({ completed_at: ADDED_AT + 40, id: 1 }),
        completion({ completed_at: ADDED_AT + 3, id: 2 }),
      ],
    ),
    [{ trackId: 1, downloadedAt: ADDED_AT + 3 }],
  );
});

test('supports exact Spotify identities when file_mtime is available', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [track({
        file_mtime: ADDED_AT * 1000,
        spotify_id: 'spotify-1',
        youtube_id: null,
      })],
      [completion({ source: 'spotify', source_id: 'spotify-1' })],
    ),
    [{ trackId: 1, downloadedAt: ADDED_AT + 5 }],
  );
});

test('falls back to the resolved YouTube identity after a provider mismatch', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [track({
        file_mtime: ADDED_AT * 1000,
        spotify_id: 'spotify-1',
        youtube_id: 'resolved-youtube-1',
      })],
      [completion({
        resolved_source_id: 'resolved-youtube-1',
        source: 'spotify',
        source_id: 'different-spotify-id',
      })],
    ),
    [{ trackId: 1, downloadedAt: ADDED_AT + 5 }],
  );
});

test('leaves tracks without a valid file_mtime unset', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [track(), track({ id: 2, file_mtime: 0 })],
      [completion()],
    ),
    [],
  );
});

test('leaves ambiguous, distant, and cross-provider matches unset', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [
        track({ file_mtime: ADDED_AT * 1000 }),
        track({ id: 2, file_mtime: ADDED_AT * 1000, youtube_id: 'youtube-2' }),
      ],
      [
        completion({ completed_at: ADDED_AT - 10, id: 1 }),
        completion({ completed_at: ADDED_AT + 10, id: 2 }),
        completion({ id: 3, source: 'spotify', source_id: 'youtube-1' }),
        completion({ completed_at: ADDED_AT + 3_601, id: 4, source_id: 'youtube-2' }),
      ],
    ),
    [],
  );
});

test('rejects distinct queue rows even when they share one completion timestamp', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [track({ file_mtime: ADDED_AT * 1000 })],
      [completion({ id: 1 }), completion({ id: 2 })],
    ),
    [],
  );
});

test('requires a mutual one-to-one track and queue match', () => {
  assert.deepEqual(
    recoverHistoricalDownloadedAt(
      [
        track({ id: 1, file_mtime: ADDED_AT * 1000 }),
        track({ id: 2, file_mtime: ADDED_AT * 1000 }),
      ],
      [completion({ id: 1 })],
    ),
    [],
  );
});
