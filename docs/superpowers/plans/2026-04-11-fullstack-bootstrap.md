# Fullstack Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable 1Flowse frontend/backend skeleton with locked toolchain versions, quality gates, OpenAPI docs, and a repo-local project skill.

**Architecture:** Use a `pnpm + Turbo` monorepo for the frontend and a Rust workspace for the backend, but keep every app/package/crate at the minimum runnable or compilable shape. The bootstrap should prove the final directory boundaries, local run commands, OpenAPI exposure, and agent guidance without introducing real product logic.

**Tech Stack:** Node 22, pnpm 10, Vite, React, TanStack Router, TanStack Query, Ant Design, Zustand, Vitest, React Testing Library, ESLint, Prettier, Turbo, Rust stable, Axum, Tokio, Tower, tower-http, SQLx, utoipa, utoipa-swagger-ui, tracing

---

## File Structure

**Create**
- `.nvmrc`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `.prettierrc.json`
- `.prettierignore`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/.env.example`
- `apps/web/src/main.tsx`
- `apps/web/src/styles/global.css`
- `apps/web/src/state/app-store.ts`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/router.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/features/home/HomePage.tsx`
- `apps/web/src/features/agent-flow/AgentFlowPage.tsx`
- `apps/web/src/test/setup.ts`
- `packages/shared-types/package.json`
- `packages/shared-types/tsconfig.json`
- `packages/shared-types/src/index.ts`
- `packages/api-client/package.json`
- `packages/api-client/tsconfig.json`
- `packages/api-client/src/index.ts`
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/src/index.tsx`
- `packages/flow-schema/package.json`
- `packages/flow-schema/tsconfig.json`
- `packages/flow-schema/src/index.ts`
- `packages/page-protocol/package.json`
- `packages/page-protocol/tsconfig.json`
- `packages/page-protocol/src/index.ts`
- `packages/page-runtime/package.json`
- `packages/page-runtime/tsconfig.json`
- `packages/page-runtime/src/index.ts`
- `packages/embed-sdk/package.json`
- `packages/embed-sdk/tsconfig.json`
- `packages/embed-sdk/src/index.ts`
- `rust-toolchain.toml`
- `Cargo.toml`
- `apps/api-server/Cargo.toml`
- `apps/api-server/src/main.rs`
- `apps/api-server/src/lib.rs`
- `apps/api-server/tests/health_routes.rs`
- `apps/plugin-runner/Cargo.toml`
- `apps/plugin-runner/src/main.rs`
- `apps/plugin-runner/src/lib.rs`
- `apps/plugin-runner/tests/health_routes.rs`
- `crates/domain/Cargo.toml`
- `crates/domain/src/lib.rs`
- `crates/control-plane/Cargo.toml`
- `crates/control-plane/src/lib.rs`
- `crates/runtime-core/Cargo.toml`
- `crates/runtime-core/src/lib.rs`
- `crates/publish-gateway/Cargo.toml`
- `crates/publish-gateway/src/lib.rs`
- `crates/access-control/Cargo.toml`
- `crates/access-control/src/lib.rs`
- `crates/plugin-framework/Cargo.toml`
- `crates/plugin-framework/src/lib.rs`
- `crates/storage-pg/Cargo.toml`
- `crates/storage-pg/src/lib.rs`
- `crates/storage-redis/Cargo.toml`
- `crates/storage-redis/src/lib.rs`
- `crates/storage-object/Cargo.toml`
- `crates/storage-object/src/lib.rs`
- `crates/observability/Cargo.toml`
- `crates/observability/src/lib.rs`
- `.agent/skills/1flowse-fullstack-bootstrap/SKILL.md`
- `.agent/skills/1flowse-fullstack-bootstrap/references/commands.md`
- `.memory/history/2026-04-11-fullstack-bootstrap-implementation.md`

**Modify**
- `README.md`
- `.memory/runtime-foundation.md`

**Notes**
- `packages/page-runtime`、`packages/page-protocol`、`packages/flow-schema` 在本计划中只做类型/函数占位，不做运行时编排实现。
- `apps/plugin-runner` 本轮只提供独立 health HTTP 服务，不做插件加载。
- `apps/api-server` 只暴露 `/health`、`/api/console/health`、`/openapi.json` 与文档页。

### Task 1: Root Workspace And Toolchain Baseline

**Files:**
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Run the missing-workspace check**

Run: `pnpm lint`

Expected: FAIL with a missing `package.json` or missing script error because the JS workspace does not exist yet.

- [ ] **Step 2: Write the root workspace files**

Create `.nvmrc`:

```text
22
```

Create `package.json`:

```json
{
  "name": "1flowse",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "turbo run dev --parallel --filter=@1flowse/web",
    "dev:web": "pnpm --filter @1flowse/web dev",
    "dev:api": "cargo run -p api-server",
    "dev:runner": "cargo run -p plugin-runner",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "format": "prettier --check .",
    "format:write": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.24.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.14.0",
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.24.0",
    "eslint-plugin-jest-dom": "^5.5.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.19",
    "eslint-plugin-testing-library": "^7.2.0",
    "globals": "^16.0.0",
    "jsdom": "^26.0.0",
    "prettier": "^3.5.3",
    "turbo": "^2.5.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.29.0",
    "vite": "^6.2.6",
    "vitest": "^3.1.1"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@1flowse/shared-types": ["packages/shared-types/src/index.ts"],
      "@1flowse/api-client": ["packages/api-client/src/index.ts"],
      "@1flowse/ui": ["packages/ui/src/index.tsx"],
      "@1flowse/flow-schema": ["packages/flow-schema/src/index.ts"],
      "@1flowse/page-protocol": ["packages/page-protocol/src/index.ts"],
      "@1flowse/page-runtime": ["packages/page-runtime/src/index.ts"],
      "@1flowse/embed-sdk": ["packages/embed-sdk/src/index.ts"]
    }
  }
}
```

Create `eslint.config.mjs`:

```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import testingLibrary from 'eslint-plugin-testing-library';
import jestDom from 'eslint-plugin-jest-dom';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    plugins: {
      'testing-library': testingLibrary,
      'jest-dom': jestDom
    },
    rules: {
      ...testingLibrary.configs.react.rules,
      ...jestDom.configs.recommended.rules
    }
  }
);
```

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none"
}
```

Create `.prettierignore`:

```text
dist
coverage
node_modules
pnpm-lock.yaml
target
```

- [ ] **Step 3: Install the root JS toolchain**

Run: `pnpm install`

If the install fails with a registry or timeout error, rerun with the proxy:

Run: `HTTP_PROXY=http://192.168.92.1:1454 HTTPS_PROXY=http://192.168.92.1:1454 pnpm install`

Expected: PASS and generate `pnpm-lock.yaml`.

- [ ] **Step 4: Verify the root formatting toolchain**

Run: `pnpm exec prettier --check package.json turbo.json tsconfig.base.json eslint.config.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .prettierrc.json .prettierignore pnpm-lock.yaml
git commit -m "chore: initialize root js workspace"
```

### Task 2: Create Shared Frontend Packages

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.tsx`
- Create: `packages/flow-schema/package.json`
- Create: `packages/flow-schema/tsconfig.json`
- Create: `packages/flow-schema/src/index.ts`
- Create: `packages/page-protocol/package.json`
- Create: `packages/page-protocol/tsconfig.json`
- Create: `packages/page-protocol/src/index.ts`
- Create: `packages/page-runtime/package.json`
- Create: `packages/page-runtime/tsconfig.json`
- Create: `packages/page-runtime/src/index.ts`
- Create: `packages/embed-sdk/package.json`
- Create: `packages/embed-sdk/tsconfig.json`
- Create: `packages/embed-sdk/src/index.ts`

- [ ] **Step 1: Write the failing package build check**

Run: `pnpm --filter @1flowse/shared-types build`

Expected: FAIL with `No projects matched the filters` because the shared packages do not exist yet.

- [ ] **Step 2: Create the shared package manifests**

Create `packages/shared-types/package.json`:

```json
{
  "name": "@1flowse/shared-types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/api-client/package.json`:

```json
{
  "name": "@1flowse/api-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@1flowse/shared-types": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/ui/package.json`:

```json
{
  "name": "@1flowse/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "antd": "^5.24.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/flow-schema/package.json`:

```json
{
  "name": "@1flowse/flow-schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/page-protocol/package.json`:

```json
{
  "name": "@1flowse/page-protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/page-runtime/package.json`:

```json
{
  "name": "@1flowse/page-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@1flowse/page-protocol": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `packages/embed-sdk/package.json`:

```json
{
  "name": "@1flowse/embed-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --ext .ts",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create these identical `tsconfig.json` files:

- `packages/shared-types/tsconfig.json`
- `packages/api-client/tsconfig.json`
- `packages/flow-schema/tsconfig.json`
- `packages/page-protocol/tsconfig.json`
- `packages/page-runtime/tsconfig.json`
- `packages/embed-sdk/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": true
  },
  "include": ["src"]
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the shared package source files**

Create `packages/shared-types/src/index.ts`:

```ts
export interface HealthResponse {
  service: string;
  status: 'ok';
  version: string;
}

export type AppRouteId = 'home' | 'agent-flow';
```

Create `packages/api-client/src/index.ts`:

```ts
import type { HealthResponse } from '@1flowse/shared-types';

export async function fetchApiHealth(baseUrl = 'http://127.0.0.1:3000'): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health`);

  if (!response.ok) {
    throw new Error(`health request failed: ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
```

Create `packages/ui/src/index.tsx`:

```tsx
import { Layout, Typography } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';

const { Header, Content } = Layout;

export interface AppShellProps extends PropsWithChildren {
  title: string;
  navigation?: ReactNode;
}

export function AppShell({ title, navigation, children }: AppShellProps) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Typography.Title level={3} style={{ margin: 0, color: '#fff' }}>
          {title}
        </Typography.Title>
        {navigation}
      </Header>
      <Content style={{ maxWidth: 960, margin: '0 auto', padding: 24, width: '100%' }}>{children}</Content>
    </Layout>
  );
}
```

Create `packages/flow-schema/src/index.ts`:

```ts
export interface FlowDocument {
  id: string;
  name: string;
  nodes: Array<{ id: string; type: string }>;
}
```

Create `packages/page-protocol/src/index.ts`:

```ts
export interface PageDefinition {
  route: string;
  title: string;
}
```

Create `packages/page-runtime/src/index.ts`:

```ts
import type { PageDefinition } from '@1flowse/page-protocol';

export function renderPageTitle(definition: PageDefinition): string {
  return `${definition.title} (${definition.route})`;
}
```

Create `packages/embed-sdk/src/index.ts`:

```ts
export interface EmbedContext {
  applicationId: string;
  teamId: string;
}

export function createEmbedContext(input: EmbedContext): EmbedContext {
  return input;
}
```

- [ ] **Step 4: Run the shared package build check**

Run: `pnpm -r --filter "./packages/*" build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types packages/api-client packages/ui packages/flow-schema packages/page-protocol packages/page-runtime packages/embed-sdk
git commit -m "feat: scaffold shared frontend packages"
```

### Task 3: Build The Web App Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/.env.example`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/state/app-store.ts`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/App.test.tsx`
- Create: `apps/web/src/features/home/HomePage.tsx`
- Create: `apps/web/src/features/agent-flow/AgentFlowPage.tsx`
- Create: `apps/web/src/test/setup.ts`

- [ ] **Step 1: Write the failing web test and package shell**

Create `apps/web/package.json`:

```json
{
  "name": "@1flowse/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@1flowse/api-client": "workspace:*",
    "@1flowse/shared-types": "workspace:*",
    "@1flowse/ui": "workspace:*",
    "@tanstack/react-query": "^5.73.3",
    "@tanstack/react-router": "^1.114.15",
    "antd": "^5.24.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.3"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest --run"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
});
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>1Flowse</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/.env.example`:

```text
VITE_API_BASE_URL=http://127.0.0.1:3000
```

Create `apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `apps/web/src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@1flowse/api-client', () => ({
  fetchApiHealth: vi.fn().mockResolvedValue({
    service: 'api-server',
    status: 'ok',
    version: '0.1.0'
  })
}));

import { App } from './App';

test('renders the bootstrap shell and health state', async () => {
  render(<App />);

  expect(screen.getByText('1Flowse Bootstrap')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'agentFlow' })).toBeInTheDocument();
  expect(await screen.findByText(/api-server/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `pnpm --filter @1flowse/web test`

Expected: FAIL with `Cannot find module './App'` or a similar import error because the web source files do not exist yet.

- [ ] **Step 3: Write the minimal web implementation**

Create `apps/web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `apps/web/src/styles/global.css`:

```css
:root {
  color: #111827;
  background: #f6f7fb;
  font-family: 'Segoe UI', sans-serif;
}

body {
  margin: 0;
}

a {
  color: inherit;
}
```

Create `apps/web/src/state/app-store.ts`:

```ts
import { create } from 'zustand';

interface AppState {
  visitCount: number;
  increment: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  visitCount: 0,
  increment: () => set((state) => ({ visitCount: state.visitCount + 1 }))
}));
```

Create `apps/web/src/features/home/HomePage.tsx`:

```tsx
import { Card, Space, Typography, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';

import { fetchApiHealth } from '@1flowse/api-client';

import { useAppStore } from '../../state/app-store';

export function HomePage() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
  const visitCount = useAppStore((state) => state.visitCount);
  const increment = useAppStore((state) => state.increment);
  const healthQuery = useQuery({
    queryKey: ['api-health', apiBaseUrl],
    queryFn: () => fetchApiHealth(apiBaseUrl)
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Workspace Bootstrap">
        <Typography.Paragraph>
          Frontend monorepo and backend health endpoint are wired together.
        </Typography.Paragraph>
        <Typography.Paragraph>Visit count: {visitCount}</Typography.Paragraph>
        <Button onClick={increment}>Increment</Button>
      </Card>
      <Card title="API Health">
        <Typography.Paragraph>
          {healthQuery.isLoading && 'Loading health status...'}
          {healthQuery.isError && 'Health request failed.'}
          {healthQuery.data &&
            `${healthQuery.data.service} ${healthQuery.data.status} (${healthQuery.data.version})`}
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
```

Create `apps/web/src/features/agent-flow/AgentFlowPage.tsx`:

```tsx
import { Card, Typography } from 'antd';

export function AgentFlowPage() {
  return (
    <Card title="agentFlow">
      <Typography.Paragraph>
        Editor shell reserved for the next implementation slice.
      </Typography.Paragraph>
    </Card>
  );
}
```

Create `apps/web/src/app/router.tsx`:

```tsx
import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Space } from 'antd';

import { AppShell } from '@1flowse/ui';

import { AgentFlowPage } from '../features/agent-flow/AgentFlowPage';
import { HomePage } from '../features/home/HomePage';

function RootLayout() {
  return (
    <AppShell
      title="1Flowse Bootstrap"
      navigation={
        <Space>
          <Link to="/">Home</Link>
          <Link to="/agent-flow">agentFlow</Link>
        </Space>
      }
    >
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage
});

const agentFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agent-flow',
  component: AgentFlowPage
});

const routeTree = rootRoute.addChildren([homeRoute, agentFlowRoute]);

export const router = createRouter({
  routeTree
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
```

Create `apps/web/src/app/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppRouterProvider } from './router';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouterProvider />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run the web checks**

Run: `pnpm install`

Run: `pnpm --filter @1flowse/web test`

Expected: PASS

Run: `pnpm --filter @1flowse/web build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add bootstrap web app shell"
```

### Task 4: Build The Rust Workspace Skeleton

**Files:**
- Create: `rust-toolchain.toml`
- Create: `Cargo.toml`
- Create: `crates/domain/Cargo.toml`
- Create: `crates/domain/src/lib.rs`
- Create: `crates/control-plane/Cargo.toml`
- Create: `crates/control-plane/src/lib.rs`
- Create: `crates/runtime-core/Cargo.toml`
- Create: `crates/runtime-core/src/lib.rs`
- Create: `crates/publish-gateway/Cargo.toml`
- Create: `crates/publish-gateway/src/lib.rs`
- Create: `crates/access-control/Cargo.toml`
- Create: `crates/access-control/src/lib.rs`
- Create: `crates/plugin-framework/Cargo.toml`
- Create: `crates/plugin-framework/src/lib.rs`
- Create: `crates/storage-pg/Cargo.toml`
- Create: `crates/storage-pg/src/lib.rs`
- Create: `crates/storage-redis/Cargo.toml`
- Create: `crates/storage-redis/src/lib.rs`
- Create: `crates/storage-object/Cargo.toml`
- Create: `crates/storage-object/src/lib.rs`
- Create: `crates/observability/Cargo.toml`
- Create: `crates/observability/src/lib.rs`
- Create: `apps/api-server/Cargo.toml`
- Create: `apps/api-server/src/main.rs`
- Create: `apps/plugin-runner/Cargo.toml`
- Create: `apps/plugin-runner/src/main.rs`

- [ ] **Step 1: Run the missing-Rust-workspace check**

Run: `cargo test`

Expected: FAIL with `could not find Cargo.toml`.

- [ ] **Step 2: Create the Rust workspace roots**

Create `rust-toolchain.toml`:

```toml
[toolchain]
channel = "stable"
components = ["clippy", "rustfmt"]
```

Create `Cargo.toml`:

```toml
[workspace]
members = [
  "apps/api-server",
  "apps/plugin-runner",
  "crates/domain",
  "crates/control-plane",
  "crates/runtime-core",
  "crates/publish-gateway",
  "crates/access-control",
  "crates/plugin-framework",
  "crates/storage-pg",
  "crates/storage-redis",
  "crates/storage-object",
  "crates/observability"
]
resolver = "2"

[workspace.package]
edition = "2021"
license = "MIT"
version = "0.1.0"

[workspace.dependencies]
axum = { version = "0.8", features = ["macros"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", default-features = false, features = ["postgres", "runtime-tokio-rustls", "uuid", "macros"] }
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
utoipa = { version = "5", features = ["axum_extras", "uuid"] }
utoipa-swagger-ui = { version = "8", features = ["axum"] }
uuid = { version = "1", features = ["serde", "v7"] }
```

Run:

```bash
cargo new apps/api-server --bin --vcs none
cargo new apps/plugin-runner --bin --vcs none
cargo new crates/domain --lib --vcs none
cargo new crates/control-plane --lib --vcs none
cargo new crates/runtime-core --lib --vcs none
cargo new crates/publish-gateway --lib --vcs none
cargo new crates/access-control --lib --vcs none
cargo new crates/plugin-framework --lib --vcs none
cargo new crates/storage-pg --lib --vcs none
cargo new crates/storage-redis --lib --vcs none
cargo new crates/storage-object --lib --vcs none
cargo new crates/observability --lib --vcs none
```

- [ ] **Step 3: Replace the generated manifests and library stubs**

Create `crates/domain/Cargo.toml`:

```toml
[package]
name = "domain"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/control-plane/Cargo.toml`:

```toml
[package]
name = "control-plane"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/runtime-core/Cargo.toml`:

```toml
[package]
name = "runtime-core"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/publish-gateway/Cargo.toml`:

```toml
[package]
name = "publish-gateway"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/access-control/Cargo.toml`:

```toml
[package]
name = "access-control"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/plugin-framework/Cargo.toml`:

```toml
[package]
name = "plugin-framework"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/storage-pg/Cargo.toml`:

```toml
[package]
name = "storage-pg"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/storage-redis/Cargo.toml`:

```toml
[package]
name = "storage-redis"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/storage-object/Cargo.toml`:

```toml
[package]
name = "storage-object"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/observability/Cargo.toml`:

```toml
[package]
name = "observability"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Create `crates/domain/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "domain"
}
```

Create `crates/control-plane/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "control-plane"
}
```

Create `crates/runtime-core/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "runtime-core"
}
```

Create `crates/publish-gateway/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "publish-gateway"
}
```

Create `crates/access-control/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "access-control"
}
```

Create `crates/plugin-framework/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "plugin-framework"
}
```

Create `crates/storage-pg/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "storage-pg"
}
```

Create `crates/storage-redis/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "storage-redis"
}
```

Create `crates/storage-object/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "storage-object"
}
```

Create `crates/observability/src/lib.rs`:

```rust
pub fn crate_name() -> &'static str {
    "observability"
}
```

Create `apps/api-server/Cargo.toml`:

```toml
[package]
name = "api-server"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
axum.workspace = true
serde.workspace = true
serde_json.workspace = true
sqlx.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
utoipa.workspace = true
utoipa-swagger-ui.workspace = true
uuid.workspace = true
domain = { path = "../../crates/domain" }
control-plane = { path = "../../crates/control-plane" }
runtime-core = { path = "../../crates/runtime-core" }
publish-gateway = { path = "../../crates/publish-gateway" }
access-control = { path = "../../crates/access-control" }
plugin-framework = { path = "../../crates/plugin-framework" }
storage-pg = { path = "../../crates/storage-pg" }
storage-redis = { path = "../../crates/storage-redis" }
storage-object = { path = "../../crates/storage-object" }
observability = { path = "../../crates/observability" }
```

Create `apps/api-server/src/main.rs`:

```rust
fn main() {
    println!("api-server bootstrap");
}
```

Create `apps/plugin-runner/Cargo.toml`:

```toml
[package]
name = "plugin-runner"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
axum.workspace = true
serde.workspace = true
serde_json.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
```

Create `apps/plugin-runner/src/main.rs`:

```rust
fn main() {
    println!("plugin-runner bootstrap");
}
```

- [ ] **Step 4: Run the Rust workspace smoke test**

Run: `cargo test --workspace`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml rust-toolchain.toml apps/api-server apps/plugin-runner crates
git commit -m "feat: scaffold rust workspace skeleton"
```

### Task 5: Add The API Server Health And OpenAPI Routes

**Files:**
- Modify: `apps/api-server/Cargo.toml`
- Create: `apps/api-server/src/lib.rs`
- Modify: `apps/api-server/src/main.rs`
- Create: `apps/api-server/tests/health_routes.rs`

- [ ] **Step 1: Write the failing API integration tests**

Create `apps/api-server/tests/health_routes.rs`:

```rust
use api_server::app;
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn health_route_returns_ok_payload() {
    let response = app()
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["service"], "api-server");
    assert_eq!(payload["status"], "ok");
}

#[tokio::test]
async fn openapi_route_exposes_api_title() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["info"]["title"], "1Flowse API");
}
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `cargo test -p api-server --test health_routes`

Expected: FAIL with `unresolved import api_server::app` or a similar missing-library error.

- [ ] **Step 3: Write the API server implementation**

Modify `apps/api-server/Cargo.toml`:

```toml
[package]
name = "api-server"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
axum.workspace = true
serde.workspace = true
serde_json.workspace = true
sqlx.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
utoipa.workspace = true
utoipa-swagger-ui.workspace = true
uuid.workspace = true
domain = { path = "../../crates/domain" }
control-plane = { path = "../../crates/control-plane" }
runtime-core = { path = "../../crates/runtime-core" }
publish-gateway = { path = "../../crates/publish-gateway" }
access-control = { path = "../../crates/access-control" }
plugin-framework = { path = "../../crates/plugin-framework" }
storage-pg = { path = "../../crates/storage-pg" }
storage-redis = { path = "../../crates/storage-redis" }
storage-object = { path = "../../crates/storage-object" }
observability = { path = "../../crates/observability" }

[dev-dependencies]
tokio.workspace = true
```

Create `apps/api-server/src/lib.rs`:

```rust
use axum::{routing::get, Json, Router};
use serde::Serialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthResponse {
    pub service: &'static str,
    pub status: &'static str,
    pub version: &'static str,
}

#[utoipa::path(get, path = "/health", responses((status = 200, body = HealthResponse)))]
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "api-server",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[utoipa::path(
    get,
    path = "/api/console/health",
    responses((status = 200, body = HealthResponse))
)]
async fn console_health() -> Json<HealthResponse> {
    health().await
}

#[derive(OpenApi)]
#[openapi(
    paths(health, console_health),
    components(schemas(HealthResponse)),
    info(title = "1Flowse API", version = "0.1.0")
)]
pub struct ApiDoc;

pub fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/console/health", get(console_health))
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new("info"))
        .with(tracing_subscriber::fmt::layer())
        .init();
}
```

Modify `apps/api-server/src/main.rs`:

```rust
use std::net::SocketAddr;

use api_server::{app, init_tracing};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    init_tracing();

    let addr: SocketAddr = std::env::var("API_SERVER_ADDR")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:3000".parse().unwrap());

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app()).await.unwrap();
}
```

- [ ] **Step 4: Run the API tests**

Run: `cargo test -p api-server --test health_routes`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-server
git commit -m "feat: add api server health and openapi routes"
```

### Task 6: Add The Plugin Runner Health Service

**Files:**
- Modify: `apps/plugin-runner/Cargo.toml`
- Create: `apps/plugin-runner/src/lib.rs`
- Modify: `apps/plugin-runner/src/main.rs`
- Create: `apps/plugin-runner/tests/health_routes.rs`

- [ ] **Step 1: Write the failing plugin-runner tests**

Create `apps/plugin-runner/tests/health_routes.rs`:

```rust
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use plugin_runner::app;
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn runner_health_route_returns_ok_payload() {
    let response = app()
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["service"], "plugin-runner");
    assert_eq!(payload["status"], "ok");
}
```

- [ ] **Step 2: Run the plugin-runner tests to verify they fail**

Run: `cargo test -p plugin-runner --test health_routes`

Expected: FAIL with `unresolved import plugin_runner::app` or a similar missing-library error.

- [ ] **Step 3: Write the plugin-runner implementation**

Modify `apps/plugin-runner/Cargo.toml`:

```toml
[package]
name = "plugin-runner"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
axum.workspace = true
serde.workspace = true
serde_json.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true

[dev-dependencies]
tokio.workspace = true
```

Create `apps/plugin-runner/src/lib.rs`:

```rust
use axum::{routing::get, Json, Router};
use serde::Serialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub service: &'static str,
    pub status: &'static str,
    pub version: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "plugin-runner",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new("info"))
        .with(tracing_subscriber::fmt::layer())
        .init();
}
```

Modify `apps/plugin-runner/src/main.rs`:

```rust
use std::net::SocketAddr;

use plugin_runner::{app, init_tracing};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    init_tracing();

    let addr: SocketAddr = std::env::var("PLUGIN_RUNNER_ADDR")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:3001".parse().unwrap());

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app()).await.unwrap();
}
```

- [ ] **Step 4: Run the plugin-runner tests**

Run: `cargo test -p plugin-runner --test health_routes`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/plugin-runner
git commit -m "feat: add plugin runner health service"
```

### Task 7: Add Quick Start Docs, Project Skill, And Final Verification

**Files:**
- Modify: `README.md`
- Create: `.agent/skills/1flowse-fullstack-bootstrap/SKILL.md`
- Create: `.agent/skills/1flowse-fullstack-bootstrap/references/commands.md`
- Modify: `.memory/runtime-foundation.md`
- Create: `.memory/history/2026-04-11-fullstack-bootstrap-implementation.md`

- [ ] **Step 1: Run the missing-skill check**

Run: `test -f .agent/skills/1flowse-fullstack-bootstrap/SKILL.md`

Expected: FAIL because the project skill does not exist yet.

- [ ] **Step 2: Write the quick start docs and project skill**

Modify `README.md`:

````md
# 1Flowse

## Bootstrap Quick Start

### Frontend

```bash
pnpm install
pnpm dev
```

### Backend

```bash
cargo run -p api-server
cargo run -p plugin-runner
```

### Middleware

```bash
docker compose -f docker/docker-compose.middleware.yaml up -d
```

### Local URLs

- Web: `http://127.0.0.1:5173`
- API Health: `http://127.0.0.1:3000/health`
- OpenAPI JSON: `http://127.0.0.1:3000/openapi.json`
- API Docs: `http://127.0.0.1:3000/docs`
- Plugin Runner Health: `http://127.0.0.1:3001/health`
````

Create `.agent/skills/1flowse-fullstack-bootstrap/SKILL.md`:

```md
---
name: 1flowse-fullstack-bootstrap
description: Use when working inside the 1Flowse repository and adding or extending the frontend monorepo, Rust workspace, OpenAPI bootstrap, or local development commands.
---

# 1Flowse Fullstack Bootstrap

## Overview

This skill locks the repo-specific rules for 1Flowse frontend and backend bootstrap work. Use it whenever the task touches repo structure, shared packages, Rust crates, OpenAPI wiring, or local run commands.

## Repo Rules

- Frontend uses `pnpm workspace + Turbo`.
- Frontend app lives in `apps/web`.
- Shared frontend packages live in `packages/*`.
- Backend uses a Rust workspace rooted at `Cargo.toml`.
- Main backend app is `apps/api-server`.
- Internal runner is `apps/plugin-runner`.
- Shared backend crates live in `crates/*`.
- OpenAPI must stay exposed from `api-server`.

## Versions

- Node: `22`
- pnpm: `10`
- Rust toolchain: `stable`

## Commands

- Install frontend deps: `pnpm install`
- Frontend dev: `pnpm dev`
- Frontend lint: `pnpm lint`
- Frontend test: `pnpm test`
- Frontend build: `pnpm build`
- API dev: `cargo run -p api-server`
- Runner dev: `cargo run -p plugin-runner`
- Rust fmt: `cargo fmt --check`
- Rust lint: `cargo clippy --all-targets --all-features -- -D warnings`
- Rust test: `cargo test`

Read `references/commands.md` before changing local run flows, verification commands, or URL conventions.

## Network

If dependency download fails, retry with:

`HTTP_PROXY=http://192.168.92.1:1454 HTTPS_PROXY=http://192.168.92.1:1454`
```

Create `.agent/skills/1flowse-fullstack-bootstrap/references/commands.md`:

```md
# Commands

## Local Run

- `pnpm dev`
- `cargo run -p api-server`
- `cargo run -p plugin-runner`

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`

## Local URLs

- Web: `http://127.0.0.1:5173`
- API Health: `http://127.0.0.1:3000/health`
- OpenAPI JSON: `http://127.0.0.1:3000/openapi.json`
- API Docs: `http://127.0.0.1:3000/docs`
- Plugin Runner Health: `http://127.0.0.1:3001/health`
```

- [ ] **Step 3: Run the full verification**

Run: `pnpm lint`

Expected: PASS

Run: `pnpm test`

Expected: PASS

Run: `pnpm build`

Expected: PASS

Run: `cargo fmt --check`

Expected: PASS

Run: `cargo clippy --all-targets --all-features -- -D warnings`

Expected: PASS

Run: `cargo test`

Expected: PASS

Start the API server in one terminal:

```bash
cargo run -p api-server
```

Start the plugin runner in a second terminal:

```bash
cargo run -p plugin-runner
```

Start the web app in a third terminal:

```bash
pnpm dev
```

Verify the URLs:

Run: `curl http://127.0.0.1:3000/health`

Expected: JSON with `"service":"api-server"` and `"status":"ok"`.

Run: `curl http://127.0.0.1:3000/openapi.json`

Expected: JSON containing `"title":"1Flowse API"`.

Run: `curl -I http://127.0.0.1:3000/docs`

Expected: `200` or `307`/`308` redirect to the rendered docs UI.

Run: `curl http://127.0.0.1:3001/health`

Expected: JSON with `"service":"plugin-runner"` and `"status":"ok"`.

- [ ] **Step 4: Update user memory with actual bootstrap results**

Run: `date '+%Y-%m-%d %H:%M:%S %Z'`

Expected: output like `2026-04-11 09:41:52 CST`.

Create `.memory/history/2026-04-11-fullstack-bootstrap-implementation.md` using the literal timestamp output from the previous command on the `时间：` line:

```md
# 2026-04-11 全栈骨架初始化结果

- 时间：2026-04-11 09:41:52 CST
- 已完成前端 `pnpm + Turbo` monorepo 骨架。
- 已完成 `apps/web`、`packages/*` 最小可跑占位。
- 已完成 Rust workspace、`apps/api-server`、`apps/plugin-runner`、`crates/*` 最小可编译占位。
- 已完成 `api-server` 的 `/health`、`/api/console/health`、`/openapi.json` 与本地文档页。
- 已完成仓库内 `.agent/skills/1flowse-fullstack-bootstrap/` 项目专用 skill。
- 已验证本地链接：
  - Web：`http://127.0.0.1:5173`
  - API Docs：`http://127.0.0.1:3000/docs`
```

Modify `.memory/runtime-foundation.md` by appending one concise bullet with the actual completion time, verification command outcome, and the OpenAPI docs URL. Keep the file under 2000 characters.

- [ ] **Step 5: Commit**

```bash
git add README.md .agent/skills/1flowse-fullstack-bootstrap .memory/history/2026-04-11-fullstack-bootstrap-implementation.md .memory/runtime-foundation.md
git commit -m "docs: record bootstrap workflow and project skill"
```
