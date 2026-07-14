import fs from 'fs';
import { getDb } from '../../services/database';
import { assert } from './assert';
import type { InvokeFn, ScenarioDeleteResults } from './scenario-types';

export async function runDeleteChecks(
  invoke: InvokeFn,
): Promise<ScenarioDeleteResults> {
  const db = getDb();
  const loudnessStats = await invoke<{ total: number; analyzed: number; missing: number }>(
    'library:loudness-stats',
  );
  assert(loudnessStats.total === 1, `Expected loudness total=1, got ${loudnessStats.total}`);
  assert(
    loudnessStats.analyzed >= 0 && loudnessStats.analyzed <= loudnessStats.total,
    `Expected a valid loudness analyzed count, got ${loudnessStats.analyzed}`,
  );
  assert(
    loudnessStats.missing === loudnessStats.total - loudnessStats.analyzed,
    `Expected coherent loudness missing count, got ${loudnessStats.missing}`,
  );

  const importedTracksAfterRoundTrip = db
    .prepare('SELECT id, file_path FROM tracks ORDER BY id ASC')
    .all() as Array<{ id: number; file_path: string }>;
  assert(
    importedTracksAfterRoundTrip.length === 1,
    `Expected 1 track after TON playlist bundle import, got ${importedTracksAfterRoundTrip.length}`,
  );

  const firstTrackId = importedTracksAfterRoundTrip[0].id;
  const firstTrackPath = importedTracksAfterRoundTrip[0].file_path;
  const deleteResult = await invoke<{ deleted: number }>('library:delete-tracks', [firstTrackId]);
  assert(deleteResult.deleted === 1, `Expected deleted=1, got ${deleteResult.deleted}`);
  assert(!fs.existsSync(firstTrackPath), 'Expected deleted library file to be removed from disk');

  const deletedTrackRow = db
    .prepare('SELECT id FROM tracks WHERE id = ?')
    .get(firstTrackId) as { id: number } | undefined;
  assert(!deletedTrackRow, 'Expected deleted track row to be removed from DB');

  return {
    loudnessStats,
    deleteResult,
  };
}
