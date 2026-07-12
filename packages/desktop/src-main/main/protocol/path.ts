import { extname, isAbsolute, normalize } from 'path';
import { CUSTOM_PROTOCOL, SUPPORTED_AUDIO_EXTENSIONS } from '@ton/core';
import { ALLOWED_IMAGE_EXTENSIONS } from './constants';

export function isAllowedMediaPath(filePath: string): boolean {
  if (!isAbsolute(filePath)) {
    return false;
  }

  const normalized = normalize(filePath);
  if (normalized !== filePath && normalized !== filePath.replace(/\//g, '\\')) {
    return false;
  }

  const ext = extname(normalized).toLowerCase();
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)
    || ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

export function extractPathFromProtocolUrl(url: string): string {
  const prefix = `${CUSTOM_PROTOCOL}://`;
  const raw = url.slice(prefix.length);
  return decodeURIComponent(raw.replace(/^\/+/, ''));
}
