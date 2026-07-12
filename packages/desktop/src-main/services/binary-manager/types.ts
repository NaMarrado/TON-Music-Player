export type BinaryDependencyId = 'yt-dlp' | 'ffmpeg' | '7zz';

export type BinaryStatusKind = 'bundled' | 'downloaded' | 'system' | 'missing';

export interface BinaryLookupResult {
  id: BinaryDependencyId;
  executableName: string | null;
  path: string | null;
  status: BinaryStatusKind;
}
