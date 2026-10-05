import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
let nextFixture = 0;

/** Bundle production TS while replacing only platform I/O boundaries. */
export async function loadSyncModule<T>(
  entry: string,
  boundaries: Record<string, Record<string, unknown>>,
): Promise<T> {
  const fixtureKey = `__tonSyncTest${nextFixture++}`;
  (globalThis as Record<string, unknown>)[fixtureKey] = boundaries;
  const result = await build({
    entryPoints: [resolve(entry)], bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'node24',
    plugins: [{
      name: 'isolated-platform-boundaries',
      setup(plugin: { onResolve: Function; onLoad: Function }) {
        plugin.onResolve({ filter: /.*/ }, (args: { path: string; importer: string }) => {
          if (args.path === '@ton/core') return { path: resolve('packages/core/src/index.ts') };
          const absolute = args.path.startsWith('.')
            ? resolve(args.importer, '..', args.path).replace(/\\/g, '/')
            : args.path;
          const boundary = Object.keys(boundaries).find((key) => (
            key === args.path || absolute.endsWith(key)
          ));
          return boundary ? { path: boundary, namespace: 'test-platform' } : undefined;
        });
        plugin.onLoad({ filter: /.*/, namespace: 'test-platform' }, (args: { path: string }) => ({
          contents: Object.keys(boundaries[args.path]).map((name) => (
            `export const ${name} = globalThis[${JSON.stringify(fixtureKey)}][${JSON.stringify(args.path)}][${JSON.stringify(name)}];`
          )).join('\n'),
          loader: 'js',
        }));
      },
    }],
  });
  // Test boundary exception: the bundled, fixture-specific source is generated
  // at runtime, so it cannot be loaded through a static import.
  const source = result.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete (globalThis as Record<string, unknown>)[fixtureKey];
  return module as T;
}
