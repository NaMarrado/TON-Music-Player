const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = path.resolve(__dirname);
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  'react-native',
  'require',
  'import',
];

// Force single React instance — desktop uses React 19, mobile uses React 18.
// Without this, pnpm nests React 19 inside shared packages (react-i18next, zustand, etc.)
// causing "Invalid hook call" / dual-React errors at runtime.
const reactRoot = path.resolve(monorepoRoot, 'node_modules/react');
const singletonPaths = {
  react: path.resolve(reactRoot, 'index.js'),
  'react/jsx-runtime': path.resolve(reactRoot, 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.resolve(reactRoot, 'jsx-dev-runtime.js'),
};

// Apply NativeWind FIRST so its resolver is part of the chain,
// THEN wrap the complete chain with our singleton resolver.
const nativeWindConfig = withNativeWind(config, { input: './src/global.css' });

const wrappedResolveRequest = nativeWindConfig.resolver.resolveRequest;
nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletonPaths[moduleName]) {
    return { type: 'sourceFile', filePath: singletonPaths[moduleName] };
  }
  if (wrappedResolveRequest) {
    return wrappedResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

const existingEnhanceMiddleware = nativeWindConfig.server?.enhanceMiddleware;
nativeWindConfig.server = {
  ...nativeWindConfig.server,
  enhanceMiddleware: (middleware, server) => {
    const enhancedMiddleware = existingEnhanceMiddleware
      ? existingEnhanceMiddleware(middleware, server)
      : middleware;

    return (req, res, next) => {
      if (typeof req.url === 'string') {
        try {
          const url = new URL(req.url, 'http://localhost');
          if (
            url.pathname.endsWith('.bundle') &&
            url.searchParams.get('platform') === 'ios' &&
            url.searchParams.get('lazy') === 'true'
          ) {
            url.searchParams.set('lazy', 'false');
            req.url = `${url.pathname}${url.search}${url.hash}`;
          }
        } catch {
          // Keep Metro's default handling for non-standard internal URLs.
        }
      }

      return enhancedMiddleware(req, res, next);
    };
  },
};

module.exports = nativeWindConfig;
