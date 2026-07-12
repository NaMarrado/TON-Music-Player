import { isWebViewReady } from '../../js-evaluator';
import { getPlayerClient, type GetPlayerClientOptions } from '../client';

export async function maybeDecipherCipherUrl(
  signatureCipher?: string,
  cipher?: string,
  playerOptions: GetPlayerClientOptions = {},
): Promise<string | undefined> {
  if (!isWebViewReady()) {
    return undefined;
  }

  const yt = await getPlayerClient(playerOptions);
  const player = yt.session.player;
  if (!player?.data) {
    return undefined;
  }

  const deciphered = await player.decipher(
    undefined,
    signatureCipher ?? undefined,
    cipher ?? undefined,
    undefined,
  );

  try {
    const url = new URL(deciphered);
    return url.toString();
  } catch {
    return deciphered;
  }
}

export async function maybeDecipherNParam(
  inputUrl: string,
  logLabel: string,
  playerOptions: GetPlayerClientOptions = {},
): Promise<string> {
  const url = new URL(inputUrl);
  const nParam = url.searchParams.get('n');
  if (!nParam || !isWebViewReady()) {
    return inputUrl;
  }

  try {
    const yt = await getPlayerClient(playerOptions);
    const player = yt.session.player;
    if (!player?.data) {
      return inputUrl;
    }

    const deciphered = await player.decipher(inputUrl, undefined, undefined, undefined);
    const decipheredUrl = new URL(deciphered);
    const newN = decipheredUrl.searchParams.get('n');
    if (newN && newN !== nParam) {
      console.log(`[YT-AUDIO] ${logLabel} n-param deobfuscated`);
      return decipheredUrl.toString();
    }
  } catch {
    // Non-fatal.
  }

  return inputUrl;
}
