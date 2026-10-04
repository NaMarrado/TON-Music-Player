export interface ProfileExportResult {
  /** False when the user cancelled the save dialog. */
  saved: boolean;
  path: string | null;
  settings: number;
  starred: number;
  playlists: number;
  sessions: number;
  /** Starred songs and playlist entries that have no hash and so could not be written. */
  unidentified: number;
}

export interface ProfileImportSummary {
  /** False when the user cancelled the open dialog. */
  imported: boolean;
  settings: number;
  ignoredSettings: number;
  starred: number;
  starsMissing: number;
  playlistsCreated: number;
  playlistsSkipped: number;
  playlistTracksMissing: number;
  sessions: number;
  sessionsRejected: number;
}
