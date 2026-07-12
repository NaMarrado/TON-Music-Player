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

  throw new Error('BotGuard did not provide a usable po_token minter');
}

var poTokenGeneratorState = null;
var poTokenGeneratorPromise = null;

async function createPoTokenGeneratorState() {
  var challenge = await fetchChallenge();
  log('Challenge: JS=' + (challenge.interpreterJavascript ? challenge.interpreterJavascript.length + 'ch' : 'null') +
    ', prog=' + (challenge.program ? String(challenge.program).substring(0,30) + '...' : 'null') +
    ', name=' + challenge.globalName);

  if (!challenge.interpreterJavascript) {
    throw new Error('No interpreter JS in challenge');
  }

  var bgResult = await runBotGuard(challenge.interpreterJavascript, challenge.program, challenge.globalName);
  log('BotGuard done: response=' + (bgResult.botguardResponse ? bgResult.botguardResponse.length + 'ch' : 'null') +
    ', webPoSO=' + bgResult.webPoSignalOutput.length);

  var itData = await getIntegrityToken(bgResult.botguardResponse);
  var ttlSecs = itData.estimatedTtlSecs || 21600;
  return {
    expiresAt: Date.now() + Math.max(60, ttlSecs - 600) * 1000,
    integrityTokenData: itData,
    webPoSignalOutput: bgResult.webPoSignalOutput
  };
}

async function getPoTokenGeneratorState() {
  if (poTokenGeneratorState && poTokenGeneratorState.expiresAt > Date.now()) {
    return poTokenGeneratorState;
  }

  if (!poTokenGeneratorPromise) {
    poTokenGeneratorPromise = createPoTokenGeneratorState()
      .then(function(state) {
        poTokenGeneratorState = state;
        return state;
      })
      .finally(function() {
        poTokenGeneratorPromise = null;
      });
  }

  return poTokenGeneratorPromise;
}

window.__resetPoTokenGenerator = function() {
  poTokenGeneratorState = null;
  poTokenGeneratorPromise = null;
};

// ========== Main Generation Flow ==========
window.__generatePoToken = async function(requestId, existingVisitorData, tokenIdentifier, binding, videoId) {
  try {
    var visitorData = existingVisitorData || generateVisitorData();
    var identifier = tokenIdentifier || visitorData;
    var tokenBinding = binding === 'video' ? 'video' : 'session';
    log('Starting ' + tokenBinding + ' po_token generation, visitorData=' + visitorData.substring(0, 20) + ', identifier=' + identifier.substring(0, 20) + '...');

    // One BotGuard integrity/minter session must mint both GVS and player tokens.
    var generatorState = await getPoTokenGeneratorState();
    var poToken = await mintPoToken(
      generatorState.integrityTokenData,
      generatorState.webPoSignalOutput,
      identifier
    );
    log('po_token generated: ' + poToken.substring(0, 30) + '... (' + poToken.length + 'ch)');

    // Step 6: Send result back
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'po_token_result',
      id: requestId,
      binding: tokenBinding,
      poToken: poToken,
      visitorData: visitorData,
      videoId: videoId || undefined,
      ttlSecs: Math.max(60, Math.floor((generatorState.expiresAt - Date.now()) / 1000))
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
