export type UpdateSource = 'manifest' | 'simulation';
export type AppUpdatePlatform =
  | 'desktop-darwin'
  | 'desktop-win32'
  | 'desktop-linux'
  | 'android'
  | 'ios'
  | 'unknown';

export interface UpdateAssetDescriptor {
  url: string;
  fileName?: string;
}

export interface UpdateManifestDesktopTargets {
  darwin?: UpdateAssetDescriptor;
  win32?: UpdateAssetDescriptor;
  linux?: UpdateAssetDescriptor;
}

export interface UpdateManifest {
  version: string;
  downloadUrl?: string;
  detailsUrl?: string;
  notes?: string;
  desktop?: UpdateManifestDesktopTargets;
  android?: UpdateAssetDescriptor;
  ios?: UpdateAssetDescriptor;
}

export interface UpdateFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type UpdateFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<UpdateFetchResponse>;

export interface AppUpdateCheck {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl: string;
  detailsUrl: string;
  notes?: string;
  source: UpdateSource;
  platform: AppUpdatePlatform;
  canDownload: boolean;
  assetFileName?: string;
}

export interface ResolvedUpdateTarget {
  latestVersion: string;
  downloadUrl: string;
  detailsUrl: string;
  notes?: string;
  source: UpdateSource;
  platform: AppUpdatePlatform;
  canDownload: boolean;
  assetFileName?: string;
}
