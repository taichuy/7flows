import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = (env.VITE_API_BASE_URL || 'http://127.0.0.1:7800').replace(/\/$/, '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3100,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        },
        '/health': {
          target: apiProxyTarget,
          changeOrigin: true
        },
        '/openapi.json': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        '@1flowbase/shared-types': fileURLToPath(
          new URL('../packages/shared-types/src/index.ts', import.meta.url)
        ),
        '@1flowbase/api-client': fileURLToPath(
          new URL('../packages/api-client/src/index.ts', import.meta.url)
        ),
        '@1flowbase/ui': fileURLToPath(
          new URL('../packages/ui/src/index.tsx', import.meta.url)
        ),
        '@1flowbase/flow-schema': fileURLToPath(
          new URL('../packages/flow-schema/src/index.ts', import.meta.url)
        ),
        '@1flowbase/page-protocol': fileURLToPath(
          new URL('../packages/page-protocol/src/index.ts', import.meta.url)
        ),
        '@1flowbase/page-runtime': fileURLToPath(
          new URL('../packages/page-runtime/src/index.ts', import.meta.url)
        ),
        '@1flowbase/embed-sdk': fileURLToPath(
          new URL('../packages/embed-sdk/src/index.ts', import.meta.url)
        )
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts'
    }
  };
});
