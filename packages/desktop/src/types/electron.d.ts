import type { AllowedInvokeChannel, AllowedOnChannel } from '../shared/ipc-channels';

interface TransactionStatement {
  sql: string;
  params?: unknown[];
}

interface ExecuteResult {
  changes: number;
  lastInsertRowid: number;
}

interface AppPaths {
  userData: string;
  music: string;
  downloads: string;
  artwork: string;
}

interface DesktopUpdateDownloadRequest {
  url: string;
  fileName?: string;
  version?: string;
  simulate?: boolean;
}

interface DesktopUpdateDownloadResult {
  filePath: string;
  fileName: string;
  openedInstaller: boolean;
  simulated: boolean;
}

interface DesktopBinaryStatus {
  id: 'yt-dlp' | 'ffmpeg' | '7zz';
  executableName: string | null;
  path: string | null;
  status: 'bundled' | 'downloaded' | 'system' | 'missing';
}

interface ElectronAPI {
  invoke(channel: AllowedInvokeChannel, ...args: unknown[]): Promise<unknown>;
  invoke(channel: 'db:query', sql: string, params?: unknown[]): Promise<unknown[]>;
  invoke(channel: 'db:execute', sql: string, params?: unknown[]): Promise<ExecuteResult>;
  invoke(channel: 'db:transaction', statements: TransactionStatement[]): Promise<ExecuteResult[]>;
  invoke(channel: 'settings:get', key: string): Promise<string | null>;
  invoke(channel: 'settings:set', key: string, value: string): Promise<void>;
  invoke(channel: 'binaries:get-status'): Promise<DesktopBinaryStatus[]>;
  invoke(channel: 'binaries:repair'): Promise<DesktopBinaryStatus[]>;
  invoke(channel: 'cloud:get-config'): Promise<import('@ton/core').CloudStoragePublicConfig | null>;
  invoke(
    channel: 'cloud:save-config',
    config: import('@ton/core').CloudStorageConfig,
  ): Promise<import('@ton/core').CloudStoragePublicConfig>;
  invoke(channel: 'cloud:test-config', config?: import('@ton/core').CloudStorageConfig): Promise<void>;
  invoke(channel: 'cloud:upload-missing'): Promise<import('@ton/core').CloudSyncResult | null>;
  invoke(channel: 'cloud:fetch-library'): Promise<import('@ton/core').CloudSyncResult | null>;
  invoke(channel: 'cloud:sync-now'): Promise<import('@ton/core').CloudSyncResult | null>;
  invoke(channel: 'cloud:cancel'): Promise<void>;
  invoke(channel: 'app:get-version'): Promise<string>;
  invoke(channel: 'app:get-platform'): Promise<NodeJS.Platform>;
  invoke(channel: 'app:get-paths'): Promise<AppPaths>;
  invoke(channel: 'app:check-update'): Promise<import('@ton/core').AppUpdateCheck>;
  invoke(channel: 'app:open-external', url: string): Promise<void>;
  invoke(
    channel: 'app:download-update',
    request: DesktopUpdateDownloadRequest,
  ): Promise<DesktopUpdateDownloadResult>;
  invoke(channel: 'download:start', request: import('@ton/core').DownloadRequest): Promise<number>;
  invoke(channel: 'download:cancel', id: number): Promise<void>;
  invoke(channel: 'download:cancel-all'): Promise<void>;
  invoke(channel: 'download:retry', id: number): Promise<void>;
  invoke(channel: 'download:clear-completed'): Promise<void>;
  invoke(channel: 'download:get-all'): Promise<import('@ton/core').DownloadItem[]>;
  invoke(
    channel: 'download:import-playlist',
    options: { url: string; format?: 'opus' | 'mp3' },
  ): Promise<import('@ton/core').PlaylistImportResult>;
  invoke(
    channel: 'search:query',
    query: import('@ton/core').SearchQuery,
  ): Promise<{ sourceErrors: Record<string, string> }>;
  invoke(
    channel: 'search:spotify-playlist',
    url: string,
  ): Promise<{ name: string; tracks: import('@ton/core').SpotifyPlaylistTrack[]; total: number }>;
  invoke(channel: 'library:import-files'): Promise<{ imported: number }>;
  invoke(channel: 'library:scan', dirPath?: string): Promise<{ imported: number; skipped: number }>;
  invoke(
    channel: 'library:analyze-loudness',
    trackId: number,
  ): Promise<{ lufs: number; gain: number } | null>;
  invoke(
    channel: 'library:analyze-loudness-all',
  ): Promise<{ analyzed: number; failed: number; total: number; noFfmpeg: boolean }>;
  invoke(
    channel: 'library:loudness-stats',
  ): Promise<{ total: number; analyzed: number; missing: number }>;
  invoke(
    channel: 'library:list-summary',
  ): Promise<(import('@ton/core').Track & { playlist_names: string | null })[]>;
  invoke(
    channel: 'library:list-summary-by-ids',
    trackIds: number[],
  ): Promise<(import('@ton/core').Track & { playlist_names: string | null })[]>;
  invoke(
    channel: 'library:home-summary',
  ): Promise<{
    libraryCount: number;
    recentTracks: import('@ton/core').Track[];
    recentlyPlayed: import('@ton/core').Track[];
  }>;
  invoke(
    channel: 'library:get-track-snapshot',
    trackId: number,
  ): Promise<import('@ton/core').Track | null>;
  invoke(channel: 'file:exists', ...args: unknown[]): Promise<unknown>;
  invoke(channel: 'file:read-metadata', ...args: unknown[]): Promise<unknown>;
  invoke(channel: 'file:delete', ...args: unknown[]): Promise<unknown>;
  invoke(channel: 'playlist:list'): Promise<import('@ton/core').Playlist[]>;
  invoke(
    channel: 'playlist:get',
    id: number,
  ): Promise<{
    playlist: import('@ton/core').Playlist;
    tracks: import('@ton/core').Track[];
  } | null>;
  invoke(
    channel: 'playlist:create',
    data: { name: string; description?: string; is_smart?: boolean; smart_rules?: string },
  ): Promise<import('@ton/core').Playlist>;
  invoke(
    channel: 'playlist:update',
    id: number,
    data: { name?: string; description?: string; smart_rules?: string },
  ): Promise<void>;
  invoke(channel: 'playlist:delete', id: number): Promise<void>;
  invoke(channel: 'playlist:add-tracks', playlistId: number, trackIds: number[]): Promise<void>;
  invoke(channel: 'playlist:remove-track', playlistId: number, trackId: number): Promise<void>;
  invoke(channel: 'playlist:reorder', playlistId: number, orderedTrackIds: number[]): Promise<void>;
  invoke(
    channel: 'playlist:smart-query',
    config: import('@ton/core').SmartPlaylistConfig,
  ): Promise<import('@ton/core').Track[]>;
  invoke(
    channel: 'export:start',
    options?: { destinationPath?: string; bundleFormat?: 'archive' | 'folder' },
  ): Promise<{ trackCount: number; playlistCount: number; sizeBytes: number }>;
  invoke(
    channel: 'export:summary',
  ): Promise<{ exportableTrackCount: number; exportablePlaylistCount: number }>;
  invoke(
    channel: 'import:start',
    options?: { bundlePath?: string },
  ): Promise<{ importedTracks: number; skippedTracks: number; importedPlaylists: number }>;
  on(channel: AllowedOnChannel, callback: (...args: unknown[]) => void): void;
  on(
    channel:
      | 'download:progress'
      | 'download:complete'
      | 'download:error'
      | 'library:scan-progress'
      | 'library:loudness-progress'
      | 'export:progress'
      | 'import:progress'
      | 'tray:play-pause'
      | 'tray:next'
      | 'tray:prev'
      | 'menu:import'
      | 'menu:export'
      | 'menu:settings',
    callback: (...args: unknown[]) => void,
  ): void;
  off(channel: AllowedOnChannel, callback: (...args: unknown[]) => void): void;
  off(
    channel:
      | 'download:progress'
      | 'download:complete'
      | 'download:error'
      | 'library:scan-progress'
      | 'library:loudness-progress'
      | 'export:progress'
      | 'import:progress'
      | 'tray:play-pause'
      | 'tray:next'
      | 'tray:prev'
      | 'menu:import'
      | 'menu:export'
      | 'menu:settings',
    callback: (...args: unknown[]) => void,
  ): void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
