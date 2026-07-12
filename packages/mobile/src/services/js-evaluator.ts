import type WebView from 'react-native-webview';

type BuildScriptResult = {
  exported?: string[];
  output: string;
};

type PendingRequest = {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type EvaluatorPrimitive = string | number | boolean | null | undefined;
type EvaluatorResult = Record<string, unknown>;

const NSIG_PROCESSOR_METHOD_BLOCK = `  const proto = Object.getPrototypeOf(urlCtor);
  const properties = Object.getOwnPropertyNames(proto);
  const methodBlacklist = ['constructor', 'clone', 'set', 'get'];

  for (const prop of properties) {
    if (methodBlacklist.includes(prop))
      continue;

    if (typeof urlCtor[prop] === 'function')
      urlCtor[prop]();
  }

`;

let webViewRef: WebView | null = null;
const pendingRequests = new Map<string, PendingRequest>();
const readyWaiters = new Set<() => void>();
let requestId = 0;

export function registerWebView(ref: WebView | null) {
  webViewRef = ref;
  if (!ref) {
    return;
  }

  for (const resolve of readyWaiters) {
    resolve();
  }
  readyWaiters.clear();
}

export function isWebViewReady(): boolean {
  return webViewRef !== null;
}

export function waitForWebViewReady(timeoutMs = 5000): Promise<void> {
  if (webViewRef) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const complete = () => {
      readyWaiters.delete(complete);
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = setTimeout(() => {
      readyWaiters.delete(complete);
      reject(new Error('WebView evaluator not ready'));
    }, timeoutMs);

    readyWaiters.add(complete);
  });
}

export function handleWebViewMessage(data: string) {
  try {
    const msg = JSON.parse(data);
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;
    pendingRequests.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  } catch {
    // ignore malformed messages
  }
}

function getMissingResultKey(
  result: EvaluatorResult,
  env: Record<string, EvaluatorPrimitive>,
): string | null {
  return Object.keys(env).find((key) => (
    key !== 'sp' && typeof env[key] === 'string' && typeof result[key] !== 'string'
  )) ?? null;
}

function normalizeEmptyStringResults(
  result: EvaluatorResult,
  env: Record<string, EvaluatorPrimitive>,
): EvaluatorResult {
  for (const key of Object.keys(env)) {
    if (env[key] === '' && typeof result[key] !== 'string') {
      result[key] = '';
    }
  }

  return result;
}

function summarizeEvaluatorEnv(env: Record<string, EvaluatorPrimitive>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      typeof value === 'string' ? `string(${value.length})` : String(value),
    ]),
  ));
}

function asEvaluatorResult(value: unknown): EvaluatorResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Player evaluator returned ${typeof value}`);
  }

  return value as EvaluatorResult;
}

function evaluateDirect(data: BuildScriptResult): EvaluatorResult {
  return asEvaluatorResult(new Function(data.output)());
}

function evaluateWithoutNsigPrototypeCalls(data: BuildScriptResult): EvaluatorResult | null {
  if (!data.output.includes(NSIG_PROCESSOR_METHOD_BLOCK)) {
    return null;
  }

  const patchedOutput = data.output.replace(
    NSIG_PROCESSOR_METHOD_BLOCK,
    '  // React Native WebView can break some extracted URL prototype helpers.\n',
  );
  return asEvaluatorResult(new Function(patchedOutput)());
}

function evaluateViaExportedVars(
  data: BuildScriptResult,
  env: Record<string, EvaluatorPrimitive>,
): EvaluatorResult {
  const evaluator = new Function(
    '__env',
    `${data.output}
const __result = {};
const __keys = Object.keys(__env);
for (let __i = 0; __i < __keys.length; __i++) {
  const __k = __keys[__i];
  if (typeof exportedVars !== 'undefined' && typeof exportedVars[__k] === 'function') {
    __result[__k] = exportedVars[__k](__env[__k]);
  }
}
return __result;`,
  ) as (input: Record<string, EvaluatorPrimitive>) => EvaluatorResult;

  return asEvaluatorResult(evaluator(env));
}

function evaluatePlayerScriptLocally(
  data: BuildScriptResult,
  env: Record<string, EvaluatorPrimitive>,
): EvaluatorResult {
  let directResult: EvaluatorResult | null = null;
  let directError: unknown = null;
  let patchedResult: EvaluatorResult | null = null;
  let patchedError: unknown = null;

  try {
    directResult = evaluateDirect(data);
    normalizeEmptyStringResults(directResult, env);
    const missingKey = getMissingResultKey(directResult, env);
    if (!missingKey) {
      return directResult;
    }
  } catch (error) {
    directError = error;
  }

  try {
    patchedResult = evaluateWithoutNsigPrototypeCalls(data);
    if (patchedResult) {
      normalizeEmptyStringResults(patchedResult, env);
      const missingKey = getMissingResultKey(patchedResult, env);
      if (!missingKey) {
        return patchedResult;
      }
    }
  } catch (error) {
    patchedError = error;
  }

  let fallbackResult: EvaluatorResult | null = null;
  let fallbackError: unknown = null;
  try {
    fallbackResult = evaluateViaExportedVars(data, env);
    normalizeEmptyStringResults(fallbackResult, env);
    const missingKey = getMissingResultKey(fallbackResult, env);
    if (!missingKey) {
      return fallbackResult;
    }
  } catch (error) {
    fallbackError = error;
  }

  const result = fallbackResult ?? patchedResult ?? directResult ?? {};
  const missingKey = getMissingResultKey(result, env);
  if (missingKey) {
    throw new Error(
      `Player evaluator missing ${missingKey}; env=${summarizeEvaluatorEnv(env)}; exported=${JSON.stringify(data.exported ?? [])}; directKeys=${JSON.stringify(Object.keys(directResult ?? {}))}; patchedKeys=${JSON.stringify(Object.keys(patchedResult ?? {}))}; fallbackKeys=${JSON.stringify(Object.keys(fallbackResult ?? {}))}`,
    );
  }

  throw new Error(
    `Player evaluator failed; direct=${directError instanceof Error ? directError.message : String(directError)}; patched=${patchedError instanceof Error ? patchedError.message : String(patchedError)}; fallback=${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
  );
}

/**
 * Evaluate a youtubei.js player script in the hidden WebView.
 *
 * data.output is a JS string that defines `exportedVars` —
 * an object with wrapper functions (e.g. sig(input), n(input)).
 *
 * env maps function names to input values (e.g. { sig: "encrypted", n: "token" }).
 *
 * We execute the script, call each exported function with its env input,
 * and return the results (e.g. { sig: "deciphered", n: "transformed" }).
 */
export function evaluatePlayerScript(
  data: BuildScriptResult,
  env: Record<string, EvaluatorPrimitive>,
): Promise<Record<string, unknown>> {
  let localError: unknown = null;
  try {
    return Promise.resolve(evaluatePlayerScriptLocally(data, env));
  } catch (error) {
    localError = error;
    // Hermes can run this today, but keep the WebView path as a platform fallback.
  }

  return new Promise((resolve, reject) => {
    if (!webViewRef) {
      reject(localError instanceof Error ? localError : new Error('WebView evaluator not ready'));
      return;
    }

    const id = `eval_${++requestId}`;
    pendingRequests.set(id, { resolve, reject });

    const idJson = JSON.stringify(id);
    const outputJson = JSON.stringify(data.output);
    const envJson = JSON.stringify(JSON.stringify(env));

    const script = `
(function() {
  var __rnBridge = window.ReactNativeWebView;
  try {
    if (typeof window.__evaluatePlayerScript !== 'function') {
      throw new Error('WebView player evaluator unavailable');
    }
    window.__evaluatePlayerScript(${idJson}, ${outputJson}, ${envJson});
  } catch(__e) {
    __rnBridge.postMessage(JSON.stringify({ id: ${idJson}, error: __e.message || String(__e) }));
  }
})();
true;`;

    webViewRef.injectJavaScript(script);

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('WebView eval timed out after 30s'));
      }
    }, 30000);
  });
}
