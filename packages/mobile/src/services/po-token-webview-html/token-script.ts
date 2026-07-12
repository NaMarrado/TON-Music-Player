export const TOKEN_SCRIPT = `// ========== Integrity Token ==========
async function getIntegrityToken(botguardResponse) {
  var resp = await fetch(GENERATE_IT_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse])
  });
  if (!resp.ok) throw new Error('GenerateIT failed: ' + resp.status);
  var json = await resp.json();
  log('GenerateIT: token=' + (json[0] ? 'present(' + json[0].length + ')' : 'null') + ', ttl=' + json[1] + ', fallback=' + (json[3] ? 'present(' + json[3].length + ')' : 'null'));
  return {
    integrityToken: json[0],
    estimatedTtlSecs: json[1],
    mintRefreshThreshold: json[2],
    websafeFallbackToken: json[3]
  };
}

// ========== WebPo Minter ==========
async function mintPoToken(integrityTokenData, webPoSignalOutput, identifier) {
  // Primary: use webPoSignalOutput minter if available
  var getMinter = webPoSignalOutput[0];
  if (getMinter && integrityTokenData.integrityToken) {
    log('Minting via webPoSignalOutput[0]...');
    var mintCallback = await getMinter(base64ToU8(integrityTokenData.integrityToken));
    if (typeof mintCallback !== 'function') throw new Error('APF:Failed - minter is not a function');
    var result = await mintCallback(new TextEncoder().encode(identifier));
    if (!result) throw new Error('YNJ:Undefined - mint returned nothing');
    return u8ToBase64(result, true);
  }

  // Fallback: use websafeFallbackToken directly as po_token
  if (integrityTokenData.websafeFallbackToken) {
    log('Using websafeFallbackToken as po_token fallback');
    return integrityTokenData.websafeFallbackToken;
  }

  throw new Error('No minter (' + (getMinter ? 'has getMinter' : 'no getMinter') + ') and no fallback token');
}

// ========== Main Generation Flow ==========
window.__generatePoToken = async function(requestId, existingVisitorData, tokenIdentifier, binding, videoId) {
  try {
    var visitorData = existingVisitorData || generateVisitorData();
    var identifier = tokenIdentifier || visitorData;
    var tokenBinding = binding === 'video' ? 'video' : 'session';
    log('Starting ' + tokenBinding + ' po_token generation, visitorData=' + visitorData.substring(0, 20) + ', identifier=' + identifier.substring(0, 20) + '...');

    // Step 1: Fetch challenge
    var challenge = await fetchChallenge();
    log('Challenge: JS=' + (challenge.interpreterJavascript ? challenge.interpreterJavascript.length + 'ch' : 'null') +
      ', prog=' + (challenge.program ? String(challenge.program).substring(0,30) + '...' : 'null') +
      ', name=' + challenge.globalName);

    if (!challenge.interpreterJavascript) {
      throw new Error('No interpreter JS in challenge');
    }

    // Step 2+3: Run BotGuard (loads interpreter + runs VM)
    var bgResult = await runBotGuard(challenge.interpreterJavascript, challenge.program, challenge.globalName);
    log('BotGuard done: response=' + (bgResult.botguardResponse ? bgResult.botguardResponse.length + 'ch' : 'null') +
      ', webPoSO=' + bgResult.webPoSignalOutput.length);

    // Step 4: Get integrity token
    var itData = await getIntegrityToken(bgResult.botguardResponse);

    // Step 5: Mint po_token (or use fallback)
    var poToken = await mintPoToken(itData, bgResult.webPoSignalOutput, identifier);
    log('po_token generated: ' + poToken.substring(0, 30) + '... (' + poToken.length + 'ch)');

    // Step 6: Send result back
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'po_token_result',
      id: requestId,
      binding: tokenBinding,
      poToken: poToken,
      visitorData: visitorData,
      videoId: videoId || undefined,
      ttlSecs: itData.estimatedTtlSecs || 21600
    }));
  } catch (e) {
    log('FAILED: ' + (e.message || String(e)));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'po_token_error',
      id: requestId,
      error: e.message || String(e)
    }));
  }
};`;
