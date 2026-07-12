import path from 'path';

export function parseFilename(filePath: string): { artist: string | null; title: string } {
  const stem = path.basename(filePath, path.extname(filePath));
  const strippedStem = stem.replace(/^\d{1,3}[\s.\-]+\s*/, '');
  const separatorMatch = strippedStem.match(/^(.+?)\s+[-–—]\s+(.+)$/);

  if (separatorMatch) {
    return {
      artist: separatorMatch[1].trim(),
      title: separatorMatch[2].trim(),
    };
  }

  return { artist: null, title: strippedStem };
}
