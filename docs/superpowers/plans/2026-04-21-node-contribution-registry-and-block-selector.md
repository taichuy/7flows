# Node Contribution Registry And Block Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `node contribution v1` persistence, dependency resolution, API reads, DSL identity fields, and a registry-driven block selector so `CapabilityPlugin + declarative_only` can land without custom frontend code injection.

**Architecture:** Keep the registry as a control-plane owned read model backed by PostgreSQL. `plugin-framework` and install-time services extract `node_contributions[]` from the manifest, `storage-pg` persists them into `node_contribution_registry`, `api-server` exposes a workspace-scoped list endpoint, and the agent-flow editor replaces its hardcoded node list with a registry-backed source while still letting built-in nodes coexist. The DSL stores contribution identity explicitly so dependency status and future execution can resolve by `plugin_id + plugin_version + contribution_code + node_shell`.

**Tech Stack:** Rust (`domain`, `control-plane`, `storage-pg`, `api-server`), TypeScript React, `@1flowbase/api-client`, `@1flowbase/flow-schema`, targeted `cargo test`, targeted `pnpm exec vitest`.

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-20-plugin-architecture-and-node-contribution-design.md`, `docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md`

---

## File Structure

**Create**
- `api/crates/domain/src/node_contribution.rs`
- `api/crates/control-plane/src/node_contribution.rs`
- `api/crates/storage-pg/migrations/20260421113000_create_node_contribution_registry_tables.sql`
- `api/crates/storage-pg/src/node_contribution_repository.rs`
- `api/crates/storage-pg/src/mappers/node_contribution_mapper.rs`
- `api/crates/storage-pg/src/_tests/node_contribution_repository_tests.rs`
- `api/crates/control-plane/src/_tests/node_contribution_service_tests.rs`
- `api/apps/api-server/src/routes/node_contributions.rs`
- `api/apps/api-server/src/_tests/node_contribution_routes.rs`
- `web/packages/api-client/src/console-node-contributions.ts`
- `web/app/src/features/agent-flow/api/node-contributions.ts`
- `web/app/src/features/agent-flow/lib/plugin-node-definitions.ts`
- `web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/plugin_management.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/routes/application_orchestration.rs`
- `web/packages/flow-schema/src/index.ts`
- `web/packages/api-client/src/index.ts`
- `web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx`
- `web/app/src/features/agent-flow/lib/node-definitions/index.ts`
- `web/app/src/features/agent-flow/lib/document/node-factory.ts`
- `web/app/src/features/agent-flow/lib/validate-document.ts`
- `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
- `web/app/src/features/agent-flow/api/orchestration.ts`
- `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- `web/app/src/features/agent-flow/_tests/node-picker-popover.test.tsx`

**Notes**
- This plan only lands `CapabilityPlugin + declarative_only`.
- Built-in nodes remain first-party definitions; the registry augments them instead of replacing them all at once.
- Third-party nodes still cannot ship frontend components. The block selector and inspector must render through host-owned schema and metadata only.

### Task 1: Add Registry Storage And Dependency Resolution

**Files:**
- Create: `api/crates/domain/src/node_contribution.rs`
- Create: `api/crates/control-plane/src/node_contribution.rs`
- Create: `api/crates/storage-pg/migrations/20260421113000_create_node_contribution_registry_tables.sql`
- Create: `api/crates/storage-pg/src/node_contribution_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/node_contribution_mapper.rs`
- Create: `api/crates/storage-pg/src/_tests/node_contribution_repository_tests.rs`
- Create: `api/crates/control-plane/src/_tests/node_contribution_service_tests.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`

- [x] **Step 1: Write failing repository and service tests**

Add cases like:

```rust
#[tokio::test]
async fn registry_lists_workspace_visible_contributions_with_dependency_status() {
    let record = service
        .list_node_contributions(ListNodeContributionsQuery {
            actor_user_id,
            workspace_id,
        })
        .await
        .unwrap();

    assert_eq!(record.entries[0].contribution_code, "openai_prompt");
    assert_eq!(record.entries[0].dependency_status.as_str(), "ready");
}

#[tokio::test]
async fn registry_marks_disabled_plugin_as_disabled_dependency() {
    let record = repository
        .list_node_contributions(workspace_id)
        .await
        .unwrap();

    assert_eq!(record[0].dependency_status.as_str(), "disabled_plugin");
}
```

- [x] **Step 2: Run RED tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-pg node_contribution_repository -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane node_contribution_service -- --nocapture
```

Expected:

- FAIL because no registry table, repository, or dependency-status read model exists yet.

- [x] **Step 3: Create the registry tables and domain records**

Create `api/crates/storage-pg/migrations/20260421113000_create_node_contribution_registry_tables.sql` with:

```sql
create table node_contribution_registry (
    id uuid primary key,
    installation_id uuid not null references plugin_installations(id) on delete cascade,
    provider_code text not null,
    plugin_id text not null,
    plugin_version text not null,
    contribution_code text not null,
    node_shell text not null,
    category text not null,
    title text not null,
    description text not null,
    icon text,
    schema_ui jsonb not null default '{}'::jsonb,
    schema_version text not null,
    output_schema jsonb not null default '{}'::jsonb,
    required_auth jsonb not null default '[]'::jsonb,
    visibility text not null default 'public',
    experimental boolean not null default false,
    dependency_installation_kind text not null,
    dependency_plugin_version_range text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (installation_id, contribution_code)
);
```

And define:

```rust
pub enum NodeContributionDependencyStatus {
    Ready,
    MissingPlugin,
    VersionMismatch,
    DisabledPlugin,
}
```

- [x] **Step 4: Re-run the repository and service tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-pg node_contribution_repository -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane node_contribution_service -- --nocapture
```

Expected:

- PASS with `node_contribution_registry` rows derived from installed plugin manifests and dependency status resolved per workspace.

- [x] **Step 5: Commit the registry backend**

```bash
git add api/crates/domain/src/lib.rs api/crates/domain/src/node_contribution.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/node_contribution.rs api/crates/control-plane/src/plugin_management.rs api/crates/control-plane/src/_tests/node_contribution_service_tests.rs api/crates/storage-pg/migrations/20260421113000_create_node_contribution_registry_tables.sql api/crates/storage-pg/src/node_contribution_repository.rs api/crates/storage-pg/src/mappers/node_contribution_mapper.rs api/crates/storage-pg/src/_tests/node_contribution_repository_tests.rs
git commit -m "feat: add node contribution registry backend"
```

### Task 2: Expose Workspace-scoped Node Contribution APIs

**Files:**
- Create: `api/apps/api-server/src/routes/node_contributions.rs`
- Create: `api/apps/api-server/src/_tests/node_contribution_routes.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/routes/application_orchestration.rs`
- Create: `web/packages/api-client/src/console-node-contributions.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Create: `web/app/src/features/agent-flow/api/node-contributions.ts`

- [ ] **Step 1: Write failing route and client tests**

Use cases like:

```rust
#[tokio::test]
async fn list_node_contributions_returns_workspace_registry_entries() {
    let response = app
        .oneshot(get("/api/console/node-contributions?application_id=<app-id>"))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

```ts
it('fetchNodeContributions requests the workspace-scoped registry', async () => {
  await fetchNodeContributions('app-1');

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/console/node-contributions?application_id=app-1'),
    expect.anything()
  );
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server node_contribution_routes -- --nocapture
pnpm exec vitest run web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx
```

Expected:

- FAIL because no route, API client, or frontend fetch layer exists yet.

- [ ] **Step 3: Implement the route and typed client**

Create a route DTO shaped like:

```rust
pub struct NodeContributionResponse {
    pub plugin_id: String,
    pub plugin_version: String,
    pub contribution_code: String,
    pub node_shell: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub dependency_status: String,
    pub schema_version: String,
    pub experimental: bool,
}
```

And add a client helper:

```ts
export interface ConsoleNodeContribution {
  plugin_id: string;
  plugin_version: string;
  contribution_code: string;
  node_shell: string;
  category: string;
  title: string;
  description: string;
  dependency_status: 'ready' | 'missing_plugin' | 'version_mismatch' | 'disabled_plugin';
  schema_version: string;
  experimental: boolean;
}
```

- [ ] **Step 4: Re-run route and client tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server node_contribution_routes -- --nocapture
pnpm exec vitest run web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx
```

Expected:

- PASS with a typed API surface for the agent-flow editor.

- [ ] **Step 5: Commit the API surface**

```bash
git add api/apps/api-server/src/lib.rs api/apps/api-server/src/openapi.rs api/apps/api-server/src/routes/application_orchestration.rs api/apps/api-server/src/routes/node_contributions.rs api/apps/api-server/src/_tests/node_contribution_routes.rs web/packages/api-client/src/console-node-contributions.ts web/packages/api-client/src/index.ts web/app/src/features/agent-flow/api/node-contributions.ts
git commit -m "feat: expose node contribution registry api"
```

### Task 3: Replace The Hardcoded Block Selector And Extend The DSL Identity

**Files:**
- Modify: `web/packages/flow-schema/src/index.ts`
- Modify: `web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions/index.ts`
- Modify: `web/app/src/features/agent-flow/lib/document/node-factory.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
- Create: `web/app/src/features/agent-flow/lib/plugin-node-definitions.ts`
- Create: `web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-picker-popover.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

- [ ] **Step 1: Write failing UI tests for registry-driven node selection**

Add cases like:

```ts
it('renders contribution entries from the registry and disables missing dependencies', async () => {
  render(<NodePickerPopover ... />);

  expect(await screen.findByText('OpenAI Prompt')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: /sql exporter/i })).toBeDisabled();
});

it('writes contribution identity into the draft node document', async () => {
  await user.click(screen.getByRole('menuitem', { name: /openai prompt/i }));

  expect(selectWorkingDocument(store.getState()).graph.nodes.at(-1)).toMatchObject({
    type: 'plugin_node',
    plugin_id: 'prompt_pack@0.1.0',
    plugin_version: '0.1.0',
    contribution_code: 'openai_prompt',
    node_shell: 'action',
    schema_version: '1flowbase.node-contribution/v1'
  });
});
```

- [ ] **Step 2: Run RED UI tests**

Run:

```bash
pnpm exec vitest run web/app/src/features/agent-flow/_tests/node-picker-popover.test.tsx web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected:

- FAIL because the picker is still hardcoded to `NODE_OPTIONS` and `FlowNodeDocument` has no plugin contribution identity fields.

- [ ] **Step 3: Extend the flow schema and picker contract**

Update `web/packages/flow-schema/src/index.ts` around:

```ts
export type FlowNodeType = ExistingBuiltinNodeType | 'plugin_node';

export interface FlowPluginContributionRef {
  plugin_id: string;
  plugin_version: string;
  contribution_code: string;
  node_shell: string;
  schema_version: string;
}

export interface FlowNodeDocument extends Partial<FlowPluginContributionRef> {
  id: string;
  type: FlowNodeType;
  ...
}
```

And replace `NODE_OPTIONS` with fetched entries:

```ts
type NodePickerOption =
  | { kind: 'builtin'; type: FlowNodeType; label: string }
  | {
      kind: 'plugin_contribution';
      contribution: ConsoleNodeContribution;
      disabled: boolean;
    };
```

- [ ] **Step 4: Re-run the UI tests**

Run:

```bash
pnpm exec vitest run web/app/src/features/agent-flow/_tests/node-picker-popover.test.tsx web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected:

- PASS with a registry-backed picker, disabled unavailable entries, and persisted contribution identity in the draft document.

- [ ] **Step 5: Commit the block selector path**

```bash
git add web/packages/flow-schema/src/index.ts web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx web/app/src/features/agent-flow/lib/node-definitions/index.ts web/app/src/features/agent-flow/lib/document/node-factory.ts web/app/src/features/agent-flow/lib/validate-document.ts web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx web/app/src/features/agent-flow/lib/plugin-node-definitions.ts web/app/src/features/agent-flow/_tests/node-contribution-picker.test.tsx web/app/src/features/agent-flow/_tests/node-picker-popover.test.tsx web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "feat: drive block selector from node contribution registry"
```

## Self-Review

- Spec coverage: this plan covers `node contribution v1`, `node_contribution_registry`, dependency states, block selector rules, and DSL identity fields for plugin-contributed nodes.
- Placeholder scan: each task names the route, repository, schema, and picker files explicitly; no anonymous registry or frontend adapter remains.
- Type consistency: the same fields repeat across tasks: `plugin_id`, `plugin_version`, `contribution_code`, `node_shell`, `schema_version`, and `dependency_status`.
