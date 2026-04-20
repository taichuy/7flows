# Model Provider Contract Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore model provider contract consistency on `latest main`, add a dedicated contract gate for `/api/console/model-providers/catalog` and `/options`, and document the new verification layer.

**Architecture:** Keep repo-level verification owned by `scripts/node/*`: add a new `test-contracts` entrypoint and compose it into `verify-repo` without changing `verify-ci` semantics. Store canonical multi-provider contract fixtures under `scripts/node/testing/contracts/model-providers/`, then make `web/app` consumers import those fixtures through a controlled alias so settings tests, style-boundary, and agent-flow all consume the same shape.

**Tech Stack:** Node.js CLI wrappers, CommonJS script tests, React + Vitest + Vite, TypeScript JSON module imports, README docs, project-local `qa-evaluation` skill docs

---

## File Structure

- `scripts/node/test-contracts.js`
  - New repo-level contract gate entrypoint. Runs only targeted frontend contract tests for shared model provider consumers.
- `scripts/node/test-contracts/_tests/cli.test.js`
  - Verifies CLI help output and command composition for the new contract gate.
- `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`
  - Canonical `/api/console/model-providers/catalog` fixture with multi-provider wrapper shape.
- `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
  - Canonical `/api/console/model-providers/options` fixture with multi-provider wrapper shape.
- `scripts/node/testing/contracts/model-providers/index.js`
  - CommonJS helper that exposes the canonical fixture payloads to Node-side scripts and tests.
- `scripts/node/verify-repo.js`
  - Repository full gate; will gain a `test-contracts` step before `frontend full`.
- `scripts/node/verify-repo/_tests/cli.test.js`
  - Verifies the updated `verify-repo` command ordering.
- `web/tsconfig.base.json`
  - Adds a path alias for canonical model-provider contract fixtures.
- `web/app/vite.config.ts`
  - Adds a matching Vite alias and controlled filesystem allow-list for fixtures outside `web/`.
- `web/app/src/test/model-provider-contract-fixtures.ts`
  - Typed frontend adapter that imports the canonical JSON fixtures and exposes convenient projections for tests and style-boundary scenes.
- `web/packages/api-client/src/console-model-providers.ts`
  - Expands DTOs so catalog entries and options instances retain all shared contract fields.
- `web/app/src/features/settings/api/_tests/settings-api.test.ts`
  - Locks wrapper and key-field passthrough against the canonical fixtures.
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
  - Uses canonical catalog entries instead of hand-written stale mock shapes.
- `web/app/src/style-boundary/registry.tsx`
  - Replaces inlined model provider contract mocks with canonical fixtures.
- `web/app/src/style-boundary/_tests/registry.test.tsx`
  - Verifies the settings scene renders under canonical contract data.
- `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
  - Uses canonical `/options` fixture so agent-flow stays aligned with the same contract source.
- `README.md`
  - Documents the new contract gate and its relationship to `verify-repo` / `verify-ci`.
- `.agents/skills/qa-evaluation/SKILL.md`
  - Adds explicit QA guidance for shared console API contract checks.

### Task 1: Add `test-contracts` CLI And Wire `verify-repo`

**Files:**
- Create: `scripts/node/test-contracts.js`
- Create: `scripts/node/test-contracts/_tests/cli.test.js`
- Modify: `scripts/node/verify-repo.js`
- Modify: `scripts/node/verify-repo/_tests/cli.test.js`

- [x] **Step 1: Write the failing CLI tests for the new contract gate and updated repo gate order**

```js
// scripts/node/test-contracts/_tests/cli.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildCommands, main } = require('../../test-contracts.js');

const CONTRACT_TEST_FILES = [
  'src/features/settings/api/_tests/settings-api.test.ts',
  'src/features/settings/_tests/model-providers-page.test.tsx',
  'src/style-boundary/_tests/registry.test.tsx',
  'src/features/agent-flow/_tests/llm-model-provider-field.test.tsx'
];

test('buildCommands targets the shared model provider contract consumers', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildCommands({ repoRoot }), [
    {
      label: 'model-provider-contract-tests',
      command: 'pnpm',
      args: ['--dir', 'web/app', 'exec', 'vitest', 'run', ...CONTRACT_TEST_FILES],
      cwd: repoRoot
    }
  ]);
});

test('main runs the contract gate and captures advisory output', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-test-contracts-'));
  const calls = [];

  const status = main([], {
    repoRoot,
    env: {},
    writeStdout() {},
    writeStderr() {},
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });

      return {
        status: 0,
        stdout: '',
        stderr: 'warning: model-provider-contract advisory\n'
      };
    }
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--dir', 'web/app', 'exec', 'vitest', 'run', ...CONTRACT_TEST_FILES]);

  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'test-contracts.warnings.log');
  assert.equal(fs.existsSync(warningLogPath), true);
  assert.match(fs.readFileSync(warningLogPath, 'utf8'), /model-provider-contract advisory/u);
});
```

```js
// scripts/node/verify-repo/_tests/cli.test.js
test('buildCommands composes script tests, contract tests, frontend full gate and backend verify gate', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildCommands({ repoRoot }), [
    {
      label: 'repo-script-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-contract-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-contracts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-frontend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-frontend.js'), 'full'],
      cwd: repoRoot,
    },
    {
      label: 'repo-backend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')],
      cwd: repoRoot,
    },
  ]);
});
```

- [x] **Step 2: Run the script CLI tests and verify they fail before implementation**

Run:

```bash
rtk node --test scripts/node/test-contracts/_tests/cli.test.js scripts/node/verify-repo/_tests/cli.test.js
```

Expected:

- FAIL because `scripts/node/test-contracts.js` does not exist yet.
- FAIL because `verify-repo` still composes only three commands.

- [x] **Step 3: Implement the new CLI entrypoint and compose it into `verify-repo`**

```js
// scripts/node/test-contracts.js
#!/usr/bin/env node

const {
  getRepoRoot,
  runCommandSequence,
} = require('./testing/warning-capture.js');

const CONTRACT_TEST_FILES = [
  'src/features/settings/api/_tests/settings-api.test.ts',
  'src/features/settings/_tests/model-providers-page.test.tsx',
  'src/style-boundary/_tests/registry.test.tsx',
  'src/features/agent-flow/_tests/llm-model-provider-field.test.tsx',
];

function buildCommands({ repoRoot }) {
  return [
    {
      label: 'model-provider-contract-tests',
      command: 'pnpm',
      args: ['--dir', 'web/app', 'exec', 'vitest', 'run', ...CONTRACT_TEST_FILES],
      cwd: repoRoot,
    },
  ];
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/test-contracts.js\\n'
      + 'Runs targeted model provider contract tests across shared consumers\\n'
  );
}

function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'test-contracts',
    commands: buildCommands({ repoRoot }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[1flowbase-test-contracts] ${error.message}\\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_TEST_FILES,
  buildCommands,
  main,
};
```

```js
// scripts/node/verify-repo.js
function buildCommands({ repoRoot }) {
  return [
    {
      label: 'repo-script-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-contract-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-contracts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-frontend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-frontend.js'), 'full'],
      cwd: repoRoot,
    },
    {
      label: 'repo-backend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')],
      cwd: repoRoot,
    },
  ];
}
```

- [x] **Step 4: Run the CLI tests again and verify the command layer passes**

Run:

```bash
rtk node --test scripts/node/test-contracts/_tests/cli.test.js scripts/node/verify-repo/_tests/cli.test.js
```

Expected:

- PASS for the new `test-contracts` help/build/main flow.
- PASS for the updated `verify-repo` command ordering.

- [x] **Step 5: Commit the CLI runner changes**

```bash
git add \
  scripts/node/test-contracts.js \
  scripts/node/test-contracts/_tests/cli.test.js \
  scripts/node/verify-repo.js \
  scripts/node/verify-repo/_tests/cli.test.js
git commit -m "test: add model provider contract gate entrypoint"
```

### Task 2: Add Canonical Multi-Provider Fixtures And Expand Shared DTOs

**Files:**
- Create: `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`
- Create: `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
- Create: `scripts/node/testing/contracts/model-providers/index.js`
- Create: `web/app/src/test/model-provider-contract-fixtures.ts`
- Modify: `web/tsconfig.base.json`
- Modify: `web/app/vite.config.ts`
- Modify: `web/packages/api-client/src/console-model-providers.ts`
- Test: `web/app/src/features/settings/api/_tests/settings-api.test.ts`

- [x] **Step 1: Rewrite the settings API wrapper test to consume canonical fixtures and lock wrapper passthrough**

```ts
// web/app/src/features/settings/api/_tests/settings-api.test.ts
import {
  modelProviderCatalogContract,
  modelProviderCatalogEntries,
  modelProviderOptionsContract
} from '../../../../test/model-provider-contract-fixtures';

vi.mock('@1flowbase/api-client', () => ({
  // ...other mocks...
  listConsoleModelProviderCatalog: vi.fn().mockResolvedValue(modelProviderCatalogContract),
  listConsoleModelProviderInstances: vi.fn().mockResolvedValue([]),
  listConsoleModelProviderOptions: vi.fn().mockResolvedValue(modelProviderOptionsContract),
  // ...other mocks...
}));

test('forwards model provider query keys and request helpers', async () => {
  expect(settingsModelProviderCatalogQueryKey).toEqual([
    'settings',
    'model-providers',
    'catalog'
  ]);

  await expect(fetchSettingsModelProviderCatalog()).resolves.toEqual(
    modelProviderCatalogEntries
  );
  await expect(fetchSettingsModelProviderOptions()).resolves.toEqual(
    modelProviderOptionsContract
  );

  expect(modelProviderOptionsContract.instances[0]).toEqual(
    expect.objectContaining({
      provider_instance_id: 'provider-openai-prod',
      provider_code: 'openai_compatible',
      plugin_type: 'provider',
      namespace: 'plugin.openai_compatible',
      label_key: 'provider.label',
      description_key: 'provider.description'
    })
  );
});
```

- [x] **Step 2: Run the settings API wrapper test and verify it fails on unresolved fixtures and missing DTO fields**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/settings/api/_tests/settings-api.test.ts
```

Expected:

- FAIL because the canonical fixture adapter does not exist yet.
- FAIL because `ConsoleModelProviderCatalogEntry` and `ConsoleModelProviderOptions` do not yet retain the full shared contract shape.

- [x] **Step 3: Add the canonical fixtures, web adapter, alias wiring, and DTO fields**

```json
// scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json
{
  "locale_meta": {
    "requested_locale": "zh_Hans",
    "resolved_locale": "zh_Hans",
    "user_preferred_locale": "zh_Hans",
    "accept_language": "zh-Hans-CN,zh;q=0.9,en;q=0.8",
    "fallback_locale": "en_US",
    "supported_locales": ["zh_Hans", "en_US"]
  },
  "i18n_catalog": {
    "plugin.openai_compatible": {
      "zh_Hans": {
        "provider.label": "OpenAI Compatible",
        "provider.description": "OpenAI 协议兼容供应商",
        "models.gpt-4o-mini.label": "GPT-4o Mini"
      },
      "en_US": {
        "provider.label": "OpenAI Compatible",
        "provider.description": "OpenAI-compatible provider",
        "models.gpt-4o-mini.label": "GPT-4o Mini"
      }
    },
    "plugin.anthropic_compatible": {
      "zh_Hans": {
        "provider.label": "Anthropic Compatible",
        "provider.description": "Anthropic 协议兼容供应商",
        "models.claude-3-5-sonnet.label": "Claude 3.5 Sonnet"
      },
      "en_US": {
        "provider.label": "Anthropic Compatible",
        "provider.description": "Anthropic-compatible provider",
        "models.claude-3-5-sonnet.label": "Claude 3.5 Sonnet"
      }
    }
  },
  "entries": [
    {
      "installation_id": "installation-openai-compatible",
      "provider_code": "openai_compatible",
      "plugin_id": "openai_compatible@0.3.7",
      "plugin_version": "0.3.7",
      "plugin_type": "provider",
      "namespace": "plugin.openai_compatible",
      "label_key": "provider.label",
      "description_key": "provider.description",
      "display_name": "OpenAI Compatible",
      "protocol": "openai_responses",
      "help_url": "https://platform.openai.com/docs/api-reference/responses",
      "default_base_url": "https://api.openai.com/v1",
      "model_discovery_mode": "dynamic",
      "supports_model_fetch_without_credentials": false,
      "enabled": true,
      "form_schema": [
        { "key": "base_url", "field_type": "string", "required": true },
        { "key": "api_key", "field_type": "secret", "required": true }
      ],
      "predefined_models": [
        {
          "model_id": "gpt-4o-mini",
          "display_name": "GPT-4o Mini",
          "source": "runtime_catalog",
          "supports_streaming": true,
          "supports_tool_call": true,
          "supports_multimodal": true,
          "context_window": 128000,
          "max_output_tokens": 16384,
          "parameter_form": null,
          "provider_metadata": {}
        }
      ]
    },
    {
      "installation_id": "installation-anthropic-compatible",
      "provider_code": "anthropic_compatible",
      "plugin_id": "anthropic_compatible@0.1.0",
      "plugin_version": "0.1.0",
      "plugin_type": "provider",
      "namespace": "plugin.anthropic_compatible",
      "label_key": "provider.label",
      "description_key": "provider.description",
      "display_name": "Anthropic Compatible",
      "protocol": "anthropic_messages",
      "help_url": "https://docs.anthropic.com/en/api/messages",
      "default_base_url": "https://api.anthropic.com",
      "model_discovery_mode": "static",
      "supports_model_fetch_without_credentials": false,
      "enabled": true,
      "form_schema": [
        { "key": "api_key", "field_type": "secret", "required": true }
      ],
      "predefined_models": [
        {
          "model_id": "claude-3-5-sonnet",
          "display_name": "Claude 3.5 Sonnet",
          "source": "static",
          "supports_streaming": true,
          "supports_tool_call": false,
          "supports_multimodal": true,
          "context_window": 200000,
          "max_output_tokens": 8192,
          "parameter_form": null,
          "provider_metadata": {}
        }
      ]
    }
  ]
}
```

```json
// scripts/node/testing/contracts/model-providers/options.multiple-providers.json
{
  "locale_meta": {
    "requested_locale": "zh_Hans",
    "resolved_locale": "zh_Hans",
    "user_preferred_locale": "zh_Hans",
    "accept_language": "zh-Hans-CN,zh;q=0.9,en;q=0.8",
    "fallback_locale": "en_US",
    "supported_locales": ["zh_Hans", "en_US"]
  },
  "i18n_catalog": {
    "plugin.openai_compatible": {
      "zh_Hans": {
        "provider.label": "OpenAI Compatible",
        "provider.description": "OpenAI 协议兼容供应商"
      },
      "en_US": {
        "provider.label": "OpenAI Compatible",
        "provider.description": "OpenAI-compatible provider"
      }
    },
    "plugin.anthropic_compatible": {
      "zh_Hans": {
        "provider.label": "Anthropic Compatible",
        "provider.description": "Anthropic 协议兼容供应商"
      },
      "en_US": {
        "provider.label": "Anthropic Compatible",
        "provider.description": "Anthropic-compatible provider"
      }
    }
  },
  "instances": [
    {
      "provider_instance_id": "provider-openai-prod",
      "provider_code": "openai_compatible",
      "plugin_type": "provider",
      "namespace": "plugin.openai_compatible",
      "label_key": "provider.label",
      "description_key": "provider.description",
      "protocol": "openai_responses",
      "display_name": "OpenAI Production",
      "models": [
        {
          "model_id": "gpt-4o-mini",
          "display_name": "GPT-4o Mini",
          "source": "runtime_catalog",
          "supports_streaming": true,
          "supports_tool_call": true,
          "supports_multimodal": true,
          "context_window": 128000,
          "max_output_tokens": 16384,
          "parameter_form": {
            "schema_version": "1.0.0",
            "fields": [
              {
                "key": "temperature",
                "label": "Temperature",
                "type": "number",
                "send_mode": "optional",
                "enabled_by_default": false,
                "options": [],
                "visible_when": [],
                "disabled_when": [],
                "default_value": 0.7
              }
            ]
          },
          "provider_metadata": {}
        }
      ]
    },
    {
      "provider_instance_id": "provider-anthropic-prod",
      "provider_code": "anthropic_compatible",
      "plugin_type": "provider",
      "namespace": "plugin.anthropic_compatible",
      "label_key": "provider.label",
      "description_key": "provider.description",
      "protocol": "anthropic_messages",
      "display_name": "Anthropic Production",
      "models": [
        {
          "model_id": "claude-3-5-sonnet",
          "display_name": "Claude 3.5 Sonnet",
          "source": "static",
          "supports_streaming": true,
          "supports_tool_call": false,
          "supports_multimodal": true,
          "context_window": 200000,
          "max_output_tokens": 8192,
          "parameter_form": null,
          "provider_metadata": {}
        }
      ]
    }
  ]
}
```

```js
// scripts/node/testing/contracts/model-providers/index.js
const modelProviderCatalogContract = require('./catalog.multiple-providers.json');
const modelProviderOptionsContract = require('./options.multiple-providers.json');

module.exports = {
  modelProviderCatalogContract,
  modelProviderOptionsContract,
};
```

```ts
// web/tsconfig.base.json
"paths": {
  "@1flowbase/shared-types": ["packages/shared-types/src/index.ts"],
  "@1flowbase/api-client": ["packages/api-client/src/index.ts"],
  "@1flowbase/model-provider-contracts/*": ["../scripts/node/testing/contracts/model-providers/*"],
  "@1flowbase/ui": ["packages/ui/src/index.tsx"],
  "@1flowbase/flow-schema": ["packages/flow-schema/src/index.ts"],
  "@1flowbase/page-protocol": ["packages/page-protocol/src/index.ts"],
  "@1flowbase/page-runtime": ["packages/page-runtime/src/index.ts"],
  "@1flowbase/embed-sdk": ["packages/embed-sdk/src/index.ts"],
  "@1flowbase/embedded-contracts": ["packages/embedded-contracts/src/index.ts"]
}
```

```ts
// web/app/vite.config.ts
server: {
  host: '0.0.0.0',
  port: 3100,
  strictPort: true,
  fs: {
    allow: [fileURLToPath(new URL('../../scripts', import.meta.url))]
  },
  proxy: {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true
    },
    // ...
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
    '@1flowbase/model-provider-contracts': fileURLToPath(
      new URL('../../scripts/node/testing/contracts/model-providers', import.meta.url)
    ),
    // ...
  }
}
```

```ts
// web/app/src/test/model-provider-contract-fixtures.ts
import type {
  ConsoleModelProviderCatalogResponse,
  ConsoleModelProviderOptions
} from '@1flowbase/api-client';
import modelProviderCatalogContractJson from '@1flowbase/model-provider-contracts/catalog.multiple-providers.json';
import modelProviderOptionsContractJson from '@1flowbase/model-provider-contracts/options.multiple-providers.json';

export const modelProviderCatalogContract =
  modelProviderCatalogContractJson as ConsoleModelProviderCatalogResponse;
export const modelProviderOptionsContract =
  modelProviderOptionsContractJson as ConsoleModelProviderOptions;

export const modelProviderCatalogEntries = modelProviderCatalogContract.entries;
export const modelProviderOptionInstances = modelProviderOptionsContract.instances;
export const primaryContractProviderModels = modelProviderOptionsContract.instances[0].models;
```

```ts
// web/packages/api-client/src/console-model-providers.ts
export interface ConsoleModelProviderCatalogEntry {
  installation_id: string;
  provider_code: string;
  plugin_id: string;
  plugin_version: string;
  plugin_type: string;
  namespace: string;
  label_key: string;
  description_key: string | null;
  display_name: string;
  protocol: string;
  help_url: string | null;
  default_base_url: string | null;
  model_discovery_mode: string;
  supports_model_fetch_without_credentials: boolean;
  enabled: boolean;
  form_schema: ConsoleModelProviderConfigField[];
  predefined_models: ConsoleProviderModelDescriptor[];
}

export interface ConsoleModelProviderOption {
  provider_instance_id: string;
  provider_code: string;
  plugin_type: string;
  namespace: string;
  label_key: string;
  description_key: string | null;
  protocol: string;
  display_name: string;
  models: ConsoleProviderModelDescriptor[];
}

export interface ConsoleModelProviderOptions {
  locale_meta: Record<string, unknown>;
  i18n_catalog: Record<string, unknown>;
  instances: ConsoleModelProviderOption[];
}
```

- [x] **Step 4: Run the settings API wrapper test again and verify it passes with canonical fixture data**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/settings/api/_tests/settings-api.test.ts
```

Expected:

- PASS with wrapper passthrough locked to canonical fixture data.
- PASS with catalog entries and options wrapper retaining the shared key fields.

- [x] **Step 5: Commit the canonical fixture source and DTO changes**

```bash
git add \
  scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json \
  scripts/node/testing/contracts/model-providers/options.multiple-providers.json \
  scripts/node/testing/contracts/model-providers/index.js \
  web/tsconfig.base.json \
  web/app/vite.config.ts \
  web/app/src/test/model-provider-contract-fixtures.ts \
  web/packages/api-client/src/console-model-providers.ts \
  web/app/src/features/settings/api/_tests/settings-api.test.ts
git commit -m "test: add canonical model provider contract fixtures"
```

### Task 3: Align Settings Tests And `style-boundary` With Canonical Fixtures

**Files:**
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/_tests/registry.test.tsx`

- [x] **Step 1: Replace hand-written stale contract mocks in the settings and style-boundary tests**

```ts
// web/app/src/features/settings/_tests/model-providers-page.test.tsx
import {
  modelProviderCatalogEntries,
  modelProviderOptionsContract,
  primaryContractProviderModels
} from '../../../test/model-provider-contract-fixtures';

beforeEach(() => {
  modelProvidersApi.fetchSettingsModelProviderCatalog.mockResolvedValue(
    modelProviderCatalogEntries
  );
  modelProvidersApi.fetchSettingsModelProviderModels.mockResolvedValue({
    provider_instance_id: 'provider-openai-prod',
    refresh_status: 'ready',
    source: 'hybrid',
    last_error_message: null,
    refreshed_at: '2026-04-20T10:01:00Z',
    models: primaryContractProviderModels
  });
});
```

```tsx
// web/app/src/style-boundary/registry.tsx
import {
  modelProviderCatalogContract,
  modelProviderOptionsContract,
  primaryContractProviderModels
} from '../test/model-provider-contract-fixtures';

const styleBoundaryProviderModels = primaryContractProviderModels;

// remove the inlined styleBoundaryProviderCatalog/styleBoundaryProviderOptions constants

if (
  method.toUpperCase() === 'GET' &&
  url.endsWith('/api/console/model-providers/options')
) {
  return new Response(
    JSON.stringify({
      data: modelProviderOptionsContract,
      meta: null
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}

if (
  method.toUpperCase() === 'GET' &&
  url.endsWith('/api/console/model-providers/catalog')
) {
  return new Response(
    JSON.stringify({
      data: modelProviderCatalogContract,
      meta: null
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}
```

- [x] **Step 2: Run the settings page and style-boundary tests and verify the current implementation fails before the refactor is complete**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/settings/_tests/model-providers-page.test.tsx src/style-boundary/_tests/registry.test.tsx
```

Expected:

- FAIL at first on unresolved fixture imports or stale style-boundary settings mock shape.
- Specifically, the settings scene should fail until `/catalog` stops returning the old array payload.

- [x] **Step 3: Finish the refactor so both consumers read the canonical fixtures**

```tsx
// web/app/src/style-boundary/_tests/registry.test.tsx
test(
  'renders the settings scene with canonical model provider contract data',
  async () => {
    const scene = getRuntimeScene('page.settings');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    expect(
      await screen.findByRole('heading', { name: '模型供应商', level: 4 }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: '已安装供应商', level: 5 }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(await screen.findByText('OpenAI Compatible')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '已安装到当前 workspace' }, { timeout: 5000 })
    ).toBeInTheDocument();
  },
  15000
);
```

- [x] **Step 4: Run the settings page and style-boundary tests again and verify they pass**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/settings/_tests/model-providers-page.test.tsx src/style-boundary/_tests/registry.test.tsx
```

Expected:

- PASS for the settings model provider page tests under canonical catalog data.
- PASS for the `style-boundary` settings scene that previously failed with `catalogEntries is not iterable`.

- [x] **Step 5: Commit the settings consumer and style-boundary alignment**

```bash
git add \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx \
  web/app/src/style-boundary/registry.tsx \
  web/app/src/style-boundary/_tests/registry.test.tsx
git commit -m "test: align settings consumers with canonical contracts"
```

### Task 4: Align Agent-Flow With Canonical `/options` Fixture

**Files:**
- Modify: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- Test: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`

- [x] **Step 1: Replace the hand-written agent-flow options payload with the canonical `/options` fixture**

```tsx
// web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
import { modelProviderOptionsContract } from '../../../test/model-provider-contract-fixtures';

beforeEach(() => {
  modelProviderOptionsApi.fetchModelProviderOptions.mockReset();
  modelProviderOptionsApi.fetchModelProviderOptions.mockResolvedValue(
    modelProviderOptionsContract
  );
});
```

```tsx
// adjust one assertion so it matches the canonical fixture labels
const providerButton = await screen.findByRole('button', {
  name: '选择模型供应商实例 OpenAI Production'
});

fireEvent.click(
  await screen.findByRole('button', { name: '选择模型 GPT-4o Mini' })
);

expect(
  await screen.findByText('当前节点引用的模型供应商实例不可用。')
).toBeInTheDocument();
```

- [x] **Step 2: Run the agent-flow contract consumer test and verify it fails before the fixture migration**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- FAIL because the test still expects the old hand-written provider labels or payload shape.

- [x] **Step 3: Finish the test migration so agent-flow reads the same wrapper shape as settings**

```tsx
// keep the rest of the test logic intact; only the source of truth changes
expect(latestDocument.graph.nodes).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      id: 'node-llm',
      config: expect.objectContaining({
        model_provider: expect.objectContaining({
          provider_instance_id: 'provider-openai-prod',
          model_id: 'gpt-4o-mini',
          provider_label: 'OpenAI Production',
          model_label: 'GPT-4o Mini'
        })
      })
    })
  ])
);
```

- [x] **Step 4: Run the agent-flow test again and verify it passes against the canonical fixture**

Run:

```bash
rtk pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- PASS with agent-flow consuming the same `/options` wrapper source as the settings consumers.

- [x] **Step 5: Commit the agent-flow contract consumer alignment**

```bash
git add web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
git commit -m "test: align agent-flow provider options fixture"
```

### Task 5: Update Docs, QA Guidance, And Run Final Verification

**Files:**
- Modify: `README.md`
- Modify: `.agents/skills/qa-evaluation/SKILL.md`

- [x] **Step 1: Add failing doc expectations for the new gate semantics**

```md
<!-- README.md -->
### Repository

```bash
node scripts/node/test-scripts.js
node scripts/node/test-scripts.js page-debug
node scripts/node/test-contracts.js
node scripts/node/verify-repo.js
```

说明：

- `node scripts/node/test-contracts.js` 统一执行 model provider 共享契约定向测试。
- canonical fixture 真相源位于 `scripts/node/testing/contracts/model-providers/`。
- `node scripts/node/verify-repo.js` 现在会依次执行 `scripts/node` 测试、contract gate、前端 `full` 门禁和后端 `verify-backend`。
```

```md
<!-- .agents/skills/qa-evaluation/SKILL.md -->
- 评估范围命中共享 console API DTO、`style-boundary` mock、model provider settings/agent-flow consumer 时，必须检查 `node scripts/node/test-contracts.js` 是否存在且已接入 `verify-repo`
```

- [x] **Step 2: Run targeted verification and confirm the current docs/skill text does not yet describe the new gate**

Run:

```bash
rtk rg -n "test-contracts|model-providers/catalog|canonical fixture" README.md .agents/skills/qa-evaluation/SKILL.md
```

Expected:

- No `test-contracts` explanation yet.
- No explicit QA guidance for shared model provider contract gate.

- [x] **Step 3: Update the docs and QA guidance, then run the final verification stack**

```md
<!-- README.md -->
### Repository

```bash
node scripts/node/test-scripts.js
node scripts/node/test-scripts.js page-debug
node scripts/node/test-contracts.js
node scripts/node/verify-repo.js
```

说明：

- `node scripts/node/test-scripts.js` 统一执行 `scripts/node/**/_tests/*.js`。
- `node scripts/node/test-contracts.js` 统一执行 model provider 共享契约定向测试，当前覆盖 settings API wrapper、settings page、style-boundary settings scene 和 agent-flow provider options consumer。
- canonical fixture 真相源位于 `scripts/node/testing/contracts/model-providers/`。
- `node scripts/node/verify-repo.js` 是仓库级 full gate，会依次执行 `scripts/node` 测试、contract gate、前端 `full` 门禁和后端 `verify-backend`。
```

```md
<!-- .agents/skills/qa-evaluation/SKILL.md -->
- 评估范围命中共享 console API DTO、`style-boundary` mock、model provider settings/agent-flow consumer 时，必须检查 `node scripts/node/test-contracts.js` 是否通过，或确认 `verify-repo` 已包含该 gate
```

Run:

```bash
rtk node --test scripts/node/test-contracts/_tests/cli.test.js scripts/node/verify-repo/_tests/cli.test.js
rtk pnpm --dir web/app exec vitest run \
  src/features/settings/api/_tests/settings-api.test.ts \
  src/features/settings/_tests/model-providers-page.test.tsx \
  src/style-boundary/_tests/registry.test.tsx \
  src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
rtk node scripts/node/test-contracts.js
rtk node scripts/node/verify-repo.js
```

Expected:

- PASS for both Node CLI test files.
- PASS for the four targeted frontend contract consumer tests.
- PASS for `node scripts/node/test-contracts.js`.
- PASS for the full `verify-repo` stack with contract gate included between `test-scripts` and `frontend full`.

- [x] **Step 4: Commit docs, QA guidance, and verified gate wiring**

```bash
git add \
  README.md \
  .agents/skills/qa-evaluation/SKILL.md
git commit -m "docs: describe model provider contract gate"
```

- [x] **Step 5: Record final verification in the implementation notes**

```md
- `rtk node --test scripts/node/test-contracts/_tests/cli.test.js scripts/node/verify-repo/_tests/cli.test.js`
- `rtk pnpm --dir web/app exec vitest run src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx src/style-boundary/_tests/registry.test.tsx src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- `rtk node scripts/node/test-contracts.js`
- `rtk node --test scripts/node/dev-up/_tests/vite-config-text.test.js`
- `rtk node scripts/node/dev-up.js restart --frontend-only --skip-docker`
- `rtk node scripts/node/check-style-boundary.js all-pages`
- `rtk node scripts/node/verify-repo.js`
```

Implementation notes:

- Final verification exposed one contract-wrapper mock gap in `web/app/src/features/agent-flow/_tests/validate-document.test.ts`, which was updated to include the current `/options` top-level metadata shape.
- Adding the shared fixture alias required preserving Vite's workspace root inside `server.fs.allow`; otherwise `style-boundary.html` returned `403 Restricted` during the runtime gate.
- `page.settings` style-boundary expectations were synchronized to the current settings panel CSS values: official grid `row-gap: 12px` and official card radius `14px`.

## Self-Review

- Spec coverage: This plan covers all `Phase A` requirements from [2026-04-20-model-provider-contract-gate-design.md](/home/taichu/git/1flowbase/docs/superpowers/specs/1flowbase/2026-04-20-model-provider-contract-gate-design.md): canonical fixture source, `test-contracts`, `verify-repo` integration, settings/style-boundary/agent-flow consumer alignment, and minimal doc/QA updates. It does not implement `cross-repo gate`, matching the approved scope.
- Placeholder scan: Removed vague “if needed” work. The only app consumer test explicitly included is `llm-model-provider-field.test.tsx`, which is the required agent-flow provider-options consumer in this phase.
- Type consistency: The plan keeps naming consistent across files: `modelProviderCatalogContract`, `modelProviderOptionsContract`, `modelProviderCatalogEntries`, `modelProviderOptionInstances`, and `test-contracts`.
