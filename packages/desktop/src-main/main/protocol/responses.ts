import fs from 'fs';
import { ALLOWED_IMAGE_EXTENSIONS } from './constants';
import { toReadableStream } from './stream';

export function createRangeResponse(
  filePath: string,
  ext: string,
  contentType: string,
  totalSize: number,
  rangeMatch: RegExpExecArray,
): Response {
  const start = parseInt(rangeMatch[1], 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= totalSize) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    });
  }
  const requestedEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalSize - 1;
  const end = Math.min(requestedEnd, totalSize - 1);
  if (!Number.isSafeInteger(end) || end < start) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    });
  }
  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });
  const cacheControl = ALLOWED_IMAGE_EXTENSIONS.has(ext)
    ? 'max-age=31536000, immutable'
    : 'no-cache';

  return new Response(toReadableStream(stream), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
    },
  });
}

export function createFullResponse(
  filePath: string,
  contentType: string,
  totalSize: number,
  cacheControl: string,
): Response {
  return new Response(toReadableStream(fs.createReadStream(filePath)), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(totalSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
    },
  });
}
