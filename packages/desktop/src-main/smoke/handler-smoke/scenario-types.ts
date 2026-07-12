import type { SmokeSummary } from './index';

export type InvokeFn = <T>(channel: string, ...args: unknown[]) => Promise<T>;

export type RunHandlerSmokeScenarioArgs = {
  invoke: InvokeFn;
  progressEvents: Array<{ channel: string; payload: unknown }>;
  rootDir: string;
  registeredChannels: string[];
};

export type ScenarioPaths = {
  sourceDir: string;
  duplicateDir: string;
  playlistImportDir: string;
  exportDir: string;
  exportBundleDir: string;
  playlistBundleZip: string;
  trackOne: string;
  trackTwo: string;
  playlistImportTrack: string;
};

export type ScenarioScanResults = {
  scanResult: { imported: number; skipped: number };
  rescanResult: { imported: number; skipped: number };
  duplicateStatus: { total: number; existing: number } | null;
};

export type ScenarioPlaylistResults = {
  importedPlaylistId: number;
  importedPlaylistName: string;
};

export type ScenarioExportImportResults = {
  folderExportResult: {
    trackCount: number;
    playlistCount: number;
    sizeBytes: number;
  };
  folderImportResult: {
    importedTracks: number;
    skippedTracks: number;
    importedPlaylists: number;
  };
};

export type ScenarioDeleteResults = {
  loudnessStats: { total: number; analyzed: number; missing: number };
  deleteResult: { deleted: number };
};

export type ScenarioSummaryParts = ScenarioScanResults & ScenarioPlaylistResults & ScenarioExportImportResults & ScenarioDeleteResults;

export type ScenarioSmokeSummary = SmokeSummary;
