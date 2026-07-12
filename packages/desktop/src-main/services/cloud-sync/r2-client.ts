import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

function parseListBucketResult(xml: string): { keys: string[]; nextContinuationToken: string | null } {
  const keys = Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (match) => decodeXmlText(match[1]));
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return {
    keys,
    nextContinuationToken: tokenMatch ? decodeXmlText(tokenMatch[1]) : null,
  };
}

export class DesktopR2Client {
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
    await assertOk(response);
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
    await assertOk(response);
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
      await assertOk(response);
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
    await assertOk(response);
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
    await assertOk(response);
  }

  async uploadFile(key: string, filePath: string, contentType: string, bodyHash: string): Promise<void> {
    const signed = signR2Request({
      config: this.config,
      method: 'PUT',
      key,
      headers: { 'content-type': contentType },
      bodyHash,
    });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
      body: fs.createReadStream(filePath) as unknown as RequestInit['body'],
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await assertOk(response);
  }

  async downloadFile(key: string, destinationPath: string): Promise<void> {
    const signed = signR2Request({ config: this.config, method: 'GET', key });
    const response = await fetch(signed.url, {
      method: signed.method,
      headers: requestHeaders(signed.headers),
    });
    await assertOk(response);
    if (!response.body) {
      throw new Error(`GET ${key} returned empty body`);
    }
    await pipeline(
      Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream),
      fs.createWriteStream(destinationPath),
    );
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
    await assertOk(response);
  }
}

export function hashStringForR2(value: string): string {
  return sha256Hex(value);
}
