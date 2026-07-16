const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { gzipSync } = require('node:zlib');

const {
  testables: { downloadFile, downloadGzFile },
} = require('../../packages/desktop/scripts/prepare-bundled-binaries.cjs');

async function withTempDirectory(run) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ton-binary-download-'));
  try {
    await run(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

test('retries a transient network failure and atomically writes the binary', async () => {
  await withTempDirectory(async (directory) => {
    let requests = 0;
    const destination = path.join(directory, 'tool.exe');

    await downloadFile('https://example.test/tool.exe', destination, {
      fetchImpl: async () => {
        requests += 1;
        if (requests === 1) {
          throw new TypeError('fetch failed');
        }
        return new Response('binary-data', { status: 200 });
      },
      retryDelayMs: 0,
      timeoutMs: 1_000,
    });

    assert.equal(requests, 2);
    assert.equal(await fs.promises.readFile(destination, 'utf8'), 'binary-data');
    assert.deepEqual(await fs.promises.readdir(directory), ['tool.exe']);
  });
});

test('retries a corrupt gzip response and writes only decompressed output', async () => {
  await withTempDirectory(async (directory) => {
    let requests = 0;
    const destination = path.join(directory, 'ffmpeg');

    await downloadGzFile('https://example.test/ffmpeg.gz', destination, {
      fetchImpl: async () => {
        requests += 1;
        const body = requests === 1 ? Buffer.from('corrupt') : gzipSync(Buffer.from('ffmpeg-data'));
        return new Response(body, { status: 200 });
      },
      retryDelayMs: 0,
      timeoutMs: 1_000,
    });

    assert.equal(requests, 2);
    assert.equal(await fs.promises.readFile(destination, 'utf8'), 'ffmpeg-data');
    assert.deepEqual(await fs.promises.readdir(directory), ['ffmpeg']);
  });
});

test('does not retry a permanent HTTP error or leave a partial file', async () => {
  await withTempDirectory(async (directory) => {
    let requests = 0;
    const destination = path.join(directory, 'missing.exe');

    await assert.rejects(
      downloadFile('https://example.test/missing.exe', destination, {
        fetchImpl: async () => {
          requests += 1;
          return new Response('missing', { status: 404 });
        },
        retryDelayMs: 0,
        timeoutMs: 1_000,
      }),
      /HTTP 404/,
    );

    assert.equal(requests, 1);
    assert.deepEqual(await fs.promises.readdir(directory), []);
  });
});
