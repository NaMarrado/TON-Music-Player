import fs from 'fs';
import { protocol } from 'electron';
import { extname } from 'path';
import { CUSTOM_PROTOCOL } from '@ton/core';
import { ALLOWED_IMAGE_EXTENSIONS, MIME_BY_EXTENSION } from './constants';
import { extractPathFromProtocolUrl, isAllowedMediaPath } from './path';
import { createFullResponse, createRangeResponse } from './responses';

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CUSTOM_PROTOCOL,
      privileges: {
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(CUSTOM_PROTOCOL, async (request) => {
    const filePath = extractPathFromProtocolUrl(request.url);

    if (!isAllowedMediaPath(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXTENSION[ext] || 'application/octet-stream';
    const totalSize = stat.size;
    const rangeHeader = request.headers.get('Range');

    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (match) {
        return createRangeResponse(filePath, ext, contentType, totalSize, match);
      }
    }

    const cacheControl = ALLOWED_IMAGE_EXTENSIONS.has(ext)
      ? 'max-age=31536000, immutable'
      : 'no-cache';
    return createFullResponse(filePath, contentType, totalSize, cacheControl);
  });
}
