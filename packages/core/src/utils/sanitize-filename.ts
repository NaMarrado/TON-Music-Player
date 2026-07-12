export function sanitizeFilename(name: string): string {
  const invalidChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  let sanitized = '';

  for (const char of name) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || invalidChars.has(char)) {
      continue;
    }
    sanitized += char;
  }

  return sanitized.replace(/\s+/g, ' ').trim().slice(0, 200);
}
