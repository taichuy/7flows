# AgentFlow Editor V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `Application` 的 `orchestration` 分区交付第一版 `agentFlow` editor：默认三节点 Draft、顶部 overlay、右侧节点配置面板、Issues 抽屉、逻辑变更历史、容器子画布，以及首批节点的可编辑配置。

**Architecture:** 后端在现有 `Application` 宿主下新增 `Flow` 主体、唯一可编辑 `FlowDraft` 和最多 `30` 条不可变 `FlowVersion` 快照，`GET /api/console/applications/:id/orchestration` 负责懒初始化默认 Draft，`PUT draft` 只更新 Draft，只有 `logical` 变更才追加历史版本。前端新增 `features/agent-flow`，在 `ApplicationDetailPage` 的 `orchestration` 分区挂载 `@xyflow/react` 画布、overlay、Issues 抽屉、历史抽屉和右侧 Inspector；静态校验、selector 可见性、布局变更分类在前端完成，API 只持久化文档和版本元数据。

**Tech Stack:** Rust, Axum, SQLx, Serde JSON, React 19, TypeScript, `@xyflow/react`, Lexical, `@dagrejs/dagre`, TanStack Query, Ant Design 5, Vitest, Testing Library

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-15-agentflow-editor-design.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。

---

## File Structure

**Create**
- `api/crates/domain/src/flow.rs`
- `api/crates/control-plane/src/flow.rs`
- `api/crates/control-plane/src/_tests/flow_service_tests.rs`
- `api/crates/storage-pg/src/flow_repository.rs`
- `api/crates/storage-pg/src/mappers/flow_mapper.rs`
- `api/crates/storage-pg/src/_tests/flow_repository_tests.rs`
- `api/crates/storage-pg/migrations/20260415113000_create_flow_tables.sql`
- `api/apps/api-server/src/routes/application_orchestration.rs`
- `api/apps/api-server/src/_tests/application_orchestration_routes.rs`
- `web/packages/api-client/src/console-application-orchestration.ts`
- `web/app/src/features/agent-flow/api/orchestration.ts`
- `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- `web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx`
- `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
- `web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx`
- `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- `web/app/src/features/agent-flow/components/nodes/node-registry.tsx`
- `web/app/src/features/agent-flow/components/bindings/SelectorField.tsx`
- `web/app/src/features/agent-flow/components/bindings/TemplatedTextField.tsx`
- `web/app/src/features/agent-flow/components/bindings/NamedBindingsField.tsx`
- `web/app/src/features/agent-flow/components/bindings/ConditionGroupField.tsx`
- `web/app/src/features/agent-flow/components/bindings/StateWriteField.tsx`
- `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts`
- `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts`
- `web/app/src/features/agent-flow/lib/history-change.ts`
- `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- `web/app/src/features/agent-flow/lib/selector-options.ts`
- `web/app/src/features/agent-flow/lib/validate-document.ts`
- `web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts`
- `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
- `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- `web/app/src/features/agent-flow/_tests/validate-document.test.ts`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/application.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/storage-pg/src/lib.rs`
- `api/crates/storage-pg/src/mappers/mod.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/application_repository.rs`
- `api/crates/storage-pg/src/_tests/mod.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/src/_tests/openapi_alignment.rs`
- `web/app/package.json`
- `web/packages/api-client/src/index.ts`
- `web/packages/flow-schema/src/index.ts`
- `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- `web/app/src/app/router.tsx`
- `web/app/src/routes/_tests/application-shell-routing.test.tsx`
- `web/app/src/style-boundary/registry.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`

## Task 1: Add The Flow Document Contract And Frontend Orchestration Client

**Files:**
- Create: `web/packages/api-client/src/console-application-orchestration.ts`
- Create: `web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts`
- Modify: `web/app/package.json`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/packages/flow-schema/src/index.ts`

- [x] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from 'vitest';

import {
  FLOW_SCHEMA_VERSION,
  classifyDocumentChange,
  createDefaultAgentFlowDocument
} from '@1flowse/flow-schema';

describe('agent flow document helpers', () => {
  test('seeds the default start -> llm -> answer graph', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(document.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(document.graph.nodes.map((node) => node.type)).toEqual([
      'start',
      'llm',
      'answer'
    ]);
    expect(document.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['node-start', 'node-llm'],
      ['node-llm', 'node-answer']
    ]);
  });

  test('treats viewport-only edits as layout changes', () => {
    const before = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const viewportOnly = {
      ...before,
      editor: {
        ...before.editor,
        viewport: { x: 120, y: 48, zoom: 0.85 }
      }
    };
    const logicalChange = {
      ...before,
      graph: {
        ...before.graph,
        nodes: before.graph.nodes.map((node) =>
          node.id === 'node-llm'
            ? {
                ...node,
                bindings: {
                  ...node.bindings,
                  system_prompt: {
                    kind: 'templated_text',
                    value: 'You are a support agent.'
                  }
                }
              }
            : node
        )
      }
    };

    expect(classifyDocumentChange(before, viewportOnly)).toBe('layout');
    expect(classifyDocumentChange(before, logicalChange)).toBe('logical');
  });
});
```

- [x] **Step 2: Install editor dependencies**

Run:

```bash
pnpm --dir web --filter @1flowse/web add @1flowse/flow-schema@workspace:* @xyflow/react @dagrejs/dagre lexical @lexical/react @lexical/plain-text @lexical/rich-text @lexical/utils
```

Expected: `web/app/package.json` and the workspace lockfile update cleanly without install errors.

- [x] **Step 3: Implement flow schema helpers and the orchestration API client**

```ts
// web/packages/flow-schema/src/index.ts
export const FLOW_SCHEMA_VERSION = '1flowse.flow/v1';

export type FlowNodeType =
  | 'start'
  | 'answer'
  | 'llm'
  | 'knowledge_retrieval'
  | 'question_classifier'
  | 'if_else'
  | 'code'
  | 'template_transform'
  | 'http_request'
  | 'tool'
  | 'variable_assigner'
  | 'parameter_extractor'
  | 'iteration'
  | 'loop'
  | 'human_input';

export type FlowBinding =
  | { kind: 'templated_text'; value: string }
  | { kind: 'selector'; value: string[] }
  | { kind: 'selector_list'; value: string[][] }
  | {
      kind: 'named_bindings';
      value: Array<{ name: string; selector: string[] }>;
    }
  | {
      kind: 'condition_group';
      value: {
        operator: 'and' | 'or';
        conditions: Array<{
          left: string[];
          comparator: 'exists' | 'equals' | 'contains';
          right?: string | string[];
        }>;
      };
    }
  | {
      kind: 'state_write';
      value: Array<{
        path: string[];
        operator: 'set' | 'append' | 'clear' | 'increment';
        source: string[] | null;
      }>;
    };

export interface FlowNodeDocument {
  id: string;
  type: FlowNodeType;
  alias: string;
  containerId: string | null;
  position: { x: number; y: number };
  configVersion: number;
  config: Record<string, unknown>;
  bindings: Record<string, FlowBinding>;
  outputs: Array<{ key: string; title: string; valueType: string }>;
}

export interface FlowEdgeDocument {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  containerId: string | null;
  points: Array<{ x: number; y: number }>;
}

export interface FlowAuthoringDocument {
  schemaVersion: typeof FLOW_SCHEMA_VERSION;
  meta: {
    flowId: string;
    name: string;
    description: string;
    tags: string[];
  };
  graph: {
    nodes: FlowNodeDocument[];
    edges: FlowEdgeDocument[];
  };
  editor: {
    viewport: { x: number; y: number; zoom: number };
    annotations: Array<{
      id: string;
      kind: 'note';
      text: string;
      position: { x: number; y: number };
    }>;
    activeContainerPath: string[];
  };
}

export function createDefaultAgentFlowDocument({
  flowId
}: {
  flowId: string;
}): FlowAuthoringDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    meta: {
      flowId,
      name: 'Untitled agentFlow',
      description: '',
      tags: []
    },
    graph: {
      nodes: [
        {
          id: 'node-start',
          type: 'start',
          alias: 'Start',
          containerId: null,
          position: { x: 80, y: 220 },
          configVersion: 1,
          config: {},
          bindings: {},
          outputs: [{ key: 'query', title: '用户输入', valueType: 'string' }]
        },
        {
          id: 'node-llm',
          type: 'llm',
          alias: 'LLM',
          containerId: null,
          position: { x: 360, y: 220 },
          configVersion: 1,
          config: { model: '', temperature: 0.7 },
          bindings: {
            user_prompt: { kind: 'selector', value: ['node-start', 'query'] }
          },
          outputs: [{ key: 'text', title: '模型输出', valueType: 'string' }]
        },
        {
          id: 'node-answer',
          type: 'answer',
          alias: 'Answer',
          containerId: null,
          position: { x: 640, y: 220 },
          configVersion: 1,
          config: {},
          bindings: {
            answer_template: { kind: 'selector', value: ['node-llm', 'text'] }
          },
          outputs: [{ key: 'answer', title: '对话输出', valueType: 'string' }]
        }
      ],
      edges: [
        {
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-llm',
          sourceHandle: null,
          targetHandle: null,
          containerId: null,
          points: []
        },
        {
          id: 'edge-llm-answer',
          source: 'node-llm',
          target: 'node-answer',
          sourceHandle: null,
          targetHandle: null,
          containerId: null,
          points: []
        }
      ]
    },
    editor: {
      viewport: { x: 0, y: 0, zoom: 1 },
      annotations: [],
      activeContainerPath: []
    }
  };
}

function stripLayout(document: FlowAuthoringDocument) {
  return {
    ...document,
    graph: {
      nodes: document.graph.nodes.map(({ position, ...node }) => node),
      edges: document.graph.edges.map(({ points, ...edge }) => edge)
    },
    editor: {
      ...document.editor,
      viewport: { x: 0, y: 0, zoom: 1 },
      annotations: document.editor.annotations.map(({ position, ...annotation }) => annotation)
    }
  };
}

export function classifyDocumentChange(
  before: FlowAuthoringDocument,
  after: FlowAuthoringDocument
): 'layout' | 'logical' {
  return JSON.stringify(stripLayout(before)) === JSON.stringify(stripLayout(after))
    ? 'layout'
    : 'logical';
}

// web/packages/api-client/src/console-application-orchestration.ts
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

import { apiFetch } from './transport';

export interface ConsoleFlowVersionSummary {
  id: string;
  sequence: number;
  trigger: 'autosave' | 'restore';
  change_kind: 'logical';
  summary: string;
  created_at: string;
}

export interface ConsoleFlowDraftPayload {
  id: string;
  flow_id: string;
  document: FlowAuthoringDocument;
  updated_at: string;
}

export interface ConsoleApplicationOrchestrationState {
  flow_id: string;
  draft: ConsoleFlowDraftPayload;
  versions: ConsoleFlowVersionSummary[];
  autosave_interval_seconds: number;
}

export interface SaveConsoleApplicationDraftInput {
  document: FlowAuthoringDocument;
  change_kind: 'layout' | 'logical';
  summary: string;
}

export function getConsoleApplicationOrchestration(
  applicationId: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration`,
    baseUrl
  });
}

export function saveConsoleApplicationDraft(
  applicationId: string,
  input: SaveConsoleApplicationDraftInput,
  csrfToken: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration/draft`,
    method: 'PUT',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function restoreConsoleApplicationVersion(
  applicationId: string,
  versionId: string,
  csrfToken: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration/versions/${versionId}/restore`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}
```

- [x] **Step 4: Run the targeted contract test**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-document.test.ts -v
```

Expected: both helper tests pass and the file resolves `@1flowse/flow-schema` plus the new API client exports.

- [x] **Step 5: Commit**

```bash
git add web/app/package.json web/packages/api-client/src/index.ts web/packages/api-client/src/console-application-orchestration.ts web/packages/flow-schema/src/index.ts web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts
git commit -m "feat: add agent flow document contract"
```

## Task 2: Persist Flow Subject, Draft, And History In The Backend

**Files:**
- Create: `api/crates/domain/src/flow.rs`
- Create: `api/crates/control-plane/src/flow.rs`
- Create: `api/crates/control-plane/src/_tests/flow_service_tests.rs`
- Create: `api/crates/storage-pg/src/flow_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/flow_mapper.rs`
- Create: `api/crates/storage-pg/src/_tests/flow_repository_tests.rs`
- Create: `api/crates/storage-pg/migrations/20260415113000_create_flow_tables.sql`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/application.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Modify: `api/crates/storage-pg/src/application_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`

- [x] **Step 1: Write the failing repository and service tests**

```rust
use control_plane::{
    flow::{FlowService, SaveFlowDraftCommand},
    ports::{ApplicationRepository, CreateApplicationInput, FlowRepository},
};
use sqlx::PgPool;
use uuid::Uuid;

async fn isolated_database_url() -> String {
    let base_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into());
    let admin_pool = PgPool::connect(&base_url).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().simple());
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{base_url}?options=-csearch_path%3D{schema}")
}

async fn seed_workspace(store: &storage_pg::PgControlPlaneStore, name: &str) -> Uuid {
    let workspace_id = Uuid::now_v7();
    let tenant_id: Uuid =
        sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
            .fetch_one(store.pool())
            .await
            .unwrap();

    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(tenant_id)
    .bind(name)
    .execute(store.pool())
    .await
    .unwrap();

    workspace_id
}

async fn seed_user(
    store: &storage_pg::PgControlPlaneStore,
    workspace_id: Uuid,
    account_prefix: &str,
) -> Uuid {
    let user_id = Uuid::now_v7();
    let account = format!("{account_prefix}-{}", user_id.simple());

    sqlx::query(
        r#"
        insert into users (
            id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
            default_display_role, email_login_enabled, phone_login_enabled, status, session_version,
            created_by, updated_by
        ) values (
            $1, $2, $3, null, 'hash', $4, $5, null, '', 'manager', true, false, 'active', 1, null, null
        )
        "#,
    )
    .bind(user_id)
    .bind(&account)
    .bind(format!("{account}@example.com"))
    .bind(&account)
    .bind(&account)
    .execute(store.pool())
    .await
    .unwrap();

    sqlx::query(
        "insert into workspace_memberships (id, workspace_id, user_id, introduction) values ($1, $2, $3, '')",
    )
    .bind(Uuid::now_v7())
    .bind(workspace_id)
    .bind(user_id)
    .execute(store.pool())
    .await
    .unwrap();

    user_id
}

async fn seed_agent_flow_application(
    store: &storage_pg::PgControlPlaneStore,
    workspace_id: Uuid,
    actor_user_id: Uuid,
) -> domain::ApplicationRecord {
    <storage_pg::PgControlPlaneStore as ApplicationRepository>::create_application(
        store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Support Agent".into(),
            description: "customer support".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn get_or_create_editor_state_bootstraps_default_draft_and_first_version() {
    let pool = storage_pg::connect(&isolated_database_url().await).await.unwrap();
    storage_pg::run_migrations(&pool).await.unwrap();
    let store = storage_pg::PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Flow Workspace").await;
    let actor_user_id = seed_user(&store, workspace_id, "flow-owner").await;
    let application = seed_agent_flow_application(&store, workspace_id, actor_user_id).await;

    let state = <storage_pg::PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    assert_eq!(state.draft.document["graph"]["nodes"].as_array().unwrap().len(), 3);
    assert_eq!(state.versions.len(), 1);
    assert_eq!(state.versions[0].trigger, domain::FlowVersionTrigger::Autosave);
}

#[tokio::test]
async fn save_draft_only_appends_history_for_logical_changes() {
    let service = FlowService::for_tests();
    let application = service.seed_application("Support Agent");
    let initial = service
        .get_or_create_editor_state(application.created_by, application.id)
        .await
        .unwrap();
    let mut layout_only = initial.draft.document.clone();
    layout_only["editor"]["viewport"] = serde_json::json!({ "x": 240, "y": 32, "zoom": 0.8 });

    let layout_state = service
        .save_draft(SaveFlowDraftCommand {
            actor_user_id: application.created_by,
            application_id: application.id,
            document: layout_only,
            change_kind: domain::FlowChangeKind::Layout,
            summary: "viewport update".into(),
        })
        .await
        .unwrap();

    assert_eq!(layout_state.versions.len(), 1);
}
```

- [x] **Step 2: Add the flow tables, domain records, and repository ports**

```sql
create table if not exists flows (
  id uuid primary key,
  application_id uuid not null unique references applications(id) on delete cascade,
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flow_drafts (
  id uuid primary key,
  flow_id uuid not null unique references flows(id) on delete cascade,
  schema_version text not null,
  document jsonb not null,
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists flow_versions (
  id uuid primary key,
  flow_id uuid not null references flows(id) on delete cascade,
  sequence bigint not null,
  trigger text not null check (trigger in ('autosave', 'restore')),
  change_kind text not null check (change_kind in ('logical')),
  summary text not null,
  document jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique(flow_id, sequence)
);
```

```rust
// api/crates/domain/src/flow.rs
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlowChangeKind {
    Layout,
    Logical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlowVersionTrigger {
    Autosave,
    Restore,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowRecord {
    pub id: Uuid,
    pub application_id: Uuid,
    pub created_by: Uuid,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowDraftRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub schema_version: String,
    pub document: serde_json::Value,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowVersionRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub sequence: i64,
    pub trigger: FlowVersionTrigger,
    pub change_kind: FlowChangeKind,
    pub summary: String,
    pub document: serde_json::Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowEditorState {
    pub flow: FlowRecord,
    pub draft: FlowDraftRecord,
    pub versions: Vec<FlowVersionRecord>,
    pub autosave_interval_seconds: u16,
}
```

```rust
// api/crates/control-plane/src/ports.rs
#[async_trait]
pub trait FlowRepository: Send + Sync {
    async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> anyhow::Result<domain::FlowEditorState>;
    async fn save_draft(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> anyhow::Result<domain::FlowEditorState>;
    async fn restore_version(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
    ) -> anyhow::Result<domain::FlowEditorState>;
}
```

- [x] **Step 3: Implement storage-pg mapping, the Flow service, and application section updates**

```rust
// api/crates/control-plane/src/flow.rs
use anyhow::Result;
use uuid::Uuid;

use crate::{
    application::ApplicationService,
    ports::{ApplicationRepository, FlowRepository},
};

pub struct SaveFlowDraftCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub document: serde_json::Value,
    pub change_kind: domain::FlowChangeKind,
    pub summary: String,
}

pub struct FlowService<R> {
    repository: R,
}

impl<R> FlowService<R>
where
    R: ApplicationRepository + FlowRepository + Clone,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn get_or_create_editor_state(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        let application =
            ApplicationService::new(self.repository.clone()).get_application(actor_user_id, application_id).await?;
        let actor = self.repository.load_actor_context_for_user(actor_user_id).await?;

        self.repository
            .get_or_create_editor_state(actor.current_workspace_id, application.id, actor_user_id)
            .await
    }

    pub async fn save_draft(
        &self,
        command: SaveFlowDraftCommand,
    ) -> Result<domain::FlowEditorState> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;

        self.repository
            .save_draft(
                actor.current_workspace_id,
                command.application_id,
                command.actor_user_id,
                command.document,
                command.change_kind,
                &command.summary,
            )
            .await
    }

    pub async fn restore_version(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
        version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        let actor = self.repository.load_actor_context_for_user(actor_user_id).await?;

        self.repository
            .restore_version(
                actor.current_workspace_id,
                application_id,
                actor_user_id,
                version_id,
            )
            .await
    }
}

impl FlowService<InMemoryFlowRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryFlowRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]))
    }

    pub fn seed_application(&self, name: &str) -> domain::ApplicationRecord {
        self.repository.seed_agent_flow_application(name)
    }
}
```

```rust
// api/crates/storage-pg/src/application_repository.rs
let row = sqlx::query(
    r#"
    select
        a.id,
        a.workspace_id,
        a.application_type,
        a.name,
        a.description,
        a.icon_type,
        a.icon,
        a.icon_background,
        a.created_by,
        a.updated_at,
        f.id as current_flow_id,
        fd.id as current_draft_id
    from applications a
    left join flows f on f.application_id = a.id
    left join flow_drafts fd on fd.flow_id = f.id
    where a.workspace_id = $1
      and a.id = $2
    "#,
)
```

```rust
// api/crates/storage-pg/src/mappers/flow_mapper.rs
pub fn flow_sections(
    application_type: domain::ApplicationType,
    current_flow_id: Option<Uuid>,
    current_draft_id: Option<Uuid>,
) -> domain::ApplicationSections {
    let ready = current_flow_id.is_some() && current_draft_id.is_some();

    domain::ApplicationSections {
        orchestration: domain::ApplicationOrchestrationSection {
            status: if ready { "ready".into() } else { "planned".into() },
            subject_kind: application_type.as_str().into(),
            subject_status: if ready { "editable".into() } else { "unconfigured".into() },
            current_subject_id: current_flow_id,
            current_draft_id,
        },
        ..crate::mappers::application_mapper::planned_sections(application_type)
    }
}
```

- [x] **Step 4: Run the targeted Rust tests**

Run:

```bash
cargo test -p storage-pg flow_repository_tests -v
cargo test -p control-plane flow_service_tests -v
```

Expected: the repository tests cover bootstrap, logical-save history, and restore; the service tests cover permission-gated application loading and save routing.

Execution note (`2026-04-15 15:46`):

- `cargo test -p control-plane flow_service_tests -v` passed directly in `api/`.
- The local Docker-published PostgreSQL port `127.0.0.1:35432` accepted TCP but did not respond to PostgreSQL protocol packets on this machine, so `storage-pg` tests could not bootstrap a DB connection through the default URL.
- Worked around verification with a temporary local proxy on `127.0.0.1:35433` that relayed each connection via `docker exec docker-db-1 nc 127.0.0.1 5432`, then ran:

```bash
DATABASE_URL='postgres://postgres:sevenflows@127.0.0.1:35433/sevenflows' cargo test -p storage-pg flow_repository_tests -v
```

- Result: `control-plane` target tests `2 passed`; `storage-pg` target tests `3 passed`.

- [x] **Step 5: Commit**

```bash
git add api/crates/domain/src/flow.rs api/crates/domain/src/lib.rs api/crates/control-plane/src/flow.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/application.rs api/crates/control-plane/src/_tests/mod.rs api/crates/control-plane/src/_tests/flow_service_tests.rs api/crates/storage-pg/src/flow_repository.rs api/crates/storage-pg/src/mappers/flow_mapper.rs api/crates/storage-pg/src/mappers/mod.rs api/crates/storage-pg/src/lib.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/application_repository.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/flow_repository_tests.rs api/crates/storage-pg/migrations/20260415113000_create_flow_tables.sql
git commit -m "feat: persist agent flow drafts and history"
```

Commit note (`2026-04-15 15:48`): committed as `32417e2d feat: persist agent flow drafts and history`.

## Task 3: Expose Orchestration Endpoints And Mount The Editor Page

**Files:**
- Create: `api/apps/api-server/src/routes/application_orchestration.rs`
- Create: `api/apps/api-server/src/_tests/application_orchestration_routes.rs`
- Create: `web/app/src/features/agent-flow/api/orchestration.ts`
- Create: `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- Modify: `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/routes/_tests/application-shell-routing.test.tsx`

- [x] **Step 1: Write the failing API route and routing tests**

```rust
#[tokio::test]
async fn application_orchestration_routes_bootstrap_save_and_restore() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/applications")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "application_type": "agent_flow",
                        "name": "Support Agent",
                        "description": "customer support",
                        "icon": "RobotOutlined",
                        "icon_type": "iconfont",
                        "icon_background": "#E6F7F2"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let created_body: serde_json::Value =
        serde_json::from_slice(&to_bytes(create.into_body(), usize::MAX).await.unwrap()).unwrap();
    let application_id = created_body["data"]["id"].as_str().unwrap();

    let get_state = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/console/applications/{application_id}/orchestration"))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(get_state.status(), StatusCode::OK);
}
```

```tsx
test('renders the editor page inside orchestration', async () => {
  window.history.pushState({}, '', '/applications/app-1/orchestration');
  render(
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );

  expect(await screen.findByText('30 秒自动保存')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument();
});
```

- [x] **Step 2: Implement the orchestration API routes and wire them into the console router**

```rust
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post, put},
    Json, Router,
};
use control_plane::flow::{FlowService, SaveFlowDraftCommand};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct SaveDraftBody {
    pub document: serde_json::Value,
    pub change_kind: String,
    pub summary: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OrchestrationStateResponse {
    pub flow_id: String,
    pub draft: FlowDraftResponse,
    pub versions: Vec<FlowVersionResponse>,
    pub autosave_interval_seconds: u16,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/applications/:id/orchestration", get(get_orchestration))
        .route("/applications/:id/orchestration/draft", put(save_draft))
        .route(
            "/applications/:id/orchestration/versions/:version_id/restore",
            post(restore_version),
        )
}

pub async fn get_orchestration(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiSuccess<OrchestrationStateResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let flow_state = FlowService::new(state.store.clone())
        .get_or_create_editor_state(context.user.id, id)
        .await?;

    Ok(Json(ApiSuccess::new(to_response(flow_state))))
}

pub async fn save_draft(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<SaveDraftBody>,
) -> Result<Json<ApiSuccess<OrchestrationStateResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let flow_state = FlowService::new(state.store.clone())
        .save_draft(SaveFlowDraftCommand {
            actor_user_id: context.user.id,
            application_id: id,
            document: body.document,
            change_kind: parse_change_kind(&body.change_kind)?,
            summary: body.summary,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_response(flow_state))))
}
```

- [x] **Step 3: Add frontend orchestration query helpers and mount the editor page**

```ts
// web/app/src/features/agent-flow/api/orchestration.ts
import {
  getConsoleApplicationOrchestration,
  restoreConsoleApplicationVersion,
  saveConsoleApplicationDraft,
  type SaveConsoleApplicationDraftInput
} from '@1flowse/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';

export const orchestrationQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'orchestration'] as const;

export function fetchOrchestrationState(applicationId: string) {
  return getConsoleApplicationOrchestration(applicationId, getApplicationsApiBaseUrl());
}

export function saveDraft(
  applicationId: string,
  input: SaveConsoleApplicationDraftInput,
  csrfToken: string
) {
  return saveConsoleApplicationDraft(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function restoreVersion(
  applicationId: string,
  versionId: string,
  csrfToken: string
) {
  return restoreConsoleApplicationVersion(
    applicationId,
    versionId,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}
```

```tsx
// web/app/src/features/applications/pages/ApplicationDetailPage.tsx
const content =
  requestedSectionKey === 'orchestration' ? (
    <AgentFlowEditorPage
      applicationId={applicationId}
      applicationName={application.name}
      apiCapabilityStatus={application.sections.api.api_capability_status}
    />
  ) : (
    <ApplicationSectionState
      application={application}
      sectionKey={requestedSectionKey}
    />
  );

return (
  <SectionPageLayout
    pageTitle={application.name}
    navItems={getApplicationSections(applicationId)}
    activeKey={requestedSectionKey}
    contentWidth="wide"
  >
    {content}
  </SectionPageLayout>
);
```

- [x] **Step 4: Run the targeted API and routing tests**

Run:

```bash
cargo test -p api-server application_orchestration_routes -v
pnpm --dir web/app exec vitest run src/routes/_tests/application-shell-routing.test.tsx -v
```

Expected: the backend returns orchestration state, draft save, and restore routes; the frontend mounts the editor page only for the orchestration section and keeps the other three sections on the existing state panels.

Execution note (`2026-04-15 15:51`):

- `api/apps/api-server/src/_tests/support.rs` had to be updated so test config prefers process env vars before falling back to the default local URLs; otherwise route tests were hard-wired to the broken `127.0.0.1:35432` mapping and never reached the orchestration handlers.
- Backend verification ran with:

```bash
API_DATABASE_URL='postgres://postgres:sevenflows@127.0.0.1:35433/sevenflows' \
API_REDIS_URL='redis://:sevenflows@127.0.0.1:36379' \
BOOTSTRAP_ROOT_ACCOUNT='root' \
BOOTSTRAP_ROOT_EMAIL='root@example.com' \
BOOTSTRAP_ROOT_PASSWORD='change-me' \
BOOTSTRAP_WORKSPACE_NAME='1Flowse' \
cargo test -p api-server application_orchestration_routes -v
```

- Frontend verification ran with:

```bash
pnpm --dir web/app exec vitest run src/routes/_tests/application-shell-routing.test.tsx -v
```

- Result: backend `1 passed`; frontend route suite `4 passed`.

- [x] **Step 5: Commit**

```bash
git add api/apps/api-server/src/routes/application_orchestration.rs api/apps/api-server/src/routes/mod.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/openapi.rs api/apps/api-server/src/_tests/mod.rs api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/src/_tests/application_orchestration_routes.rs web/app/src/features/agent-flow/api/orchestration.ts web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx web/app/src/features/applications/pages/ApplicationDetailPage.tsx web/app/src/features/applications/components/ApplicationSectionState.tsx web/app/src/app/router.tsx web/app/src/routes/_tests/application-shell-routing.test.tsx
git commit -m "feat: expose application orchestration routes"
```

Commit note (`2026-04-15 15:53`): committed as `bfe1b82d feat: expose application orchestration routes`.

## Task 4: Build The Editor Shell, Canvas Overlay, And Add-Node Interactions

**Files:**
- Create: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Create: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Create: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- Create: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Create: `web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx`
- Create: `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- Create: `web/app/src/features/agent-flow/components/nodes/node-registry.tsx`
- Create: `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts`
- Create: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`

- [x] **Step 1: Write the failing editor-shell and canvas tests**

```tsx
test('renders the default three nodes and overlay controls', async () => {
  const initialState = {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };

  render(
    <AgentFlowEditorShell
      applicationId="app-1"
      applicationName="Support Agent"
      initialState={initialState}
    />
  );

  expect(await screen.findByText('Start')).toBeInTheDocument();
  expect(screen.getByText('LLM')).toBeInTheDocument();
  expect(screen.getByText('Answer')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '发布配置' })).toBeInTheDocument();
});

test('adds a node from the plus picker after the selected node', async () => {
  const initialState = {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };

  render(
    <AgentFlowEditorShell
      applicationId="app-1"
      applicationName="Support Agent"
      initialState={initialState}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: '在 LLM 后新增节点' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Template Transform' }));

  expect(screen.getByText('Template Transform')).toBeInTheDocument();
});
```

- [x] **Step 2: Implement default-document helpers, canvas node mapping, and add-node insertion**

```ts
// web/app/src/features/agent-flow/lib/default-agent-flow-document.ts
import {
  createDefaultAgentFlowDocument,
  type FlowAuthoringDocument,
  type FlowNodeDocument,
  type FlowNodeType
} from '@1flowse/flow-schema';

export function buildDefaultAgentFlowDocument(flowId: string): FlowAuthoringDocument {
  return createDefaultAgentFlowDocument({ flowId });
}

export function insertNodeAfter(
  document: FlowAuthoringDocument,
  anchorNodeId: string,
  node: FlowNodeDocument
): FlowAuthoringDocument {
  const outgoing = document.graph.edges.filter((edge) => edge.source === anchorNodeId);

  return {
    ...document,
    graph: {
      nodes: [...document.graph.nodes, node],
      edges: [
        ...document.graph.edges.filter((edge) => edge.source !== anchorNodeId),
        {
          id: `edge-${anchorNodeId}-${node.id}`,
          source: anchorNodeId,
          target: node.id,
          sourceHandle: null,
          targetHandle: null,
          containerId: node.containerId,
          points: []
        },
        ...outgoing.map((edge) => ({
          ...edge,
          source: node.id,
          id: `edge-${node.id}-${edge.target}`
        }))
      ]
    }
  };
}

export function createNodeDocument(
  nodeType: FlowNodeType,
  id: string,
  x: number,
  y: number
): FlowNodeDocument {
  return {
    id,
    type: nodeType,
    alias: nodeType
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    containerId: null,
    position: { x, y },
    configVersion: 1,
    config: {},
    bindings: {},
    outputs: []
  };
}
```

```tsx
// web/app/src/features/agent-flow/components/nodes/node-registry.tsx
import type { Node, NodeTypes } from '@xyflow/react';

import { AgentFlowNodeCard } from './AgentFlowNodeCard';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

export interface AgentFlowCanvasNodeData {
  nodeId: string;
  typeLabel: string;
  alias: string;
  selected: boolean;
  issueCount: number;
}

export const agentFlowNodeTypes: NodeTypes = {
  agentFlowNode: AgentFlowNodeCard
};

export function toCanvasNodes(
  document: FlowAuthoringDocument,
  selectedNodeId: string | null,
  issueCountByNodeId: Record<string, number>
): Array<Node<AgentFlowCanvasNodeData>> {
  return document.graph.nodes.map((node) => ({
    id: node.id,
    type: 'agentFlowNode',
    position: node.position,
    data: {
      nodeId: node.id,
      typeLabel: node.type,
      alias: node.alias,
      selected: node.id === selectedNodeId,
      issueCount: issueCountByNodeId[node.id] ?? 0
    }
  }));
}
```

- [x] **Step 3: Implement the shell layout, overlay actions, and canvas controls**

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx
interface AgentFlowEditorShellProps {
  applicationId: string;
  applicationName: string;
  initialState: ConsoleApplicationOrchestrationState;
  saveDraftOverride?: (input: SaveConsoleApplicationDraftInput) => Promise<ConsoleApplicationOrchestrationState>;
}

export function AgentFlowEditorShell({
  applicationId,
  applicationName,
  initialState,
  saveDraftOverride
}: AgentFlowEditorShellProps) {
const csrfToken = useAuthStore((state) => state.csrfToken) ?? '';
const [document, setDocument] = useState(initialState.draft.document);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-llm');
const [issuesOpen, setIssuesOpen] = useState(false);
const [historyOpen, setHistoryOpen] = useState(false);
const persistDraft = saveDraftOverride ?? ((input) => saveDraft(applicationId, input, csrfToken));

return (
  <div className="agent-flow-editor__shell">
    <AgentFlowOverlay
      autosaveLabel="30 秒自动保存"
      onOpenIssues={() => setIssuesOpen(true)}
      onOpenHistory={() => setHistoryOpen(true)}
      publishDisabledReason="发布网关将在 06B 接入"
    />
    <AgentFlowCanvas
      document={document}
      selectedNodeId={selectedNodeId}
      onSelectNode={setSelectedNodeId}
      onDocumentChange={setDocument}
      onOpenIssues={() => setIssuesOpen(true)}
    />
    <NodeInspector
      document={document}
      selectedNodeId={selectedNodeId}
      onDocumentChange={setDocument}
    />
    <IssuesDrawer open={issuesOpen} onClose={() => setIssuesOpen(false)} issues={[]} />
    <VersionHistoryDrawer
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      versions={initialState.versions}
      restoring={false}
    />
  </div>
);
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx
<ReactFlow
  nodes={toCanvasNodes(document, selectedNodeId, issueCountByNodeId)}
  edges={toCanvasEdges(document)}
  nodeTypes={agentFlowNodeTypes}
  fitView
  onNodeClick={(_, node) => onSelectNode(node.id)}
>
  <MiniMap pannable zoomable />
  <Controls position="bottom-left" />
  <Background gap={20} />
</ReactFlow>
```

- [x] **Step 4: Run the targeted editor-shell tests and build**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx -v
pnpm --dir web/app build
```

Expected: the editor mounts with the default graph, plus-entry creation works, and the app build resolves the new XYFlow and Lexical imports.

Execution note (`2026-04-15 16:00`):

- Added `web/app/src/test/setup.ts` `ResizeObserver` mock so `@xyflow/react` custom nodes can render under jsdom.
- Final verification ran with:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx -v
pnpm --dir web/app build
```

- Result: editor-shell suite `1 passed`; canvas suite `1 passed`; web production build succeeded.

- [x] **Step 5: Commit**

```bash
git add web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx web/app/src/features/agent-flow/components/editor/agent-flow-editor.css web/app/src/features/agent-flow/components/node-picker/NodePickerPopover.tsx web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx web/app/src/features/agent-flow/components/nodes/node-registry.tsx web/app/src/features/agent-flow/lib/default-agent-flow-document.ts web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx
git commit -m "feat: add agent flow editor shell"
```

Commit note (`2026-04-15 16:01`): committed as `a13b8f42 feat: add agent flow editor shell`.

## Task 5: Implement The Inspector And Binding Editors For Non-Container Nodes

**Files:**
- Create: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/SelectorField.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/TemplatedTextField.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/NamedBindingsField.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/ConditionGroupField.tsx`
- Create: `web/app/src/features/agent-flow/components/bindings/StateWriteField.tsx`
- Create: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- Create: `web/app/src/features/agent-flow/lib/selector-options.ts`
- Create: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Create: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`

- [x] **Step 1: Write the failing inspector and validation tests**

```tsx
test('renders unified Basics Inputs Outputs Policy Advanced sections for an LLM node', async () => {
  render(
    <NodeInspector
      document={document}
      selectedNodeId="node-llm"
      onDocumentChange={vi.fn()}
    />
  );

  expect(screen.getByText('Basics')).toBeInTheDocument();
  expect(screen.getByText('Inputs')).toBeInTheDocument();
  expect(screen.getByText('Outputs')).toBeInTheDocument();
  expect(screen.getByText('Policy')).toBeInTheDocument();
  expect(screen.getByText('Advanced')).toBeInTheDocument();
  expect(screen.getByLabelText('System Prompt')).toBeInTheDocument();
});
```

```ts
test('returns field, node, and global issues', () => {
  const broken = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
  broken.graph.nodes = broken.graph.nodes.filter((node) => node.id !== 'node-answer');

  const issues = validateDocument(broken);

  expect(issues.some((issue) => issue.scope === 'field')).toBe(true);
  expect(issues.some((issue) => issue.scope === 'node')).toBe(true);
  expect(issues.some((issue) => issue.scope === 'global')).toBe(true);
});
```

- [x] **Step 2: Implement node definitions, selector options, and the binding-editor family**

```tsx
// web/app/src/features/agent-flow/lib/node-definitions.tsx
export type InspectorSectionKey =
  | 'basics'
  | 'inputs'
  | 'outputs'
  | 'policy'
  | 'advanced';

export interface NodeDefinition {
  label: string;
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: Array<{
      key: string;
      label: string;
      editor:
        | 'text'
        | 'number'
        | 'selector'
        | 'selector_list'
        | 'templated_text'
        | 'named_bindings'
        | 'condition_group'
        | 'state_write';
    }>;
  }>;
}

export const nodeDefinitions: Record<string, NodeDefinition> = {
  start: {
    label: 'Start',
    sections: [
      { key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] },
      { key: 'outputs', title: 'Outputs', fields: [{ key: 'outputs.query', label: '用户输入', editor: 'text' }] }
    ]
  },
  answer: {
    label: 'Answer',
    sections: [
      { key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] },
      { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.answer_template', label: '回复内容', editor: 'templated_text' }] },
      { key: 'outputs', title: 'Outputs', fields: [{ key: 'outputs.answer', label: '对话输出', editor: 'text' }] }
    ]
  },
  llm: {
    label: 'LLM',
    sections: [
      { key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          { key: 'config.model', label: '模型', editor: 'text' },
          { key: 'bindings.system_prompt', label: 'System Prompt', editor: 'templated_text' },
          { key: 'bindings.user_prompt', label: 'User Prompt', editor: 'templated_text' }
        ]
      },
      { key: 'outputs', title: 'Outputs', fields: [{ key: 'outputs.text', label: '模型输出', editor: 'text' }] },
      { key: 'policy', title: 'Policy', fields: [{ key: 'config.temperature', label: '温度', editor: 'number' }] },
      { key: 'advanced', title: 'Advanced', fields: [{ key: 'config.max_tokens', label: '最大输出', editor: 'number' }] }
    ]
  },
  knowledge_retrieval: { label: 'Knowledge Retrieval', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.query', label: '检索问题', editor: 'selector' }] }] },
  question_classifier: { label: 'Question Classifier', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.question', label: '待分类问题', editor: 'selector' }] }] },
  if_else: { label: 'IfElse', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.condition_group', label: '条件组', editor: 'condition_group' }] }] },
  code: { label: 'Code', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.named_bindings', label: '输入变量', editor: 'named_bindings' }] }, { key: 'advanced', title: 'Advanced', fields: [{ key: 'config.language', label: '运行语言', editor: 'text' }] }] },
  template_transform: { label: 'Template Transform', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.template', label: '模板', editor: 'templated_text' }] }] },
  http_request: { label: 'HTTP Request', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'config.url', label: 'URL', editor: 'templated_text' }, { key: 'bindings.body', label: '请求体', editor: 'templated_text' }] }] },
  tool: { label: 'Tool', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.parameters', label: '工具入参', editor: 'named_bindings' }] }] },
  variable_assigner: { label: 'Variable Assigner', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.operations', label: '变量操作', editor: 'state_write' }] }] },
  parameter_extractor: { label: 'Parameter Extractor', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.source_text', label: '源文本', editor: 'selector' }] }] },
  human_input: { label: 'Human Input', sections: [{ key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] }, { key: 'inputs', title: 'Inputs', fields: [{ key: 'config.prompt', label: '等待问题', editor: 'templated_text' }] }] }
};
```

```tsx
// web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx
const definition = selectedNode ? nodeDefinitions[selectedNode.type] : null;

if (!selectedNode || !definition) {
  return null;
}

return (
  <aside className="agent-flow-editor__inspector">
    {definition.sections.map((section) => (
      <Collapse
        key={section.key}
        items={[
          {
            key: section.key,
            label: section.title,
            children: section.fields.map((field) => renderInspectorField(field, selectedNode))
          }
        ]}
        defaultActiveKey={[section.key]}
      />
    ))}
  </aside>
);
```

- [x] **Step 3: Implement static validation for selector visibility, required config, and global graph rules**

```ts
// web/app/src/features/agent-flow/lib/validate-document.ts
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

export interface AgentFlowIssue {
  id: string;
  scope: 'field' | 'node' | 'global';
  level: 'error' | 'warning';
  nodeId: string | null;
  sectionKey: 'basics' | 'inputs' | 'outputs' | 'policy' | 'advanced' | null;
  title: string;
  message: string;
}

export function validateDocument(document: FlowAuthoringDocument): AgentFlowIssue[] {
  const issues: AgentFlowIssue[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));

  if (!nodeIds.has('node-start')) {
    issues.push({
      id: 'global-start-missing',
      scope: 'global',
      level: 'error',
      nodeId: null,
      sectionKey: null,
      title: '缺少 Start 节点',
      message: '每个草稿都必须保留唯一 Start 节点。'
    });
  }

  for (const node of document.graph.nodes) {
    if (node.type === 'llm' && typeof node.config.model !== 'string') {
      issues.push({
        id: `${node.id}-model-required`,
        scope: 'field',
        level: 'error',
        nodeId: node.id,
        sectionKey: 'inputs',
        title: 'LLM 缺少模型',
        message: '请先在 Inputs 中选择模型。'
      });
    }

    if (node.type !== 'start' && !document.graph.edges.some((edge) => edge.target === node.id)) {
      issues.push({
        id: `${node.id}-orphan-node`,
        scope: 'node',
        level: 'warning',
        nodeId: node.id,
        sectionKey: 'basics',
        title: `${node.alias} 尚未接入主链路`,
        message: '当前节点没有任何入边。'
      });
    }
  }

  return issues;
}
```

- [x] **Step 4: Run the targeted inspector and validation tests**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/validate-document.test.ts -v
```

Expected: the inspector renders the unified five-section structure and validation reports field, node, and global issues without server participation.

- [x] **Step 5: Commit**

```bash
git add web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx web/app/src/features/agent-flow/components/bindings/SelectorField.tsx web/app/src/features/agent-flow/components/bindings/TemplatedTextField.tsx web/app/src/features/agent-flow/components/bindings/NamedBindingsField.tsx web/app/src/features/agent-flow/components/bindings/ConditionGroupField.tsx web/app/src/features/agent-flow/components/bindings/StateWriteField.tsx web/app/src/features/agent-flow/lib/node-definitions.tsx web/app/src/features/agent-flow/lib/selector-options.ts web/app/src/features/agent-flow/lib/validate-document.ts web/app/src/features/agent-flow/_tests/node-inspector.test.tsx web/app/src/features/agent-flow/_tests/validate-document.test.ts
git commit -m "feat: add agent flow inspector and bindings"
```

## Task 6: Add Issues, Autosave, History, And Restore

**Files:**
- Create: `web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx`
- Create: `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
- Create: `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts`
- Create: `web/app/src/features/agent-flow/lib/history-change.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- Modify: `web/app/src/features/agent-flow/api/orchestration.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `api/apps/api-server/src/routes/application_orchestration.rs`

- [ ] **Step 1: Write the failing autosave, history, and issue-focus tests**

```tsx
test('sends layout changes without appending history and opens the selected issue target', async () => {
  vi.useFakeTimers();
  const initialState = {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [
      {
        id: 'version-1',
        sequence: 1,
        trigger: 'autosave',
        change_kind: 'logical',
        summary: '初始化默认草稿',
        created_at: '2026-04-15T09:00:00Z'
      }
    ],
    autosave_interval_seconds: 30
  };
  const saveDraft = vi.fn().mockResolvedValue(initialState);
  render(
    <AgentFlowEditorShell
      applicationId="app-1"
      applicationName="Support Agent"
      initialState={initialState}
      saveDraftOverride={saveDraft}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
  fireEvent.click(await screen.findByRole('button', { name: 'LLM 缺少模型' }));

  act(() => {
    vi.advanceTimersByTime(30_000);
  });

  expect(saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({ change_kind: 'layout' })
  );
  expect(screen.getByLabelText('模型')).toHaveFocus();
});
```

```tsx
test('restores a history version into the current draft', async () => {
  const versions = [
    {
      id: 'version-1',
      sequence: 1,
      trigger: 'autosave',
      change_kind: 'logical',
      summary: '初始化默认草稿',
      created_at: '2026-04-15T09:00:00Z'
    }
  ];
  const restoreVersion = vi.fn().mockResolvedValue({
    flow_id: 'flow-1',
    draft: {
      id: 'draft-2',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:15:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions,
    autosave_interval_seconds: 30
  });
  render(
    <VersionHistoryDrawer
      open
      onClose={vi.fn()}
      versions={versions}
      restoring={false}
      onRestore={restoreVersion}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: '恢复版本 1' }));

  expect(restoreVersion).toHaveBeenCalledWith('version-1');
});
```

- [ ] **Step 2: Implement logical-vs-layout classification and the 30-second autosave hook**

```ts
// web/app/src/features/agent-flow/lib/history-change.ts
import {
  classifyDocumentChange,
  type FlowAuthoringDocument
} from '@1flowse/flow-schema';

export function buildVersionSummary(
  before: FlowAuthoringDocument,
  after: FlowAuthoringDocument
): string {
  const beforeIds = new Set(before.graph.nodes.map((node) => node.id));
  const afterIds = new Set(after.graph.nodes.map((node) => node.id));
  const added = after.graph.nodes.filter((node) => !beforeIds.has(node.id));
  const removed = before.graph.nodes.filter((node) => !afterIds.has(node.id));

  if (added.length > 0) {
    return `新增 ${added.map((node) => node.alias).join('、')}`;
  }

  if (removed.length > 0) {
    return `删除 ${removed.map((node) => node.alias).join('、')}`;
  }

  return classifyDocumentChange(before, after) === 'logical'
    ? '更新节点配置'
    : '更新画布布局';
}
```

```ts
// web/app/src/features/agent-flow/hooks/useEditorAutosave.ts
export function useEditorAutosave({
  document,
  lastSavedDocument,
  onSave
}: {
  document: FlowAuthoringDocument;
  lastSavedDocument: FlowAuthoringDocument;
  onSave: (input: {
    document: FlowAuthoringDocument;
    change_kind: 'layout' | 'logical';
    summary: string;
  }) => Promise<void>;
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (JSON.stringify(document) === JSON.stringify(lastSavedDocument)) {
        return;
      }

      setStatus('saving');

      try {
        await onSave({
          document,
          change_kind: classifyDocumentChange(lastSavedDocument, document),
          summary: buildVersionSummary(lastSavedDocument, document)
        });
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [document, lastSavedDocument, onSave]);

  return status;
}
```

- [ ] **Step 3: Connect Issues and history drawers to node focus and restore mutations**

```tsx
// web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx
<Drawer title="Issues" open={open} onClose={onClose} placement="right" width={360}>
  <List
    dataSource={issues}
    renderItem={(issue) => (
      <List.Item>
        <Button type="link" onClick={() => onSelectIssue(issue)}>
          {issue.title}
        </Button>
      </List.Item>
    )}
  />
</Drawer>
```

```tsx
// web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx
<Drawer title="历史版本" open={open} onClose={onClose} placement="right" width={420}>
  <List
    dataSource={versions}
    renderItem={(version) => (
      <List.Item
        actions={[
          <Button
            key={version.id}
            loading={restoring}
            onClick={() => onRestore(version.id)}
          >
            恢复版本 {version.sequence}
          </Button>
        ]}
      >
        <List.Item.Meta
          title={`版本 ${version.sequence}`}
          description={`${version.summary} · ${version.created_at}`}
        />
      </List.Item>
    )}
  />
</Drawer>
```

- [ ] **Step 4: Run the targeted history and issue tests**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/routes/_tests/application-shell-routing.test.tsx -v
```

Expected: overlay status changes between `saving` and `saved`, layout-only saves stay out of history growth, issue clicks focus the corresponding node field, and restore replaces the active draft state.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx web/app/src/features/agent-flow/hooks/useEditorAutosave.ts web/app/src/features/agent-flow/lib/history-change.ts web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx web/app/src/features/agent-flow/api/orchestration.ts web/app/src/features/agent-flow/lib/validate-document.ts api/apps/api-server/src/routes/application_orchestration.rs
git commit -m "feat: add agent flow autosave and history"
```

## Task 7: Add Container Subcanvas, Mobile Fallback, And Final Verification

**Files:**
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- Modify: `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [ ] **Step 1: Write the failing container-navigation and mobile-fallback tests**

```tsx
test('focuses the iteration child canvas and returns through breadcrumb', async () => {
  const iterationState = {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: {
        ...createDefaultAgentFlowDocument({ flowId: 'flow-1' }),
        graph: {
          nodes: [
            ...createDefaultAgentFlowDocument({ flowId: 'flow-1' }).graph.nodes,
            {
              id: 'node-iteration',
              type: 'iteration',
              alias: 'Iteration',
              containerId: null,
              position: { x: 920, y: 220 },
              configVersion: 1,
              config: {},
              bindings: {},
              outputs: [{ key: 'result', title: '聚合输出', valueType: 'array' }]
            },
            {
              id: 'node-inner-answer',
              type: 'answer',
              alias: 'Inner Answer',
              containerId: 'node-iteration',
              position: { x: 360, y: 220 },
              configVersion: 1,
              config: {},
              bindings: {},
              outputs: [{ key: 'answer', title: '对话输出', valueType: 'string' }]
            }
          ],
          edges: createDefaultAgentFlowDocument({ flowId: 'flow-1' }).graph.edges
        }
      }
    },
    versions: [],
    autosave_interval_seconds: 30
  };

  render(
    <AgentFlowEditorShell
      applicationId="app-1"
      applicationName="Support Agent"
      initialState={iterationState}
    />
  );

  fireEvent.doubleClick(await screen.findByText('Iteration'));
  expect(screen.getByRole('button', { name: '返回主画布' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '返回主画布' }));
  expect(screen.getByText('Start')).toBeInTheDocument();
});

test('shows a desktop-only message on small screens', async () => {
  vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: false } as never);
  render(<AgentFlowEditorPage applicationId="app-1" applicationName="Support Agent" apiCapabilityStatus="planned" />);

  expect(await screen.findByText('请使用桌面端编辑')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement Iteration and Loop child-canvas focus plus mobile downgrade**

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx
const [containerPath, setContainerPath] = useState<string[]>([]);
const screens = Grid.useBreakpoint();

if (!screens.lg) {
  return (
    <Result
      status="info"
      title="请使用桌面端编辑"
      subTitle="移动端只提供受限查看，不开放完整画布编辑。"
    />
  );
}

const activeContainerId = containerPath.at(-1) ?? null;
const activeNodes = document.graph.nodes.filter((node) => node.containerId === activeContainerId);
const activeEdges = document.graph.edges.filter((edge) => edge.containerId === activeContainerId);
```

```tsx
// web/app/src/features/agent-flow/lib/node-definitions.tsx
nodeDefinitions.iteration = {
  label: 'Iteration',
  sections: [
    { key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] },
    { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.items', label: '循环列表', editor: 'selector' }] },
    { key: 'outputs', title: 'Outputs', fields: [{ key: 'outputs.result', label: '聚合输出', editor: 'text' }] }
  ]
};

nodeDefinitions.loop = {
  label: 'Loop',
  sections: [
    { key: 'basics', title: 'Basics', fields: [{ key: 'alias', label: '节点名称', editor: 'text' }] },
    { key: 'inputs', title: 'Inputs', fields: [{ key: 'bindings.entry_condition', label: '入口条件', editor: 'condition_group' }] },
    { key: 'policy', title: 'Policy', fields: [{ key: 'config.max_rounds', label: '最大轮数', editor: 'number' }] }
  ]
};
```

- [ ] **Step 3: Update style-boundary scenes and run the final verification suite**

```json
{
  "id": "page.application-detail",
  "kind": "page",
  "title": "Application Detail Page",
  "impactFiles": [
    "web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx",
    "web/app/src/shared/ui/section-page-layout/SectionSidebarNav.tsx",
    "web/app/src/shared/ui/section-page-layout/section-page-layout.css",
    "web/app/src/features/applications/pages/ApplicationDetailPage.tsx",
    "web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx",
    "web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx",
    "web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx",
    "web/app/src/features/agent-flow/components/editor/agent-flow-editor.css"
  ],
  "boundaryNodes": [
    {
      "id": "editor-shell",
      "selector": ".agent-flow-editor__shell",
      "propertyAssertions": [
        {
          "property": "display",
          "expected": "grid"
        }
      ]
    }
  ]
}
```

Run:

```bash
cargo test -p api-server application_orchestration_routes -v
cargo test -p control-plane flow_service_tests -v
cargo test -p storage-pg flow_repository_tests -v
pnpm --dir web lint
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-document.test.ts src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/validate-document.test.ts src/routes/_tests/application-shell-routing.test.tsx -v
pnpm --dir web/app build
node scripts/node/check-style-boundary.js page page.application-detail
node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css
```

Expected: backend flow routes pass; frontend lint, targeted editor tests, and build pass; the updated application detail scene and the new editor stylesheet both pass style-boundary regression.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx web/app/src/features/agent-flow/lib/node-definitions.tsx web/app/src/features/agent-flow/lib/default-agent-flow-document.ts web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx web/app/src/style-boundary/registry.tsx web/app/src/style-boundary/scenario-manifest.json
git commit -m "feat: finish agent flow container editing"
```

## Self-Review

- `spec` 覆盖情况：
  - `editor 容器 / overlay / 默认三节点 / 右侧配置 / 新增节点入口 / 自动保存 / 历史恢复 / Issues / Iteration / Loop 子画布 / 第一批节点 / 移动端降级 / 样式回归` 都有对应任务。
  - `发布配置 / Publish` 在计划中按正式 overlay 入口接入，但保持禁用态并明确依赖 `06B`；没有把发布网关细节误并入本计划。
- 占位词扫描：
  - 本计划没有使用 `TODO`、`TBD`、`implement later`、`fill in details` 之类占位词。
- 类型一致性：
  - 前端统一使用 `FlowAuthoringDocument`。
  - 后端统一使用 `FlowDraftRecord / FlowVersionRecord / FlowEditorState`。
  - 保存接口统一传 `change_kind: 'layout' | 'logical'`。
  - 历史快照统一使用 `trigger: 'autosave' | 'restore'`。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-agentflow-editor.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
