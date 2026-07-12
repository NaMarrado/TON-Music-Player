export interface PlayHistoryEntry {
  id: number;
  track_id: number;
  played_at: number;
  duration_ms: number | null;
  completed: boolean;
}
