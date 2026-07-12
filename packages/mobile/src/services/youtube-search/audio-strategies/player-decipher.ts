import { isWebViewReady, waitForWebViewReady } from '../../js-evaluator';
import { getPlayerClient, type GetPlayerClientOptions } from '../client';
import { YouTubeResolverError } from '../errors';

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

export async function decipherCipherUrlStrict(
  strategy: string,
  signatureCipher?: string,
  cipher?: string,
  playerOptions: GetPlayerClientOptions = {},
): Promise<string> {
  try {
    await waitForWebViewReady();
    const result = await maybeDecipherCipherUrl(signatureCipher, cipher, playerOptions);
    if (!result) {
      throw new Error('player returned no URL');
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new YouTubeResolverError({
      canRefresh: true,
      message: `${strategy} cipher decipher failed: ${message}`,
      stage: 'decipher',
      strategy,
    });
  }
}

export async function decipherNParamStrict(
  inputUrl: string,
  strategy: string,
  playerOptions: GetPlayerClientOptions = {},
): Promise<string> {
  const original = new URL(inputUrl);
  const originalN = original.searchParams.get('n');
  if (!originalN) {
    return inputUrl;
  }

  try {
    await waitForWebViewReady();
    const yt = await getPlayerClient(playerOptions);
    const player = yt.session.player;
    if (!player?.data) {
      throw new Error('player runtime unavailable');
    }

    const deciphered = await player.decipher(inputUrl, undefined, undefined, undefined);
    const decipheredUrl = new URL(deciphered);
    const decipheredN = decipheredUrl.searchParams.get('n');
    if (!decipheredN || decipheredN === originalN) {
      throw new Error('n parameter was not transformed');
    }

    console.log(`[YT-AUDIO] ${strategy} n-param deobfuscated`);
    return decipheredUrl.toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new YouTubeResolverError({
      canRefresh: true,
      message: `${strategy} n-param decipher failed: ${message}`,
      stage: 'decipher',
      strategy,
    });
  }
}
