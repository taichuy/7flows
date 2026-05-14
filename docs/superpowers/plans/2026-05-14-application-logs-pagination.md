# Application Logs Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-backed pagination to the application logs page so it loads 20 runs per request, shows the newest runs first, and renders an Ant Design pagination control in the logs table.

**Architecture:** Extend the console application runtime logs route from a bare array response into a paginated query/response contract, preserve the existing default `created_at desc, id desc` ordering in the repository, and thread the new shape through the API client and React page state. Keep the current floating-window details UI intact while making the list/table own the remaining vertical space with a bottom pagination area.

**Tech Stack:** Rust, Axum, sqlx, TypeScript, React, TanStack Query, Ant Design, Vitest

---

### Task 1: Add Backend Pagination Contract For Application Runs

**Files:**
- Modify: `api/apps/api-server/src/routes/applications/application_runtime.rs`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository/read_methods.rs`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository/mod.rs`
- Test: `api/apps/api-server/src/_tests/application/application_runtime_routes.rs`

- [ ] **Step 1: Write the failing route test for paginated logs**

```rust
#[tokio::test]
async fn application_runtime_routes_logs_are_paginated_and_newest_first() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    for index in 0..25 {
        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/console/applications/{application_id}/orchestration/debug-runs"
                    ))
                    .header("cookie", &cookie)
                    .header("x-csrf-token", &csrf)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "node_id": "flow",
                            "input_payload": {
                                "query": format!("run-{index:02}")
                            }
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::CREATED);
    }

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs?page=1&page_size=20"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(list.status(), StatusCode::OK);
    let payload: Value = serde_json::from_slice(
        &to_bytes(list.into_body(), usize::MAX).await.unwrap(),
    )
    .unwrap();

    assert_eq!(payload["data"]["page"].as_i64(), Some(1));
    assert_eq!(payload["data"]["page_size"].as_i64(), Some(20));
    assert_eq!(payload["data"]["total"].as_i64(), Some(25));
    assert_eq!(payload["data"]["items"].as_array().unwrap().len(), 20);

    let first_title = payload["data"]["items"][0]["title"].as_str().unwrap_or_default();
    let last_title = payload["data"]["items"][19]["title"].as_str().unwrap_or_default();
    assert!(first_title >= last_title);
}
```

- [ ] **Step 2: Run the targeted backend test and confirm it fails**

Run: `cargo test -p api-server application_runtime_routes_logs_are_paginated_and_newest_first -- --nocapture`

Expected: FAIL because the route still returns a bare array and does not parse `page` / `page_size`.

- [ ] **Step 3: Introduce paginated repository and route types**

```rust
#[derive(Debug, Clone, Copy)]
pub struct ListApplicationRunsInput {
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone)]
pub struct ApplicationRunSummaryPage {
    pub items: Vec<domain::ApplicationRunSummary>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}
```

```rust
#[derive(Debug, Deserialize, Default)]
pub struct ApplicationRunsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowRunSummaryPageResponse {
    pub items: Vec<FlowRunSummaryResponse>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}
```

- [ ] **Step 4: Implement paginated SQL in the Postgres repository**

```rust
let page = input.page.max(1);
let page_size = input.page_size.clamp(1, 100);
let offset = (page - 1) * page_size;

let total = sqlx::query_scalar::<_, i64>(
    r#"
    select count(*)
    from flow_runs
    where application_id = $1
    "#,
)
.bind(application_id)
.fetch_one(self.pool())
.await?;

let rows = sqlx::query(
    r#"
    select
        id,
        run_mode,
        status,
        target_node_id,
        title,
        input_payload,
        external_user,
        (
            select users.account
            from users
            where users.id = flow_runs.created_by
        ) as authorized_account,
        started_at,
        finished_at,
        created_at,
        updated_at
    from flow_runs
    where application_id = $1
    order by created_at desc, id desc
    limit $2 offset $3
    "#,
)
.bind(application_id)
.bind(page_size)
.bind(offset)
.fetch_all(self.pool())
.await?;
```

- [ ] **Step 5: Return the paginated API response**

```rust
let page = <MainDurableStore as OrchestrationRuntimeRepository>::list_application_runs(
    &state.store,
    id,
    ListApplicationRunsInput {
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(20),
    },
)
.await?;

Ok(Json(ApiSuccess::new(FlowRunSummaryPageResponse {
    items: page.items.into_iter().map(to_flow_run_summary_response).collect(),
    total: page.total,
    page: page.page,
    page_size: page.page_size,
})))
```

- [ ] **Step 6: Run the targeted backend test and confirm it passes**

Run: `cargo test -p api-server application_runtime_routes_logs_are_paginated_and_newest_first -- --nocapture`

Expected: PASS

### Task 2: Thread Paginated Logs Through The Frontend API Layer

**Files:**
- Modify: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/app/src/features/applications/api/runtime.ts`
- Test: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`

- [ ] **Step 1: Write the failing frontend test for page-1 / page-size-20 fetches**

```ts
test('requests the first logs page with page size 20 and renders pagination', async () => {
  runtimeApi.fetchApplicationRuns.mockResolvedValue({
    items: Array.from({ length: 20 }, (_, index) => ({
      id: `run-${index + 1}`,
      run_mode: 'published_api_run' as const,
      status: 'succeeded',
      target_node_id: 'node-llm',
      title: `run-${index + 1}`,
      expand_id: null,
      authorized_account: 'root',
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z',
      created_at: `2026-04-17T09:00:${String(index).padStart(2, '0')}Z`,
      updated_at: `2026-04-17T09:00:${String(index).padStart(2, '0')}Z`,
    })),
    total: 42,
    page: 1,
    page_size: 20,
  });

  render(
    <AppProviders>
      <ApplicationLogsPage applicationId="app-1" />
    </AppProviders>
  );

  await screen.findByRole('table');
  expect(runtimeApi.fetchApplicationRuns).toHaveBeenCalledWith('app-1', {
    page: 1,
    pageSize: 20,
  });
  expect(screen.getByTitle('2')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted frontend test and confirm it fails**

Run: `../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-logs-page.test.tsx`

Expected: FAIL because the mocked API and page component still use an array response with no page arguments.

- [ ] **Step 3: Add paginated client types and fetch input**

```ts
export interface ConsoleApplicationRunsPage {
  items: ConsoleApplicationRunSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetConsoleApplicationRunsInput {
  page?: number;
  page_size?: number;
}
```

```ts
export function getConsoleApplicationRuns(
  applicationId: string,
  input: GetConsoleApplicationRunsInput = {},
  baseUrl?: string
) {
  const page = input.page ?? 1;
  const pageSize = input.page_size ?? 20;

  return apiFetch<ConsoleApplicationRunsPage>({
    path: `/api/console/applications/${applicationId}/logs/runs?page=${page}&page_size=${pageSize}`,
    baseUrl
  });
}
```

- [ ] **Step 4: Update the feature API wrapper**

```ts
export interface FetchApplicationRunsInput {
  page: number;
  pageSize: number;
}

export const applicationRunsQueryKey = (
  applicationId: string,
  input: FetchApplicationRunsInput
) =>
  ['applications', applicationId, 'runtime', 'runs', input.page, input.pageSize] as const;

export function fetchApplicationRuns(
  applicationId: string,
  input: FetchApplicationRunsInput
) {
  return getConsoleApplicationRuns(
    applicationId,
    {
      page: input.page,
      page_size: input.pageSize
    },
    getApplicationsApiBaseUrl()
  );
}
```

- [ ] **Step 5: Re-run the frontend test to confirm the API contract is now green-ready**

Run: `../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-logs-page.test.tsx`

Expected: The old array-shape failures move into component-level pagination/rendering failures, confirming the API layer is wired.

### Task 3: Add Controlled Pagination To The Logs Page And Table

**Files:**
- Modify: `web/app/src/features/applications/pages/ApplicationLogsPage.tsx`
- Modify: `web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx`
- Modify: `web/app/src/features/applications/pages/application-logs-page.css`
- Test: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`

- [ ] **Step 1: Add page state and use the paginated response**

```tsx
const PAGE_SIZE = 20;

const [page, setPage] = useState(1);

const runsQuery = useQuery({
  queryKey: applicationRunsQueryKey(applicationId, { page, pageSize: PAGE_SIZE }),
  queryFn: () =>
    fetchApplicationRuns(applicationId, {
      page,
      pageSize: PAGE_SIZE
    })
});

const runsPage = runsQuery.data;
const runs = runsPage?.items ?? [];
const total = runsPage?.total ?? 0;
```

- [ ] **Step 2: Remove the local sort ambiguity and keep newest-first as the only list order**

```tsx
// Remove the updated_at sorter path from the logs page.
// Keep the backend response order as the single source of truth.
```

```tsx
<Typography.Text type="secondary">
  默认按创建时间倒序展示，最新运行优先。
</Typography.Text>
```

- [ ] **Step 3: Add controlled Ant Design pagination to the logs table**

```tsx
export function ApplicationRunsTable({
  loading = false,
  page,
  pageSize,
  total,
  runs,
  selectedRunId,
  onPageChange,
  onSelectRun
}: {
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  runs: ApplicationRunSummary[];
  selectedRunId?: string | null;
  onPageChange: (page: number) => void;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <Table<ApplicationRunSummary>
      rowKey="id"
      dataSource={runs}
      loading={loading}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: false,
        onChange: onPageChange
      }}
      // existing columns stay the same
    />
  );
}
```

- [ ] **Step 4: Feed pagination props from the page and reset page when filters change**

```tsx
useEffect(() => {
  setPage(1);
}, [applicationId, timeRange]);
```

```tsx
<ApplicationRunsTable
  loading={searchingRunDetails}
  page={page}
  pageSize={PAGE_SIZE}
  total={total}
  runs={visibleRuns}
  selectedRunId={selectedRunId}
  onPageChange={setPage}
  onSelectRun={selectRun}
/>
```

- [ ] **Step 5: Adjust the list container so the table body and pagination share the remaining height**

```css
.application-logs-page__list .ant-table-wrapper,
.application-logs-page__list .ant-spin-nested-loading,
.application-logs-page__list .ant-spin-container {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.application-logs-page__list .ant-table {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.application-logs-page__list .ant-table-container {
  flex: 1 1 auto;
}

.application-logs-page__list .ant-table-pagination {
  flex: 0 0 auto;
  margin: 12px 16px 0;
}
```

- [ ] **Step 6: Re-run the targeted frontend test suite and confirm it passes**

Run: `../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-logs-page.test.tsx`

Expected: PASS

### Task 4: Final Verification

**Files:**
- Verify: `api/apps/api-server/src/_tests/application/application_runtime_routes.rs`
- Verify: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Verify: `web/app/src/features/applications/pages/application-logs-page.css`

- [ ] **Step 1: Run backend verification**

Run: `cargo test -p api-server application_runtime_routes_logs -- --nocapture`

Expected: PASS

- [ ] **Step 2: Run frontend verification**

Run: `../../scripts/node/exec-with-real-node.sh ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-logs-page.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the logs page style-boundary check**

Run: `node scripts/node/check-style-boundary.js page page.application-logs`

Expected: PASS
