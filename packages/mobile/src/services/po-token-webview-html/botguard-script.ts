export const BOTGUARD_SCRIPT = `// ========== BotGuard Client ==========
async function runBotGuard(interpreterJs, program, globalName) {
  // Load interpreter via <script> tag — BotGuard checks document.scripts
  log('Loading interpreter via script tag...');
  var previousScript = document.getElementById('bg-interpreter');
  if (previousScript) previousScript.remove();
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.id = 'bg-interpreter';
  script.textContent = interpreterJs;
  document.head.appendChild(script);

  // Allow event loop to process BotGuard init
  await new Promise(function(r) { setTimeout(r, 100); });

  var vm = window[globalName];
  if (!vm) throw new Error('VM not found at window.' + globalName);
  if (!vm.a) throw new Error('VM init function not found');
  log('VM available, keys: ' + Object.keys(vm).join(','));

  var deferred = new DeferredPromise();
  var webPoSignalOutput = [];

  var vmFunctionsCallback = function(asyncSnapshotFn, shutdownFn, passEventFn, checkCameraFn) {
    log('vmFunctionsCallback received: async=' + typeof asyncSnapshotFn);
    deferred.resolve({
      asyncSnapshotFunction: asyncSnapshotFn,
      shutdownFunction: shutdownFn,
      passEventFunction: passEventFn,
      checkCameraFunction: checkCameraFn
    });
  };

  try {
    var userInteractionElement = document.getElementById('bg-container') || document.body;
    var syncResult = vm.a(program, vmFunctionsCallback, true, userInteractionElement, function(){}, [[], []]);
    log('vm.a() returned: type=' + typeof syncResult + (Array.isArray(syncResult) ? ', len=' + syncResult.length : ''));
  } catch (e) {
    throw new Error('VM init failed: ' + e.message);
  }

  var vmFunctions = await Promise.race([
    deferred.promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('VM functions timeout (5s)')); }, 5000);
    })
  ]);

  if (!vmFunctions.asyncSnapshotFunction) {
    throw new Error('No async snapshot function returned');
  }

  // Call snapshot with webPoSignalOutput — BotGuard VM should populate it
  log('Calling asyncSnapshotFunction...');
  var botguardResponse = await new Promise(function(resolve, reject) {
    Promise.race([
      new Promise(function(res) {
        vmFunctions.asyncSnapshotFunction(function(response) {
          log('Snapshot done, response len=' + (response ? response.length : 0) + ', webPoSO len=' + webPoSignalOutput.length);
          res(response);
        }, [
          undefined, // contentBinding
          undefined, // signedTimestamp
          webPoSignalOutput, // VM populates this with minter factory
          undefined  // skipPrivacyBuffer
        ]);
      }),
      new Promise(function(_, rej) {
        setTimeout(function() { rej(new Error('Snapshot timeout (10s)')); }, 10000);
      })
    ]).then(resolve, reject);
  });

  return { botguardResponse: botguardResponse, webPoSignalOutput: webPoSignalOutput };
}`;
