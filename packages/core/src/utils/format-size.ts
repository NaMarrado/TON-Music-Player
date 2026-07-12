const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const formatted = exponent === 0 ? value.toString() : value.toFixed(1);

  return `${formatted} ${UNITS[exponent]}`;
}
