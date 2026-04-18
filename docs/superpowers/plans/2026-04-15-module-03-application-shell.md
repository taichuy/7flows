# Module 03 Application Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前仓库内完成 `03` 模块的最小闭环实现：工作台首页切换为 `Application` 列表与创建入口，后端落地 `GET/POST/GET detail` 三个控制台接口，应用详情固定为 `orchestration / api / logs / monitoring` 四分区壳层，并为后续 `04/05/06B` 返回 future hooks。

**Architecture:** 后端采用现有 `domain -> control-plane -> storage-pg -> api-server` 分层，新增 `ApplicationRecord` 与 `ApplicationService`，由存储层负责 `own/all` 过滤查询，`GET /api/console/applications/:id` 返回基础元数据和四分区能力状态。前端保持 `工作台` 顶层导航不变，`HomePage` 改为 `ApplicationListPage` 容器，应用详情沿用 `SectionPageLayout`，`API` 分区只展示“统一调用 URL + API Key 绑定应用”的正式空态，不提前实现真实发布网关。

**Tech Stack:** Rust, Axum, SQLx, Utoipa, React 19, TypeScript, TanStack Router, TanStack Query, Zustand, Ant Design 5, Vitest, Testing Library

**Source Spec:** `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。

---

## File Structure

**Create**
- `api/crates/domain/src/application.rs`
- `api/crates/control-plane/src/application.rs`
- `api/crates/control-plane/src/_tests/application_service_tests.rs`
- `api/crates/storage-pg/src/mappers/application_mapper.rs`
- `api/crates/storage-pg/src/application_repository.rs`
- `api/crates/storage-pg/src/_tests/application_repository_tests.rs`
- `api/crates/storage-pg/migrations/20260415093000_create_application_tables.sql`
- `api/apps/api-server/src/routes/applications.rs`
- `api/apps/api-server/src/_tests/application_routes.rs`
- `web/packages/api-client/src/console-applications.ts`
- `web/app/src/features/applications/api/applications.ts`
- `web/app/src/features/applications/components/ApplicationCreateModal.tsx`
- `web/app/src/features/applications/components/ApplicationCardGrid.tsx`
- `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- `web/app/src/features/applications/lib/application-sections.tsx`
- `web/app/src/features/applications/pages/ApplicationListPage.tsx`
- `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- `web/app/src/features/applications/_tests/application-create-modal.test.tsx`
- `web/app/src/routes/_tests/application-shell-routing.test.tsx`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/storage-pg/src/mappers/mod.rs`
- `api/crates/storage-pg/src/lib.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/_tests/mod.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/src/_tests/openapi_alignment.rs`
- `web/packages/api-client/src/index.ts`
- `web/packages/shared-types/src/index.ts`
- `web/app/src/features/home/pages/HomePage.tsx`
- `web/app/src/features/home/_tests/home-page.test.tsx`
- `web/app/src/app/router.tsx`
- `web/app/src/routes/route-config.ts`
- `web/app/src/routes/_tests/route-config.test.ts`
- `web/app/src/app/_tests/app-shell.test.tsx`
- `web/app/src/style-boundary/registry.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`

## Task 1: Add Application Persistence And Domain Types

**Files:**
- Create: `api/crates/domain/src/application.rs`
- Create: `api/crates/storage-pg/src/mappers/application_mapper.rs`
- Create: `api/crates/storage-pg/src/application_repository.rs`
- Create: `api/crates/storage-pg/src/_tests/application_repository_tests.rs`
- Create: `api/crates/storage-pg/migrations/20260415093000_create_application_tables.sql`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`

- [x] **Step 1: Write the failing repository tests**

Create `api/crates/storage-pg/src/_tests/application_repository_tests.rs`:

```rust
use control_plane::ports::{ApplicationRepository, ApplicationVisibility, CreateApplicationInput};
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase".into())
}

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().simple());
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{}?options=-csearch_path%3D{schema}", base_database_url())
}

async fn root_tenant_id(store: &PgControlPlaneStore) -> Uuid {
    sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap()
}

async fn seed_workspace(store: &PgControlPlaneStore, name: &str) -> Uuid {
    let workspace_id = Uuid::now_v7();
    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(root_tenant_id(store).await)
    .bind(name)
    .execute(store.pool())
    .await
    .unwrap();
    workspace_id
}

async fn seed_user(store: &PgControlPlaneStore, workspace_id: Uuid, account_prefix: &str) -> Uuid {
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

#[tokio::test]
async fn list_applications_scopes_rows_by_workspace_and_owner() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Applications").await;
    let actor_user_id = seed_user(&store, workspace_id, "owner").await;
    let other_user_id = seed_user(&store, workspace_id, "other").await;

    let owned = <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Owned App".into(),
            description: "owned".into(),
            icon: Some("RobotOutlined".into()),
            icon_type: Some("iconfont".into()),
            icon_background: Some("#E6F7F2".into()),
        },
    )
    .await
    .unwrap();

    <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id: other_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Foreign App".into(),
            description: "foreign".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();

    let own_only = <PgControlPlaneStore as ApplicationRepository>::list_applications(
        &store,
        workspace_id,
        actor_user_id,
        ApplicationVisibility::Own,
    )
    .await
    .unwrap();
    let all_rows = <PgControlPlaneStore as ApplicationRepository>::list_applications(
        &store,
        workspace_id,
        actor_user_id,
        ApplicationVisibility::All,
    )
    .await
    .unwrap();

    assert_eq!(own_only.len(), 1);
    assert_eq!(own_only[0].id, owned.id);
    assert_eq!(all_rows.len(), 2);
}

#[tokio::test]
async fn get_application_returns_section_hooks_with_null_runtime_targets() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Applications Detail").await;
    let actor_user_id = seed_user(&store, workspace_id, "detail").await;
    let created = <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Detail App".into(),
            description: "detail".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();

    let detail = <PgControlPlaneStore as ApplicationRepository>::get_application(
        &store,
        workspace_id,
        created.id,
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(detail.sections.api.invoke_routing_mode, "api_key_bound_application");
    assert_eq!(detail.sections.api.invoke_path_template, None);
    assert_eq!(detail.sections.orchestration.current_draft_id, None);
}
```

- [x] **Step 2: Run the repository tests to verify they fail**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p storage-pg application_repository_tests -- --nocapture
```

Expected: FAIL because the migration, trait, mapper, and repository implementation do not exist yet.

- [x] **Step 3: Implement the migration, domain record, mapper, and repository**

Create `api/crates/storage-pg/migrations/20260415093000_create_application_tables.sql`:

```sql
create table applications (
    id uuid primary key,
    workspace_id uuid not null references workspaces(id) on delete cascade,
    application_type text not null check (application_type in ('agent_flow', 'workflow')),
    name text not null,
    description text not null default '',
    icon_type text null,
    icon text null,
    icon_background text null,
    created_by uuid not null references users(id),
    updated_by uuid null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index applications_workspace_updated_idx
    on applications (workspace_id, updated_at desc, id desc);

create index applications_workspace_creator_idx
    on applications (workspace_id, created_by, updated_at desc, id desc);
```

Create `api/crates/domain/src/application.rs`:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApplicationType {
    AgentFlow,
    Workflow,
}

impl ApplicationType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AgentFlow => "agent_flow",
            Self::Workflow => "workflow",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationOrchestrationSection {
    pub status: String,
    pub subject_kind: String,
    pub subject_status: String,
    pub current_subject_id: Option<Uuid>,
    pub current_draft_id: Option<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationApiSection {
    pub status: String,
    pub credential_kind: String,
    pub invoke_routing_mode: String,
    pub invoke_path_template: Option<String>,
    pub api_capability_status: String,
    pub credentials_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationLogsSection {
    pub status: String,
    pub runs_capability_status: String,
    pub run_object_kind: String,
    pub log_retention_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationMonitoringSection {
    pub status: String,
    pub metrics_capability_status: String,
    pub metrics_object_kind: String,
    pub tracing_config_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationSections {
    pub orchestration: ApplicationOrchestrationSection,
    pub api: ApplicationApiSection,
    pub logs: ApplicationLogsSection,
    pub monitoring: ApplicationMonitoringSection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub application_type: ApplicationType,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
    pub created_by: Uuid,
    pub updated_at: time::OffsetDateTime,
    pub sections: ApplicationSections,
}
```

Extend `api/crates/control-plane/src/ports.rs` with the application repository contract:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationVisibility {
    Own,
    All,
}

#[derive(Debug, Clone)]
pub struct CreateApplicationInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub application_type: domain::ApplicationType,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

#[async_trait]
pub trait ApplicationRepository: Send + Sync {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> anyhow::Result<domain::ActorContext>;
    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> anyhow::Result<Vec<domain::ApplicationRecord>>;
    async fn create_application(
        &self,
        input: &CreateApplicationInput,
    ) -> anyhow::Result<domain::ApplicationRecord>;
    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> anyhow::Result<Option<domain::ApplicationRecord>>;
    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> anyhow::Result<()>;
}
```

Implement `api/crates/storage-pg/src/application_repository.rs` with owner filtering in SQL:

```rust
let rows = sqlx::query(
    r#"
    select
        id,
        workspace_id,
        application_type,
        name,
        description,
        icon_type,
        icon,
        icon_background,
        created_by,
        updated_at
    from applications
    where workspace_id = $1
      and ($3 = 'all' or created_by = $2)
    order by updated_at desc, id desc
    "#,
)
.bind(workspace_id)
.bind(actor_user_id)
.bind(match visibility {
    ApplicationVisibility::Own => "own",
    ApplicationVisibility::All => "all",
})
.fetch_all(self.pool())
.await?;
```

- [x] **Step 4: Re-run the repository tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p storage-pg application_repository_tests -- --nocapture
```

Expected: PASS.

- [x] **Step 5: Commit the persistence slice**

```bash
git add api/crates/domain/src/application.rs
git add api/crates/domain/src/lib.rs
git add api/crates/control-plane/src/ports.rs
git add api/crates/storage-pg/src/mappers/application_mapper.rs
git add api/crates/storage-pg/src/application_repository.rs
git add api/crates/storage-pg/src/_tests/application_repository_tests.rs
git add api/crates/storage-pg/src/mappers/mod.rs
git add api/crates/storage-pg/src/lib.rs
git add api/crates/storage-pg/src/repositories.rs
git add api/crates/storage-pg/src/_tests/mod.rs
git add api/crates/storage-pg/migrations/20260415093000_create_application_tables.sql
git commit -m "feat(api): add application persistence"
```

## Task 2: Add Application Service And ACL Decisions

**Files:**
- Create: `api/crates/control-plane/src/application.rs`
- Create: `api/crates/control-plane/src/_tests/application_service_tests.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [x] **Step 1: Write the failing service tests**

Create `api/crates/control-plane/src/_tests/application_service_tests.rs`:

```rust
use control_plane::application::{ApplicationService, CreateApplicationCommand};
use domain::ApplicationType;
use uuid::Uuid;

#[tokio::test]
async fn create_application_requires_application_create_all() {
    let service = ApplicationService::for_tests_with_permissions(vec!["application.view.own"]);

    let error = service
        .create_application(CreateApplicationCommand {
            actor_user_id: Uuid::nil(),
            application_type: ApplicationType::AgentFlow,
            name: "Blocked".into(),
            description: "blocked".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn list_applications_uses_own_scope_when_actor_lacks_all_scope() {
    let service = ApplicationService::for_tests_with_permissions(vec!["application.view.own", "application.create.all"]);
    let mine = service
        .create_application(CreateApplicationCommand {
            actor_user_id: Uuid::nil(),
            application_type: ApplicationType::AgentFlow,
            name: "Mine".into(),
            description: "mine".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        })
        .await
        .unwrap();
    service.seed_foreign_application("Other App");

    let visible = service.list_applications(Uuid::nil()).await.unwrap();

    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0].id, mine.id);
}

#[tokio::test]
async fn get_application_detail_returns_planned_future_hooks() {
    let service = ApplicationService::for_tests();
    let created = service
        .create_application(CreateApplicationCommand {
            actor_user_id: Uuid::nil(),
            application_type: ApplicationType::AgentFlow,
            name: "Detail".into(),
            description: "detail".into(),
            icon: Some("RobotOutlined".into()),
            icon_type: Some("iconfont".into()),
            icon_background: Some("#E6F7F2".into()),
        })
        .await
        .unwrap();

    let detail = service.get_application(Uuid::nil(), created.id).await.unwrap();

    assert_eq!(detail.sections.orchestration.subject_kind, "agent_flow");
    assert_eq!(detail.sections.api.credentials_status, "planned");
    assert_eq!(detail.sections.logs.run_object_kind, "application_run");
    assert_eq!(detail.sections.monitoring.metrics_object_kind, "application_metrics");
}
```

- [x] **Step 2: Run the service tests to verify they fail**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p control-plane application_service_tests -- --nocapture
```

Expected: FAIL because `ApplicationService` does not exist yet.

- [x] **Step 3: Implement the service with planned section hooks**

Create `api/crates/control-plane/src/application.rs`:

```rust
use std::{collections::HashMap, sync::{Arc, Mutex}};

use access_control::ensure_permission;
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

use crate::{audit::audit_log, errors::ControlPlaneError, ports::{ApplicationRepository, ApplicationVisibility, CreateApplicationInput}};

pub struct CreateApplicationCommand {
    pub actor_user_id: Uuid,
    pub application_type: domain::ApplicationType,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

pub struct ApplicationService<R> {
    repository: R,
}

impl<R> ApplicationService<R>
where
    R: ApplicationRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_applications(&self, actor_user_id: Uuid) -> Result<Vec<domain::ApplicationRecord>> {
        let actor = self.repository.load_actor_context_for_user(actor_user_id).await?;
        let visibility = if actor.is_root || actor.has_permission("application.view.all") {
            ApplicationVisibility::All
        } else if actor.has_permission("application.view.own") {
            ApplicationVisibility::Own
        } else {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        };

        self.repository
            .list_applications(actor.current_workspace_id, actor_user_id, visibility)
            .await
    }

    pub async fn create_application(
        &self,
        command: CreateApplicationCommand,
    ) -> Result<domain::ApplicationRecord> {
        let actor = self.repository.load_actor_context_for_user(command.actor_user_id).await?;
        ensure_permission(&actor, "application.create.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let created = self.repository.create_application(&CreateApplicationInput {
            actor_user_id: command.actor_user_id,
            workspace_id: actor.current_workspace_id,
            application_type: command.application_type,
            name: command.name,
            description: command.description,
            icon: command.icon,
            icon_type: command.icon_type,
            icon_background: command.icon_background,
        }).await?;

        self.repository.append_audit_log(&audit_log(
            Some(actor.current_workspace_id),
            Some(command.actor_user_id),
            "application",
            Some(created.id),
            "application.created",
            serde_json::json!({ "application_type": created.application_type.as_str() }),
        )).await?;

        Ok(created)
    }
}
```

Build the future hooks once in the service/repository return value:

```rust
sections: domain::ApplicationSections {
    orchestration: domain::ApplicationOrchestrationSection {
        status: "planned".into(),
        subject_kind: "agent_flow".into(),
        subject_status: "unconfigured".into(),
        current_subject_id: None,
        current_draft_id: None,
    },
    api: domain::ApplicationApiSection {
        status: "planned".into(),
        credential_kind: "application_api_key".into(),
        invoke_routing_mode: "api_key_bound_application".into(),
        invoke_path_template: None,
        api_capability_status: "planned".into(),
        credentials_status: "planned".into(),
    },
    logs: domain::ApplicationLogsSection {
        status: "planned".into(),
        runs_capability_status: "planned".into(),
        run_object_kind: "application_run".into(),
        log_retention_status: "planned".into(),
    },
    monitoring: domain::ApplicationMonitoringSection {
        status: "planned".into(),
        metrics_capability_status: "planned".into(),
        metrics_object_kind: "application_metrics".into(),
        tracing_config_status: "planned".into(),
    },
}
```

Add an in-memory test constructor in the same file so the service tests can run without SQL:

```rust
impl ApplicationService<InMemoryApplicationRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryApplicationRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]))
    }

    pub fn for_tests_with_permissions(permissions: Vec<&str>) -> Self {
        Self::new(InMemoryApplicationRepository::with_permissions(permissions))
    }
}
```

- [x] **Step 4: Re-run the service tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p control-plane application_service_tests -- --nocapture
```

Expected: PASS.

- [x] **Step 5: Commit the service slice**

```bash
git add api/crates/control-plane/src/application.rs
git add api/crates/control-plane/src/_tests/application_service_tests.rs
git add api/crates/control-plane/src/lib.rs
git add api/crates/control-plane/src/_tests/mod.rs
git commit -m "feat(api): add application service"
```

## Task 3: Expose Console Application Routes And OpenAPI

**Files:**
- Create: `api/apps/api-server/src/routes/applications.rs`
- Create: `api/apps/api-server/src/_tests/application_routes.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`

- [x] **Step 1: Write the failing route and OpenAPI tests**

Create `api/apps/api-server/src/_tests/application_routes.rs`:

```rust
use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{body::{to_bytes, Body}, http::{Request, StatusCode}};
use serde_json::{json, Value};
use tower::ServiceExt;

#[tokio::test]
async fn application_routes_create_list_and_detail() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let create = app.clone().oneshot(
        Request::builder()
            .method("POST")
            .uri("/api/console/applications")
            .header("cookie", &cookie)
            .header("x-csrf-token", &csrf)
            .header("content-type", "application/json")
            .body(Body::from(json!({
                "application_type": "agent_flow",
                "name": "Agent Support",
                "description": "support app",
                "icon": "RobotOutlined",
                "icon_type": "iconfont",
                "icon_background": "#E6F7F2"
            }).to_string()))
            .unwrap(),
    ).await.unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);

    let payload: Value = serde_json::from_slice(&to_bytes(create.into_body(), usize::MAX).await.unwrap()).unwrap();
    let application_id = payload["data"]["id"].as_str().unwrap();

    let list = app.clone().oneshot(
        Request::builder()
            .uri("/api/console/applications")
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();
    assert_eq!(list.status(), StatusCode::OK);

    let detail = app.clone().oneshot(
        Request::builder()
            .uri(format!("/api/console/applications/{application_id}"))
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();
    assert_eq!(detail.status(), StatusCode::OK);
}
```

Append to `api/apps/api-server/src/_tests/openapi_alignment.rs`:

```rust
#[tokio::test]
async fn openapi_contains_application_console_routes() {
    let paths = openapi_paths().await;

    for route in [
        "/api/console/applications",
        "/api/console/applications/{id}",
    ] {
        assert!(paths.contains_key(route), "missing path {route}");
    }
}
```

- [x] **Step 2: Run the API server tests to verify they fail**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p api-server application_routes -- --nocapture
cargo test -p api-server openapi_contains_application_console_routes -- --nocapture
```

Expected: FAIL because the route module is not wired yet.

- [x] **Step 3: Implement the route module and wire it into the server**

Create `api/apps/api-server/src/routes/applications.rs`:

```rust
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use control_plane::application::{ApplicationService, CreateApplicationCommand};
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
pub struct CreateApplicationBody {
    pub application_type: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationSummaryResponse {
    pub id: String,
    pub application_type: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationDetailResponse {
    #[serde(flatten)]
    pub summary: ApplicationSummaryResponse,
    pub sections: domain::ApplicationSections,
}

fn to_application_summary(application: domain::ApplicationRecord) -> ApplicationSummaryResponse {
    ApplicationSummaryResponse {
        id: application.id.to_string(),
        application_type: application.application_type.as_str().into(),
        name: application.name,
        description: application.description,
        icon: application.icon,
        icon_type: application.icon_type,
        icon_background: application.icon_background,
        updated_at: application.updated_at.format(&time::format_description::well_known::Rfc3339).unwrap(),
    }
}

fn to_application_detail(application: domain::ApplicationRecord) -> ApplicationDetailResponse {
    ApplicationDetailResponse {
        summary: to_application_summary(application.clone()),
        sections: application.sections,
    }
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/applications", get(list_applications).post(create_application))
        .route("/applications/:id", get(get_application))
}

#[utoipa::path(
    get,
    path = "/api/console/applications",
    responses((status = 200, body = [ApplicationSummaryResponse]))
)]
pub async fn list_applications(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<ApplicationSummaryResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let rows = ApplicationService::new(state.store.clone())
        .list_applications(context.user.id)
        .await?;

    Ok(Json(ApiSuccess::new(
        rows.into_iter().map(to_application_summary).collect(),
    )))
}
```

同文件里补齐另外两个 handler：

```rust
#[utoipa::path(
    post,
    path = "/api/console/applications",
    request_body = CreateApplicationBody,
    responses((status = 201, body = ApplicationDetailResponse))
)]
pub async fn create_application(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateApplicationBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ApplicationDetailResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let created = ApplicationService::new(state.store.clone())
        .create_application(CreateApplicationCommand {
            actor_user_id: context.user.id,
            application_type: parse_application_type(&body.application_type)?,
            name: body.name,
            description: body.description,
            icon: body.icon,
            icon_type: body.icon_type,
            icon_background: body.icon_background,
        })
        .await?;

    Ok((StatusCode::CREATED, Json(ApiSuccess::new(to_application_detail(created)))))
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}",
    responses((status = 200, body = ApplicationDetailResponse), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn get_application(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiSuccess<ApplicationDetailResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let detail = ApplicationService::new(state.store.clone())
        .get_application(context.user.id, id)
        .await?;

    Ok(Json(ApiSuccess::new(to_application_detail(detail))))
}
```

Wire it in:

```rust
// api/apps/api-server/src/routes/mod.rs
pub mod applications;

// api/apps/api-server/src/lib.rs
.nest("/api/console", routes::applications::router())

// api/apps/api-server/src/openapi.rs
crate::routes::applications::list_applications,
crate::routes::applications::create_application,
crate::routes::applications::get_application,
crate::routes::applications::ApplicationSummaryResponse,
crate::routes::applications::ApplicationDetailResponse,
crate::routes::applications::CreateApplicationBody,
```

- [x] **Step 4: Re-run the route and OpenAPI tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p api-server application_routes -- --nocapture
cargo test -p api-server openapi_contains_application_console_routes -- --nocapture
```

Expected: PASS.

- [x] **Step 5: Commit the HTTP slice**

```bash
git add api/apps/api-server/src/routes/applications.rs
git add api/apps/api-server/src/routes/mod.rs
git add api/apps/api-server/src/lib.rs
git add api/apps/api-server/src/openapi.rs
git add api/apps/api-server/src/_tests/application_routes.rs
git add api/apps/api-server/src/_tests/mod.rs
git add api/apps/api-server/src/_tests/openapi_alignment.rs
git commit -m "feat(api): add console application routes"
```

## Task 4: Build The Frontend Data Layer And Workspace List/Create UX

**Files:**
- Create: `web/packages/api-client/src/console-applications.ts`
- Create: `web/app/src/features/applications/api/applications.ts`
- Create: `web/app/src/features/applications/components/ApplicationCreateModal.tsx`
- Create: `web/app/src/features/applications/components/ApplicationCardGrid.tsx`
- Create: `web/app/src/features/applications/pages/ApplicationListPage.tsx`
- Create: `web/app/src/features/applications/_tests/application-create-modal.test.tsx`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/app/src/features/home/pages/HomePage.tsx`
- Modify: `web/app/src/features/home/_tests/home-page.test.tsx`
- Modify: `web/app/src/app/_tests/app-shell.test.tsx`

- [x] **Step 1: Write the failing list/create UI tests**

Create `web/app/src/features/applications/_tests/application-create-modal.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
import { ApplicationCreateModal } from '../components/ApplicationCreateModal';

describe('ApplicationCreateModal', () => {
  test('shows agent_flow as enabled and workflow as disabled', () => {
    render(
      <AppProviders>
        <ApplicationCreateModal open csrfToken="csrf-123" onClose={vi.fn()} onCreated={vi.fn()} />
      </AppProviders>
    );

    expect(screen.getByRole('radio', { name: /AgentFlow/i })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Workflow/i })).toBeDisabled();
    expect(screen.getByText('未开放')).toBeInTheDocument();
  });
});
```

Update `web/app/src/features/home/_tests/home-page.test.tsx`:

```tsx
vi.mock('../../applications/api/applications', () => ({
  applicationsQueryKey: ['applications'],
  fetchApplications: vi.fn().mockResolvedValue([
    {
      id: 'app-1',
      application_type: 'agent_flow',
      name: 'Support Agent',
      description: 'customer support',
      icon: 'RobotOutlined',
      icon_type: 'iconfont',
      icon_background: '#E6F7F2',
      updated_at: '2026-04-15T09:00:00Z'
    }
  ]),
  createApplication: vi.fn()
}));

test('renders application cards instead of the old health summary', async () => {
  render(
    <AppProviders>
      <HomePage />
    </AppProviders>
  );

  expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
  expect(await screen.findByText('Support Agent')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '进入应用' })).toBeInTheDocument();
  expect(screen.queryByText(/api-server ok/i)).not.toBeInTheDocument();
});
```

Update `web/app/src/app/_tests/app-shell.test.tsx` so the shell test uses the new home-page data source instead of the removed health query:

```tsx
vi.mock('@1flowbase/api-client', () => ({
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800'),
  listConsoleApplications: vi.fn().mockResolvedValue([
    {
      id: 'app-1',
      application_type: 'agent_flow',
      name: 'Support Agent',
      description: 'customer support',
      icon: 'RobotOutlined',
      icon_type: 'iconfont',
      icon_background: '#E6F7F2',
      updated_at: '2026-04-15T09:00:00Z'
    }
  ])
}));

test('renders the formal console shell with application workspace content', async () => {
  render(<App />);

  expect(await screen.findByRole('heading', { name: '1flowbase' })).toBeInTheDocument();
  expect(await screen.findByText('Support Agent')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '工作台' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '进入应用' })).toBeInTheDocument();
  expect(screen.queryByText(/api-server/i)).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run the focused frontend tests to verify they fail**

Run:

```bash
cd /home/taichu/git/1flowbase
pnpm --dir web/app exec vitest run \
  src/features/applications/_tests/application-create-modal.test.tsx \
  src/features/home/_tests/home-page.test.tsx
```

Expected: FAIL because the applications client/module/components do not exist yet and `HomePage` still renders health content.

- [x] **Step 3: Implement the API client, query wrappers, list page, and create modal**

Create `web/packages/api-client/src/console-applications.ts`:

```ts
import { apiFetch } from './transport';

export type ConsoleApplicationType = 'agent_flow' | 'workflow';

export interface ConsoleApplicationSummary {
  id: string;
  application_type: ConsoleApplicationType;
  name: string;
  description: string;
  icon: string | null;
  icon_type: string | null;
  icon_background: string | null;
  updated_at: string;
}

export interface ConsoleApplicationSections {
  orchestration: {
    status: string;
    subject_kind: string;
    subject_status: string;
    current_subject_id: string | null;
    current_draft_id: string | null;
  };
  api: {
    status: string;
    credential_kind: string;
    invoke_routing_mode: string;
    invoke_path_template: string | null;
    api_capability_status: string;
    credentials_status: string;
  };
  logs: {
    status: string;
    runs_capability_status: string;
    run_object_kind: string;
    log_retention_status: string;
  };
  monitoring: {
    status: string;
    metrics_capability_status: string;
    metrics_object_kind: string;
    tracing_config_status: string;
  };
}

export interface ConsoleApplicationDetail extends ConsoleApplicationSummary {
  sections: ConsoleApplicationSections;
}

export interface CreateConsoleApplicationInput {
  application_type: ConsoleApplicationType;
  name: string;
  description: string;
  icon: string | null;
  icon_type: string | null;
  icon_background: string | null;
}

export function listConsoleApplications(baseUrl?: string) {
  return apiFetch<ConsoleApplicationSummary[]>({
    path: '/api/console/applications',
    baseUrl
  });
}

export function createConsoleApplication(
  input: CreateConsoleApplicationInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationDetail>({
    path: '/api/console/applications',
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function getConsoleApplication(applicationId: string, baseUrl?: string) {
  return apiFetch<ConsoleApplicationDetail>({
    path: `/api/console/applications/${applicationId}`,
    baseUrl
  });
}
```

Create `web/app/src/features/applications/api/applications.ts`:

```ts
import {
  createConsoleApplication,
  getConsoleApplication,
  listConsoleApplications,
  type ConsoleApplicationDetail,
  type ConsoleApplicationSummary,
  type CreateConsoleApplicationInput
} from '@1flowbase/api-client';

export type Application = ConsoleApplicationSummary;
export type ApplicationDetail = ConsoleApplicationDetail;
export type CreateApplicationInput = CreateConsoleApplicationInput;

export const applicationsQueryKey = ['applications'] as const;
export const applicationDetailQueryKey = (applicationId: string) =>
  ['applications', applicationId] as const;

export function fetchApplications(): Promise<Application[]> {
  return listConsoleApplications();
}

export function fetchApplicationDetail(applicationId: string): Promise<ApplicationDetail> {
  return getConsoleApplication(applicationId);
}

export function createApplication(input: CreateApplicationInput, csrfToken: string) {
  return createConsoleApplication(input, csrfToken);
}
```

Create `web/app/src/features/applications/components/ApplicationCreateModal.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Radio, Space, Typography } from 'antd';

import { applicationsQueryKey, createApplication } from '../api/applications';

export function ApplicationCreateModal({
  open,
  csrfToken,
  onClose,
  onCreated
}: {
  open: boolean;
  csrfToken: string;
  onClose: () => void;
  onCreated: (applicationId: string) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: (values: {
      application_type: 'agent_flow' | 'workflow';
      name: string;
      description: string;
    }) =>
      createApplication(
        {
          application_type: values.application_type,
          name: values.name,
          description: values.description,
          icon: 'RobotOutlined',
          icon_type: 'iconfont',
          icon_background: '#E6F7F2'
        }, csrfToken
      ),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: applicationsQueryKey });
      message.success('应用已创建');
      onCreated(created.id);
      onClose();
      form.resetFields();
    }
  });

  return (
    <Modal open={open} title="新建应用" onCancel={onClose} footer={null} destroyOnClose>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ application_type: 'agent_flow', description: '' }}
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item label="类型" name="application_type">
          <Radio.Group optionType="button" buttonStyle="solid">
            <Space direction="vertical" size="small">
              <Radio.Button value="agent_flow">AgentFlow</Radio.Button>
              <Radio.Button value="workflow" disabled>
                Workflow
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>
        <Typography.Text type="secondary">Workflow 未开放</Typography.Text>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="简介" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          创建应用
        </Button>
      </Form>
    </Modal>
  );
}
```

Create `web/app/src/features/applications/components/ApplicationCardGrid.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import { Button, Flex, List, Tag, Typography } from 'antd';

import type { Application } from '../api/applications';

export function ApplicationCardGrid({
  applications
}: {
  applications: Application[];
}) {
  return (
    <List
      grid={{ gutter: 16, column: 2 }}
      dataSource={applications}
      renderItem={(application) => (
        <List.Item>
          <Flex vertical gap={12} className="application-card">
            <Flex justify="space-between" align="center">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {application.name}
              </Typography.Title>
              <Tag>{application.application_type}</Tag>
            </Flex>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {application.description || '当前应用尚未填写简介。'}
            </Typography.Paragraph>
            <Typography.Text type="secondary">
              最近更新：{new Date(application.updated_at).toLocaleString('zh-CN')}
            </Typography.Text>
            <Link
              to="/applications/$applicationId/orchestration"
              params={{ applicationId: application.id }}
            >
              <Button type="primary">进入应用</Button>
            </Link>
          </Flex>
        </List.Item>
      )}
    />
  );
}
```

Create `web/app/src/features/applications/pages/ApplicationListPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Input, Result, Select, Space, Typography } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { applicationsQueryKey, fetchApplications } from '../api/applications';
import { ApplicationCardGrid } from '../components/ApplicationCardGrid';
import { ApplicationCreateModal } from '../components/ApplicationCreateModal';

export function ApplicationListPage() {
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'agent_flow' | 'workflow'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const isRoot = actor?.effective_display_role === 'root';
  const canCreate = isRoot || (me?.permissions ?? []).includes('application.create.all');
  const applicationsQuery = useQuery({ queryKey: applicationsQueryKey, queryFn: fetchApplications });
  const keyword = search.trim().toLowerCase();

  if (applicationsQuery.isPending) {
    return <Result status="info" title="正在加载应用" />;
  }

  if (applicationsQuery.isError) {
    return <Result status="error" title="应用列表加载失败" />;
  }

  const visibleItems = (applicationsQuery.data ?? []).filter((item) => {
    const matchesType = typeFilter === 'all' || item.application_type === typeFilter;
    const matchesKeyword =
      keyword.length === 0 ||
      item.name.toLowerCase().includes(keyword) ||
      item.description.toLowerCase().includes(keyword);

    return matchesType && matchesKeyword;
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>工作台</Typography.Title>
        <Typography.Paragraph>浏览、创建并进入当前工作区可见的应用。</Typography.Paragraph>
      </div>
      <Space wrap>
        <Input.Search aria-label="搜索应用" placeholder="按名称或简介搜索" onChange={(event) => setSearch(event.target.value)} />
        <Select
          aria-label="应用类型"
          value={typeFilter}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'agent_flow', label: 'AgentFlow' },
            { value: 'workflow', label: 'Workflow' }
          ]}
          onChange={setTypeFilter}
        />
        {canCreate ? <Button type="primary" onClick={() => setCreateOpen(true)}>新建应用</Button> : null}
      </Space>
      {visibleItems.length === 0 ? <Empty description="当前没有可见应用" /> : <ApplicationCardGrid applications={visibleItems} />}
      <ApplicationCreateModal
        open={createOpen}
        csrfToken={csrfToken ?? ''}
        onClose={() => setCreateOpen(false)}
        onCreated={(applicationId) => {
          void navigate({
            to: '/applications/$applicationId/orchestration',
            params: { applicationId }
          });
        }}
      />
    </Space>
  );
}
```

Modify `web/app/src/features/home/pages/HomePage.tsx` to become a thin wrapper:

```tsx
import { ApplicationListPage } from '../../applications/pages/ApplicationListPage';

export function HomePage() {
  return <ApplicationListPage />;
}
```

- [x] **Step 4: Re-run the focused frontend tests**

Run:

```bash
cd /home/taichu/git/1flowbase
pnpm --dir web/app exec vitest run \
  src/features/applications/_tests/application-create-modal.test.tsx \
  src/features/home/_tests/home-page.test.tsx \
  src/app/_tests/app-shell.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit the list/create slice**

```bash
git add web/packages/api-client/src/console-applications.ts
git add web/packages/api-client/src/index.ts
git add web/app/src/features/applications/api/applications.ts
git add web/app/src/features/applications/components/ApplicationCreateModal.tsx
git add web/app/src/features/applications/components/ApplicationCardGrid.tsx
git add web/app/src/features/applications/pages/ApplicationListPage.tsx
git add web/app/src/features/applications/_tests/application-create-modal.test.tsx
git add web/app/src/features/home/pages/HomePage.tsx
git add web/app/src/features/home/_tests/home-page.test.tsx
git add web/app/src/app/_tests/app-shell.test.tsx
git commit -m "feat(web): add application list and create flow"
```

## Task 5: Add Application Detail Routes, Empty Sections, And Navigation Truth

**Files:**
- Create: `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- Create: `web/app/src/features/applications/lib/application-sections.tsx`
- Create: `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- Create: `web/app/src/routes/_tests/application-shell-routing.test.tsx`
- Modify: `web/packages/shared-types/src/index.ts`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/routes/route-config.ts`
- Modify: `web/app/src/routes/_tests/route-config.test.ts`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [x] **Step 1: Write the failing detail routing tests**

Create `web/app/src/routes/_tests/application-shell-routing.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiClientError } from '@1flowbase/api-client';
import { AppProviders } from '../../app/AppProviders';
import { AppRouterProvider } from '../../app/router';
import { resetAuthStore, useAuthStore } from '../../state/auth-store';

const applicationApi = vi.hoisted(() => ({
  applicationsQueryKey: ['applications'],
  applicationDetailQueryKey: (applicationId: string) => ['applications', applicationId],
  fetchApplications: vi.fn(),
  createApplication: vi.fn(),
  fetchApplicationDetail: vi.fn()
}));

vi.mock('../../features/applications/api/applications', () => applicationApi);

function authenticate() {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: { id: 'user-1', account: 'manager', effective_display_role: 'manager', current_workspace_id: 'workspace-1' },
    me: { id: 'user-1', account: 'manager', email: 'manager@example.com', phone: null, nickname: 'Manager', name: 'Manager', avatar_url: null, introduction: '', effective_display_role: 'manager', permissions: ['route_page.view.all', 'application.view.all'] }
  });
}

describe('application shell routing', () => {
  beforeEach(() => {
    resetAuthStore();
    authenticate();
    applicationApi.fetchApplicationDetail.mockResolvedValue({
      id: 'app-1',
      application_type: 'agent_flow',
      name: 'Support Agent',
      description: 'customer support',
      icon: 'RobotOutlined',
      icon_type: 'iconfont',
      icon_background: '#E6F7F2',
      updated_at: '2026-04-15T09:00:00Z',
      sections: {
        orchestration: {
          status: 'planned',
          subject_kind: 'agent_flow',
          subject_status: 'unconfigured',
          current_subject_id: null,
          current_draft_id: null
        },
        api: {
          status: 'planned',
          credential_kind: 'application_api_key',
          invoke_routing_mode: 'api_key_bound_application',
          invoke_path_template: null,
          api_capability_status: 'planned',
          credentials_status: 'planned'
        },
        logs: {
          status: 'planned',
          runs_capability_status: 'planned',
          run_object_kind: 'application_run',
          log_retention_status: 'planned'
        },
        monitoring: {
          status: 'planned',
          metrics_capability_status: 'planned',
          metrics_object_kind: 'application_metrics',
          tracing_config_status: 'planned'
        }
      }
    });
  });

  test('redirects /applications/:id to orchestration', async () => {
    window.history.pushState({}, '', '/applications/app-1');
    render(<AppProviders><AppRouterProvider /></AppProviders>);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/applications/app-1/orchestration');
    });
  });

  test('renders section navigation and planned API copy', async () => {
    window.history.pushState({}, '', '/applications/app-1/api');
    render(<AppProviders><AppRouterProvider /></AppProviders>);

    expect(await screen.findByRole('heading', { name: 'Support Agent', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Section navigation' })).toBeInTheDocument();
    expect(screen.getByText(/API Key 绑定应用/i)).toBeInTheDocument();
  });

  test('renders formal 403 state for inaccessible applications', async () => {
    applicationApi.fetchApplicationDetail.mockRejectedValueOnce(
      new ApiClientError({ status: 403, message: 'forbidden' })
    );

    window.history.pushState({}, '', '/applications/app-1/logs');
    render(<AppProviders><AppRouterProvider /></AppProviders>);

    expect(await screen.findByText('无权限访问')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the routing test to verify it fails**

Run:

```bash
cd /home/taichu/git/1flowbase
pnpm --dir web/app exec vitest run \
  src/routes/_tests/application-shell-routing.test.tsx \
  src/routes/_tests/route-config.test.ts
```

Expected: FAIL because there are no `/applications/*` routes or section components yet.

- [x] **Step 3: Implement the detail page, hidden route metadata, and style-boundary scenes**

Update `web/packages/shared-types/src/index.ts`:

```ts
export type AppRouteId =
  | 'home'
  | 'application-detail'
  | 'embedded-apps'
  | 'tools'
  | 'settings'
  | 'me'
  | 'sign-in';
```

Update `web/app/src/routes/route-config.ts` to keep top-nav selection on `工作台`:

```ts
{
  id: 'application-detail',
  path: '/applications',
  navLabel: null,
  chromeSlot: 'hidden',
  selectedMatchers: [
    (pathname) => /^\/applications\/[^/]+(\/|$)/.test(pathname)
  ],
  permissionKey: 'route_page.view.all',
  guard: 'session-required'
}

export function getSelectedRouteId(pathname: string): AppRouteId {
  const matched =
    APP_ROUTES.find((route) => route.selectedMatchers.some((match) => match(pathname)))?.id ??
    'home';

  return matched === 'application-detail' ? 'home' : matched;
}
```

Update `web/app/src/routes/_tests/route-config.test.ts`:

```ts
expect(APP_ROUTES.map((route) => route.id)).toEqual([
  'home',
  'application-detail',
  'embedded-apps',
  'tools',
  'settings',
  'me',
  'sign-in'
]);
expect(getSelectedRouteId('/applications/app-1')).toBe('home');
expect(getSelectedRouteId('/applications/app-1/orchestration')).toBe('home');
expect(getSelectedRouteId('/applications/app-1/api')).toBe('home');
```

Add the router entries in `web/app/src/app/router.tsx` and wire them into the existing `routeTree`:

```tsx
import { Navigate } from '@tanstack/react-router';
import { ApplicationDetailPage } from '../features/applications/pages/ApplicationDetailPage';
import type { ApplicationSectionKey } from '../features/applications/lib/application-sections';

function ApplicationIndexRedirect() {
  const { applicationId } = applicationIndexRoute.useParams();

  return (
    <Navigate
      to="/applications/$applicationId/orchestration"
      params={{ applicationId }}
      replace
    />
  );
}

function ApplicationSectionRoute({
  applicationId,
  requestedSectionKey
}: {
  applicationId: string;
  requestedSectionKey: ApplicationSectionKey;
}) {
  return (
    <RouteGuard routeId="application-detail">
      <ApplicationDetailPage
        applicationId={applicationId}
        requestedSectionKey={requestedSectionKey}
      />
    </RouteGuard>
  );
}

const applicationIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId',
  component: ApplicationIndexRedirect
});

const applicationOrchestrationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/orchestration',
  component: () => {
    const { applicationId } = applicationOrchestrationRoute.useParams();
    return (
      <ApplicationSectionRoute
        applicationId={applicationId}
        requestedSectionKey="orchestration"
      />
    );
  }
});

const applicationApiRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/api',
  component: () => {
    const { applicationId } = applicationApiRoute.useParams();
    return <ApplicationSectionRoute applicationId={applicationId} requestedSectionKey="api" />;
  }
});

const applicationLogsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/logs',
  component: () => {
    const { applicationId } = applicationLogsRoute.useParams();
    return <ApplicationSectionRoute applicationId={applicationId} requestedSectionKey="logs" />;
  }
});

const applicationMonitoringRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/applications/$applicationId/monitoring',
  component: () => {
    const { applicationId } = applicationMonitoringRoute.useParams();
    return (
      <ApplicationSectionRoute
        applicationId={applicationId}
        requestedSectionKey="monitoring"
      />
    );
  }
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    homeRoute,
    applicationIndexRoute,
    applicationOrchestrationRoute,
    applicationApiRoute,
    applicationLogsRoute,
    applicationMonitoringRoute,
    embeddedAppsRoute,
    toolsRoute,
    settingsIndexRoute,
    settingsDocsRoute,
    settingsMembersRoute,
    settingsRolesRoute,
    meIndexRoute,
    meProfileRoute,
    meSecurityRoute
  ]),
  signInRoute
]);
```

Create `web/app/src/features/applications/lib/application-sections.tsx`:

```tsx
import {
  ApiOutlined,
  DeploymentUnitOutlined,
  FundOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';

import type { SectionNavItem } from '../../../shared/ui/section-page-layout/SectionPageLayout';

export type ApplicationSectionKey = 'orchestration' | 'api' | 'logs' | 'monitoring';

const SECTION_DEFINITIONS: Array<{
  key: ApplicationSectionKey;
  label: string;
  icon: JSX.Element;
}> = [
  { key: 'orchestration', label: '编排', icon: <DeploymentUnitOutlined /> },
  { key: 'api', label: 'API', icon: <ApiOutlined /> },
  { key: 'logs', label: '日志', icon: <UnorderedListOutlined /> },
  { key: 'monitoring', label: '监控', icon: <FundOutlined /> }
];

export function getApplicationSections(applicationId: string): SectionNavItem[] {
  return SECTION_DEFINITIONS.map((section) => ({
    key: section.key,
    label: section.label,
    icon: section.icon,
    to: `/applications/${applicationId}/${section.key}`
  }));
}
```

Create `web/app/src/features/applications/components/ApplicationSectionState.tsx`:

```tsx
import { Descriptions, Result, Space, Tag, Typography } from 'antd';

import type { ApplicationDetail } from '../api/applications';
import type { ApplicationSectionKey } from '../lib/application-sections';

function renderStatusTag(status: string) {
  return <Tag color={status === 'planned' ? 'gold' : 'default'}>{status}</Tag>;
}

export function ApplicationSectionState({
  application,
  sectionKey
}: {
  application: ApplicationDetail;
  sectionKey: ApplicationSectionKey;
}) {
  if (sectionKey === 'orchestration') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>编排</Typography.Title>
        <Typography.Paragraph>
          这里是当前应用主编排主体的挂载位。`03` 只冻结主体种类、状态和当前草稿锚点；
          真正的 Draft / Version / Graph 由 `04` 接入。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            { key: 'status', label: '能力状态', children: renderStatusTag(application.sections.orchestration.status) },
            { key: 'subject_kind', label: '主体种类', children: application.sections.orchestration.subject_kind },
            { key: 'subject_status', label: '主体状态', children: application.sections.orchestration.subject_status },
            { key: 'subject_id', label: '当前主体 ID', children: application.sections.orchestration.current_subject_id ?? '未绑定' },
            { key: 'draft_id', label: '当前草稿 ID', children: application.sections.orchestration.current_draft_id ?? '未生成' }
          ]}
        />
      </Space>
    );
  }

  if (sectionKey === 'api') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>API</Typography.Title>
        <Typography.Paragraph>
          该分区固定承接应用级凭证和对外交付契约。`03` 只确认“统一调用 URL 由
          `application_type` 决定，应用归属由 API Key 绑定”这一原则。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            { key: 'status', label: '能力状态', children: renderStatusTag(application.sections.api.status) },
            { key: 'credential_kind', label: '凭证类型', children: application.sections.api.credential_kind },
            { key: 'routing_mode', label: '����由模式', children: application.sections.api.invoke_routing_mode },
            { key: 'path_template', label: '调用路径模板', children: application.sections.api.invoke_path_template ?? '由 application_type 冻结，06B 再落地' },
            { key: 'credentials_status', label: '凭证生命周期', children: application.sections.api.credentials_status }
          ]}
        />
      </Space>
    );
  }

  if (sectionKey === 'logs') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>日志</Typography.Title>
        <Typography.Paragraph>
          该分区对应应用级运行日志，而不是编辑器历史。`05` 会把 Application Run /
          Node Run / Event Trace 挂进这里。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            { key: 'status', label: '能力状态', children: renderStatusTag(application.sections.logs.status) },
            { key: 'run_object_kind', label: '运行对象', children: application.sections.logs.run_object_kind },
            { key: 'runs_status', label: '运行列表状态', children: application.sections.logs.runs_capability_status },
            { key: 'retention_status', label: '保留策略状态', children: application.sections.logs.log_retention_status }
          ]}
        />
      </Space>
    );
  }

  if (sectionKey === 'monitoring') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>监控</Typography.Title>
        <Typography.Paragraph>
          该分区对应应用级聚合指标与 tracing / observability 配置，真实图表和配置编辑统一留给后续专题。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            { key: 'status', label: '能力状态', children: renderStatusTag(application.sections.monitoring.status) },
            { key: 'metrics_kind', label: '指标对象', children: application.sections.monitoring.metrics_object_kind },
            { key: 'metrics_status', label: '指标聚合状态', children: application.sections.monitoring.metrics_capability_status },
            { key: 'tracing_status', label: 'Tracing 配置状态', children: application.sections.monitoring.tracing_config_status }
          ]}
        />
      </Space>
    );
  }

  return <Result status="info" title="未找到分区内容" />;
}
```

Create `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Result } from 'antd';

import { ApiClientError } from '@1flowbase/api-client';
import { SectionPageLayout } from '../../../shared/ui/section-page-layout/SectionPageLayout';
import { PermissionDeniedState } from '../../../shared/ui/PermissionDeniedState';
import { applicationDetailQueryKey, fetchApplicationDetail } from '../api/applications';
import { ApplicationSectionState } from '../components/ApplicationSectionState';
import { getApplicationSections, type ApplicationSectionKey } from '../lib/application-sections';

export function ApplicationDetailPage({
  applicationId,
  requestedSectionKey
}: {
  applicationId: string;
  requestedSectionKey: ApplicationSectionKey;
}) {
  const detailQuery = useQuery({
    queryKey: applicationDetailQueryKey(applicationId),
    queryFn: () => fetchApplicationDetail(applicationId)
  });

  if (detailQuery.isPending) {
    return <Result status="info" title="正在加载应用" />;
  }

  if (detailQuery.isError) {
    const error = detailQuery.error;

    if (error instanceof ApiClientError && error.status === 403) {
      return <PermissionDeniedState />;
    }

    if (error instanceof ApiClientError && error.status === 404) {
      return <Result status="404" title="应用不存在" />;
    }

    return <Result status="error" title="应用加载失败" />;
  }

  return (
    <SectionPageLayout
      pageTitle={detailQuery.data.name}
      navItems={getApplicationSections(applicationId)}
      activeKey={requestedSectionKey}
      contentWidth="wide"
    >
      <ApplicationSectionState
        application={detailQuery.data}
        sectionKey={requestedSectionKey}
      />
    </SectionPageLayout>
  );
}
```

Update `web/app/src/style-boundary/registry.tsx` so router-backed scenes use `AppProviders` and application fetch stubs:

```tsx
import { AppProviders } from '../app/AppProviders';
import { AppRouterProvider } from '../app/router';

function seedStyleBoundaryApplicationFetch() {
  if (typeof globalThis.fetch !== 'function') {
    return;
  }

  styleBoundaryOriginalFetch ??= globalThis.fetch.bind(globalThis);
  const originalFetch = styleBoundaryOriginalFetch;

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    if (url.includes('/api/console/applications/app-1')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'app-1',
            application_type: 'agent_flow',
            name: 'Support Agent',
            description: 'customer support',
            icon: 'RobotOutlined',
            icon_type: 'iconfont',
            icon_background: '#E6F7F2',
            updated_at: '2026-04-15T09:00:00Z',
            sections: {
              orchestration: {
                status: 'planned',
                subject_kind: 'agent_flow',
                subject_status: 'unconfigured',
                current_subject_id: null,
                current_draft_id: null
              },
              api: {
                status: 'planned',
                credential_kind: 'application_api_key',
                invoke_routing_mode: 'api_key_bound_application',
                invoke_path_template: null,
                api_capability_status: 'planned',
                credentials_status: 'planned'
              },
              logs: {
                status: 'planned',
                runs_capability_status: 'planned',
                run_object_kind: 'application_run',
                log_retention_status: 'planned'
              },
              monitoring: {
                status: 'planned',
                metrics_capability_status: 'planned',
                metrics_object_kind: 'application_metrics',
                tracing_config_status: 'planned'
              }
            }
          },
          meta: null
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url.endsWith('/api/console/applications')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'app-1',
              application_type: 'agent_flow',
              name: 'Support Agent',
              description: 'customer support',
              icon: 'RobotOutlined',
              icon_type: 'iconfont',
              icon_background: '#E6F7F2',
              updated_at: '2026-04-15T09:00:00Z'
            }
          ],
          meta: null
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return originalFetch(input as RequestInfo, init);
  };
}

function renderRouterScene(pathname: string) {
  seedStyleBoundaryAuth();
  window.history.replaceState({}, '', pathname);

  return (
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );
}

const renderers: Record<string, StyleBoundaryRuntimeScene['render']> = {
  // ...
  'page.home': () => {
    seedStyleBoundaryApplicationFetch();
    return renderRouterScene('/');
  },
  'page.application-detail': () => {
    seedStyleBoundaryApplicationFetch();
    return renderRouterScene('/applications/app-1/orchestration');
  },
  // ...
};
```

Update `web/app/src/style-boundary/scenario-manifest.json`:

```json
{
  "id": "page.home",
  "kind": "page",
  "title": "Home Page",
  "impactFiles": [
    "web/app/src/styles/tokens.css",
    "web/app/src/styles/globals.css",
    "web/app/src/app-shell/app-shell.css",
    "web/app/src/app-shell/AppShellFrame.tsx",
    "web/app/src/app-shell/Navigation.tsx",
    "web/app/src/app-shell/AccountMenu.tsx",
    "web/app/src/app-shell/account-menu-items.tsx",
    "web/app/src/features/home/pages/HomePage.tsx",
    "web/app/src/features/applications/pages/ApplicationListPage.tsx",
    "web/app/src/features/applications/components/ApplicationCardGrid.tsx",
    "web/app/src/features/applications/components/ApplicationCreateModal.tsx",
    "web/app/src/app/router.tsx"
  ]
},
{
  "id": "page.application-detail",
  "kind": "page",
  "title": "Application Detail Page",
  "impactFiles": [
    "web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx",
    "web/app/src/shared/ui/section-page-layout/SectionSidebarNav.tsx",
    "web/app/src/shared/ui/section-page-layout/section-page-layout.css",
    "web/app/src/features/applications/pages/ApplicationDetailPage.tsx",
    "web/app/src/features/applications/components/ApplicationSectionState.tsx",
    "web/app/src/features/applications/lib/application-sections.tsx",
    "web/app/src/style-boundary/registry.tsx",
    "web/app/src/app/router.tsx"
  ],
  "boundaryNodes": [
    {
      "id": "section-shell",
      "selector": ".section-page-layout__shell",
      "propertyAssertions": [{ "property": "display", "expected": "flex" }]
    }
  ]
}
```

- [x] **Step 4: Re-run the routing and style-boundary registry tests**

Run:

```bash
cd /home/taichu/git/1flowbase
pnpm --dir web/app exec vitest run \
  src/routes/_tests/application-shell-routing.test.tsx \
  src/routes/_tests/route-config.test.ts \
  src/style-boundary/_tests/registry.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit the application shell slice**

```bash
git add web/packages/shared-types/src/index.ts
git add web/app/src/features/applications/components/ApplicationSectionState.tsx
git add web/app/src/features/applications/lib/application-sections.tsx
git add web/app/src/features/applications/pages/ApplicationDetailPage.tsx
git add web/app/src/routes/_tests/application-shell-routing.test.tsx
git add web/app/src/app/router.tsx
git add web/app/src/routes/route-config.ts
git add web/app/src/routes/_tests/route-config.test.ts
git add web/app/src/style-boundary/registry.tsx
git add web/app/src/style-boundary/scenario-manifest.json
git commit -m "feat(web): add application detail shell"
```

## Task 6: Run Focused Regression And Full Verification

**Files:**
- Verify: `api/crates/storage-pg/src/_tests/application_repository_tests.rs`
- Verify: `api/crates/control-plane/src/_tests/application_service_tests.rs`
- Verify: `api/apps/api-server/src/_tests/application_routes.rs`
- Verify: `web/app/src/features/home/_tests/home-page.test.tsx`
- Verify: `web/app/src/features/applications/_tests/application-create-modal.test.tsx`
- Verify: `web/app/src/routes/_tests/application-shell-routing.test.tsx`
- Verify: `web/app/src/style-boundary/registry.tsx`

- [x] **Step 1: Run the focused backend tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p storage-pg application_repository_tests -- --nocapture
cargo test -p control-plane application_service_tests -- --nocapture
cargo test -p api-server application_routes -- --nocapture
```

Expected: all PASS.

- [x] **Step 2: Run the focused frontend tests**

Run:

```bash
cd /home/taichu/git/1flowbase
pnpm --dir web/app exec vitest run \
  src/features/home/_tests/home-page.test.tsx \
  src/features/applications/_tests/application-create-modal.test.tsx \
  src/routes/_tests/application-shell-routing.test.tsx \
  src/routes/_tests/route-config.test.ts \
  src/app/_tests/app-shell.test.tsx \
  src/style-boundary/_tests/registry.test.tsx
```

Expected: PASS.

- [x] **Step 3: Run required workspace verification**

Run:

```bash
cd /home/taichu/git/1flowbase
node scripts/node/verify-backend.js
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Expected:
- `verify-backend.js` PASS
- `pnpm --dir web lint` PASS
- `pnpm --dir web test` PASS
- `pnpm --dir web/app build` PASS

- [x] **Step 4: Run style-boundary regression for the affected pages**

With `pnpm --dir web/app dev` running on `http://127.0.0.1:3100`, run:

```bash
cd /home/taichu/git/1flowbase
node scripts/node/check-style-boundary.js page page.home
node scripts/node/check-style-boundary.js page page.application-detail
```

Expected: both commands print `[1flowbase-style-boundary] PASS ...`.

- [x] **Step 5: Confirm the working tree status after verification**

```bash
git status --short
```

Actual after `2026-04-15 11` execution-related commit: task-related changes are committed; repository still contains a pre-existing local modification in `.memory/user-memory.md`.

### Execution Notes

- `pnpm --dir web/app test -- <file>` 在当前仓库不会稳定落到单文件；定向前端测试统一使用 `pnpm --dir web/app exec vitest run <file...>`。
- `node scripts/node/check-style-boundary.js ...` 依赖本地前端服务 `http://127.0.0.1:3100`；如果在受限沙箱里运行，监听 `3100` 端口可能需要额外权限。
- `HomePage` 和 `ApplicationDetailPage` 都会读取 React Query 数据，所以 `style-boundary` 场景必须通过 `AppProviders + AppRouterProvider` 提供 QueryClient 和路由上下文，不能再裸渲染页面组件。
- `2026-04-15 11` 首次执行 `node scripts/node/verify-backend.js` 命中 `clippy::too_many_arguments`，位置在 `api/crates/control-plane/src/application.rs` 的 in-memory helper `build_application_record`。已把散参数收口到 `CreateApplicationInput` 后重跑，通过。
- `2026-04-15 11` 计划内验证已实际执行并通过：
  - `cargo test -p storage-pg application_repository_tests -- --nocapture`
  - `cargo test -p control-plane application_service_tests -- --nocapture`
  - `cargo test -p api-server application_routes -- --nocapture`
  - `pnpm --dir web/app exec vitest run src/features/home/_tests/home-page.test.tsx src/features/applications/_tests/application-create-modal.test.tsx src/routes/_tests/application-shell-routing.test.tsx src/routes/_tests/route-config.test.ts src/app/_tests/app-shell.test.tsx src/style-boundary/_tests/registry.test.tsx`
  - `node scripts/node/verify-backend.js`
  - `pnpm --dir web lint`
  - `pnpm --dir web test`
  - `pnpm --dir web/app build`
  - `node scripts/node/check-style-boundary.js page page.home`
  - `node scripts/node/check-style-boundary.js page page.application-detail`
- `2026-04-15 11` 手动启动 `pnpm dev --host 127.0.0.1 --port 3100` 时返回 `Port 3100 is already in use`；经核实占用进程是同仓库 `web/app` 的现有 `vite`，直接复用后两条 `style-boundary` 命令均通过，无需强制重启。

## Self-Review

- Spec coverage:
  - 工作台首页改为 `Application` 列表、搜索/筛选/创建入口由 Task 4 覆盖。
  - `Application` 最小后端模型、`GET list / POST create / GET detail` 三个接口和 `application.view/create` ACL 由 Task 1-3 覆盖。
  - `/applications/:applicationId` 重定向、四分区二级壳层、正式空态和 `403/404` 行为由 Task 5 覆盖。
  - `orchestration/api/logs/monitoring` 的 future hooks、对象锚点和 `style-boundary` 场景由 Task 5 覆盖。
  - 聚焦回归、全量验证和样式边界回归由 Task 6 覆盖。
- Placeholder scan:
  - 已补齐 `ApplicationSectionState`、route-config 测试、router scene seed 等原先缺失内容。
  - 全文没有 `TODO/TBD/类似 Task N` 之类占位语句。
- Consistency:
  - 全文统一使用 `Application` 作为一级对象、`application_type` 作为一级真相。
  - 前端路由统一为 `/applications/:applicationId/{orchestration|api|logs|monitoring}`，并保持一级导航高亮仍落在 `工作台`。
  - `API` 分区统一采用“同类型共享调用 URL、应用靠 API Key 绑定”的口径，没有把 `applicationId` 写进未来外部调用 URL。

## Execution Result

Execution completed inline in the current workspace on `2026-04-15 11`.
