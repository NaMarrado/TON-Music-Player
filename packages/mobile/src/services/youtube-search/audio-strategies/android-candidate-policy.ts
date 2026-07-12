export interface AndroidAudioCandidate {
  headers: Record<string, string>;
  mimeType: string;
  url: string;
}

export type AndroidAudioStrategy = 'ANDROID_VR' | 'MWEB';

function isAacAudio(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('audio/mp4')
    || normalized.startsWith('audio/x-m4a');
}

function getHeader(headers: Record<string, string>, name: string): string {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1] ?? '';
}

export function getAndroidCandidateViolation(
  strategy: AndroidAudioStrategy,
  candidate: AndroidAudioCandidate,
): string | null {
  if (!isAacAudio(candidate.mimeType)) {
    return `${strategy} returned non-AAC audio (${candidate.mimeType})`;
  }

  const userAgent = getHeader(candidate.headers, 'user-agent');
  if (/iphone|ipad|\bios\b|com\.google\.ios/i.test(userAgent)) {
    return `${strategy} returned an Apple User-Agent on Android`;
  }

  const url = new URL(candidate.url);
  const urlClient = url.searchParams.get('c')?.toUpperCase() ?? '';
  if (urlClient !== strategy) {
    return `${strategy} returned an unexpected media client (${urlClient || 'missing'})`;
  }

  if (strategy === 'ANDROID_VR' && url.searchParams.has('pot')) {
    return 'ANDROID_VR URL contains a foreign PO token';
  }
  if (strategy === 'MWEB' && !url.searchParams.has('pot')) {
    return 'MWEB URL is missing its video-bound PO token';
  }

  return null;
}
