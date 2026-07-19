const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const {
  IOS_BACKGROUND_MODES,
  ensureIosDownloadActivityTarget,
  insertFmtPodfilePatch,
  insertPodsTonLdFlagsPodfilePatch,
  mergeStringArray,
  removeAppTargetInheritedLdFlags,
} = require('./with-ton-ios-build-sources');

const DISABLE_LAZY_BUNDLE_HELPER = `- (NSURL *)tonURLByDisablingLazyBundleLoading:(NSURL *)url
{
  NSURLComponents *components = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
  if (!components) {
    return url;
  }

  NSMutableArray<NSURLQueryItem *> *queryItems = [NSMutableArray array];
  BOOL replacedLazy = NO;

  for (NSURLQueryItem *item in components.queryItems ?: @[]) {
    if ([item.name isEqualToString:@"lazy"]) {
      [queryItems addObject:[[NSURLQueryItem alloc] initWithName:@"lazy" value:@"false"]];
      replacedLazy = YES;
    } else {
      [queryItems addObject:item];
    }
  }

  if (!replacedLazy) {
    [queryItems addObject:[[NSURLQueryItem alloc] initWithName:@"lazy" value:@"false"]];
  }

  components.queryItems = queryItems;
  return components.URL ?: url;
}

`;

function disableIosDebugLazyBundleLoading(contents) {
  let nextContents = contents;

  if (!nextContents.includes('- (NSURL *)tonURLByDisablingLazyBundleLoading:(NSURL *)url')) {
    const anchor = '- (NSURL *)bundleURL\n';
    const index = nextContents.indexOf(anchor);
    if (index === -1) {
      throw new Error('Unable to find bundleURL method in iOS AppDelegate.');
    }

    nextContents = `${nextContents.slice(0, index)}${DISABLE_LAZY_BUNDLE_HELPER}${nextContents.slice(index)}`;
  }

  const lazyPatchedReturn = `NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  return [self tonURLByDisablingLazyBundleLoading:bundleURL];`;
  nextContents = nextContents.replace(
    'return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];',
    lazyPatchedReturn,
  );

  return nextContents;
}

function withTonIosBuild(config) {
  const withInfoPlistConfig = withInfoPlist(config, (mod) => {
    mod.modResults.UIBackgroundModes = mergeStringArray(
      mod.modResults.UIBackgroundModes,
      IOS_BACKGROUND_MODES,
    );
    mod.modResults.NSSupportsLiveActivities = true;

    return mod;
  });

  const withXcodeProjectConfig = withXcodeProject(withInfoPlistConfig, (mod) => {
    mod.modResults = removeAppTargetInheritedLdFlags(mod.modResults);
    mod.modResults = ensureIosDownloadActivityTarget(
      mod.modResults,
      mod.ios?.bundleIdentifier ?? 'cz.ton.player',
    );
    return mod;
  });

  return withDangerousMod(withXcodeProjectConfig, [
    'ios',
    async (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        const contents = fs.readFileSync(podfilePath, 'utf8');
        let patchedContents = insertFmtPodfilePatch(contents);
        patchedContents = insertPodsTonLdFlagsPodfilePatch(patchedContents);
        if (patchedContents !== contents) {
          fs.writeFileSync(podfilePath, patchedContents);
        }
      }

      const appDelegatePath = path.join(mod.modRequest.platformProjectRoot, 'TON', 'AppDelegate.mm');
      if (fs.existsSync(appDelegatePath)) {
        const contents = fs.readFileSync(appDelegatePath, 'utf8');
        const patchedContents = disableIosDebugLazyBundleLoading(contents);
        if (patchedContents !== contents) {
          fs.writeFileSync(appDelegatePath, patchedContents);
        }
      }

      return mod;
    },
  ]);
}

module.exports = withTonIosBuild;
