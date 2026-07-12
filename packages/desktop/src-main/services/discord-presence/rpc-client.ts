import { Client, type SetActivity } from '@xhayper/discord-rpc';
import { TON_DISCORD_APPLICATION_ID } from '../../../src/shared/discord-presence';

export interface DiscordRpcClient {
  clearActivity(): Promise<void>;
  connect(): Promise<void>;
  destroy(): Promise<void>;
  onDisconnected(listener: () => void): void;
  setActivity(activity: SetActivity): Promise<void>;
}

export type DiscordRpcClientFactory = () => DiscordRpcClient;

export class DesktopDiscordRpcClient implements DiscordRpcClient {
  private readonly client = new Client({
    clientId: TON_DISCORD_APPLICATION_ID,
    transport: { type: 'ipc' },
  });

  async connect(): Promise<void> {
    await this.client.login();
  }

  onDisconnected(listener: () => void): void {
    this.client.on('disconnected', listener);
  }

  async setActivity(activity: SetActivity): Promise<void> {
    if (!this.client.user) throw new Error('Discord RPC connected without a user');
    await this.client.user.setActivity(activity);
  }

  async clearActivity(): Promise<void> {
    await this.client.user?.clearActivity();
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}

export const createDesktopDiscordRpcClient: DiscordRpcClientFactory = () => (
  new DesktopDiscordRpcClient()
);
