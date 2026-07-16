import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  buildCloudConnectionTestObjectKey,
  createCloudStorageHttpError,
  normalizeCloudObjectEtag,
  signR2Request,
  sha256Hex,
  type CloudConditionalJsonReadResult,
  type CloudConditionalReadOptions,
  type CloudConditionalWriteOptions,
  type CloudConditionalWriteResult,
  type CloudR2ObjectInfo,
  type CloudStorageConfig,
} from '@ton/core';

function requestHeaders(headers: Record<string, string>): Record<string, string> {
  const rest = { ...headers };
  delete rest.host;
  return rest;
}

function requestUrl(signedUrl: string): string {
  const endpoint = process.env.TON_R2_TEST_ENDPOINT?.trim().replace(/\/+$/, '');
  if (!endpoint) return signedUrl;
  return `${endpoint}${signedUrl.replace(/^https:\/\/[^/]+/, '')}`;
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.text().catch(() => '');
  throw createCloudStorageHttpError(response.status, body);
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseListBucketResult(xml: string): {
  objects: CloudR2ObjectInfo[];
  nextContinuationToken: string | null;
} {
  const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g), (match) => {
    const keyMatch = match[1].match(/<Key>([^<]+)<\/Key>/);
    const sizeMatch = match[1].match(/<Size>(\d+)<\/Size>/);
    return keyMatch
      ? { key: decodeXmlText(keyMatch[1]), size: Number(sizeMatch?.[1] ?? 0) }
      : null;
  }).filter((object): object is CloudR2ObjectInfo => object != null);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    objects,
    nextContinuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  };
}

export class DesktopR2Client {
  constructor(private readonly config: CloudStorageConfig) {}

  async headObject(key: string, signal?: AbortSignal): Promise<boolean> {
    const signed = signR2Request({
      config: this.config,
      method: 'HEAD',
      key,
      headers: { 'cache-control': 'no-cache' },
    });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    if (response.status === 404 || response.status === 403) {
      return false;
    }
    await assertOk(response);
    return true;
  }

  async getJson<T>(key: string, signal?: AbortSignal): Promise<T | null> {
    const result = await this.getJsonConditional<T>(key, { signal });
    return result.status === 'ok' ? result.value : null;
  }

  async getJsonConditional<T>(
    key: string,
    options: CloudConditionalReadOptions = {},
  ): Promise<CloudConditionalJsonReadResult<T>> {
    const headers: Record<string, string> = { 'cache-control': 'no-cache' };
    const ifNoneMatch = normalizeCloudObjectEtag(options.ifNoneMatch);
    if (ifNoneMatch) {
      headers['if-none-match'] = ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'GET',
      key,
      headers,
    });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal: options.signal as AbortSignal | undefined,
    });
    if (response.status === 404) {
      return { status: 'missing', etag: null };
    }
    if (response.status === 304) {
      return {
        status: 'not-modified',
        etag: normalizeCloudObjectEtag(response.headers.get('etag')),
      };
    }
    await assertOk(response);
    const etag = normalizeCloudObjectEtag(response.headers.get('etag'));
    if (!etag) {
      throw new Error(`GET ${key} returned no ETag`);
    }
    return { status: 'ok', value: await response.json() as T, etag };
  }

  async listObjectKeys(prefix: string, signal?: AbortSignal): Promise<string[]> {
    return (await this.listObjects(prefix, signal)).map((object) => object.key);
  }

  async listObjects(prefix: string, signal?: AbortSignal): Promise<CloudR2ObjectInfo[]> {
    const objects: CloudR2ObjectInfo[] = [];
    let continuationToken: string | null = null;
    do {
      const query: Record<string, string> = {
        'list-type': '2',
        prefix,
      };
      if (continuationToken) {
        query['continuation-token'] = continuationToken;
      }
      const signed = signR2Request({
        config: this.config,
        method: 'GET',
        key: '',
        query,
        headers: { 'cache-control': 'no-cache' },
      });
      const response = await fetch(requestUrl(signed.url), {
        method: signed.method,
        headers: requestHeaders(signed.headers),
        signal,
      });
      await assertOk(response);
      const parsed = parseListBucketResult(await response.text());
      objects.push(...parsed.objects);
      continuationToken = parsed.nextContinuationToken;
    } while (continuationToken);
    return objects;
  }

  async putJson(key: string, value: unknown, signal?: AbortSignal): Promise<void> {
    const result = await this.putJsonConditional(key, value, { signal });
    if (result.status === 'precondition-failed') {
      throw new Error('cloud_sync_precondition_failed');
    }
  }

  async putJsonConditional(
    key: string,
    value: unknown,
    options: CloudConditionalWriteOptions = {},
  ): Promise<CloudConditionalWriteResult> {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
    const ifMatch = normalizeCloudObjectEtag(options.ifMatch);
    if (ifMatch) {
      headers['if-match'] = ifMatch;
    } else if (options.ifNoneMatch) {
      headers['if-none-match'] = options.ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers,
      body,
    });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body,
      signal: options.signal as AbortSignal | undefined,
    });
    if (response.status === 412) {
      return {
        status: 'precondition-failed',
        etag: normalizeCloudObjectEtag(response.headers.get('etag')),
      };
    }
    await assertOk(response);
    return { status: 'ok', etag: normalizeCloudObjectEtag(response.headers.get('etag')) };
  }

  async deleteObject(key: string, signal?: AbortSignal): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'DELETE', key });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    if (response.status === 404) {
      return;
    }
    await assertOk(response);
  }

  async uploadFile(
    key: string,
    filePath: string,
    contentType: string,
    bodyHash: string,
    options: CloudConditionalWriteOptions = {},
  ): Promise<CloudConditionalWriteResult> {
    const fileSize = (await fs.promises.stat(filePath)).size;
    const headers: Record<string, string> = {
      'content-length': String(fileSize),
      'content-type': contentType,
    };
    const ifMatch = normalizeCloudObjectEtag(options.ifMatch);
    if (ifMatch) {
      headers['if-match'] = ifMatch;
    } else if (options.ifNoneMatch) {
      headers['if-none-match'] = options.ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers,
      bodyHash,
    });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body: fs.createReadStream(filePath) as unknown as RequestInit['body'],
      duplex: 'half',
      signal: options.signal as AbortSignal | undefined,
    } as RequestInit & { duplex: 'half' });
    if (response.status === 412) {
      return {
        status: 'precondition-failed',
        etag: normalizeCloudObjectEtag(response.headers.get('etag')),
      };
    }
    await assertOk(response);
    return { status: 'ok', etag: normalizeCloudObjectEtag(response.headers.get('etag')) };
  }

  async downloadFile(key: string, destinationPath: string, signal?: AbortSignal): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'GET', key });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    await assertOk(response);
    if (!response.body) {
      throw new Error(`GET ${key} returned empty body`);
    }
    const source = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream);
    if (signal) {
      await pipeline(source, fs.createWriteStream(destinationPath), { signal });
    } else {
      await pipeline(source, fs.createWriteStream(destinationPath));
    }
  }

  async testConnection(signal?: AbortSignal): Promise<void> {
    const key = buildCloudConnectionTestObjectKey(this.config.prefix);
    const body = 'ok';
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body,
    });
    const response = await fetch(requestUrl(signed.url), {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body,
      signal,
    });
    await assertOk(response);
  }
}

export function hashStringForR2(value: string): string {
  return sha256Hex(value);
}
