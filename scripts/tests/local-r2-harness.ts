import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCloudLibraryAudioObjectKey,
  buildCloudV2ManifestObjectKey,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  type CloudLibraryManifestV2,
  type CloudPlaylistEntry,
  type CloudTrackEntry,
} from '../../packages/core/src/index.ts';

type StoredObject = {
  body: Buffer;
  contentType: string;
  etag: string;
};

const options = parseOptions(process.argv.slice(2));
const objects = new Map<string, StoredObject>();
const failingAudioKeys = new Set<string>();
seedHarness(options.tracks, options.failAudioEvery, options.specialNames);

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : 'local-r2-harness-error');
  });
});

server.listen(options.port, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({
    endpoint: `http://127.0.0.1:${options.port}`,
    fakeConfig: {
      accountId: 'local-test-account',
      accessKeyId: 'local-test-access-key',
      secretAccessKey: 'local-test-secret-key',
      bucket: options.bucket,
      prefix: 'ton',
      jurisdiction: 'default',
    },
    objects: objects.size,
    tracks: options.tracks,
  })}\n`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'POST' && url.pathname === '/__harness/restore-audio') {
    failingAudioKeys.clear();
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
    sendList(response, url.searchParams.get('prefix') ?? '');
    return;
  }

  const requestPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const bucketPrefix = `${options.bucket}/`;
  const key = requestPath.startsWith(bucketPrefix)
    ? requestPath.slice(bucketPrefix.length)
    : requestPath;
  if (!key || key.includes('..')) {
    response.statusCode = 400;
    response.end('invalid-key');
    return;
  }

  const stored = objects.get(key);
  if (request.method === 'HEAD') {
    if (!stored) {
      response.statusCode = 404;
      response.end();
      return;
    }
    sendObjectHeaders(response, stored);
    response.statusCode = 200;
    response.end();
    return;
  }

  if (request.method === 'GET') {
    if (!stored) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (normalizeEtag(request.headers['if-none-match']) === stored.etag) {
      response.statusCode = 304;
      response.setHeader('etag', quoteEtag(stored.etag));
      response.end();
      return;
    }
    if (failingAudioKeys.has(key)) {
      response.statusCode = 503;
      response.end('fixture-audio-failure');
      return;
    }
    if (options.audioDelayMs > 0 && stored.contentType.startsWith('audio/')) {
      await new Promise((resolve) => setTimeout(resolve, options.audioDelayMs));
    }
    sendObjectHeaders(response, stored);
    response.statusCode = 200;
    response.end(stored.body);
    return;
  }

  if (request.method === 'PUT') {
    const current = objects.get(key);
    const ifMatch = normalizeEtag(request.headers['if-match']);
    if ((ifMatch && current?.etag !== ifMatch)
        || (request.headers['if-none-match'] === '*' && current)) {
      response.statusCode = 412;
      if (current) response.setHeader('etag', quoteEtag(current.etag));
      response.end();
      return;
    }
    const body = await readBody(request);
    const next = storeObject(key, body, String(request.headers['content-type'] ?? 'application/octet-stream'));
    response.statusCode = 200;
    response.setHeader('etag', quoteEtag(next.etag));
    response.end();
    return;
  }

  if (request.method === 'DELETE') {
    objects.delete(key);
    response.statusCode = 204;
    response.end();
    return;
  }

  response.statusCode = 405;
  response.end();
}

function seedHarness(trackCount: number, failAudioEvery: number, specialNames: boolean): void {
  const baseAudio = createBaseAudio();
  const entries: CloudTrackEntry[] = [];
  for (let index = 0; index < trackCount; index += 1) {
    const body = Buffer.concat([baseAudio, Buffer.from(`TON_LOCAL_R2_FIXTURE_${index}`)]);
    const hash = sha256(body);
    const useSpecialName = specialNames && index === 0;
    const title = useSpecialName
      ? '#BrooklynBloodPop! 100%'
      : `Fixture Track ${String(index + 1).padStart(5, '0')}`;
    const artist = useSpecialName
      ? 'SyKo!'
      : `Fixture Artist ${String(index % 100).padStart(3, '0')}`;
    // Reproduce object keys created before portable filename sanitization.
    const objectKey = useSpecialName
      ? `ton/library/tracks/${artist} - ${title} [${hash.slice(0, 8)}].m4a`
      : buildCloudLibraryAudioObjectKey('ton', hash, '.m4a', {
          title,
          artist,
          fileName: `${title}.m4a`,
        });
    storeObject(objectKey, body, 'audio/mp4');
    if (failAudioEvery > 0 && (index + 1) % failAudioEvery === 0) {
      failingAudioKeys.add(objectKey);
    }
    entries.push({
      content_hash_sha256: hash,
      object_key: objectKey,
      file_name: `${artist} - ${title}.m4a`,
      file_size: body.byteLength,
      format: 'm4a',
      artwork_hash_sha256: null,
      artwork_object_key: null,
      artwork_file_name: null,
      youtube_id: null,
      spotify_id: null,
      soundcloud_id: null,
      source_url: null,
      downloaded_at: 1_700_000_000 + index,
      added_at: 1_700_000_000 + index,
      updated_at: 1_700_000_000 + index,
      metadata: {
        title,
        artist,
        album: `Fixture Album ${index % 20}`,
        album_artist: null,
        track_number: index + 1,
        disc_number: 1,
        duration_ms: 350,
        genre: 'Fixture',
        year: 2026,
        bitrate: 96_000,
        sample_rate: 44_100,
        loudness_lufs: -14,
        loudness_gain: 0,
        rating: null,
      },
    });
  }

  const playlists = createPlaylists(entries);
  const manifest: CloudLibraryManifestV2 = {
    schema_version: 2,
    app: 'TON',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000 + trackCount,
    writer_device_id: 'local-r2-harness',
    revision: `local-fixture-${trackCount}`,
    max_counter: entries.length + playlists.length,
    tracks: entries.map((entry, index) => createCloudLiveTrackRecordV2(
      entry,
      { counter: index + 1, device_id: 'local-r2-harness' },
    )),
    playlists: playlists.map((entry, index) => createCloudLivePlaylistRecordV2(
      entry,
      { counter: entries.length + index + 1, device_id: 'local-r2-harness' },
    )),
  };
  storeObject(
    buildCloudV2ManifestObjectKey('ton'),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    'application/json; charset=utf-8',
  );
}

function createPlaylists(entries: CloudTrackEntry[]): CloudPlaylistEntry[] {
  const groups = [
    entries.slice(0, Math.min(entries.length, 400)),
    entries.filter((_, index) => index % 2 === 0).slice(0, 500),
    entries.filter((_, index) => index % 3 === 0).slice(0, 500),
    entries.slice(Math.max(0, entries.length - 300)),
  ];
  return groups.map((tracks, index) => ({
    cloud_id: `local-fixture-playlist-${index + 1}`,
    name: `Fixture Playlist ${index + 1}`,
    description: null,
    cover_hash_sha256: null,
    cover_object_key: null,
    is_smart: false,
    smart_rules: null,
    sort_order: index,
    created_at: 1_700_000_000 + index,
    updated_at: 1_700_000_000 + index,
    track_hashes: tracks.map((track) => track.content_hash_sha256),
  }));
}

function createBaseAudio(): Buffer {
  const directory = join(tmpdir(), 'ton-local-r2-harness');
  const filePath = join(directory, 'fixture.m4a');
  if (!existsSync(filePath)) {
    mkdirSync(directory, { recursive: true });
    const ffmpeg = existsSync(join(process.cwd(), 'packages/desktop/build-resources/bin/ffmpeg'))
      ? join(process.cwd(), 'packages/desktop/build-resources/bin/ffmpeg')
      : join(process.env.HOME ?? '', 'Library/Application Support/TON/bin/ffmpeg');
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '0.35', '-c:a', 'aac', '-b:a', '96k', filePath,
    ]);
  }
  return readFileSync(filePath);
}

function storeObject(key: string, body: Buffer, contentType: string): StoredObject {
  const stored = { body, contentType, etag: sha256(body) };
  objects.set(key, stored);
  return stored;
}

function sendObjectHeaders(response: ServerResponse, stored: StoredObject): void {
  response.setHeader('content-length', String(stored.body.byteLength));
  response.setHeader('content-type', stored.contentType);
  response.setHeader('etag', quoteEtag(stored.etag));
}

function sendList(response: ServerResponse, prefix: string): void {
  const rows = [...objects.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right));
  const contents = rows.map(([key, value]) => (
    `<Contents><Key>${escapeXml(key)}</Key><Size>${value.body.byteLength}</Size></Contents>`
  )).join('');
  response.statusCode = 200;
  response.setHeader('content-type', 'application/xml');
  response.end(`<?xml version="1.0"?><ListBucketResult>${contents}</ListBucketResult>`);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEtag(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '') || null;
}

function quoteEtag(value: string): string {
  return `"${value}"`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseOptions(args: string[]): {
  audioDelayMs: number;
  bucket: string;
  failAudioEvery: number;
  port: number;
  specialNames: boolean;
  tracks: number;
} {
  const readNumber = (name: string, fallback: number): number => {
    const value = args.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
  };
  return {
    audioDelayMs: readNumber('audio-delay-ms', 0),
    bucket: args.find((argument) => argument.startsWith('--bucket='))?.split('=')[1]
      || 'local-test-bucket',
    failAudioEvery: readNumber('fail-audio-every', 0),
    port: readNumber('port', 9462),
    specialNames: args.includes('--special-names'),
    tracks: Math.max(1, readNumber('tracks', 1_600)),
  };
}
