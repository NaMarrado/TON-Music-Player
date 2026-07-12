export const PHASE_LABELS: Record<string, string> = {
  queued: 'exportPhaseQueued',
  manifest: 'exportPhaseManifest',
  tracks: 'exportPhaseTracks',
  artwork: 'exportPhaseArtwork',
  done: 'exportPhaseDone',
  extract: 'importPhaseExtract',
  playlists: 'importPhasePlaylists',
};

export interface ExportImportProgress {
  phase: string;
  current: number;
  total: number;
}
