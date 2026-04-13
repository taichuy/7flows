import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack')) {
              return 'tanstack-vendor';
            }

            if (id.includes('antd') || id.includes('@ant-design')) {
              return 'antd-vendor';
            }

            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
          }

          return undefined;
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3200,
    strictPort: true
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^react$/,
        replacement: fileURLToPath(new URL('./node_modules/react', import.meta.url))
      },
      {
        find: /^react-dom$/,
        replacement: fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url))
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: fileURLToPath(
          new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)
        )
      },
      {
        find: /^antd$/,
        replacement: fileURLToPath(new URL('./node_modules/antd', import.meta.url))
      },
      {
        find: /^@ant-design\/icons$/,
        replacement: fileURLToPath(
          new URL('./node_modules/@ant-design/icons', import.meta.url)
        )
      },
      {
        find: '@1flowse/shared-types',
        replacement: fileURLToPath(
          new URL('../../../web/packages/shared-types/src/index.ts', import.meta.url)
        )
      },
      {
        find: '@1flowse/api-client',
        replacement: fileURLToPath(
          new URL('../../../web/packages/api-client/src/index.ts', import.meta.url)
        )
      },
      {
        find: '@1flowse/ui',
        replacement: fileURLToPath(new URL('../../../web/packages/ui/src/index.tsx', import.meta.url))
      },
      {
        find: '@1flowse/flow-schema',
        replacement: fileURLToPath(
          new URL('../../../web/packages/flow-schema/src/index.ts', import.meta.url)
        )
      },
      {
        find: '@1flowse/page-protocol',
        replacement: fileURLToPath(
          new URL('../../../web/packages/page-protocol/src/index.ts', import.meta.url)
        )
      },
      {
        find: '@1flowse/page-runtime',
        replacement: fileURLToPath(
          new URL('../../../web/packages/page-runtime/src/index.ts', import.meta.url)
        )
      },
      {
        find: '@1flowse/embed-sdk',
        replacement: fileURLToPath(
          new URL('../../../web/packages/embed-sdk/src/index.ts', import.meta.url)
        )
      }
    ]
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
});
