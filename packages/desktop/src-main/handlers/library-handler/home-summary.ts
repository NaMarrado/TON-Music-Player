import type { Track } from '@ton/core';
import { getDb } from '../../services/database';
import { queryTrackSnapshots } from './track-snapshot';

export type LibraryHomeSummary = {
  libraryCount: number;
  recentTracks: Track[];
  recentlyPlayed: Track[];
};

export function handleLibraryHomeSummary(): LibraryHomeSummary {
  const db = getDb();
  const libraryCount = (
    db.prepare('SELECT COUNT(*) as count FROM tracks WHERE in_library = 1').get() as { count: number }
  ).count;

  const recentTracks = queryTrackSnapshots({
    orderBy: 'ORDER BY t.added_at DESC',
    limit: 12,
  });

  const recentlyPlayed = queryTrackSnapshots({
    whereClause: 'AND t.last_played_at IS NOT NULL',
    orderBy: 'ORDER BY t.last_played_at DESC',
    limit: 12,
  });

  return {
    libraryCount,
    recentTracks,
    recentlyPlayed,
  };
}
