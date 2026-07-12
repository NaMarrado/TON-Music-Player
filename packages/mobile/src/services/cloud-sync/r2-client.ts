import * as FileSystem from 'expo-file-system';
import {
  buildCloudConnectionTestObjectKey,
  createCloudStorageHttpError,
  signR2Request,
  sha256Hex,
  type CloudStorageConfig,
} from '@ton/core';

function requestHeaders(headers: Record<string, string>): Record<string, string> {
  const rest = { ...headers };
  delete rest.host;
  return rest;
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

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseListBucketResult(xml: string): { keys: string[]; nextContinuationToken: string | null } {
  const keys = Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (match) => decodeXmlText(match[1]));
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    keys,
    nextContinuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  };
}

export class MobileR2Client {
  constructor(private readonly config: CloudStorageConfig) {}

  async headObject(key: string): Promise<boolean> {
    const signed = signR2Request({
      config: this.config,
      method: 'HEAD',
      key,
      headers: { 'cache-control': 'no-cache' },
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
    });
    if (response.status === 404 || response.status === 403) {
      return false;
    }
    await assertFetchOk(response);
    return true;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const signed = signR2Request({
      config: this.config,
      method: 'GET',
      key,
      headers: { 'cache-control': 'no-cache' },
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
    });
    if (response.status === 404) {
      return null;
    }
    await assertFetchOk(response);
    return await response.json() as T;
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
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
      });
      if (response.status === 404 || response.status === 403) {
        return keys;
      }
      await assertFetchOk(response);
      const parsed = parseListBucketResult(await response.text());
      keys.push(...parsed.keys);
      continuationToken = parsed.nextContinuationToken;
    } while (continuationToken);
    return keys;
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body,
    });
    await assertFetchOk(response);
  }

  async deleteObject(key: string): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'DELETE', key });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
    });
    if (response.status === 404) {
      return;
    }
    await assertFetchOk(response);
  }

  async uploadFile(key: string, fileUri: string, contentType: string, bodyHash: string): Promise<void> {
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers: { 'content-type': contentType },
      bodyHash,
    });
    const result = await FileSystem.uploadAsync(signed.url, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: requestHeaders(signed.headers),
    });
    await assertFileSystemStatus(result.status, (result as { body?: string }).body ?? '');
  }

  async downloadFile(key: string, destinationUri: string): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'GET', key });
    const result = await FileSystem.downloadAsync(signed.url, destinationUri, {
      headers: requestHeaders(signed.headers),
    });
    await assertFileSystemStatus(result.status);
  }

  async testConnection(): Promise<void> {
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
    });
    await assertFetchOk(response);
  }
}

export function hashStringForR2(value: string): string {
  return sha256Hex(value);
}
