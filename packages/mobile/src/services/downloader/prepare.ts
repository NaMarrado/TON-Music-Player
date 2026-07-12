import { scheduleMobileJob } from '../job-scheduler';
import {
  resolveDownloadSource,
  type ResolveDownloadSourceOptions,
  type ResolvedDownloadSource,
} from './resolve';
import type { DownloadInput } from './types';

export type PreparedDownloadSource = ResolvedDownloadSource;

export async function prepareDownloadSource(
  input: DownloadInput,
  options: ResolveDownloadSourceOptions = {},
): Promise<PreparedDownloadSource> {
  return scheduleMobileJob({
    kind: 'download-resolve',
    lane: 'network',
    priority: 'user-visible',
    run: () => resolveDownloadSource(input, options),
  });
}
