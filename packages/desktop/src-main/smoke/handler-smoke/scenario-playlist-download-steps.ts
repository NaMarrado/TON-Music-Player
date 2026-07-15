import fs from 'fs';
import path from 'path';
import { findBestMatch, type LoadedPlaylistImport } from '@ton/core';
import { getDb } from '../../services/database';
import { replaceDesktopPlaylistImportSnapshot } from '../../services/playlist-import/snapshot';
import {
  assignDesktopPlaylistImportQueues,
  assignDesktopPlaylistImportTracks,
  materializeDesktopPlaylistImport,
  settleDesktopPlaylistImportQueueItem,
} from '../../services/playlist-import/targets';
import { assert } from './assert';

export async function runPlaylistDownloadImportChecks(
  rootDir: string,
  sourceAudioPath: string,
): Promise<void> {
  const match = findBestMatch(
    { artist: 'K.Flay', duration_ms: 215_000, title: 'Make Me Fade' },
    [
      {
        artist: 'K.Flay',
        duration_ms: 215_000,
        id: 'remix',
        title: 'Make Me Fade (Remix)',
        url: 'https://youtube.test/remix',
      },
      {
        artist: 'K.Flay - Topic',
        duration_ms: 215_500,
        id: 'original',
        title: 'Make Me Fade',
        url: 'https://youtube.test/original',
      },
    ],
  );
  assert(match?.id === 'original', 'Expected original YouTube candidate to beat remix');

  const db = getDb();
  const fixtureDir = path.join(rootDir, 'playlist-download-import');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const xPath = path.join(fixtureDir, 'x.mp3');
  const yPath = path.join(fixtureDir, 'y.mp3');
  fs.copyFileSync(sourceAudioPath, xPath);
  fs.copyFileSync(sourceAudioPath, yPath);

  const loaded: LoadedPlaylistImport = {
    name: 'Fixture Playlist',
    source: 'spotify',
    sourceId: 'fixture-playlist',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist',
    tracks: [
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 0,
        sourceTrackId: 'fixture-x',
        title: 'Track X',
      },
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 1,
        sourceTrackId: 'fixture-y',
        title: 'Track Y',
      },
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 2,
        sourceTrackId: 'fixture-x',
        title: 'Track X',
      },
    ],
  };
  const snapshot = await replaceDesktopPlaylistImportSnapshot(loaded);
  const secondSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Second Fixture Playlist',
    sourceId: 'fixture-playlist-two',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-two',
    tracks: [{ ...loaded.tracks[0], position: 0 }],
  });
  const queueX = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-x', 'Track X', 'downloading')`,
  ).run().lastInsertRowid);
  const queueY = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-y', 'Track Y', 'downloading')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    {
      importItemIds: [
        snapshot.items[0].id,
        snapshot.items[2].id,
        secondSnapshot.items[0].id,
      ],
      queueId: queueX,
    },
    { importItemIds: [snapshot.items[1].id], queueId: queueY },
  ]);

  const insertTrack = db.prepare(
    `INSERT INTO tracks (file_path, title, artist, spotify_id, in_library)
     VALUES (?, ?, 'Fixture Artist', ?, 1)`,
  );
  const trackX = Number(insertTrack.run(xPath, 'Track X', 'fixture-x').lastInsertRowid);
  const trackY = Number(insertTrack.run(yPath, 'Track Y', 'fixture-y').lastInsertRowid);

  await settleDesktopPlaylistImportQueueItem(queueY, trackY);
  await settleDesktopPlaylistImportQueueItem(queueX, trackX);
  const settledOrder = db.prepare(
    `SELECT pt.track_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(snapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    settledOrder.map((row) => row.track_id).join(',') === `${trackX},${trackY},${trackX}`,
    'Expected out-of-order settlements to preserve source order and duplicate positions',
  );
  const secondPlaylistTracks = db.prepare(
    'SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
  ).all(secondSnapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    secondPlaylistTracks.length === 1 && secondPlaylistTracks[0].track_id === trackX,
    'Expected one queue item to settle into multiple imported playlists',
  );

  const lateSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Late Fixture Playlist',
    sourceId: 'fixture-playlist-late',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-late',
    tracks: [{ ...loaded.tracks[0], position: 0 }],
  });
  const lateQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-x', 'Track X', 'done')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [lateSnapshot.items[0].id], queueId: lateQueue },
  ]);
  await materializeDesktopPlaylistImport(lateSnapshot.importSourceId);
  const lateBoundOrder = db.prepare(
    `SELECT pt.track_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(lateSnapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    lateBoundOrder.length === 1 && lateBoundOrder[0].track_id === trackX,
    'Expected a queue bound after track creation to materialize without another completion event',
  );

  const retryTrack = {
    ...loaded.tracks[0],
    sourceTrackId: 'fixture-retry',
    title: 'Track Retry',
  };
  const retrySnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Retry Fixture Playlist',
    sourceId: 'fixture-playlist-retry',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-retry',
    tracks: [{ ...retryTrack, position: 0 }],
  });
  const retryQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-retry', 'Track Retry', 'error')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [retrySnapshot.items[0].id], queueId: retryQueue },
  ]);
  await materializeDesktopPlaylistImport(retrySnapshot.importSourceId);
  const rowsBeforeRetry = db.prepare(
    'SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?',
  ).get(retrySnapshot.playlist.id) as { count: number };
  assert(rowsBeforeRetry.count === 0, 'Expected a failed queue item to stay out of its playlist');

  const retryPath = path.join(fixtureDir, 'retry.mp3');
  fs.copyFileSync(sourceAudioPath, retryPath);
  const retryTrackId = Number(
    insertTrack.run(retryPath, 'Track Retry', 'fixture-retry').lastInsertRowid,
  );
  db.prepare("UPDATE download_queue SET status = 'pending' WHERE id = ?").run(retryQueue);
  await settleDesktopPlaylistImportQueueItem(retryQueue, retryTrackId);
  db.prepare('DELETE FROM download_queue WHERE id = ?').run(retryQueue);
  const retryBinding = db.prepare(
    `SELECT queue_id, track_id
     FROM playlist_import_items
     WHERE id = ?`,
  ).get(retrySnapshot.items[0].id) as {
    queue_id: number | null;
    track_id: number | null;
  };
  assert(
    retryBinding.queue_id == null && retryBinding.track_id === retryTrackId,
    'Expected retry settlement to survive completed queue cleanup',
  );

  const cancelledSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Cancelled Fixture Playlist',
    sourceId: 'fixture-playlist-cancelled',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-cancelled',
    tracks: [{
      ...loaded.tracks[0],
      position: 0,
      sourceTrackId: 'fixture-cancelled',
      title: 'Track Cancelled',
    }],
  });
  const cancelledQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-cancelled', 'Track Cancelled', 'cancelled')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [cancelledSnapshot.items[0].id], queueId: cancelledQueue },
  ]);
  await materializeDesktopPlaylistImport(cancelledSnapshot.importSourceId);
  const cancelledRows = db.prepare(
    'SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?',
  ).get(cancelledSnapshot.playlist.id) as { count: number };
  assert(cancelledRows.count === 0, 'Expected a cancelled queue item to stay out of its playlist');

  db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path)
     VALUES (?, ?, 99, NULL)`,
  ).run(snapshot.playlist.id, trackY);
  db.prepare(
    'UPDATE playlists SET name = ?, cover_path = ? WHERE id = ?',
  ).run('Custom Fixture Playlist', '/fixture/custom-cover.png', snapshot.playlist.id);
  const reimported = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Updated Source Playlist',
    tracks: [loaded.tracks[1], loaded.tracks[0]].map((track, position) => ({
      ...track,
      position,
    })),
  });
  assert(reimported.playlist.id === snapshot.playlist.id, 'Expected reimport to reuse playlist');
  assert(
    reimported.playlist.name === 'Custom Fixture Playlist',
    'Expected reimport to preserve a custom playlist name',
  );
  assert(
    reimported.playlist.cover_path === '/fixture/custom-cover.png',
    'Expected reimport to preserve a custom playlist cover',
  );
  assignDesktopPlaylistImportTracks([
    { importItemIds: [reimported.items[0].id], trackId: trackY },
    { importItemIds: [reimported.items[1].id], trackId: trackX },
  ]);
  await materializeDesktopPlaylistImport(reimported.importSourceId);

  const reimportedRows = db.prepare(
    `SELECT pt.track_id, pt.import_item_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(reimported.playlist.id) as Array<{
    import_item_id: number | null;
    track_id: number;
  }>;
  assert(reimportedRows.length === 3, 'Expected two imported tracks plus one manual track');
  assert(
    reimportedRows.map((row) => row.track_id).join(',') === `${trackY},${trackX},${trackY}`,
    'Expected reimported source order followed by preserved manual track',
  );
  assert(reimportedRows[2].import_item_id == null, 'Expected manual playlist row to remain manual');
}
