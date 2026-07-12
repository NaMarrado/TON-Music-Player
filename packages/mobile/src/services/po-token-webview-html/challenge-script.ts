export const CHALLENGE_SCRIPT = `// ========== Challenge Fetcher ==========
async function fetchChallenge() {
  var resp = await fetch(CREATE_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY])
  });
  if (!resp.ok) throw new Error('Challenge fetch failed: ' + resp.status);
  var raw = await resp.json();

  var challengeData = [];
  if (raw.length > 1 && typeof raw[1] === 'string') {
    challengeData = JSON.parse(descramble(raw[1]) || '[]');
  } else if (raw.length && typeof raw[0] === 'object') {
    challengeData = raw[0];
  }

  var wrappedScript = challengeData[1];
  var program = challengeData[4];
  var globalName = challengeData[5];

  var scriptValue = Array.isArray(wrappedScript)
    ? wrappedScript.find(function(v) { return v && typeof v === 'string'; })
    : (typeof wrappedScript === 'string' ? wrappedScript : null);

  return {
    interpreterJavascript: scriptValue,
    program: program,
    globalName: globalName
  };
}`;
