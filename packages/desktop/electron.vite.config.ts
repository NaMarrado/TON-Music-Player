import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@ton/core'] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src-main/main.ts'),
          'export-import-offload-worker-entry': resolve(
            __dirname,
            'src-main/services/export-import-offload-worker-entry.ts',
          ),
          'library-scan-worker': resolve(
            __dirname,
            'src-main/services/library-offload/scan-worker.ts',
          ),
          'library-metadata-worker': resolve(
            __dirname,
            'src-main/services/library-offload/metadata-worker.ts',
          ),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@ton/core'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src-preload/preload.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: 'src',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  },
});
