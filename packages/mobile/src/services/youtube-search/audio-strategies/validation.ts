import type { ResolvedAudioUrl } from '../types';
import { YouTubeResolverError } from '../errors';
import { isIosCompatibleAudioMimeType } from './format-helpers';

const IOS_AUDIO_PROBE_TIMEOUT_MS = 8000;
const ANDROID_MWEB_PROBE_TIMEOUT_MS = 8000;

function isSuccessfulProbeStatus(status: number): boolean {
  return status === 200 || status === 206;
}

function getHeader(response: Response, name: string): string {
  return response.headers.get(name) ?? '';
}

function validateProbeContentType(contentType: string): void {
  if (!contentType) {
    return;
  }

  const normalized = contentType.toLowerCase();
  if (
    normalized.startsWith('audio/')
    || normalized.includes('application/octet-stream')
    || isIosCompatibleAudioMimeType(normalized)
  ) {
    return;
  }

  throw new Error(`unexpected content type ${contentType}`);
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseContentRangeTotal(contentRange: string): number | null {
  const [, total] = /\/(\d+)\s*$/.exec(contentRange) ?? [];
  return total ? parsePositiveInteger(total) : null;
}

function getProbeTotalBytes(response: Response): number | null {
  const contentRangeTotal = parseContentRangeTotal(getHeader(response, 'content-range'));
  if (contentRangeTotal != null) {
    return contentRangeTotal;
  }

  if (response.status !== 200) {
    return null;
  }

  return parsePositiveInteger(getHeader(response, 'content-length'));
}

function getNetworkHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !key.toLowerCase().startsWith('x-ton-')),
  );
}

export async function validateIosAudioCandidate(
  strategy: string,
  resolved: ResolvedAudioUrl,
): Promise<ResolvedAudioUrl> {
  const probedContentLength = await validateIosAudioRangeProbe(
    strategy,
    resolved,
    'bytes=0-0',
    'start',
  );
  const contentLength = resolved.contentLength > 0
    ? resolved.contentLength
    : probedContentLength ?? 0;

  if (contentLength > 1) {
    const lastByte = contentLength - 1;
    await validateIosAudioRangeProbe(
      strategy,
      { ...resolved, contentLength },
      `bytes=${lastByte}-${lastByte}`,
      'tail',
    );
  }

  return {
    ...resolved,
    contentLength,
  };
}

async function validateIosAudioRangeProbe(
  strategy: string,
  resolved: ResolvedAudioUrl,
  rangeHeader: string,
  label: string,
): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, IOS_AUDIO_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(resolved.url, {
      headers: {
        ...getNetworkHeaders(resolved.headers),
        Range: rangeHeader,
      },
      method: 'GET',
      signal: controller.signal,
    });

    if (!isSuccessfulProbeStatus(response.status)) {
      throw new Error(`HTTP ${response.status}`);
    }

    validateProbeContentType(getHeader(response, 'content-type'));
    const totalBytes = getProbeTotalBytes(response);

    try {
      await response.body?.cancel();
    } catch {
      // The probe already served its purpose.
    }

    return totalBytes;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${strategy}: ${label} validation timed out`);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${strategy}: ${label} validation failed: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function validateAndroidMwebCandidate(
  resolved: ResolvedAudioUrl,
  signal?: AbortSignal,
): Promise<ResolvedAudioUrl> {
  if (signal?.aborted) {
    throw new Error('download_cancelled');
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), ANDROID_MWEB_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(resolved.url, {
      headers: {
        ...getNetworkHeaders(resolved.headers),
        Range: 'bytes=0-0',
      },
      method: 'GET',
      signal: controller.signal,
    });

    if (response.status !== 206) {
      throw new YouTubeResolverError({
        canRefresh: response.status !== 429,
        message: `MWEB media probe returned HTTP ${response.status}`,
        stage: 'probe',
        status: response.status,
        strategy: 'MWEB',
      });
    }

    const contentRange = getHeader(response, 'content-range');
    if (!/^bytes\s+0-0\/\d+$/i.test(contentRange)) {
      throw new YouTubeResolverError({
        canRefresh: true,
        message: 'MWEB media probe returned an invalid Content-Range',
        stage: 'probe',
        strategy: 'MWEB',
      });
    }

    validateProbeContentType(getHeader(response, 'content-type'));
    const contentLength = parseContentRangeTotal(contentRange) ?? resolved.contentLength;
    try {
      await response.body?.cancel();
    } catch {
      // The one-byte response has already validated the candidate.
    }

    return { ...resolved, contentLength };
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('download_cancelled');
    }
    if (error instanceof YouTubeResolverError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new YouTubeResolverError({
        canRefresh: true,
        message: 'MWEB media probe timed out',
        stage: 'probe',
        strategy: 'MWEB',
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new YouTubeResolverError({
      canRefresh: true,
      message: `MWEB media probe failed: ${message}`,
      stage: 'probe',
      strategy: 'MWEB',
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}
