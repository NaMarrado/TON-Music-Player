export const EVALUATOR_SCRIPT = `// ========== Cipher Evaluation (existing) ==========
window.__evaluatePlayerScript = function(requestId, scriptCode, envJson) {
  try {
    var __rnBridge = window.ReactNativeWebView;
    var __env = JSON.parse(envJson);
    var __directResult = null;
    var __directError = null;
    var __patchedResult = null;
    var __patchedError = null;
    var __fallbackResult = null;
    var __fallbackError = null;
    var __keys = Object.keys(__env);
    var __nsigProcessorMethodBlock = '  const proto = Object.getPrototypeOf(urlCtor);\\n' +
      '  const properties = Object.getOwnPropertyNames(proto);\\n' +
      '  const methodBlacklist = [\\'constructor\\', \\'clone\\', \\'set\\', \\'get\\'];\\n' +
      '\\n' +
      '  for (const prop of properties) {\\n' +
      '    if (methodBlacklist.includes(prop))\\n' +
      '      continue;\\n' +
      '\\n' +
      '    if (typeof urlCtor[prop] === \\'function\\')\\n' +
      '      urlCtor[prop]();\\n' +
      '  }\\n' +
      '\\n';

    try {
      __directResult = new Function(scriptCode)();
      if (!__directResult || typeof __directResult !== 'object' || Array.isArray(__directResult)) {
        throw new Error('direct result is not an object');
      }
      for (var __emptyIndex = 0; __emptyIndex < __keys.length; __emptyIndex++) {
        var __emptyKey = __keys[__emptyIndex];
        if (__env[__emptyKey] === '' && typeof __directResult[__emptyKey] !== 'string') {
          __directResult[__emptyKey] = '';
        }
      }
    } catch (__e) {
      __directError = __e;
      __directResult = null;
    }

    var __result = __directResult || {};
    var __missingDirectKey = null;
    for (var __d = 0; __d < __keys.length; __d++) {
      var __directKey = __keys[__d];
      if (__directKey !== 'sp' && typeof __env[__directKey] === 'string' && typeof __result[__directKey] !== 'string') {
        __missingDirectKey = __directKey;
        break;
      }
    }

    if (__missingDirectKey) {
      try {
        if (scriptCode.indexOf(__nsigProcessorMethodBlock) !== -1) {
          var __patchedScriptCode = scriptCode.replace(
            __nsigProcessorMethodBlock,
            '  // React Native WebView can break some extracted URL prototype helpers.\\n'
          );
          __patchedResult = new Function(__patchedScriptCode)();
          if (!__patchedResult || typeof __patchedResult !== 'object' || Array.isArray(__patchedResult)) {
            throw new Error('patched result is not an object');
          }
          for (var __patchedEmptyIndex = 0; __patchedEmptyIndex < __keys.length; __patchedEmptyIndex++) {
            var __patchedEmptyKey = __keys[__patchedEmptyIndex];
            if (__env[__patchedEmptyKey] === '' && typeof __patchedResult[__patchedEmptyKey] !== 'string') {
              __patchedResult[__patchedEmptyKey] = '';
            }
          }
          var __missingPatchedKey = null;
          for (var __p = 0; __p < __keys.length; __p++) {
          var __patchedKey = __keys[__p];
            if (__patchedKey !== 'sp' && typeof __env[__patchedKey] === 'string' && typeof __patchedResult[__patchedKey] !== 'string') {
              __missingPatchedKey = __patchedKey;
              break;
            }
          }
          if (!__missingPatchedKey) {
            __result = __patchedResult;
            __missingDirectKey = null;
          }
        }
      } catch (__patchedErrorValue) {
        __patchedError = __patchedErrorValue;
      }
    }

    if (__missingDirectKey) {
      try {
        var __exported = new Function(
          scriptCode + '\\nreturn typeof exportedVars !== "undefined" ? exportedVars : undefined;'
        )();
        __fallbackResult = {};
        for (var __i = 0; __i < __keys.length; __i++) {
          var __k = __keys[__i];
          if (__exported && typeof __exported[__k] === 'function') {
            __fallbackResult[__k] = __exported[__k](__env[__k]);
          }
          if (__env[__k] === '' && typeof __fallbackResult[__k] !== 'string') {
            __fallbackResult[__k] = '';
          }
        }
        __result = __fallbackResult;
      } catch (__e2) {
        __fallbackError = __e2;
      }
    }

    for (var __i = 0; __i < __keys.length; __i++) {
      var __missingKey = __keys[__i];
      if (__missingKey !== 'sp' && typeof __env[__missingKey] === 'string' && typeof __result[__missingKey] !== 'string') {
        var __envSummary = {};
        for (var __summaryIndex = 0; __summaryIndex < __keys.length; __summaryIndex++) {
          var __summaryKey = __keys[__summaryIndex];
          var __summaryValue = __env[__summaryKey];
          __envSummary[__summaryKey] = typeof __summaryValue === 'string'
            ? 'string(' + __summaryValue.length + ')'
            : String(__summaryValue);
        }
        throw new Error(
          'WebView player evaluator missing ' + __missingKey +
          '; env=' + JSON.stringify(__envSummary) +
          '; directKeys=' + JSON.stringify(Object.keys(__directResult || {})) +
          '; patchedKeys=' + JSON.stringify(Object.keys(__patchedResult || {})) +
          '; fallbackKeys=' + JSON.stringify(Object.keys(__fallbackResult || {})) +
          '; directError=' + (__directError ? (__directError.message || String(__directError)) : '') +
          '; patchedError=' + (__patchedError ? (__patchedError.message || String(__patchedError)) : '') +
          '; fallbackError=' + (__fallbackError ? (__fallbackError.message || String(__fallbackError)) : '')
        );
      }
    }
    __rnBridge.postMessage(JSON.stringify({ id: requestId, result: __result }));
  } catch(e) {
    __rnBridge.postMessage(JSON.stringify({ id: requestId, error: e.message || String(e) }));
  }
};`;
