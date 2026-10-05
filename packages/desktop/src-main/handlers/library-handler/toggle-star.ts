import { getDb } from '../../services/database';

export function handleLibraryToggleStar(trackId: number): { rating: number | null } {
  const row = getDb().prepare(`
    UPDATE tracks
    SET rating = CASE WHEN COALESCE(rating, 0) > 0 THEN NULL ELSE 1 END
    WHERE id = ?
    RETURNING rating
  `).get(trackId) as { rating: number | null } | undefined;
  if (!row) throw new Error('track-not-found');
  return row;
}
