# AgentFlow Schema UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `agent-flow` 中建立 `canvas_node_schema + overlay_shell_schema` 的前端 typed contract、renderer registry 和 runtime，把节点卡片、节点详情和两类非画布壳层迁入统一 schema runtime，并为未来 `page_block_schema` 预留稳定入口。

**Architecture:** 本轮采用前端 registry-first 方案：`shared/schema-ui` 提供 contracts、rule evaluator、renderer runtime 和 overlay shells；`features/agent-flow/schema` 提供节点 schema registry、field/view renderers 和 adapter；`agent-flow` 组件层只负责消费 runtime。`page_block_schema` 只保留 type、namespace 和 `schemaVersion`，不落 renderer，不接页面，不接存储。

**Tech Stack:** React 19, TypeScript, Ant Design 5, Zustand, `@xyflow/react`, Vitest, Testing Library, existing `style-boundary` tooling

**Design Basis:** 2026-04-17 用户确认的 schema UI 分层方向与执行边界，已记录于 `.memory/project-memory/2026-04-17-agentflow-schema-ui-layering-direction.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。前端实现完成后必须执行 `pnpm --dir web lint`、`pnpm --dir web test`、`pnpm --dir web/app build`，并补 `page.application-detail` 与 `page.home` 两个 `style-boundary` 场景。

---

## File Structure

### New shared schema-ui contracts and runtime

- Create: `web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts`
  - 定义 `CanvasNodeSchema`、block unions、受限条件规则和 renderer key。
- Create: `web/app/src/shared/schema-ui/contracts/page-block-schema.ts`
  - 只预留 `PageBlockSchema`、registry namespace 和 `schemaVersion`。
- Create: `web/app/src/shared/schema-ui/runtime/rule-evaluator.ts`
  - 负责 `visibleWhen / disabledWhen / requiredWhen` 的受限求值。
- Create: `web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx`
  - 负责递归渲染 `container / field / view` blocks。
- Create: `web/app/src/shared/schema-ui/registry/create-renderer-registry.ts`
  - 负责创建 field/view/shell registries，阻止 schema 直接透传组件。
- Create: `web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx`
  - 覆盖 contract、rule evaluator 和 renderer runtime。

### New shared overlay shell runtime

- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaDockPanel.tsx`
  - 停靠式 panel runtime，支持 header、tabs、width、resize 和 body scroll。
- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaDrawerPanel.tsx`
  - 右侧抽屉式 panel runtime，承接非画布 drawer。
- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaModalPanel.tsx`
  - 模态壳层 runtime，承接非画布 modal。
- Create: `web/app/src/shared/schema-ui/_tests/overlay-shell.test.tsx`
  - 覆盖三类壳层的 title、footer、visibility 和 dock resize。

### New agent-flow schema registry and adapters

- Create: `web/app/src/features/agent-flow/schema/node-schema-registry.ts`
  - 节点 schema registry，按 `nodeType` 返回完整 `CanvasNodeSchema`。
- Create: `web/app/src/features/agent-flow/schema/node-schema-fragments.ts`
  - 复用 `summary / policy_group / relations / lastRun` 等 fragments。
- Create: `web/app/src/features/agent-flow/schema/node-schema-adapter.ts`
  - 提供 `getValue / setValue / getDerived / dispatch`。
- Create: `web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx`
  - 把当前 `text / number / selector / templated_text...` 渲染器注册进 field registry。
- Create: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
  - 把 `summary / output_contract / relations / policy_group / runtime_*` 注册进 view registry。
- Create: `web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts`
  - 组装 agent-flow 专用 field/view registries，供 detail 和 node card 复用。
- Create: `web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx`
  - 覆盖 registry 输出和 adapter 读写。

### Existing agent-flow files to modify

- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
  - 降级为 metadata/bridge，不再承载最终 UI 真值。
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
  - 改为 schema form runtime 外壳。
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
  - 消费 `CanvasNodeSchema.detail + SchemaDockPanel`。
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
  - 从节点 schema header blocks 渲染。
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
  - 改为单纯 schema blocks 装配层。
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
  - 改为消费 `detail.tabs.lastRun` view blocks。
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx`
  - 改为纯 view renderers，接受 schema block + adapter props。
- Modify: `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
  - 改为消费 `canvas_node_schema.card`。
- Modify: `web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts`
  - 在 canvas node data 中注入 `nodeSchema` 和 card view model。
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

### Existing non-agent-flow overlay consumers to modify

- Modify: `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
  - 改为 `drawer_panel` consumer。
- Modify: `web/app/src/features/applications/components/ApplicationCreateModal.tsx`
  - 改为 `modal_panel` consumer。
- Modify: `web/app/src/features/applications/_tests/application-create-modal.test.tsx`
  - 覆盖 modal schema shell 不影响表单语义。
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
  - 增加 `shared/schema-ui` 和 overlay shell 影响文件映射。

## Task 1: Build Shared Schema Contracts And Core Runtime

**Files:**
- Create: `web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts`
- Create: `web/app/src/shared/schema-ui/contracts/page-block-schema.ts`
- Create: `web/app/src/shared/schema-ui/runtime/rule-evaluator.ts`
- Create: `web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx`
- Create: `web/app/src/shared/schema-ui/registry/create-renderer-registry.ts`
- Create: `web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx`

- [x] **Step 1: Write the failing shared runtime tests**

```tsx
// web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { CanvasNodeSchema } from '../contracts/canvas-node-schema';
import { createRendererRegistry } from '../registry/create-renderer-registry';
import { evaluateSchemaRule } from '../runtime/rule-evaluator';
import { SchemaRenderer } from '../runtime/SchemaRenderer';

const registry = createRendererRegistry({
  fields: {
    text: ({ block, adapter }) => (
      <input aria-label={block.label} value={String(adapter.getValue(block.path) ?? '')} readOnly />
    )
  },
  views: {
    summary: ({ block }) => <div>{block.title}</div>
  },
  shells: {}
});

const schema: CanvasNodeSchema = {
  schemaVersion: '1.0.0',
  nodeType: 'llm',
  capabilities: ['help', 'run'],
  card: {
    blocks: []
  },
  detail: {
    header: { blocks: [] },
    tabs: {
      config: {
        blocks: [
          { kind: 'view', renderer: 'summary', title: '节点说明' },
          {
            kind: 'section',
            title: 'Inputs',
            blocks: [{ kind: 'field', renderer: 'text', path: 'config.model', label: '模型' }]
          }
        ]
      },
      lastRun: { blocks: [] }
    }
  },
  runtimeSlots: {}
};

describe('schema runtime', () => {
  test('evaluates visibility rules with capability lookups', () => {
    expect(
      evaluateSchemaRule(
        { operator: 'hasCapability', capability: 'run' },
        { capabilities: ['help', 'run'], values: {} }
      )
    ).toBe(true);
  });

  test('renders nested blocks through the registry', () => {
    render(
      <SchemaRenderer
        adapter={{
          getValue: (path: string) => (path === 'config.model' ? 'gpt-4o-mini' : null),
          setValue: vi.fn(),
          getDerived: () => null,
          dispatch: vi.fn()
        }}
        blocks={schema.detail.tabs.config.blocks}
        registry={registry}
      />
    );

    expect(screen.getByText('节点说明')).toBeInTheDocument();
    expect(screen.getByLabelText('模型')).toHaveValue('gpt-4o-mini');
  });
});
```

- [x] **Step 2: Run the targeted shared runtime test and confirm it fails**

Run:

```bash
pnpm --dir web/app exec vitest run src/shared/schema-ui/_tests/schema-runtime.test.tsx
```

Expected: FAIL with missing `schema-ui` modules and exports.

- [x] **Step 3: Implement the contracts, rule evaluator and base renderer runtime**

```ts
// web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts
export type SchemaConditionOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'truthy'
  | 'falsy'
  | 'hasCapability';

export interface SchemaCondition {
  operator: SchemaConditionOperator;
  path?: string;
  value?: unknown;
  values?: unknown[];
  capability?: string;
}

export interface SchemaFieldBlock {
  kind: 'field';
  renderer: string;
  path: string;
  label: string;
  visibleWhen?: SchemaCondition;
  disabledWhen?: SchemaCondition;
  requiredWhen?: SchemaCondition;
}

export interface SchemaViewBlock {
  kind: 'view';
  renderer: string;
  title?: string;
  key?: string;
  visibleWhen?: SchemaCondition;
}

export interface SchemaSectionBlock {
  kind: 'section';
  title: string;
  blocks: SchemaBlock[];
  visibleWhen?: SchemaCondition;
}

export interface SchemaStackBlock {
  kind: 'stack' | 'inline' | 'tabs';
  blocks: SchemaBlock[];
  visibleWhen?: SchemaCondition;
}

export type SchemaBlock =
  | SchemaFieldBlock
  | SchemaViewBlock
  | SchemaSectionBlock
  | SchemaStackBlock;

export interface CanvasNodeSchema {
  schemaVersion: '1.0.0';
  nodeType: string;
  capabilities: string[];
  card: { blocks: SchemaBlock[] };
  detail: {
    header: { blocks: SchemaBlock[] };
    tabs: {
      config: { blocks: SchemaBlock[] };
      lastRun: { blocks: SchemaBlock[] };
    };
  };
  runtimeSlots: Record<string, string>;
}
```

```ts
// web/app/src/shared/schema-ui/runtime/rule-evaluator.ts
import type { SchemaCondition } from '../contracts/canvas-node-schema';

function readPath(values: Record<string, unknown>, path?: string) {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, values);
}

export function evaluateSchemaRule(
  rule: SchemaCondition | undefined,
  context: { values: Record<string, unknown>; capabilities: string[] }
) {
  if (!rule) return true;
  const current = readPath(context.values, rule.path);

  switch (rule.operator) {
    case 'eq':
      return current === rule.value;
    case 'neq':
      return current !== rule.value;
    case 'in':
      return (rule.values ?? []).includes(current);
    case 'truthy':
      return Boolean(current);
    case 'falsy':
      return !current;
    case 'hasCapability':
      return context.capabilities.includes(String(rule.capability));
  }
}
```

```tsx
// web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx
import type { SchemaBlock } from '../contracts/canvas-node-schema';
import { evaluateSchemaRule } from './rule-evaluator';

export interface SchemaRuntimeAdapter {
  getValue: (path: string) => unknown;
  setValue: (path: string, value: unknown) => void;
  getDerived: (key: string) => unknown;
  dispatch: (actionKey: string, payload?: unknown) => void;
}

export function SchemaRenderer({
  blocks,
  registry,
  adapter,
  capabilities = []
}: {
  blocks: SchemaBlock[];
  registry: ReturnType<typeof import('../registry/create-renderer-registry').createRendererRegistry>;
  adapter: SchemaRuntimeAdapter;
  capabilities?: string[];
}) {
  const values = adapter.getDerived('rootValues') as Record<string, unknown>;

  return (
    <>
      {blocks.map((block, index) => {
        if (!evaluateSchemaRule(block.visibleWhen, { values: values ?? {}, capabilities })) {
          return null;
        }

        if (block.kind === 'section') {
          return (
            <section key={`${block.title}-${index}`}>
              <h3>{block.title}</h3>
              <SchemaRenderer
                adapter={adapter}
                blocks={block.blocks}
                capabilities={capabilities}
                registry={registry}
              />
            </section>
          );
        }

        if (block.kind === 'stack' || block.kind === 'inline' || block.kind === 'tabs') {
          return (
            <div key={`${block.kind}-${index}`} data-schema-container={block.kind}>
              <SchemaRenderer
                adapter={adapter}
                blocks={block.blocks}
                capabilities={capabilities}
                registry={registry}
              />
            </div>
          );
        }

        if (block.kind === 'field') {
          const FieldRenderer = registry.fields[block.renderer];
          return <FieldRenderer key={`${block.path}-${index}`} adapter={adapter} block={block} />;
        }

        const ViewRenderer = registry.views[block.renderer];
        return <ViewRenderer key={`${block.renderer}-${index}`} adapter={adapter} block={block} />;
      })}
    </>
  );
}
```

- [x] **Step 4: Run the shared runtime test and confirm it passes**

Run:

```bash
pnpm --dir web/app exec vitest run src/shared/schema-ui/_tests/schema-runtime.test.tsx
```

Expected: PASS with 2 tests passed.

- [x] **Step 5: Commit the shared schema runtime baseline**

```bash
git add \
  web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts \
  web/app/src/shared/schema-ui/contracts/page-block-schema.ts \
  web/app/src/shared/schema-ui/runtime/rule-evaluator.ts \
  web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx \
  web/app/src/shared/schema-ui/registry/create-renderer-registry.ts \
  web/app/src/shared/schema-ui/_tests/schema-runtime.test.tsx
git commit -m "feat: add schema ui contracts and core runtime"
```

## Task 2: Build Overlay Shell Runtime

**Files:**
- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaDockPanel.tsx`
- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaDrawerPanel.tsx`
- Create: `web/app/src/shared/schema-ui/overlay-shell/SchemaModalPanel.tsx`
- Create: `web/app/src/shared/schema-ui/_tests/overlay-shell.test.tsx`
- Create: `web/app/src/shared/schema-ui/contracts/overlay-shell-schema.ts`

- [x] **Step 1: Write the failing overlay shell tests**

```tsx
// web/app/src/shared/schema-ui/_tests/overlay-shell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { SchemaDockPanel } from '../overlay-shell/SchemaDockPanel';
import { SchemaDrawerPanel } from '../overlay-shell/SchemaDrawerPanel';
import { SchemaModalPanel } from '../overlay-shell/SchemaModalPanel';

describe('overlay shell runtime', () => {
  test('renders dock panel header and footer actions', () => {
    render(
      <SchemaDockPanel
        schema={{
          schemaVersion: '1.0.0',
          shellType: 'dock_panel',
          title: '节点详情',
          width: 520,
          resizable: true
        }}
        footer={<button type="button">保存</button>}
        onClose={vi.fn()}
      >
        <div>dock body</div>
      </SchemaDockPanel>
    );

    expect(screen.getByText('节点详情')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  });

  test('renders drawer and modal shells with shared title semantics', () => {
    const { rerender } = render(
      <SchemaDrawerPanel
        open
        schema={{ schemaVersion: '1.0.0', shellType: 'drawer_panel', title: '历史版本' }}
        onClose={vi.fn()}
      >
        <div>drawer body</div>
      </SchemaDrawerPanel>
    );

    expect(screen.getByText('历史版本')).toBeInTheDocument();

    rerender(
      <SchemaModalPanel
        open
        schema={{ schemaVersion: '1.0.0', shellType: 'modal_panel', title: '新建应用' }}
        onClose={vi.fn()}
      >
        <div>modal body</div>
      </SchemaModalPanel>
    );

    expect(screen.getByText('新建应用')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the overlay shell test and confirm it fails**

Run:

```bash
pnpm --dir web/app exec vitest run src/shared/schema-ui/_tests/overlay-shell.test.tsx
```

Expected: FAIL with missing shell components and overlay shell contract.

- [x] **Step 3: Implement dock, drawer and modal runtimes**

```ts
// web/app/src/shared/schema-ui/contracts/overlay-shell-schema.ts
export interface OverlayShellSchema {
  schemaVersion: '1.0.0';
  shellType: 'dock_panel' | 'drawer_panel' | 'modal_panel';
  title: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
}
```

```tsx
// web/app/src/shared/schema-ui/overlay-shell/SchemaDockPanel.tsx
import { Button } from 'antd';
import type { ReactNode } from 'react';
import type { OverlayShellSchema } from '../contracts/overlay-shell-schema';

export function SchemaDockPanel({
  schema,
  children,
  footer,
  onClose
}: {
  schema: OverlayShellSchema;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside aria-label={schema.title} className="schema-dock-panel" style={{ width: schema.width }}>
      <header className="schema-dock-panel__header">
        <h2>{schema.title}</h2>
        <Button aria-label={`关闭${schema.title}`} type="text" onClick={onClose}>
          关闭
        </Button>
      </header>
      <div className="schema-dock-panel__body">{children}</div>
      {footer ? <footer className="schema-dock-panel__footer">{footer}</footer> : null}
    </aside>
  );
}
```

```tsx
// web/app/src/shared/schema-ui/overlay-shell/SchemaDrawerPanel.tsx
import { Drawer } from 'antd';
import type { ReactNode } from 'react';
import type { OverlayShellSchema } from '../contracts/overlay-shell-schema';

export function SchemaDrawerPanel({
  open,
  schema,
  children,
  onClose
}: {
  open: boolean;
  schema: OverlayShellSchema;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Drawer
      getContainer={false}
      open={open}
      placement="right"
      title={schema.title}
      width={schema.width ?? 420}
      onClose={onClose}
    >
      {children}
    </Drawer>
  );
}
```

```tsx
// web/app/src/shared/schema-ui/overlay-shell/SchemaModalPanel.tsx
import { Modal } from 'antd';
import type { ReactNode } from 'react';
import type { OverlayShellSchema } from '../contracts/overlay-shell-schema';

export function SchemaModalPanel({
  open,
  schema,
  children,
  onClose
}: {
  open: boolean;
  schema: OverlayShellSchema;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal destroyOnHidden footer={null} open={open} title={schema.title} onCancel={onClose}>
      {children}
    </Modal>
  );
}
```

- [x] **Step 4: Run the overlay shell test and confirm it passes**

Run:

```bash
pnpm --dir web/app exec vitest run src/shared/schema-ui/_tests/overlay-shell.test.tsx
```

Expected: PASS with 2 tests passed.

- [x] **Step 5: Commit the overlay shell runtime**

```bash
git add \
  web/app/src/shared/schema-ui/contracts/overlay-shell-schema.ts \
  web/app/src/shared/schema-ui/overlay-shell/SchemaDockPanel.tsx \
  web/app/src/shared/schema-ui/overlay-shell/SchemaDrawerPanel.tsx \
  web/app/src/shared/schema-ui/overlay-shell/SchemaModalPanel.tsx \
  web/app/src/shared/schema-ui/_tests/overlay-shell.test.tsx
git commit -m "feat: add overlay shell schema runtime"
```

## Task 3: Build AgentFlow Node Schema Registry And Adapter Bridge

**Files:**
- Create: `web/app/src/features/agent-flow/schema/node-schema-registry.ts`
- Create: `web/app/src/features/agent-flow/schema/node-schema-fragments.ts`
- Create: `web/app/src/features/agent-flow/schema/node-schema-adapter.ts`
- Create: `web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx`
- Create: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
- Create: `web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts`
- Create: `web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`

- [x] **Step 1: Write the failing registry and adapter tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx
import { describe, expect, test, vi } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { createAgentFlowNodeSchemaAdapter } from '../schema/node-schema-adapter';
import { resolveAgentFlowNodeSchema } from '../schema/node-schema-registry';

describe('agent-flow node schema registry', () => {
  test('returns a full llm schema with card and detail tabs', () => {
    const schema = resolveAgentFlowNodeSchema('llm');

    expect(schema.nodeType).toBe('llm');
    expect(schema.card.blocks.length).toBeGreaterThan(0);
    expect(schema.detail.tabs.config.blocks.length).toBeGreaterThan(0);
  });

  test('adapter reads and writes relative node paths', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const setWorkingDocument = vi.fn();
    const adapter = createAgentFlowNodeSchemaAdapter({
      document,
      nodeId: 'node-llm',
      setWorkingDocument,
      dispatch: vi.fn()
    });

    expect(adapter.getValue('config.model')).toBe('gpt-4o-mini');
    adapter.setValue('alias', 'Support LLM');

    expect(setWorkingDocument).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run the registry test and confirm it fails**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-schema-registry.test.tsx
```

Expected: FAIL with missing node schema registry and adapter exports.

- [x] **Step 3: Implement the node schema registry and document adapter**

```ts
// web/app/src/features/agent-flow/schema/node-schema-adapter.ts
export function createAgentFlowNodeSchemaAdapter({
  document,
  nodeId,
  setWorkingDocument,
  dispatch
}: {
  document: import('@1flowse/flow-schema').FlowAuthoringDocument;
  nodeId: string;
  setWorkingDocument: (next: import('@1flowse/flow-schema').FlowAuthoringDocument) => void;
  dispatch: (actionKey: string, payload?: unknown) => void;
}) {
  const node = document.graph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`missing node ${nodeId}`);

  function updateValue(path: string, value: unknown) {
    const [scope, key] = path.split('.', 2);
    return {
      ...node,
      [scope === 'config' || scope === 'bindings'
        ? scope
        : path]: scope === 'config' || scope === 'bindings'
        ? {
            ...(node[scope] as Record<string, unknown>),
            [key]: value
          }
        : value
    };
  }

  return {
    getValue(path: string) {
      return path.split('.').reduce<unknown>((current, key) => {
        if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, node as unknown as Record<string, unknown>);
    },
    setValue(path: string, value: unknown) {
      setWorkingDocument({
        ...document,
        graph: {
          ...document.graph,
          nodes: document.graph.nodes.map((item) =>
            item.id === nodeId ? updateValue(path, value) : item
          )
        }
      });
    },
    getDerived(key: string) {
      if (key === 'rootValues') return node;
      if (key === 'selectedNode') return node;
      return null;
    },
    dispatch
  };
}
```

```ts
// web/app/src/features/agent-flow/schema/node-schema-registry.ts
import type { FlowNodeType } from '@1flowse/flow-schema';
import type { CanvasNodeSchema } from '../../../shared/schema-ui/contracts/canvas-node-schema';
import { buildCommonConfigBlocks, buildCommonLastRunBlocks } from './node-schema-fragments';
import { getNodeDefinitionMeta } from '../lib/node-definitions';

export function resolveAgentFlowNodeSchema(nodeType: FlowNodeType): CanvasNodeSchema {
  const meta = getNodeDefinitionMeta(nodeType);

  return {
    schemaVersion: '1.0.0',
    nodeType,
    capabilities: [
      'help',
      'locate',
      'duplicate',
      ...(meta.canEnterContainer ? ['enter_container'] : [])
    ],
    card: {
      blocks: [
        { kind: 'view', renderer: 'card_eyebrow', key: 'eyebrow' },
        { kind: 'view', renderer: 'card_title', key: 'title' },
        { kind: 'view', renderer: 'card_description', key: 'description' }
      ]
    },
    detail: {
      header: {
        blocks: [
          { kind: 'field', renderer: 'header_alias', path: 'alias', label: '节点别名' },
          { kind: 'field', renderer: 'header_description', path: 'description', label: '节点简介' }
        ]
      },
      tabs: {
        config: {
          blocks: buildCommonConfigBlocks(nodeType, meta)
        },
        lastRun: {
          blocks: buildCommonLastRunBlocks()
        }
      }
    },
    runtimeSlots: {
      summary: 'runtime_summary',
      io: 'runtime_io',
      metadata: 'runtime_metadata'
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts
import { createRendererRegistry } from '../../../shared/schema-ui/registry/create-renderer-registry';
import { agentFlowFieldRenderers } from './agent-flow-field-renderers';
import { agentFlowViewRenderers } from './agent-flow-view-renderers';

export const agentFlowRendererRegistry = createRendererRegistry({
  fields: agentFlowFieldRenderers,
  views: agentFlowViewRenderers,
  shells: {}
});
```

- [x] **Step 4: Run the registry test and confirm it passes**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-schema-registry.test.tsx
```

Expected: PASS with 2 tests passed.

- [x] **Step 5: Commit the node schema registry bridge**

```bash
git add \
  web/app/src/features/agent-flow/schema/node-schema-registry.ts \
  web/app/src/features/agent-flow/schema/node-schema-fragments.ts \
  web/app/src/features/agent-flow/schema/node-schema-adapter.ts \
  web/app/src/features/agent-flow/schema/agent-flow-field-renderers.tsx \
  web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx \
  web/app/src/features/agent-flow/schema/agent-flow-renderer-registry.ts \
  web/app/src/features/agent-flow/_tests/node-schema-registry.test.tsx \
  web/app/src/features/agent-flow/lib/node-definitions.tsx
git commit -m "feat: add agent-flow node schema registry"
```

## Task 4: Migrate Node Detail And Inspector To Schema Runtime

**Files:**
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`

- [ ] **Step 1: Update the failing detail and inspector tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
test('renders node detail through schema-driven dock shell blocks', () => {
  render(
    <AppProviders>
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    </AppProviders>
  );

  expect(screen.getByLabelText('节点详情')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '设置' })).toBeInTheDocument();
  expect(screen.getByText('节点说明')).toBeInTheDocument();
});
```

```tsx
// web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
test('renders config sections from node schema instead of hard-coded nodeDefinitions sections', () => {
  renderWithProviders(
    <AgentFlowEditorStoreProvider initialState={createInitialState()}>
      <NodeConfigTab />
    </AgentFlowEditorStoreProvider>
  );

  expect(screen.getByText('Inputs')).toBeInTheDocument();
  expect(screen.getByText('Policy')).toBeInTheDocument();
  expect(screen.getByLabelText('User Prompt')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the detail/inspector tests and confirm they fail**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected: FAIL because the current detail panel and inspector still hand-wire the old structure.

- [ ] **Step 3: Implement schema-driven detail panel, header and view renderers**

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx
import { resolveAgentFlowNodeSchema } from '../../schema/node-schema-registry';
import { createAgentFlowNodeSchemaAdapter } from '../../schema/node-schema-adapter';
import { SchemaDockPanel } from '../../../../shared/schema-ui/overlay-shell/SchemaDockPanel';
import { SchemaRenderer } from '../../../../shared/schema-ui/runtime/SchemaRenderer';

const nodeDetailShellSchema = {
  schemaVersion: '1.0.0',
  shellType: 'dock_panel',
  title: '节点详情',
  width: 520,
  minWidth: 420,
  maxWidth: 720,
  resizable: true
} as const;

export function NodeDetailPanel({ onClose, onRunNode, applicationId, runLoading = false }) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  const nodeDetailTab = useAgentFlowEditorStore((state) => state.nodeDetailTab);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  if (!selectedNodeId) return null;

  const schema = resolveAgentFlowNodeSchema(
    document.graph.nodes.find((node) => node.id === selectedNodeId)!.type
  );
  const adapter = createAgentFlowNodeSchemaAdapter({
    document,
    nodeId: selectedNodeId,
    setWorkingDocument,
    dispatch(actionKey, payload) {
      if (actionKey === 'close_detail') onClose();
      if (actionKey === 'run_node') onRunNode?.();
      if (actionKey === 'switch_tab') setPanelState({ nodeDetailTab: payload as 'config' | 'lastRun' });
    }
  });

  return (
    <SchemaDockPanel schema={nodeDetailShellSchema} onClose={onClose}>
      <NodeDetailHeader adapter={adapter} runLoading={runLoading} schema={schema} />
      <SchemaRenderer
        adapter={adapter}
        blocks={nodeDetailTab === 'lastRun' ? schema.detail.tabs.lastRun.blocks : schema.detail.tabs.config.blocks}
        capabilities={schema.capabilities}
        registry={agentFlowRendererRegistry}
      />
    </SchemaDockPanel>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx
export function NodeInspector() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  if (!selectedNodeId) return null;

  const node = document.graph.nodes.find((item) => item.id === selectedNodeId)!;
  const schema = resolveAgentFlowNodeSchema(node.type);
  const adapter = createAgentFlowNodeSchemaAdapter({
    document,
    nodeId: selectedNodeId,
    setWorkingDocument,
    dispatch: () => undefined
  });

  return (
    <section className="agent-flow-node-detail__inspector">
      <SchemaRenderer
        adapter={adapter}
        blocks={schema.detail.tabs.config.blocks}
        capabilities={schema.capabilities}
        registry={agentFlowRendererRegistry}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run the detail/inspector tests and confirm they pass**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected: PASS with the updated schema-driven assertions green.

- [ ] **Step 5: Commit the schema-driven detail migration**

```bash
git add \
  web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx \
  web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx \
  web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx \
  web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx \
  web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
git commit -m "feat: migrate node detail to schema runtime"
```

## Task 5: Migrate Node Card And Cross-Feature Overlay Consumers

**Files:**
- Modify: `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- Modify: `web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts`
- Modify: `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
- Modify: `web/app/src/features/applications/components/ApplicationCreateModal.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/features/applications/_tests/application-create-modal.test.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [ ] **Step 1: Write the failing card and overlay consumer assertions**

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('renders node cards through node schema card blocks and keeps dock shell behavior', async () => {
  renderShell(
    <div style={{ width: 1280, height: 720 }}>
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    </div>
  );

  expect(await screen.findByText('Start', { selector: '.agent-flow-node-card__title' })).toBeInTheDocument();
  expect(screen.getByText('Inputs')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
});
```

```tsx
// web/app/src/features/applications/_tests/application-create-modal.test.tsx
test('keeps form semantics after migrating to modal panel shell', () => {
  render(
    <AppProviders>
      <ApplicationCreateModal
        open
        csrfToken="csrf-123"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    </AppProviders>
  );

  expect(screen.getByText('新建应用')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '名称' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '创建应用' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted editor and application modal tests and confirm they fail**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  src/features/applications/_tests/application-create-modal.test.tsx
```

Expected: FAIL with stale hard-coded card or shell expectations.

- [ ] **Step 3: Implement card schema consumption and migrate drawer/modal consumers**

```ts
// web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts
import { resolveAgentFlowNodeSchema } from '../../schema/node-schema-registry';

// inside map(node => ({ ... }))
const nodeSchema = resolveAgentFlowNodeSchema(node.type);

data: {
  nodeId: node.id,
  nodeType: node.type,
  nodeSchema,
  typeLabel: nodeTypeLabel(node.type),
  alias: node.alias,
  description: node.description,
  issueCount: issueCountByNodeId[node.id] ?? 0,
  ...
}
```

```tsx
// web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx
export function AgentFlowNodeCard({ data, selected }: NodeProps<AgentFlowCanvasNode>) {
  return (
    <>
      ...
      <div className={`agent-flow-node-card${selected ? ' agent-flow-node-card--selected' : ''}`} ...>
        <SchemaRenderer
          adapter={{
            getValue(path) {
              if (path === 'alias') return data.alias;
              if (path === 'description') return data.description;
              return null;
            },
            setValue: () => undefined,
            getDerived(key) {
              if (key === 'issueCount') return data.issueCount;
              if (key === 'typeLabel') return data.typeLabel;
              return null;
            },
            dispatch: () => undefined
          }}
          blocks={data.nodeSchema.card.blocks}
          capabilities={data.nodeSchema.capabilities}
          registry={agentFlowRendererRegistry}
        />
      </div>
      ...
    </>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx
import { SchemaDrawerPanel } from '../../../../shared/schema-ui/overlay-shell/SchemaDrawerPanel';

const historyDrawerSchema = {
  schemaVersion: '1.0.0',
  shellType: 'drawer_panel',
  title: '历史版本',
  width: 420
} as const;

export function VersionHistoryDrawer(props: VersionHistoryDrawerProps) {
  return (
    <SchemaDrawerPanel open={props.open} schema={historyDrawerSchema} onClose={props.onClose}>
      <List ... />
    </SchemaDrawerPanel>
  );
}
```

```tsx
// web/app/src/features/applications/components/ApplicationCreateModal.tsx
import { SchemaModalPanel } from '../../../shared/schema-ui/overlay-shell/SchemaModalPanel';

const applicationCreateShell = {
  schemaVersion: '1.0.0',
  shellType: 'modal_panel',
  title: '新建应用'
} as const;

export function ApplicationCreateModal({ open, csrfToken, onClose, onCreated }: ApplicationCreateModalProps) {
  ...
  return (
    <SchemaModalPanel open={open} schema={applicationCreateShell} onClose={onClose}>
      <Form<ApplicationCreateFormValues> ...>
        ...
      </Form>
    </SchemaModalPanel>
  );
}
```

- [ ] **Step 4: Run the targeted editor and application modal tests and confirm they pass**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  src/features/applications/_tests/application-create-modal.test.tsx
```

Expected: PASS with schema card rendering and shared modal shell behavior preserved.

- [ ] **Step 5: Update style-boundary impact mapping**

```json
// web/app/src/style-boundary/scenario-manifest.json
{
  "id": "page.application-detail",
  "impactFiles": [
    "web/app/src/shared/schema-ui/contracts/canvas-node-schema.ts",
    "web/app/src/shared/schema-ui/contracts/overlay-shell-schema.ts",
    "web/app/src/shared/schema-ui/runtime/SchemaRenderer.tsx",
    "web/app/src/shared/schema-ui/overlay-shell/SchemaDockPanel.tsx",
    "web/app/src/features/agent-flow/schema/node-schema-registry.ts",
    "web/app/src/features/agent-flow/schema/node-schema-adapter.ts",
    "web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx",
    "web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx"
  ]
}
{
  "id": "page.home",
  "impactFiles": [
    "web/app/src/shared/schema-ui/overlay-shell/SchemaModalPanel.tsx",
    "web/app/src/features/applications/components/ApplicationCreateModal.tsx"
  ]
}
```

- [ ] **Step 6: Run full verification**

Run:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
node scripts/node/check-style-boundary.js page page.application-detail
node scripts/node/check-style-boundary.js page page.home
```

Expected:

```text
turbo run lint  -> success
turbo run test  -> success
vite build      -> success
[1flowse-style-boundary] PASS page.application-detail
[1flowse-style-boundary] PASS page.home
```

- [ ] **Step 7: Commit the cross-feature schema migration**

```bash
git add \
  web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx \
  web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts \
  web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx \
  web/app/src/features/applications/components/ApplicationCreateModal.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  web/app/src/features/applications/_tests/application-create-modal.test.tsx \
  web/app/src/style-boundary/scenario-manifest.json
git commit -m "feat: migrate cards and overlay consumers to schema ui"
```
