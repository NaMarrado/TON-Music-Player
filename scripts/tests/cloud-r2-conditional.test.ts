import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CloudStorageConfig } from '../../packages/core/src/types/cloud-sync.ts';
import { DesktopR2Client } from '../../packages/desktop/src-main/services/cloud-sync/r2-client.ts';

const CONFIG: CloudStorageConfig = {
  accountId: 'account',
  bucket: 'bucket',
  prefix: 'ton',
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  jurisdiction: 'default',
};

test('R2 transport exposes conditional 200/304/404 and PUT 412 without unsafe fallback', async () => {
  const originalFetch = globalThis.fetch;
  const client = new DesktopR2Client(CONFIG);
  try {
    let requestHeaders: Headers | null = null;
    globalThis.fetch = async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ revision: 'r1' }), {
        status: 200,
        headers: { etag: '"etag-1"', 'content-type': 'application/json' },
      });
    };
    const current = await client.getJsonConditional<{ revision: string }>('ton/system/v2/manifest.json', {
      ifNoneMatch: '"etag-old"',
    });
    assert.deepEqual(current, {
      status: 'ok',
      value: { revision: 'r1' },
      etag: '"etag-1"',
    });
    assert.equal(requestHeaders?.get('if-none-match'), '"etag-old"');

    globalThis.fetch = async () => new Response(null, { status: 304 });
    assert.deepEqual(
      await client.getJsonConditional('ton/system/v2/manifest.json', {
        ifNoneMatch: '"etag-1"',
      }),
      { status: 'not-modified', etag: null },
    );

    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.deepEqual(
      await client.getJsonConditional('ton/system/v2/manifest.json'),
      { status: 'missing', etag: null },
    );

    globalThis.fetch = async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(null, { status: 412, headers: { etag: '"etag-2"' } });
    };
    assert.deepEqual(
      await client.putJsonConditional(
        'ton/system/v2/manifest.json',
        { revision: 'r2' },
        { ifMatch: '"etag-1"' },
      ),
      { status: 'precondition-failed', etag: '"etag-2"' },
    );
    assert.equal(requestHeaders?.get('if-match'), '"etag-1"');

    globalThis.fetch = async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await assert.rejects(
      client.getJsonConditional('ton/system/v2/manifest.json'),
      /no ETag/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('desktop R2 file upload sends a signed fixed content length', async () => {
  const originalFetch = globalThis.fetch;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ton-r2-upload-'));
  const filePath = path.join(directory, 'fixture.m4a');
  const body = Buffer.from('fixed-length-audio-fixture');
  await fs.writeFile(filePath, body);
  try {
    let requestHeaders: Headers | null = null;
    globalThis.fetch = async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(null, { status: 200, headers: { etag: '"uploaded"' } });
    };

    const client = new DesktopR2Client(CONFIG);
    const result = await client.uploadFile(
      'ton/Library/fixture.m4a',
      filePath,
      'audio/mp4',
      'a'.repeat(64),
      { ifNoneMatch: '*' },
    );

    assert.deepEqual(result, { status: 'ok', etag: '"uploaded"' });
    assert.equal(requestHeaders?.get('content-length'), String(body.byteLength));
    assert.match(
      requestHeaders?.get('authorization') ?? '',
      /SignedHeaders=[^\s]*content-length[^\s]*/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
