# Settings API Docs On-Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把设置区 `API 文档` 从后端 Swagger `iframe` 改成“受权限控制、目录先行、按接口按需加载详情”的前端内部文档页，同时关闭生产环境对旧 `/docs` 与 `/openapi.json` 的正式暴露。

**Architecture:** 后端继续以 `utoipa` 生成 canonical OpenAPI，但不再把它直接作为前端主消费出口，而是在 `api-server` 内构建一个启动期缓存的文档注册表，派生出轻量 `catalog` 和按 `operation_id` 取用的闭合单接口 OpenAPI JSON。前端保留 `/settings/docs` 作为设置区二级页面，只先拉目录，用户点击目录项或命中 `?operation=` 深链后再请求接口详情；`Scalar` 只负责右侧详情渲染，目录、搜索、空态、错误态和权限可见性全部由 1Flowse 前端自己控制。

**Tech Stack:** Rust 2021, Axum, Utoipa, Serde JSON, React 19, TypeScript, TanStack Router, TanStack Query, Ant Design, Zustand, Vitest, Scalar React API Reference, Playwright-backed `style-boundary`

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-14-settings-api-docs-on-demand-design.md`

**Approval:** 用户在当前会话确认设计稿“没什么问题”，并要求直接整理成 implementation plan（`2026-04-14 17`）。

---

## Scope Notes

- `APP_ROUTES` 仍只保留一级 `settings` route 语义，不为单个接口新增一级导航或独立路由定义；选中状态只通过 `/settings/docs?operation=<operation_id>` 维护。
- 后端新增的文档分发接口继续挂在 `/api/console` 下，统一复用现有 session 鉴权，并新增 `api_reference.view.all` 作为唯一文档权限码；`root` 仍通过 `ActorContext::has_permission()` 的 root bypass 自动放行。
- `GET /api/console/docs/catalog` 继续返回 `ApiSuccess` 包装，`GET /api/console/docs/operations/{operation_id}/openapi.json` 返回原始 OpenAPI JSON，不再包 `data/meta`，这样前端可以直接把结果交给 `Scalar`。
- 文档分发接口本身不要进入 canonical OpenAPI 的用户可见目录，避免文档系统把自己再收录进 `catalog`；本计划直接不把 `routes::docs` 加进 `api/apps/api-server/src/openapi.rs`。
- 单接口文档闭合性在 JSON 层实现，不依赖 `utoipa` typed components 的有限字段集；递归扫描所有 `$ref`，再按 JSON Pointer 从 canonical 文档中裁剪出当前 operation 依赖的 `components` 和 `tags`。
- 生产环境不再暴露旧 `/docs` 和 `/openapi.json`；开发态和无状态 `app()` 仍保留它们作为联调入口。
- 前端的 `group` 只作为 UI 分组提示，不作为加载单元；后端用 `tags[0]`，若缺失则退化为 path bucket（如 `console` / `runtime` 下第一段资源名），前端不维护额外映射表真值。
- 本轮不做按接口资源级二次裁剪、在线发请求、凭证注入、外部开发者门户，也不把动态建模字段级文档提前并入。

## File Structure

**Create**
- `api/apps/api-server/src/openapi_docs.rs`
- `api/apps/api-server/src/routes/docs.rs`
- `api/apps/api-server/src/_tests/openapi_docs_tests.rs`
- `api/apps/api-server/src/_tests/docs_routes.rs`
- `web/packages/api-client/src/console-api-docs.ts`
- `web/app/src/features/settings/api/api-docs.ts`
- `web/app/src/features/settings/components/api-docs-panel.css`
- `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`

**Modify**
- `api/crates/access-control/src/catalog.rs`
- `api/crates/access-control/src/_tests/catalog_tests.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/tests/health_routes.rs`
- `web/packages/api-client/src/transport.ts`
- `web/packages/api-client/src/index.ts`
- `web/app/package.json`
- `web/app/src/features/settings/lib/settings-sections.tsx`
- `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- `web/app/src/features/settings/_tests/settings-page.test.tsx`
- `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- `web/app/src/style-boundary/registry.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`
- `web/app/src/style-boundary/_tests/registry.test.tsx`

### Task 1: Build The Backend Docs Registry And Permission Baseline

**Files:**
- Create: `api/apps/api-server/src/openapi_docs.rs`
- Create: `api/apps/api-server/src/_tests/openapi_docs_tests.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/access-control/src/_tests/catalog_tests.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`

- [x] **Step 1: Write the failing registry and permission tests**

Extend `api/crates/access-control/src/_tests/catalog_tests.rs` with:

```rust
#[test]
fn permission_catalog_seeds_api_reference_view_all() {
    let codes = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect::<Vec<_>>();

    assert!(codes.contains(&"api_reference.view.all".to_string()));
}
```

Create `api/apps/api-server/src/_tests/openapi_docs_tests.rs` with:

```rust
use serde_json::json;

use api_server::openapi_docs::build_api_docs_registry;

#[test]
fn registry_requires_operation_id_for_every_operation() {
    let canonical = json!({
        "openapi": "3.1.0",
        "info": { "title": "T", "version": "1" },
        "paths": { "/demo": { "get": { "summary": "missing op id" } } }
    });

    let error = build_api_docs_registry(canonical).expect_err("missing operationId must fail");
    assert!(error.to_string().contains("operationId"));
}

#[test]
fn registry_rejects_duplicate_operation_ids() {
    let canonical = json!({
        "openapi": "3.1.0",
        "info": { "title": "T", "version": "1" },
        "paths": {
            "/demo/a": { "get": { "operationId": "dup" } },
            "/demo/b": { "post": { "operationId": "dup" } }
        }
    });

    let error = build_api_docs_registry(canonical).expect_err("duplicate operationId must fail");
    assert!(error.to_string().contains("duplicate"));
}

#[test]
fn operation_spec_builder_keeps_refs_closed() {
    let registry = api_server::openapi_docs::build_default_api_docs_registry().unwrap();
    let spec = registry.operation_spec("patch_me").unwrap();

    assert_eq!(spec["paths"].as_object().unwrap().len(), 1);
    assert!(spec["paths"]["/api/console/me"]["patch"].is_object());
    assert!(spec["components"].is_object());
}
```

- [x] **Step 2: Run the focused backend failures**

Run:

```bash
cargo test -p access-control _tests::catalog_tests::permission_catalog_seeds_api_reference_view_all -- --exact
cargo test -p api-server _tests::openapi_docs_tests::registry_requires_operation_id_for_every_operation -- --exact
```

Expected:
- first test FAILS because `api_reference.view.all` is not in the current permission catalog;
- second test FAILS because `openapi_docs` builder APIs do not exist yet.

- [x] **Step 3: Implement the cached registry builder and permission code**

Add the new permission block in `api/crates/access-control/src/catalog.rs`:

```rust
push_permissions(
    &mut permissions,
    "api_reference",
    &[("view", &["all"])],
);
```

Create `api/apps/api-server/src/openapi_docs.rs` with these public entry points:

```rust
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalogOperation {
    pub id: String,
    pub method: String,
    pub path: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub group: String,
    pub deprecated: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DocsCatalog {
    pub title: String,
    pub version: String,
    pub operations: Vec<DocsCatalogOperation>,
}

#[derive(Debug, Clone)]
pub struct ApiDocsRegistry {
    catalog: DocsCatalog,
    operation_specs: HashMap<String, Value>,
}
```

The builder should work on serialized JSON rather than `utoipa` typed sub-structures:

```rust
pub fn build_default_api_docs_registry() -> anyhow::Result<ApiDocsRegistry> {
    build_api_docs_registry(serde_json::to_value(crate::openapi::ApiDoc::openapi())?)
}

pub fn build_api_docs_registry(canonical: Value) -> anyhow::Result<ApiDocsRegistry> {
    // 1. validate openapi/info/paths structure
    // 2. iterate {path -> method -> operation}
    // 3. require unique operationId
    // 4. build catalog rows
    // 5. build one closed mini-spec per operation and cache it in HashMap
}
```

Implement the closure helpers in the same module:

```rust
fn collect_refs(value: &Value, refs: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(target) = map.get("$ref").and_then(Value::as_str) {
                refs.insert(target.to_string());
            }
            for nested in map.values() {
                collect_refs(nested, refs);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_refs(item, refs);
            }
        }
        _ => {}
    }
}

fn close_operation_spec(canonical: &Value, path: &str, method: &str, operation: &Value) -> anyhow::Result<Value> {
    // BFS over collected refs until the set stops growing.
    // Keep top-level openapi/info/servers/paths/components/tags only.
}
```

Implementation rules:
- use uppercase HTTP methods in `catalog` rows;
- set `group` from `tags[0]`, otherwise the first concrete resource segment in the path;
- sort `catalog.operations` by `group`, then `path`, then `method`;
- expose `catalog()` and `operation_spec(&str)` getters on `ApiDocsRegistry`.

- [x] **Step 4: Re-run the registry tests**

Run:

```bash
cargo test -p access-control _tests::catalog_tests::permission_catalog_seeds_api_reference_view_all -- --exact
cargo test -p api-server _tests::openapi_docs_tests::registry_requires_operation_id_for_every_operation -- --exact
cargo test -p api-server _tests::openapi_docs_tests::registry_rejects_duplicate_operation_ids -- --exact
cargo test -p api-server _tests::openapi_docs_tests::operation_spec_builder_keeps_refs_closed -- --exact
```

Expected: PASS.

- [x] **Step 5: Commit the registry foundation**

```bash
git add api/crates/access-control/src/catalog.rs api/crates/access-control/src/_tests/catalog_tests.rs
git add api/apps/api-server/src/openapi_docs.rs api/apps/api-server/src/_tests/openapi_docs_tests.rs api/apps/api-server/src/_tests/mod.rs
git commit -m "feat(api): build cached api docs registry"
```

Execution note (`2026-04-14 17`):
- `src/_tests` 内单测为避免 `--exact` 命中 `0 tests`，实际使用了 `--lib` 加完整模块路径。
- Rust 验证串行执行，避免 `cargo` package/artifact lock contention。

### Task 2: Expose Protected Docs Routes And Hide Legacy Docs In Production

**Files:**
- Create: `api/apps/api-server/src/routes/docs.rs`
- Create: `api/apps/api-server/src/_tests/docs_routes.rs`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`

- [x] **Step 1: Add failing route and environment coverage**

Create `api/apps/api-server/src/_tests/docs_routes.rs` with:

```rust
#[tokio::test]
async fn docs_catalog_requires_session_and_permission() {}

#[tokio::test]
async fn docs_routes_allow_root_and_granted_members() {}

#[tokio::test]
async fn docs_operation_route_returns_404_for_unknown_operation() {}
```

The success-path assertions should be concrete:

```rust
assert_eq!(catalog_response.status(), StatusCode::OK);
assert!(catalog_payload["data"]["operations"].as_array().unwrap().len() > 0);

assert_eq!(operation_response.status(), StatusCode::OK);
assert_eq!(operation_payload["info"]["title"], "1Flowse API");
assert!(operation_payload["paths"]["/api/console/me"]["patch"].is_object());
```

Extend `api/apps/api-server/tests/health_routes.rs` with:

```rust
#[tokio::test]
async fn production_router_hides_legacy_openapi_endpoints() {}
```

That integration test should build `ApiConfig` with `API_ENV=production` and explicit `API_ALLOWED_ORIGINS`, then assert:

```rust
assert_eq!(docs_response.status(), StatusCode::NOT_FOUND);
assert_eq!(openapi_response.status(), StatusCode::NOT_FOUND);
```

- [x] **Step 2: Run the failing route checks**

Run:

```bash
cargo test -p api-server _tests::docs_routes::docs_catalog_requires_session_and_permission -- --exact --nocapture
cargo test -p api-server --test health_routes production_router_hides_legacy_openapi_endpoints -- --exact --nocapture
```

Expected:
- docs route test FAILS because `/api/console/docs/*` is not registered;
- health test FAILS because production router still exposes `/docs` and `/openapi.json`.

- [x] **Step 3: Wire the cached registry into app state and add the new routes**

Extend `api/apps/api-server/src/app_state.rs`:

```rust
#[derive(Clone)]
pub struct ApiState {
    pub store: PgControlPlaneStore,
    pub runtime_engine: Arc<RuntimeEngine>,
    pub session_store: SessionStoreHandle,
    pub api_docs: Arc<ApiDocsRegistry>,
    pub cookie_name: String,
    pub session_ttl_days: i64,
    pub bootstrap_workspace_name: String,
}
```

Build the registry once during app creation in `api/apps/api-server/src/lib.rs` and the test helpers:

```rust
let api_docs = Arc::new(openapi_docs::build_default_api_docs_registry()?);

ApiState {
    store,
    runtime_engine,
    session_store: SessionStoreHandle::Redis(Box::new(session_store)),
    api_docs,
    cookie_name: config.cookie_name.clone(),
    session_ttl_days: config.session_ttl_days,
    bootstrap_workspace_name: config.bootstrap_workspace_name.clone(),
}
```

Create `api/apps/api-server/src/routes/docs.rs`:

```rust
pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/docs/catalog", get(get_docs_catalog))
        .route("/docs/operations/:operation_id/openapi.json", get(get_operation_openapi))
}

pub async fn get_docs_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<DocsCatalog>>, ApiError> {
    // load session, assert api_reference.view.all, return cached catalog
}

pub async fn get_operation_openapi(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(operation_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    // load session, assert api_reference.view.all, return cached operation spec
}
```

Permission and error mapping rules:

```rust
let context = require_session(&state, &headers).await?;
ensure_permission(&context.actor, "api_reference.view.all")
    .map_err(ControlPlaneError::PermissionDenied)?;

let spec = state
    .api_docs
    .operation_spec(&operation_id)
    .ok_or(ControlPlaneError::NotFound("operation_id"))?;
```

Update `console_router()` and module exports:

```rust
.nest("/api/console", routes::docs::router())
```

Make legacy docs exposure config-aware:

```rust
fn base_router(include_legacy_docs: bool) -> Router {
    let router = Router::new()
        .route("/health", get(health))
        .route("/api/console/health", get(console_health));

    if include_legacy_docs {
        router.merge(SwaggerUi::new("/docs").url("/openapi.json", openapi::ApiDoc::openapi()))
    } else {
        router
    }
}
```

Use:
- `base_router(true)` for `app()` and `app_with_state()`;
- `base_router(config.env != ApiEnvironment::Production)` for `app_with_state_and_config()`.

- [x] **Step 4: Re-run the protected-route and production checks**

Run:

```bash
cargo test -p api-server _tests::docs_routes::docs_catalog_requires_session_and_permission -- --exact --nocapture
cargo test -p api-server _tests::docs_routes::docs_routes_allow_root_and_granted_members -- --exact --nocapture
cargo test -p api-server _tests::docs_routes::docs_operation_route_returns_404_for_unknown_operation -- --exact --nocapture
cargo test -p api-server --test health_routes production_router_hides_legacy_openapi_endpoints -- --exact --nocapture
```

Expected: PASS.

- [x] **Step 5: Commit the docs transport slice**

```bash
git add api/apps/api-server/src/routes/docs.rs api/apps/api-server/src/app_state.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/routes/mod.rs
git add api/apps/api-server/src/_tests/docs_routes.rs api/apps/api-server/src/_tests/mod.rs api/apps/api-server/tests/health_routes.rs
git commit -m "feat(api): add protected docs catalog routes"
```

Execution note (`2026-04-14 17`):
- 红灯阶段实际观察到 `/api/console/docs/catalog` 返回 `404`，以及生产态 `/docs` 仍返回 `303` 跳转到 Swagger UI。
- `src/_tests` 内路由单测实际使用 `--lib` 加完整模块路径执行，`cargo` 继续保持串行验证。

### Task 3: Add Frontend Client Contracts And Gate Settings Visibility

**Files:**
- Create: `web/packages/api-client/src/console-api-docs.ts`
- Create: `web/app/src/features/settings/api/api-docs.ts`
- Modify: `web/packages/api-client/src/transport.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/section-shell-routing.test.tsx`

- [x] **Step 1: Write the failing frontend visibility and contract tests**

Update `web/app/src/features/settings/_tests/settings-page.test.tsx` to mock the new docs API module and add:

```tsx
test('shows API 文档 only for root or api_reference.view.all', async () => {});
test('redirects /settings/docs to /settings/members when docs is hidden but members is visible', async () => {});
test('renders the empty settings state when no section is visible', async () => {});
```

Update `web/app/src/routes/_tests/section-shell-routing.test.tsx` with:

```tsx
test('redirects /settings to /settings/members when docs is hidden but members is visible', async () => {});
test('redirects /settings/docs to /settings/roles when docs is hidden but roles is visible', async () => {});
```

Mock scaffold for both test files:

```tsx
const docsApi = vi.hoisted(() => ({
  settingsApiDocsCatalogQueryKey: ['settings', 'docs', 'catalog'],
  settingsApiDocSpecQueryKey: vi.fn((operationId: string) => ['settings', 'docs', 'operation', operationId]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
}));

vi.mock('../api/api-docs', () => docsApi);
```

- [x] **Step 2: Run the focused frontend failures**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/settings-page.test.tsx src/routes/_tests/section-shell-routing.test.tsx
```

Expected:
- tests FAIL because `settings/api/api-docs.ts` does not exist yet;
- once the mock module exists, the visibility assertions still FAIL because `docs` is hardcoded as `visible: true`.

- [x] **Step 3: Implement the raw OpenAPI client and new section visibility rule**

Extend `web/packages/api-client/src/transport.ts` so one request can opt out of `ApiSuccess` unwrapping:

```ts
export interface ApiRequestOptions {
  path: string;
  method?: string;
  body?: unknown;
  csrfToken?: string | null;
  baseUrl?: string;
  expectJson?: boolean;
  unwrapSuccess?: boolean;
}

if (unwrapSuccess === false) {
  return (await response.json()) as T;
}

return unwrapApiSuccess<T>((await response.json()) as ApiSuccessEnvelope<T>);
```

Create `web/packages/api-client/src/console-api-docs.ts`:

```ts
import { apiFetch } from './transport';

export interface ConsoleApiDocsCatalogOperation {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  group: string;
  deprecated: boolean;
}

export interface ConsoleApiDocsCatalog {
  title: string;
  version: string;
  operations: ConsoleApiDocsCatalogOperation[];
}

export function fetchConsoleApiDocsCatalog(baseUrl?: string): Promise<ConsoleApiDocsCatalog> {
  return apiFetch<ConsoleApiDocsCatalog>({
    path: '/api/console/docs/catalog',
    baseUrl,
  });
}

export function fetchConsoleApiOperationSpec(
  operationId: string,
  baseUrl?: string
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>({
    path: `/api/console/docs/operations/${operationId}/openapi.json`,
    baseUrl,
    unwrapSuccess: false,
  });
}
```

Create the feature wrapper `web/app/src/features/settings/api/api-docs.ts`:

```ts
import {
  fetchConsoleApiDocsCatalog,
  fetchConsoleApiOperationSpec,
  type ConsoleApiDocsCatalog,
} from '@1flowse/api-client';

export type SettingsApiDocsCatalog = ConsoleApiDocsCatalog;

export const settingsApiDocsCatalogQueryKey = ['settings', 'docs', 'catalog'] as const;
export const settingsApiDocSpecQueryKey = (operationId: string) =>
  ['settings', 'docs', 'operation', operationId] as const;

export function fetchSettingsApiDocsCatalog(): Promise<SettingsApiDocsCatalog> {
  return fetchConsoleApiDocsCatalog();
}

export function fetchSettingsApiOperationSpec(operationId: string) {
  return fetchConsoleApiOperationSpec(operationId);
}
```

Update `web/app/src/features/settings/lib/settings-sections.tsx`:

```tsx
{ key: 'docs', label: 'API 文档', to: '/settings/docs', visible: input.isRoot || input.permissions.includes('api_reference.view.all') }
```

- [x] **Step 4: Re-run the section-visibility tests**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/settings-page.test.tsx src/routes/_tests/section-shell-routing.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit the frontend contract slice**

```bash
git add web/packages/api-client/src/transport.ts web/packages/api-client/src/console-api-docs.ts web/packages/api-client/src/index.ts
git add web/app/src/features/settings/api/api-docs.ts web/app/src/features/settings/lib/settings-sections.tsx
git add web/app/src/features/settings/_tests/settings-page.test.tsx web/app/src/routes/_tests/section-shell-routing.test.tsx
git commit -m "feat(web): gate settings docs behind api reference permission"
```

Execution note (`2026-04-14 17`):
- 由于 `web/app` 的 package script 不会按文件参数收窄范围，实际验证命令使用了 `pnpm --dir web/app exec vitest run ...`。
- 路由测试里的 members / roles / permissions mock 需要同步补齐既有 query key 导出，否则会先以 mock 缺口报错而不是命中可见性断言。

### Task 4: Replace The Iframe With The On-Demand Docs UI And Refresh Regression Coverage

**Files:**
- Create: `web/app/src/features/settings/components/api-docs-panel.css`
- Create: `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`
- Modify: `web/app/package.json`
- Modify: `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
- Modify: `web/app/src/style-boundary/_tests/registry.test.tsx`

- [ ] **Step 1: Add failing interaction coverage for the new docs panel**

Create `web/app/src/features/settings/_tests/api-docs-panel.test.tsx` and mock Scalar to a tiny probe component:

```tsx
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({
    configuration,
  }: {
    configuration: { content: unknown };
  }) => <div data-testid="scalar-viewer">{JSON.stringify(configuration.content)}</div>,
}));
```

Cover these behaviors:

```tsx
test('renders the internal-docs empty state after catalog loads', async () => {});
test('filters catalog rows by path method summary tags and id', async () => {});
test('does not request operation detail until an operation is selected', async () => {});
test('loads operation detail from ?operation=patch_me and passes it to Scalar', async () => {});
```

Also extend `web/app/src/style-boundary/_tests/registry.test.tsx` with:

```tsx
test('renders the settings scene with mocked api docs data', async () => {});
```

- [ ] **Step 2: Run the focused UI failures**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/api-docs-panel.test.tsx src/style-boundary/_tests/registry.test.tsx
```

Expected:
- docs-panel tests FAIL because `ApiDocsPanel` still renders an `iframe`;
- style-boundary settings scene FAILS because the new page will need seeded permission and mocked docs responses.

- [ ] **Step 3: Implement the two-pane docs UI and style-boundary stubs**

Add the Scalar dependency in `web/app/package.json`:

```json
{
  "dependencies": {
    "@scalar/api-reference-react": "^0.9.22"
  }
}
```

Rebuild `web/app/src/features/settings/components/ApiDocsPanel.tsx` around query-driven state:

```tsx
const locationSearch = useRouterState({
  select: (state) => state.location.search,
});
const selectedOperationId = new URLSearchParams(locationSearch).get('operation');

const [searchValue, setSearchValue] = useState('');
const deferredSearchValue = useDeferredValue(searchValue);

const catalogQuery = useQuery({
  queryKey: settingsApiDocsCatalogQueryKey,
  queryFn: fetchSettingsApiDocsCatalog,
});

const operationQuery = useQuery({
  queryKey: settingsApiDocSpecQueryKey(selectedOperationId ?? ''),
  queryFn: () => fetchSettingsApiOperationSpec(selectedOperationId!),
  enabled: Boolean(selectedOperationId),
});
```

Filtering logic should stay fully catalog-based:

```tsx
const filteredOperations = (catalogQuery.data?.operations ?? []).filter((operation) => {
  const haystack = [
    operation.path,
    operation.method,
    operation.summary ?? '',
    operation.id,
    operation.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(deferredSearchValue.trim().toLowerCase());
});
```

Right-pane rendering rules:

```tsx
if (!selectedOperationId) return <Result status="info" title="选择一个接口查看详情" />;
if (operationQuery.isLoading) return <Spin tip="正在加载接口文档" />;
if (operationQuery.isError) return <Result status="error" title="接口文档加载失败" />;

return (
  <ApiReferenceReact
    configuration={{
      content: operationQuery.data,
      hideClientButton: true,
      hideTestRequestButton: true,
      hiddenClients: true,
      documentDownloadType: 'none',
    }}
  />
);
```

Create `api-docs-panel.css` and move layout there instead of inline mega-style blocks. Minimum class boundary:

```css
.api-docs-panel { display: grid; gap: 20px; }
.api-docs-panel__body { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); }
.api-docs-panel__catalog { overflow: auto; }
.api-docs-panel__detail { min-height: 640px; border: 1px solid var(--color-border-default); }
.api-docs-panel__method { font-family: ui-monospace, SFMono-Regular, monospace; }
```

Style-boundary updates in `web/app/src/style-boundary/registry.tsx`:

```tsx
function seedStyleBoundaryDocsFetch() {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

    if (url.includes('/api/console/docs/catalog')) {
      return new Response(JSON.stringify({
        data: {
          title: '1Flowse API',
          version: '0.1.0',
          operations: [
            {
              id: 'list_members',
              method: 'GET',
              path: '/api/console/members',
              summary: 'List members',
              description: null,
              tags: ['members'],
              group: 'members',
              deprecated: false,
            },
          ],
        },
        meta: null,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.includes('/api/console/docs/operations/list_members/openapi.json')) {
      return new Response(JSON.stringify({
        openapi: '3.1.0',
        info: { title: '1Flowse API', version: '0.1.0' },
        paths: { '/api/console/members': { get: { operationId: 'list_members', responses: { '200': { description: 'ok' } } } } },
        components: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return originalFetch(input as RequestInfo, init);
  };
}
```

Call that helper before rendering `page.settings`, and add `api_reference.view.all` to `seedStyleBoundaryAuth()` permissions.

Update `scenario-manifest.json` so `page.settings` includes:
- `web/app/src/features/settings/components/api-docs-panel.css`
- `web/app/src/features/settings/api/api-docs.ts`

- [ ] **Step 4: Run the full verification suite**

Run frontend verification:

```bash
pnpm --dir web lint
pnpm --dir web test -- --testTimeout=15000
pnpm --dir web/app build
```

Run style-boundary verification:

```bash
node scripts/node/dev-up.js ensure --frontend-only --skip-docker
node scripts/node/check-style-boundary.js page page.settings
```

Run backend verification serially:

```bash
cargo test -p access-control _tests::catalog_tests::permission_catalog_seeds_api_reference_view_all -- --exact --nocapture
cargo test -p api-server _tests::openapi_docs_tests::registry_requires_operation_id_for_every_operation -- --exact --nocapture
cargo test -p api-server _tests::openapi_docs_tests::registry_rejects_duplicate_operation_ids -- --exact --nocapture
cargo test -p api-server _tests::openapi_docs_tests::operation_spec_builder_keeps_refs_closed -- --exact --nocapture
cargo test -p api-server _tests::docs_routes::docs_catalog_requires_session_and_permission -- --exact --nocapture
cargo test -p api-server _tests::docs_routes::docs_routes_allow_root_and_granted_members -- --exact --nocapture
cargo test -p api-server _tests::docs_routes::docs_operation_route_returns_404_for_unknown_operation -- --exact --nocapture
cargo test -p api-server --test health_routes production_router_hides_legacy_openapi_endpoints -- --exact --nocapture
```

Perform one manual browser pass in desktop and mobile widths for:
- `/settings/docs`
- `/settings/docs?operation=patch_me`
- a non-doc-permission account visiting `/settings/docs` and falling back to `/settings/members` or `/settings/roles`

Execution note:
- `check-style-boundary.js` 会内部触发 `node scripts/node/dev-up.js ensure --frontend-only --skip-docker`；在受限沙箱里如出现 `listen EPERM`，应按仓库既有约定提权执行。

- [ ] **Step 5: Commit the docs UI slice**

```bash
git add web/app/package.json
git add web/app/src/features/settings/components/ApiDocsPanel.tsx web/app/src/features/settings/components/api-docs-panel.css
git add web/app/src/features/settings/_tests/api-docs-panel.test.tsx
git add web/app/src/style-boundary/registry.tsx web/app/src/style-boundary/scenario-manifest.json web/app/src/style-boundary/_tests/registry.test.tsx
git commit -m "feat(web): replace settings docs iframe with on-demand viewer"
```

## Self-Review

- Spec coverage: 独立文档权限、受保护的 `catalog` / `operation spec` 路由、canonical OpenAPI 缓存、`operationId` 唯一性门禁、生产隐藏旧 `/docs`、前端目录搜索、详情按需请求、`?operation=` 深链、`Scalar` 只做详情渲染，以及前后端测试要求，都已经映射到上面的任务。
- Placeholder scan: 计划里没有未收口的占位词；每个任务都给了明确文件路径、测试入口、命令和最小实现骨架。
- Type consistency: 权限码固定使用 `api_reference.view.all`；详情查询参数固定使用 `operation`；原始 OpenAPI JSON 只在 `/operations/{operation_id}/openapi.json` 这条链路上通过 `unwrapSuccess: false` 读取，避免和普通 `ApiSuccess` 接口混淆。
