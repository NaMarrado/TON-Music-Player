import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { CloudStorageConfig } from '../../types/cloud-sync';
import { buildR2Endpoint } from './manifest';

const EMPTY_SHA256 = bytesToHex(sha256(new Uint8Array()));

export interface R2SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

interface SignR2RequestOptions {
  config: CloudStorageConfig;
  method: string;
  key: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string | Uint8Array | null;
  bodyHash?: string;
  now?: Date;
}

const BASE64_LOOKUP = (() => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup: Record<string, number> = {};
  for (let index = 0; index < alphabet.length; index += 1) {
    lookup[alphabet[index]] = index;
  }
  return lookup;
})();

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLength = Math.floor((clean.length * 3) / 4) - padding;
  const output = new Uint8Array(Math.max(0, outputLength));
  let outputIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const chunk =
      ((BASE64_LOOKUP[clean[index]] ?? 0) << 18)
      | ((BASE64_LOOKUP[clean[index + 1]] ?? 0) << 12)
      | ((BASE64_LOOKUP[clean[index + 2]] ?? 0) << 6)
      | (BASE64_LOOKUP[clean[index + 3]] ?? 0);

    if (outputIndex < output.length) output[outputIndex++] = (chunk >> 16) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = (chunk >> 8) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = chunk & 0xff;
  }

  return output;
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(typeof input === 'string' ? utf8ToBytes(input) : input));
}

export function createSha256Hasher(): {
  update: (chunk: Uint8Array) => void;
  digestHex: () => string;
} {
  const hasher = sha256.create();
  return {
    update: (chunk) => {
      hasher.update(chunk);
    },
    digestHex: () => bytesToHex(hasher.digest()),
  };
}

/**
 * React Native's HTTP stack may expose a strong R2 object ETag with a weak
 * `W/` prefix after transparent response decoding. R2 conditional writes
 * require the original strong entity tag, so strip only that transport-added
 * weakness marker while preserving the quoted opaque tag.
 */
export function normalizeCloudObjectEtag(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^W\/\s*/i, '');
}

function hmacSha256(key: string | Uint8Array, data: string): Uint8Array {
  return hmac(sha256, typeof key === 'string' ? utf8ToBytes(key) : key, utf8ToBytes(data));
}

function toAmzDate(now: Date): { dateStamp: string; amzDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    dateStamp: iso.slice(0, 8),
    amzDate: iso,
  };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => (
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function encodePath(key: string): string {
  return key.split('/').map((segment) => encodeRfc3986(segment)).join('/');
}

function canonicalQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function normalizeHeaders(headers: Record<string, string>): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: entries.map(([key]) => key).join(';'),
  };
}

export function signR2Request({
  config,
  method,
  key,
  headers = {},
  query = {},
  body = null,
  bodyHash,
  now = new Date(),
}: SignR2RequestOptions): R2SignedRequest {
  const endpoint = buildR2Endpoint(config);
  const host = endpoint.replace(/^https:\/\//, '');
  const pathname = `/${encodeURIComponent(config.bucket)}/${encodePath(key)}`;
  const queryString = canonicalQuery(query);
  const url = `${endpoint}${pathname}${queryString ? `?${queryString}` : ''}`;

  const { dateStamp, amzDate } = toAmzDate(now);
  const payloadHash = bodyHash ?? (body == null ? EMPTY_SHA256 : sha256Hex(body));
  const signableHeaders: Record<string, string> = {
    ...headers,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const { canonicalHeaders, signedHeaders } = normalizeHeaders(signableHeaders);
  const canonicalRequest = [
    method.toUpperCase(),
    pathname,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, 'auto');
  const serviceKey = hmacSha256(regionKey, 's3');
  const signingKey = hmacSha256(serviceKey, 'aws4_request');
  const signature = bytesToHex(hmacSha256(signingKey, stringToSign));
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    url,
    method: method.toUpperCase(),
    headers: {
      ...signableHeaders,
      Authorization: authorization,
    },
  };
}
