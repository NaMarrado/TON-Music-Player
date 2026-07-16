const MAX_FILENAME_LENGTH = 200;
const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeFilename(name: string): string {
  const portable = name
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\p{M} ._()-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[ .]+|[ .]+$/g, '');
  const truncated = Array.from(portable)
    .slice(0, MAX_FILENAME_LENGTH)
    .join('')
    .replace(/[ .]+$/g, '');

  if (!truncated) return '';
  return WINDOWS_RESERVED_FILENAME.test(truncated) ? `_${truncated}` : truncated;
}
