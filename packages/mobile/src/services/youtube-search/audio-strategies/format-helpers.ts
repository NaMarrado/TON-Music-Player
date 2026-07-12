import type { RawAdaptiveFormat, RawStreamingData } from './types';

const IOS_COMPATIBLE_AUDIO_MIME_MARKERS = [
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'video/mp4',
];

export function isAacM4aAudioMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('audio/mp4')
    || normalized.startsWith('audio/x-m4a');
}

export function getAudioFormats(
  streamingData: RawStreamingData,
  allowCipheredFormats: boolean,
): RawAdaptiveFormat[] {
  return (streamingData.adaptiveFormats || []).filter((format) => {
    if (!format.mimeType?.startsWith('audio/')) {
      return false;
    }

    return allowCipheredFormats
      ? Boolean(format.url || format.signatureCipher || format.cipher)
      : Boolean(format.url);
  });
}

export function getIosCompatibleMuxedFormats(
  streamingData: RawStreamingData,
  allowCipheredFormats: boolean,
): RawAdaptiveFormat[] {
  return (streamingData.formats || []).filter((format) => {
    const mimeType = format.mimeType?.toLowerCase() ?? '';
    if (!mimeType.includes('video/mp4') || !mimeType.includes('mp4a')) {
      return false;
    }

    return allowCipheredFormats
      ? Boolean(format.url || format.signatureCipher || format.cipher)
      : Boolean(format.url);
  });
}

export function sortFormatsByBitrateDescending(
  a: RawAdaptiveFormat,
  b: RawAdaptiveFormat,
): number {
  return (b.bitrate || 0) - (a.bitrate || 0);
}

export function toContentLength(value: RawAdaptiveFormat['contentLength']): number {
  if (typeof value === 'number') {
    return value;
  }

  return value ? Number(value) : 0;
}

export function isIosCompatibleAudioMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  const normalized = mimeType.toLowerCase();
  return IOS_COMPATIBLE_AUDIO_MIME_MARKERS.some((marker) => normalized.includes(marker));
}
