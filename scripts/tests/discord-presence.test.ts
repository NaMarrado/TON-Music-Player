import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SetActivity } from '@xhayper/discord-rpc';
import {
  buildDiscordActivity,
  getDiscordArtworkUrl,
} from '../../packages/desktop/src-main/services/discord-presence/activity.ts';
import type {
  DiscordRpcClient,
} from '../../packages/desktop/src-main/services/discord-presence/rpc-client.ts';
import { DiscordPresenceService } from '../../packages/desktop/src-main/services/discord-presence/service.ts';
import type { DiscordPresencePayload } from '../../packages/desktop/src/shared/discord-presence.ts';

function payload(overrides: Partial<DiscordPresencePayload> = {}): DiscordPresencePayload {
  return {
    capturedAtMs: 1_000_000,
    durationSeconds: 100,
    isPlaying: true,
    positionSeconds: 20,
    track: {
      artist: 'Test Artist',
      id: 1,
      title: 'Test Track',
      youtubeId: 'yHU6g3-35IU',
    },
    ...overrides,
  };
}

class FakeClient implements DiscordRpcClient {
  activities: SetActivity[] = [];
  clearCount = 0;
  destroyed = false;
  disconnected: (() => void) | null = null;
  connectImpl: () => Promise<void> = async () => {};

  connect(): Promise<void> {
    return this.connectImpl();
  }

  onDisconnected(listener: () => void): void {
    this.disconnected = listener;
  }

  async setActivity(activity: SetActivity): Promise<void> {
    this.activities.push(activity);
  }

  async clearActivity(): Promise<void> {
    this.clearCount += 1;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function settle(milliseconds = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  await Promise.resolve();
}

test('builds listening activity with stable playback timestamps and YouTube artwork', () => {
  const activity = buildDiscordActivity(payload(), 1_005_000);
  assert.equal(activity.type, 2);
  assert.equal(activity.details, 'Test Track');
  assert.equal(activity.state, 'Test Artist');
  assert.equal(activity.startTimestamp, 980_000);
  assert.equal(activity.endTimestamp, 1_080_000);
  assert.equal(activity.largeImageKey, 'https://i.ytimg.com/vi/yHU6g3-35IU/hqdefault.jpg');
});

test('paused activity keeps metadata and removes timestamps', () => {
  const activity = buildDiscordActivity(payload({ isPlaying: false }), 1_005_000);
  assert.equal(activity.state, 'Test Artist · Paused');
  assert.equal(activity.startTimestamp, undefined);
  assert.equal(activity.endTimestamp, undefined);
});

test('normalizes missing and oversized text and rejects invalid YouTube IDs', () => {
  const activity = buildDiscordActivity(payload({
    track: {
      artist: null,
      id: 2,
      title: 'x'.repeat(200),
      youtubeId: '../local-file',
    },
  }));
  assert.equal(Array.from(activity.details ?? '').length, 128);
  assert.equal(activity.state, 'Unknown artist');
  assert.equal(activity.largeImageKey, undefined);
  assert.equal(getDiscordArtworkUrl('invalid'), undefined);
});

test('latest desired activity wins while the Discord client is connecting', async () => {
  const gate = deferred();
  const client = new FakeClient();
  client.connectImpl = () => gate.promise;
  const service = new DiscordPresenceService(() => client, 5);

  service.sync(payload());
  service.sync(payload({ track: { artist: 'Second Artist', id: 2, title: 'Second Track', youtubeId: null } }));
  gate.resolve();
  await settle();

  assert.equal(client.activities.length, 1);
  assert.equal(client.activities[0]?.details, 'Second Track');
  await service.dispose();
});

test('deduplicates equal activity and clears it explicitly', async () => {
  const client = new FakeClient();
  const service = new DiscordPresenceService(() => client, 5);
  const current = payload();

  service.sync(current);
  await settle();
  service.sync(current);
  await settle();
  service.clear();
  await settle();

  assert.equal(client.activities.length, 1);
  assert.equal(client.clearCount, 1);
  await service.dispose();
});

test('reconnects after an unavailable Discord client and publishes the latest state', async () => {
  const failed = new FakeClient();
  failed.connectImpl = async () => {
    throw new Error('Discord unavailable');
  };
  const connected = new FakeClient();
  const clients = [failed, connected];
  const service = new DiscordPresenceService(() => clients.shift() ?? connected, 5);

  service.sync(payload());
  await settle(20);

  assert.equal(failed.destroyed, true);
  assert.equal(connected.activities.length, 1);
  await service.dispose();
  assert.equal(connected.destroyed, true);
});
