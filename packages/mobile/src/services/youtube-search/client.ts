import { Innertube } from 'youtubei.js';
import { getPoToken, isPoTokenReady } from '../po-token-service';
import { getErrorMessage } from './errors';
import { patchEval, patchParserCompatibility } from './patches';

let searchClient: Innertube | null = null;
let playerClient: Innertube | null = null;
let playerClientCacheKey: string | null = null;

export interface GetPlayerClientOptions {
  cacheKey?: string;
  poToken?: string;
  useSessionPoToken?: boolean;
  visitorData?: string;
}

export async function getSearchClient(): Promise<Innertube> {
  patchParserCompatibility();

  if (!searchClient) {
    searchClient = await Innertube.create({
      retrieve_player: false,
    });
  }

  return searchClient;
}

export async function getPlayerClient(
  options: GetPlayerClientOptions = {},
): Promise<Innertube> {
  patchEval();

  let poToken = options.poToken;
  let visitorData = options.visitorData;

  if (!poToken && options.useSessionPoToken && isPoTokenReady()) {
    try {
      const token = await getPoToken({ binding: 'session', visitorData });
      poToken = token.poToken;
      visitorData = token.visitorData;
      console.log(
        '[YT] Got session po_token:',
        `${poToken.slice(0, 20)}...`,
        'visitorData:',
        `${visitorData.slice(0, 20)}...`,
      );
    } catch (error) {
      console.warn('[YT] Failed to get session po_token:', getErrorMessage(error));
    }
  }

  const cacheKey = options.cacheKey
    ?? `${visitorData ?? ''}:${poToken ?? ''}`;

  if (!playerClient || playerClientCacheKey !== cacheKey) {
    console.log('[YT] Creating player client with po_token + retrieve_player: true');

    playerClient = await Innertube.create({
      retrieve_player: true,
      po_token: poToken,
      visitor_data: visitorData,
    });
    console.log(
      '[YT] Player client created, player:',
      !!playerClient.session.player,
      'po_token:',
      !!poToken,
    );
    playerClientCacheKey = cacheKey;
  } else if (playerClient.session.player) {
    playerClient.session.player.po_token = poToken;
  }

  return playerClient;
}

export function resetPlayerClient(): void {
  playerClient = null;
  playerClientCacheKey = null;
}
