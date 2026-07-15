import * as FileSystem from 'expo-file-system';
import {
  buildCloudConnectionTestObjectKey,
  createCloudStorageHttpError,
  normalizeCloudObjectEtag,
  signR2Request,
  sha256Hex,
  type CloudStorageConfig,
  type CloudR2ObjectInfo,
} from '@ton/core';
import { parseListBucketResult } from './r2-list-parser';

function requestHeaders(headers: Record<string, string>): Record<string, string> {
  const rest = { ...headers };
  delete rest.host;
  return rest;
}

export type ConditionalJsonResult<T> =
  | { status: 'ok'; value: T; etag: string }
  | { status: 'not-modified'; etag: string | null }
  | { status: 'missing'; etag: null };

export type ConditionalPutOptions = {
  ifMatch?: string;
  ifNoneMatch?: '*';
  signal?: AbortSignal;
};

export class MobileR2PreconditionFailedError extends Error {
  readonly status = 412;

  constructor() {
    super('cloud_sync_precondition_failed');
    this.name = 'MobileR2PreconditionFailedError';
  }
}

async function assertFetchOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.text().catch(() => '');
  throw createCloudStorageHttpError(response.status, body);
}

async function assertFileSystemStatus(status: number, body = ''): Promise<void> {
  if (status >= 200 && status < 300) {
    return;
  }
  throw createCloudStorageHttpError(status, body);
}

export class MobileR2Client {
  constructor(private readonly config: CloudStorageConfig) {}

  async headObject(key: string, signal?: AbortSignal): Promise<boolean> {
    const signed = signR2Request({
      config: this.config,
      method: 'HEAD',
      key,
      headers: { 'cache-control': 'no-cache' },
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    if (response.status === 404 || response.status === 403) {
      return false;
    }
    await assertFetchOk(response);
    return true;
  }

  async getJson<T>(key: string, signal?: AbortSignal): Promise<T | null> {
    const result = await this.getJsonConditional<T>(key, undefined, signal);
    return result.status === 'ok' ? result.value : null;
  }

  async getJsonConditional<T>(
    key: string,
    etag?: string,
    signal?: AbortSignal,
  ): Promise<ConditionalJsonResult<T>> {
    const headers: Record<string, string> = { 'cache-control': 'no-cache' };
    const ifNoneMatch = normalizeCloudObjectEtag(etag);
    if (ifNoneMatch) {
      headers['if-none-match'] = ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'GET',
      key,
      headers,
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    if (response.status === 404) {
      return { status: 'missing', etag: null };
    }
    if (response.status === 304) {
      return {
        status: 'not-modified',
        etag: normalizeCloudObjectEtag(response.headers.get('etag') ?? ifNoneMatch),
      };
    }
    await assertFetchOk(response);
    const responseEtag = normalizeCloudObjectEtag(response.headers.get('etag'));
    if (!responseEtag) {
      throw new Error('cloud_sync_missing_etag');
    }
    return {
      status: 'ok',
      value: await response.json() as T,
      etag: responseEtag,
    };
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
      const response = await fetch(signed.url, {
        method: signed.method,
        headers: requestHeaders(signed.headers),
        signal,
      });
      await assertFetchOk(response);
      const parsed = parseListBucketResult(await response.text());
      objects.push(...parsed.objects);
      continuationToken = parsed.nextContinuationToken;
    } while (continuationToken);
    return objects;
  }

  async putJson(key: string, value: unknown, signal?: AbortSignal): Promise<void> {
    await this.putJsonConditional(key, value, { signal });
  }

  async putJsonConditional(
    key: string,
    value: unknown,
    options: ConditionalPutOptions = {},
  ): Promise<{ etag: string | null }> {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
    const ifMatch = normalizeCloudObjectEtag(options.ifMatch);
    if (ifMatch) {
      headers['if-match'] = ifMatch;
    }
    if (options.ifNoneMatch) {
      headers['if-none-match'] = options.ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers,
      body,
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body,
      signal: options.signal,
    });
    if (response.status === 412) {
      throw new MobileR2PreconditionFailedError();
    }
    await assertFetchOk(response);
    return { etag: normalizeCloudObjectEtag(response.headers.get('etag')) };
  }

  async deleteObject(key: string, signal?: AbortSignal): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'DELETE', key });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      signal,
    });
    if (response.status === 404) {
      return;
    }
    await assertFetchOk(response);
  }

  async uploadFile(
    key: string,
    fileUri: string,
    contentType: string,
    bodyHash: string,
    options: { ifNoneMatch?: '*'; signal?: AbortSignal } = {},
  ): Promise<'uploaded' | 'exists'> {
    if (options.signal?.aborted) {
      throw new Error('cloud_sync_cancelled');
    }
    const headers: Record<string, string> = { 'content-type': contentType };
    if (options.ifNoneMatch) {
      headers['if-none-match'] = options.ifNoneMatch;
    }
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers,
      bodyHash,
    });
    const task = FileSystem.createUploadTask(signed.url, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: requestHeaders(signed.headers),
    });
    const abort = () => { void task.cancelAsync(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    const result = await task.uploadAsync().finally(() => {
      options.signal?.removeEventListener('abort', abort);
    });
    if (!result || options.signal?.aborted) {
      throw new Error('cloud_sync_cancelled');
    }
    if (result.status === 412 && options.ifNoneMatch) {
      return 'exists';
    }
    await assertFileSystemStatus(result.status, (result as { body?: string }).body ?? '');
    return 'uploaded';
  }

  async downloadFile(key: string, destinationUri: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error('cloud_sync_cancelled');
    }
    const signed = signR2Request({ config: this.config, method: 'GET', key });
    const task = FileSystem.createDownloadResumable(signed.url, destinationUri, {
      headers: requestHeaders(signed.headers),
    });
    const abort = () => { void task.cancelAsync(); };
    signal?.addEventListener('abort', abort, { once: true });
    const result = await task.downloadAsync().finally(() => {
      signal?.removeEventListener('abort', abort);
    });
    if (!result || signal?.aborted) {
      throw new Error('cloud_sync_cancelled');
    }
    await assertFileSystemStatus(result.status);
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
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body,
      signal,
    });
    await assertFetchOk(response);
  }
}

export function hashStringForR2(value: string): string {
  return sha256Hex(value);
}
