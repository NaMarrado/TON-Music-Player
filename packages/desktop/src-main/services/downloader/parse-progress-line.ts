import { YT_DLP_PROGRESS_PREFIX } from './progress-template';

export interface ParsedProgressLine {
  downloadedBytes: number | null;
  etaSeconds: number | null;
  speedBytesPerSecond: number | null;
  status: string;
  totalBytes: number | null;
  totalBytesEstimate: number | null;
}

const NULLISH_VALUES = new Set(['', 'NA', 'N/A', 'None', 'Unknown', 'null']);

function parseNullableNumber(value: string | undefined): number | null {
  if (!value || NULLISH_VALUES.has(value)) {
    return null;
  }

  const normalized = value.replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseProgressLine(line: string): ParsedProgressLine | null {
  if (!line.startsWith(YT_DLP_PROGRESS_PREFIX)) {
    return null;
  }

  const parts = line.split('\t');
  if (parts.length < 7) {
    return null;
  }

  return {
    status: parts[1] ?? '',
    downloadedBytes: parseNullableNumber(parts[2]),
    totalBytes: parseNullableNumber(parts[3]),
    totalBytesEstimate: parseNullableNumber(parts[4]),
    speedBytesPerSecond: parseNullableNumber(parts[5]),
    etaSeconds: parseNullableNumber(parts[6]),
  };
}

