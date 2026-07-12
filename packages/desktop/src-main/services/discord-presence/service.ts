import type { DiscordPresencePayload } from '../../../src/shared/discord-presence';
import { buildDiscordActivity, getDiscordPresenceFingerprint } from './activity';
import type { DiscordRpcClient, DiscordRpcClientFactory } from './rpc-client';

const DEFAULT_RECONNECT_DELAY_MS = 15_000;

export class DiscordPresenceService {
  private readonly createClient: DiscordRpcClientFactory;
  private readonly reconnectDelayMs: number;
  private client: DiscordRpcClient | null = null;
  private connecting: Promise<void> | null = null;
  private desired: DiscordPresencePayload | null = null;
  private desiredRevision = 0;
  private appliedRevision = -1;
  private appliedFingerprint: string | null = null;
  private flushPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    createClient: DiscordRpcClientFactory,
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  ) {
    this.createClient = createClient;
    this.reconnectDelayMs = reconnectDelayMs;
  }

  sync(payload: DiscordPresencePayload): void {
    if (this.disposed) return;
    this.desired = payload;
    this.desiredRevision += 1;
    void this.flush();
  }

  clear(): void {
    if (this.disposed) return;
    this.desired = null;
    this.desiredRevision += 1;
    this.cancelReconnect();
    void this.flush();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.desired = null;
    this.cancelReconnect();

    const client = this.client;
    this.client = null;
    if (!client) return;

    await client.clearActivity().catch(() => {});
    await client.destroy().catch(() => {});
  }

  private async flush(): Promise<void> {
    if (this.flushPromise || this.disposed) return this.flushPromise ?? undefined;

    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = null;
      if (
        !this.disposed
        && !this.reconnectTimer
        && this.appliedRevision !== this.desiredRevision
      ) {
        void this.flush();
      }
    });
    return this.flushPromise;
  }

  private async runFlush(): Promise<void> {
    while (!this.disposed && this.appliedRevision !== this.desiredRevision) {
      const revision = this.desiredRevision;
      const desired = this.desired;

      if (!desired) {
        if (this.client) await this.client.clearActivity().catch(() => {});
        this.appliedFingerprint = null;
        this.appliedRevision = revision;
        continue;
      }

      const connected = await this.ensureConnected();
      if (!connected || !this.client || this.disposed) return;
      if (revision !== this.desiredRevision || desired !== this.desired) continue;

      const fingerprint = getDiscordPresenceFingerprint(desired);
      if (fingerprint !== this.appliedFingerprint) {
        try {
          const activity = buildDiscordActivity(desired);
          await this.client.setActivity(activity);
          this.appliedFingerprint = fingerprint;
        } catch {
          await this.handleDisconnectedClient(this.client);
          return;
        }
      }
      this.appliedRevision = revision;
    }
  }

  private async ensureConnected(): Promise<boolean> {
    if (this.client) return true;
    if (this.connecting) {
      await this.connecting;
      return this.client !== null;
    }

    const candidate = this.createClient();
    candidate.onDisconnected(() => {
      if (this.client === candidate) void this.handleDisconnectedClient(candidate);
    });

    this.connecting = candidate.connect()
      .then(() => {
        if (this.disposed) return candidate.destroy();
        this.client = candidate;
        this.appliedFingerprint = null;
      })
      .catch(async () => {
        await candidate.destroy().catch(() => {});
        this.scheduleReconnect();
      })
      .finally(() => {
        this.connecting = null;
      });

    await this.connecting;
    return this.client !== null;
  }

  private async handleDisconnectedClient(client: DiscordRpcClient): Promise<void> {
    if (this.client !== client) return;
    this.client = null;
    this.appliedFingerprint = null;
    await client.destroy().catch(() => {});
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.desired || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.flush();
    }, this.reconnectDelayMs);
  }

  private cancelReconnect(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
