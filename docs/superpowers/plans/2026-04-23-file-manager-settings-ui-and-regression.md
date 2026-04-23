# File Manager Settings UI And Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the new backend file-management capability in the settings console, including root-managed storage configuration, root-only binding controls, workspace-level file-table management, and the final regression plus QA closeout for the whole file-manager slice.

**Architecture:** Keep the frontend aligned with the existing settings-shell structure. `@1flowbase/api-client` owns shared DTOs and fetchers, `web/app/src/features/settings/api` owns query keys and mutations, and the settings page gets a new `files` section that renders one focused file-management panel. Root users see both storage and binding controls; workspace users see only file-table actions and read-only storage references. Final regression must cover backend API contracts, settings navigation, and core permission gating before QA closeout.

**Tech Stack:** TypeScript, React, TanStack Query, Ant Design, Vitest, targeted `cargo test`, targeted `pnpm test`.

**Source Discussion:** Approved by the current file-manager storage spec; the settings console is the first operator surface for file storages and file tables.

---

## File Structure

**Create**
- `web/packages/api-client/src/console-file-management.ts`
- `web/packages/api-client/src/_tests/console-file-management.test.ts`
- `web/app/src/features/settings/api/file-management.ts`
- `web/app/src/features/settings/components/FileManagementPanel.tsx`
- `web/app/src/features/settings/components/file-management-panel.css`
- `web/app/src/features/settings/pages/settings-page/SettingsFilesSection.tsx`
- `web/app/src/features/settings/_tests/file-management-page.test.tsx`

**Modify**
- `web/packages/api-client/src/index.ts`
- `web/app/src/app/router.tsx`
- `web/app/src/features/settings/lib/settings-sections.tsx`
- `web/app/src/features/settings/pages/SettingsPage.tsx`
- `web/app/src/features/settings/pages/settings-page/SettingsSectionBody.tsx`
- `web/app/src/features/settings/_tests/settings-page.test.tsx`
- `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- `tmp/test-governance/.gitkeep`

**Notes**
- Keep the UI within the existing settings shell and avoid inventing a parallel admin area.
- The file-management panel can be bold and clear, but it must preserve the established console patterns instead of redesigning the settings page.
- Root-only controls should disappear or become disabled for non-root users; do not rely on frontend hiding alone for security.
- Final QA evidence and any saved logs belong under `tmp/test-governance/`.

### Task 1: Add Shared API Client DTOs And Settings Query Wrappers

**Files:**
- Create: `web/packages/api-client/src/console-file-management.ts`
- Create: `web/packages/api-client/src/_tests/console-file-management.test.ts`
- Create: `web/app/src/features/settings/api/file-management.ts`
- Modify: `web/packages/api-client/src/index.ts`

- [ ] **Step 1: Write the failing client-contract tests**

Create `web/packages/api-client/src/_tests/console-file-management.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('../transport', () => ({
  apiFetch: vi.fn(async (input) => input)
}));

import {
  createConsoleFileStorage,
  fetchConsoleFileStorages,
  fetchConsoleFileTables,
  updateConsoleFileTableBinding
} from '../console-file-management';

describe('console-file-management client', () => {
  test('fetchConsoleFileStorages points at the storage collection route', async () => {
    await expect(fetchConsoleFileStorages()).resolves.toMatchObject({
      path: '/api/console/file-storages'
    });
  });

  test('fetchConsoleFileTables points at the file-table collection route', async () => {
    await expect(fetchConsoleFileTables()).resolves.toMatchObject({
      path: '/api/console/file-tables'
    });
  });

  test('updateConsoleFileTableBinding posts to the binding route', async () => {
    await expect(
      updateConsoleFileTableBinding('table-1', { bound_storage_id: 'storage-1' })
    ).resolves.toMatchObject({
      path: '/api/console/file-tables/table-1/binding',
      method: 'POST'
    });
  });

  test('createConsoleFileStorage posts the storage payload', async () => {
    await expect(
      createConsoleFileStorage({
        code: 'local-default',
        title: 'Local',
        driver_type: 'local',
        enabled: true,
        is_default: true,
        config_json: { root_path: 'api/storage' },
        rule_json: {}
      })
    ).resolves.toMatchObject({
      path: '/api/console/file-storages',
      method: 'POST'
    });
  });
});
```

- [ ] **Step 2: Run the focused API-client test to verify it fails**

Run:

```bash
pnpm --dir web --filter @1flowbase/api-client test -- src/_tests/console-file-management.test.ts
```

Expected:

- FAIL because the shared file-management client file does not exist yet.

- [ ] **Step 3: Implement the shared client and settings API wrappers**

Create `web/packages/api-client/src/console-file-management.ts`:

```ts
import { apiFetch } from './transport';

export interface ConsoleFileStorage {
  id: string;
  code: string;
  title: string;
  driver_type: string;
  enabled: boolean;
  is_default: boolean;
  health_status: string;
  config_json: Record<string, unknown>;
  rule_json: Record<string, unknown>;
}

export interface ConsoleFileTable {
  id: string;
  code: string;
  title: string;
  scope_kind: 'system' | 'workspace';
  scope_id: string;
  bound_storage_id: string;
  bound_storage_title: string;
  is_builtin: boolean;
  is_default: boolean;
}

export function fetchConsoleFileStorages(baseUrl?: string) {
  return apiFetch<ConsoleFileStorage[]>({
    path: '/api/console/file-storages',
    baseUrl
  });
}

export function createConsoleFileStorage(
  body: Record<string, unknown>,
  baseUrl?: string
) {
  return apiFetch<ConsoleFileStorage>({
    path: '/api/console/file-storages',
    method: 'POST',
    body,
    baseUrl
  });
}

export function fetchConsoleFileTables(baseUrl?: string) {
  return apiFetch<ConsoleFileTable[]>({
    path: '/api/console/file-tables',
    baseUrl
  });
}

export function createConsoleFileTable(
  body: Record<string, unknown>,
  baseUrl?: string
) {
  return apiFetch<ConsoleFileTable>({
    path: '/api/console/file-tables',
    method: 'POST',
    body,
    baseUrl
  });
}

export function updateConsoleFileTableBinding(
  fileTableId: string,
  body: { bound_storage_id: string },
  baseUrl?: string
) {
  return apiFetch<ConsoleFileTable>({
    path: `/api/console/file-tables/${fileTableId}/binding`,
    method: 'POST',
    body,
    baseUrl
  });
}
```

Update `web/packages/api-client/src/index.ts`:

```ts
export * from './console-file-management';
```

Create `web/app/src/features/settings/api/file-management.ts`:

```ts
import {
  createConsoleFileStorage,
  createConsoleFileTable,
  fetchConsoleFileStorages,
  fetchConsoleFileTables,
  updateConsoleFileTableBinding,
  type ConsoleFileStorage,
  type ConsoleFileTable
} from '@1flowbase/api-client';

export type SettingsFileStorage = ConsoleFileStorage;
export type SettingsFileTable = ConsoleFileTable;

export const settingsFileStoragesQueryKey = ['settings', 'files', 'storages'] as const;
export const settingsFileTablesQueryKey = ['settings', 'files', 'tables'] as const;

export {
  createConsoleFileStorage as createSettingsFileStorage,
  createConsoleFileTable as createSettingsFileTable,
  fetchConsoleFileStorages as fetchSettingsFileStorages,
  fetchConsoleFileTables as fetchSettingsFileTables,
  updateConsoleFileTableBinding as updateSettingsFileTableBinding
};
```

- [ ] **Step 4: Re-run the focused API-client test**

Run:

```bash
pnpm --dir web --filter @1flowbase/api-client test -- src/_tests/console-file-management.test.ts
```

Expected:

- PASS with the shared client pointing to the approved routes.

- [ ] **Step 5: Commit the frontend API contract layer**

```bash
git add web/packages/api-client web/app/src/features/settings/api/file-management.ts
git commit -m "feat: add file management api clients"
```

### Task 2: Add The Settings Section, Router Entry, And Permission Gating

**Files:**
- Create: `web/app/src/features/settings/pages/settings-page/SettingsFilesSection.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsSectionBody.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/section-shell-routing.test.tsx`

- [ ] **Step 1: Write the failing settings-shell tests**

Add to `web/app/src/features/settings/_tests/settings-page.test.tsx`:

```tsx
  test('renders /settings/files for root users', async () => {
    authenticateWithPermissions([], 'root');
    renderApp('/settings/files');

    expect(await screen.findByText('文件管理')).toBeInTheDocument();
  });

  test('redirects /settings/files when the section is hidden for the current actor', async () => {
    authenticateWithPermissions([]);
    renderApp('/settings/files');

    await waitFor(() => {
      expect(window.location.pathname).not.toBe('/settings/files');
    });
  });
```

Add to `web/app/src/routes/_tests/section-shell-routing.test.tsx`:

```tsx
  test('root users can navigate to /settings/files', async () => {
    authenticateWithPermissions([], 'root');
    renderApp('/settings/files');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/files');
    });
  });
```

- [ ] **Step 2: Run the focused settings-shell tests to verify they fail**

Run:

```bash
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/settings-page.test.tsx
```

Expected:

- FAIL because the `files` section is not registered anywhere yet.

- [ ] **Step 3: Register the new settings section and route**

Create `web/app/src/features/settings/pages/settings-page/SettingsFilesSection.tsx`:

```tsx
import { FileManagementPanel } from '../../components/FileManagementPanel';

export function SettingsFilesSection({
  isRoot
}: {
  isRoot: boolean;
}) {
  return <FileManagementPanel isRoot={isRoot} />;
}
```

Update `web/app/src/features/settings/lib/settings-sections.tsx`:

```tsx
export type SettingsSectionKey =
  | 'docs'
  | 'system-runtime'
  | 'model-providers'
  | 'files'
  | 'members'
  | 'roles';

  {
    key: 'files',
    label: '文件管理',
    to: '/settings/files',
    requiredPermissions: [
      'file_storage.view.all',
      'file_table.view.all',
      'file_table.view.own',
      'file_table.create.all'
    ]
  },
```

Update `web/app/src/app/router.tsx`:

```tsx
{
  path: '/settings/files',
  component: () => <SettingsPage requestedSectionKey="files" />
},
```

Update `web/app/src/features/settings/pages/settings-page/SettingsSectionBody.tsx`:

```tsx
import { SettingsFilesSection } from './SettingsFilesSection';

export function SettingsSectionBody({
  sectionKey,
  isRoot,
  canManageMembers,
  canManageRoles,
  canManageModelProviders
}: {
  sectionKey: SettingsSectionKey;
  isRoot: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageModelProviders: boolean;
}) {
```

And in the switch:

```tsx
    case 'files':
      return <SettingsFilesSection isRoot={isRoot} />;
```

Update `web/app/src/features/settings/pages/SettingsPage.tsx`:

```tsx
  const isRootActor = Boolean(isRoot);

  <SettingsSectionBody
    sectionKey={activeSection.key}
    isRoot={isRootActor}
    canManageMembers={canManageMembers}
    canManageRoles={canManageRoles}
    canManageModelProviders={canManageModelProviders}
  />
```

- [ ] **Step 4: Re-run the focused settings-shell tests**

Run:

```bash
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/settings-page.test.tsx
pnpm --dir web --filter @1flowbase/web test -- src/routes/_tests/section-shell-routing.test.tsx
```

Expected:

- PASS with `/settings/files` routable for root users and correctly hidden when unavailable.

- [ ] **Step 5: Commit the settings-shell integration**

```bash
git add web/app/src/app/router.tsx web/app/src/features/settings
git commit -m "feat: add file management settings section"
```

### Task 3: Build The File Management Panel With Root And Workspace Modes

**Files:**
- Create: `web/app/src/features/settings/components/FileManagementPanel.tsx`
- Create: `web/app/src/features/settings/components/file-management-panel.css`
- Create: `web/app/src/features/settings/_tests/file-management-page.test.tsx`

- [ ] **Step 1: Write the failing panel behavior tests**

Create `web/app/src/features/settings/_tests/file-management-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const fileManagementApi = vi.hoisted(() => ({
  settingsFileStoragesQueryKey: ['settings', 'files', 'storages'],
  settingsFileTablesQueryKey: ['settings', 'files', 'tables'],
  fetchSettingsFileStorages: vi.fn(),
  fetchSettingsFileTables: vi.fn(),
  createSettingsFileStorage: vi.fn(),
  createSettingsFileTable: vi.fn(),
  updateSettingsFileTableBinding: vi.fn()
}));

vi.mock('../api/file-management', () => fileManagementApi);

import { FileManagementPanel } from '../components/FileManagementPanel';

describe('FileManagementPanel', () => {
  test('root mode renders both storage and file-table sections', async () => {
    fileManagementApi.fetchSettingsFileStorages.mockResolvedValue([]);
    fileManagementApi.fetchSettingsFileTables.mockResolvedValue([]);

    render(<FileManagementPanel isRoot />);

    expect(await screen.findByText('存储器')).toBeInTheDocument();
    expect(await screen.findByText('文件表')).toBeInTheDocument();
  });

  test('workspace mode hides storage creation controls', async () => {
    fileManagementApi.fetchSettingsFileStorages.mockResolvedValue([]);
    fileManagementApi.fetchSettingsFileTables.mockResolvedValue([]);

    render(<FileManagementPanel isRoot={false} />);

    expect(await screen.findByText('文件表')).toBeInTheDocument();
    expect(screen.queryByText('新增存储器')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused panel test to verify it fails**

Run:

```bash
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/file-management-page.test.tsx
```

Expected:

- FAIL because the file-management panel component does not exist yet.

- [ ] **Step 3: Implement the combined panel with explicit root/workspace states**

Create `web/app/src/features/settings/components/FileManagementPanel.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';

import {
  fetchSettingsFileStorages,
  fetchSettingsFileTables,
  settingsFileStoragesQueryKey,
  settingsFileTablesQueryKey
} from '../api/file-management';
import './file-management-panel.css';

export function FileManagementPanel({
  isRoot
}: {
  isRoot: boolean;
}) {
  const storagesQuery = useQuery({
    queryKey: settingsFileStoragesQueryKey,
    queryFn: fetchSettingsFileStorages,
    enabled: isRoot
  });
  const tablesQuery = useQuery({
    queryKey: settingsFileTablesQueryKey,
    queryFn: fetchSettingsFileTables
  });

  return (
    <div className="file-management-panel">
      <Card title="文件表" extra={<Button type="primary">新建文件表</Button>}>
        <Typography.Paragraph type="secondary">
          文件表是真实业务表，上传文件和模型产物都统一进入这里。
        </Typography.Paragraph>
        {tablesQuery.data?.length ? (
          <Table
            rowKey="id"
            pagination={false}
            dataSource={tablesQuery.data}
            columns={[
              { title: '名称', dataIndex: 'title' },
              { title: '编码', dataIndex: 'code' },
              {
                title: '范围',
                dataIndex: 'scope_kind',
                render: (value: string) => <Tag>{value}</Tag>
              },
              { title: '当前存储器', dataIndex: 'bound_storage_title' }
            ]}
          />
        ) : (
          <Empty description="暂无文件表" />
        )}
      </Card>

      {isRoot ? (
        <Card title="存储器" extra={<Button>新增存储器</Button>}>
          <Typography.Paragraph type="secondary">
            只有 root 可以配置存储器和修改文件表绑定关系。
          </Typography.Paragraph>
          {storagesQuery.data?.length ? (
            <Space direction="vertical" className="file-management-panel__storage-list">
              {storagesQuery.data.map((storage) => (
                <div key={storage.id} className="file-management-panel__storage-row">
                  <div>
                    <Typography.Text strong>{storage.title}</Typography.Text>
                    <Typography.Text type="secondary">
                      {storage.driver_type}
                    </Typography.Text>
                  </div>
                  <Space>
                    {storage.is_default ? <Tag color="green">默认</Tag> : null}
                    <Tag>{storage.health_status}</Tag>
                  </Space>
                </div>
              ))}
            </Space>
          ) : (
            <Empty description="暂无存储器" />
          )}
        </Card>
      ) : null}
    </div>
  );
}
```

Create `web/app/src/features/settings/components/file-management-panel.css`:

```css
.file-management-panel {
  display: grid;
  gap: 16px;
}

.file-management-panel__storage-list {
  width: 100%;
}

.file-management-panel__storage-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}
```

- [ ] **Step 4: Re-run the focused panel test**

Run:

```bash
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/file-management-page.test.tsx
```

Expected:

- PASS with root mode showing both cards and workspace mode hiding storage creation controls.

- [ ] **Step 5: Commit the file-management panel**

```bash
git add web/app/src/features/settings/components web/app/src/features/settings/_tests/file-management-page.test.tsx
git commit -m "feat: add file management settings panel"
```

### Task 4: Run Final Regression And QA Closeout

**Files:**
- Modify: `tmp/test-governance/.gitkeep`

- [ ] **Step 1: Create the regression output directory if it does not already exist**

Run:

```bash
mkdir -p tmp/test-governance/file-manager
touch tmp/test-governance/.gitkeep
```

Expected:

- The directory exists for saved verification outputs and future coverage artifacts.

- [ ] **Step 2: Run the targeted backend and frontend regression suite**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object -- --nocapture | tee tmp/test-governance/file-manager/storage-object.log
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_ -- --nocapture | tee tmp/test-governance/file-manager/control-plane.log
cargo test --manifest-path api/Cargo.toml -p api-server file_management_routes -- --nocapture | tee tmp/test-governance/file-manager/api-server.log
pnpm --dir web --filter @1flowbase/api-client test -- src/_tests/console-file-management.test.ts | tee tmp/test-governance/file-manager/api-client.log
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/settings-page.test.tsx | tee tmp/test-governance/file-manager/settings-page.log
pnpm --dir web --filter @1flowbase/web test -- src/features/settings/_tests/file-management-page.test.tsx | tee tmp/test-governance/file-manager/file-management-page.log
```

Expected:

- PASS for all six commands, with logs saved under `tmp/test-governance/file-manager/`.

- [ ] **Step 3: Run one focused OpenAPI and routing regression**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server openapi_alignment -- --nocapture | tee tmp/test-governance/file-manager/openapi.log
pnpm --dir web --filter @1flowbase/web test -- src/routes/_tests/section-shell-routing.test.tsx | tee tmp/test-governance/file-manager/section-routing.log
```

Expected:

- PASS with the new file-management routes documented and `/settings/files` integrated into the existing shell.

- [ ] **Step 4: Perform the final QA review using `qa-evaluation`**

Review with the `qa-evaluation` skill in task mode against these acceptance points:

```text
1. Root can create and inspect storages, and only root can rebind file tables.
2. Built-in attachments exists after startup and workspace tables reuse the same fixed template.
3. Upload writes bytes to the selected storage, inserts a runtime record, and stores record-level storage_id.
4. Content read resolves by the record snapshot, not by the table’s current binding.
5. Settings UI reflects root/workspace differences without creating a parallel admin shell.
```

Expected:

- A concise QA conclusion with evidence from the saved logs and no unsupported claims.

- [ ] **Step 5: Commit the console and regression closeout**

```bash
git add web tmp/test-governance
git commit -m "feat: finalize file management console and regression"
```
