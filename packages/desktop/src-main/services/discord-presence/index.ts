import { createDesktopDiscordRpcClient } from './rpc-client';
import { DiscordPresenceService } from './service';

let service: DiscordPresenceService | null = null;

export function getDiscordPresenceService(): DiscordPresenceService {
  service ??= new DiscordPresenceService(createDesktopDiscordRpcClient);
  return service;
}

export async function disposeDiscordPresenceService(): Promise<void> {
  const activeService = service;
  service = null;
  await activeService?.dispose();
}

export {
  buildDiscordActivity,
  getDiscordArtworkUrl,
  getDiscordPresenceFingerprint,
} from './activity';
export { DiscordPresenceService } from './service';
export type { DiscordRpcClient, DiscordRpcClientFactory } from './rpc-client';
