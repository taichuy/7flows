# Settings Docs Category Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/settings/docs` 的分类入口从多张卡片收口为一个支持检索的 Ant Design `Select`，并保留现有 `?category=` 深链接与 Scalar 详情区。

**Architecture:** 本轮只改前端消费层，不改 `/api/console/docs/catalog` 接口结构。`ApiDocsPanel` 会先把 `catalog.categories` 映射成 `Select` option，使用本地纯函数统一处理 `label + id` 的检索归一化规则，再通过现有 `updateCategoryQuery()` 维持 URL 真值；详情区仍直接消费当前分类的 OpenAPI 文档。

**Tech Stack:** React 19, TypeScript, TanStack Query, TanStack Router, Ant Design 5, Vitest, Testing Library, Scalar React API Reference

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-14-settings-docs-category-select-design.md`

---

## File Structure

**Create**
- `web/app/src/features/settings/lib/api-docs-category-search.ts`
- `web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts`

**Modify**
- `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- `web/app/src/features/settings/components/api-docs-panel.css`
- `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`

## Task 1: Add Category Search Normalization Helper

**Files:**
- Create: `web/app/src/features/settings/lib/api-docs-category-search.ts`
- Create: `web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts`:

```ts
import { describe, expect, test } from 'vitest';

import {
  buildApiDocsCategorySearchText,
  normalizeApiDocsCategorySearchText
} from '../api-docs-category-search';

describe('api docs category search helpers', () => {
  test('normalizes case and common separators', () => {
    expect(normalizeApiDocsCategorySearchText('Single:Health / Runtime_Test')).toBe(
      'singlehealthruntimetest'
    );
  });

  test('combines label and id into a single searchable string', () => {
    expect(
      buildApiDocsCategorySearchText({
        id: 'single:health',
        label: '/health'
      })
    ).toBe('healthsinglehealth');
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
pnpm --dir web/app test src/features/settings/lib/_tests/api-docs-category-search.test.ts
```

Expected: FAIL because `api-docs-category-search.ts` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Create `web/app/src/features/settings/lib/api-docs-category-search.ts`:

```ts
export function normalizeApiDocsCategorySearchText(input: string): string {
  return input.toLowerCase().replace(/[\s\-/:_]+/g, '');
}

export function buildApiDocsCategorySearchText(category: {
  id: string;
  label: string;
}): string {
  return normalizeApiDocsCategorySearchText(`${category.label} ${category.id}`);
}
```

- [ ] **Step 4: Re-run the helper test to verify it passes**

Run:

```bash
pnpm --dir web/app test src/features/settings/lib/_tests/api-docs-category-search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add web/app/src/features/settings/lib/api-docs-category-search.ts
git add web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts
git commit -m "feat(settings): add api docs category search helper"
```

## Task 2: Replace Category Cards With A Searchable Select Card

**Files:**
- Modify: `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- Modify: `web/app/src/features/settings/components/api-docs-panel.css`
- Modify: `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`
- Use: `web/app/src/features/settings/lib/api-docs-category-search.ts`

- [ ] **Step 1: Extend the panel test with selector-card and normalized search expectations**

Update `web/app/src/features/settings/_tests/api-docs-panel.test.tsx` to keep the existing selector-card assertions and add one search-focused case:

```tsx
test('filters categories by normalized label and id text', async () => {
  renderApp('/settings/docs');

  const combobox = await screen.findByRole('combobox', { name: '接口分类' });

  fireEvent.mouseDown(combobox);
  fireEvent.change(combobox, { target: { value: 'single health' } });

  expect(await screen.findByRole('option', { name: /\/health/i })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /^console$/i })).not.toBeInTheDocument();
});
```

Keep these assertions intact because they already describe the approved UX:

```tsx
expect(await screen.findByText('当前分类')).toBeInTheDocument();
expect(screen.getByText('已收录 3 个分类')).toBeInTheDocument();
expect(screen.getByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
expect(screen.getByText('当前分类 2 个接口')).toBeInTheDocument();
```

- [ ] **Step 2: Run the panel test to verify it fails for the right reason**

Run:

```bash
pnpm --dir web/app test src/features/settings/_tests/api-docs-panel.test.tsx
```

Expected:
- FAIL because `ApiDocsPanel` still renders `.api-docs-panel__categories` card buttons;
- FAIL because the CSS file does not yet contain `.api-docs-panel__category-selector`;
- FAIL because there is no searchable `combobox`.

- [ ] **Step 3: Implement the selector card and searchable options**

Update `web/app/src/features/settings/components/ApiDocsPanel.tsx`:

```tsx
import { Empty, Result, Select, Spin, Typography } from 'antd';

import {
  buildApiDocsCategorySearchText,
  normalizeApiDocsCategorySearchText
} from '../lib/api-docs-category-search';

type CategorySelectOption = {
  value: string;
  label: string;
  categoryId: string;
  operationCount: number;
  searchText: string;
};

const categoryOptions: CategorySelectOption[] = categories.map((category) => ({
  value: category.id,
  label: category.label,
  categoryId: category.id,
  operationCount: category.operation_count,
  searchText: buildApiDocsCategorySearchText(category)
}));

function renderCategorySelector() {
  if (categories.length === 0) {
    return (
      <section className="api-docs-panel__category-selector" aria-label="当前分类">
        <Typography.Text strong>当前分类</Typography.Text>
        <Typography.Text type="secondary">已收录 0 个分类</Typography.Text>
        <Empty description="暂无接口分类" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </section>
    );
  }

  return (
    <section className="api-docs-panel__category-selector" aria-label="当前分类">
      <div className="api-docs-panel__category-selector-header">
        <div className="api-docs-panel__category-selector-copy">
          <Typography.Text strong>当前分类</Typography.Text>
          <Typography.Text type="secondary">已收录 {categories.length} 个分类</Typography.Text>
        </div>
        <Typography.Text className="api-docs-panel__category-selector-current">
          当前分类 {selectedCategory?.operation_count ?? 0} 个接口
        </Typography.Text>
      </div>

      <Select
        aria-label="接口分类"
        className="api-docs-panel__category-select"
        showSearch
        value={selectedCategoryId ?? undefined}
        options={categoryOptions}
        placeholder="选择接口分类"
        optionRender={(option) => {
          const category = option.data as CategorySelectOption;
          return (
            <div className="api-docs-panel__category-option">
              <div className="api-docs-panel__category-option-copy">
                <span className="api-docs-panel__category-option-label">{category.label}</span>
                <span className="api-docs-panel__category-option-id">{category.categoryId}</span>
              </div>
              <span className="api-docs-panel__category-option-count">
                {category.operationCount} 个接口
              </span>
            </div>
          );
        }}
        filterOption={(input, option) =>
          String(option?.searchText ?? '').includes(normalizeApiDocsCategorySearchText(input))
        }
        onChange={(nextCategoryId) => updateCategoryQuery(nextCategoryId)}
        notFoundContent="未找到匹配分类"
      />
    </section>
  );
}
```

Return the selector in place of the old card strip:

```tsx
return (
  <div className="api-docs-panel">
    <div className="api-docs-panel__header">{/* existing header */}</div>
    {renderCategorySelector()}
    <section className="api-docs-panel__detail" aria-label="API 文档详情">
      {renderDetailPane()}
    </section>
  </div>
);
```

Update `web/app/src/features/settings/components/api-docs-panel.css`:

```css
.api-docs-panel__category-selector,
.api-docs-panel__detail {
  min-width: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 20px;
  box-shadow: var(--shadow-card);
}

.api-docs-panel__category-selector {
  display: grid;
  gap: 16px;
  padding: 20px 24px;
}

.api-docs-panel__category-selector-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.api-docs-panel__category-selector-copy {
  display: grid;
  gap: 4px;
}

.api-docs-panel__category-select {
  width: 100%;
}

.api-docs-panel__category-option {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.api-docs-panel__category-option-copy {
  display: grid;
  gap: 4px;
}

.api-docs-panel__category-option-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.api-docs-panel__category-option-id {
  font-size: 12px;
  color: var(--text-tertiary);
}

.api-docs-panel__category-option-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
```

Implementation guardrails:
- delete the old `.api-docs-panel__categories` / `.api-docs-panel__category-card` layout instead of leaving dead CSS behind;
- keep styling on first-party wrapper classes only, do not recurse into `.ant-select-*` internals;
- keep `useEffect` URL repair logic unchanged.

- [ ] **Step 4: Re-run the panel test to verify the selector card passes**

Run:

```bash
pnpm --dir web/app test src/features/settings/_tests/api-docs-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the selector-card implementation**

```bash
git add web/app/src/features/settings/components/ApiDocsPanel.tsx
git add web/app/src/features/settings/components/api-docs-panel.css
git add web/app/src/features/settings/_tests/api-docs-panel.test.tsx
git commit -m "feat(settings): use searchable docs category select"
```

## Task 3: Run Feature And Workspace Verification

**Files:**
- Verify: `web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts`
- Verify: `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`

- [ ] **Step 1: Re-run the focused settings tests together**

Run:

```bash
pnpm --dir web/app test src/features/settings/lib/_tests/api-docs-category-search.test.ts src/features/settings/_tests/api-docs-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run required workspace verification**

Run:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Expected:
- `lint` PASS;
- `test` PASS across the workspace;
- `build` PASS for `@1flowse/web`.

- [ ] **Step 3: Review the diff for scope**

Run:

```bash
git diff --stat
git diff -- web/app/src/features/settings/components/ApiDocsPanel.tsx
git diff -- web/app/src/features/settings/components/api-docs-panel.css
git diff -- web/app/src/features/settings/_tests/api-docs-panel.test.tsx
git diff -- web/app/src/features/settings/lib/api-docs-category-search.ts
git diff -- web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts
```

Expected: only the selector-card UI, helper, and tests changed for this feature.

- [ ] **Step 4: Commit the verified feature**

```bash
git add web/app/src/features/settings/components/ApiDocsPanel.tsx
git add web/app/src/features/settings/components/api-docs-panel.css
git add web/app/src/features/settings/_tests/api-docs-panel.test.tsx
git add web/app/src/features/settings/lib/api-docs-category-search.ts
git add web/app/src/features/settings/lib/_tests/api-docs-category-search.test.ts
git commit -m "feat(settings): refine docs category selection"
```
