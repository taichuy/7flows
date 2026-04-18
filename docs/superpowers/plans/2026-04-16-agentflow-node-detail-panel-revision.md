# AgentFlow Node Detail Panel Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 `Application / orchestration` 中已经落地的 `Node Detail Panel` 修正为 Dify 风格的右侧停靠 panel，补回 `Splitter` 拖宽、header 内联编辑 `别名 / 简介`，并让 `配置 / 上次运行` 始终共用同一个详情容器。

**Architecture:** 保留当前 `store + interaction hook + schema-driven NodeInspector` 内核，不推翻现有字段层实现；真正调整的是布局 owner 和信息架构。`AgentFlowCanvasFrame` 收回右侧详情布局控制，用 `Ant Design Splitter` 把画布与详情组成稳定分栏；`NodeDetailHeader` 收回节点身份信息编辑，`NodeSummaryCard` 降为只读说明卡片，`Last Run` 继续保持 `04` 阶段占位壳层。

**Tech Stack:** React 19, TypeScript, Ant Design 5 `Splitter/Tabs/Input`, Zustand, Vitest, Testing Library, existing `style-boundary` regression tooling

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-16-agentflow-node-detail-design.md`

**Previous Plan:** `docs/superpowers/plans/2026-04-16-agentflow-node-detail.md`

**Execution Note:** 该计划是对已完成第一版实现的修正计划，不覆写已完成计划的勾选历史。执行时继续直接在当前工作区推进，不使用 `git worktree`。完成后仍必须执行 `pnpm --dir web lint`、`pnpm --dir web test`、`pnpm --dir web/app build`，并补一次 `style-boundary` 页面回归。

Status note (`2026-04-17 01`): 已按当前工作区完成 Task 1-3。由于 `agent-flow` 的测试文件和场景清单跨任务共享，实际采用一条最终收尾提交统一落盘，而不是按任务拆成 3 条非交互式提交。已执行并通过：

- `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/detail-panel-width.test.ts src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-last-run-tab.test.tsx src/features/agent-flow/_tests/node-action-menu.test.tsx src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/validate-document.test.ts src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- `pnpm --dir web lint`
- `pnpm --dir web test`
- `pnpm --dir web/app build`
- `node scripts/node/check-style-boundary.js page page.application-detail`

Manual verification (`2026-04-17 01`):

- 通过前台 PTY `vite` + Playwright 检查 `http://127.0.0.1:3100/style-boundary.html?scene=page.application-detail`
- 桌面视口确认 `Splitter` 停靠 panel、`节点详情` 容器与 `上次运行` 共壳层
- 窄视口确认仍走 `请使用桌面端编辑` 降级路径
- 截图：`uploads/agentflow-node-detail-panel/desktop.png`、`uploads/agentflow-node-detail-panel/mobile.png`

---

## File Structure

### New layout helper

- Create: `web/app/src/features/agent-flow/lib/detail-panel-width.ts`
  - 统一定义 `nodeDetailWidth` 的默认值、最小值、保留画布宽度和拖拽后宽度收口规则，避免把 `Splitter` 尺寸计算散落在页面组件和测试里。
- Create: `web/app/src/features/agent-flow/_tests/detail-panel-width.test.ts`
  - 直接校验宽度收口规则，保证详情 panel 不会因为 store 中的旧值重新覆盖画布。

### Existing files to modify

- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - 让详情 panel 参与布局，收口 `Splitter` 的 `onResizeEnd` 与 store 宽度同步。
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
  - 从“绝对定位浮层”样式改成“停靠 panel + 分栏容器”样式。
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
  - 从“带内联宽度的浮层盒子”降为纯详情容器，不再负责绝对定位和内联宽度。
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
  - 恢复 header 中的 `别名 / 简介` 内联编辑，收口帮助入口和动作区。
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
  - 降为只读说明卡片，不再重复放别名和简介编辑控件。
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
  - 继续持有 `nodeDetailWidth` 真值，并在 server 替换与局部 panel 更新时保留修订后的默认宽度策略。
- Modify: `web/app/src/features/agent-flow/_tests/editor-store.test.ts`
  - 覆盖 `nodeDetailWidth` 在局部更新和 tab 切换时不被重置的 contract。
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
  - 覆盖 header 身份编辑和 summary 只读 contract。
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
  - 覆盖 `Splitter` 停靠布局与 `Last Run` 保持同容器。
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
  - 把 `editor-detail-panel` 的边界从“浮层存在”改为“分栏容器 + 停靠 panel”。

## Task 1: Dock The Detail Panel With Splitter And Bounded Width State

**Files:**
- Create: `web/app/src/features/agent-flow/lib/detail-panel-width.ts`
- Create: `web/app/src/features/agent-flow/_tests/detail-panel-width.test.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

- [x] **Step 1: Write the failing width helper and docked-layout tests**

```ts
// web/app/src/features/agent-flow/_tests/detail-panel-width.test.ts
import { describe, expect, test } from 'vitest';

import {
  NODE_DETAIL_DEFAULT_WIDTH,
  clampNodeDetailWidth,
  getMaxNodeDetailWidth,
  getNodeDetailWidthFromSplitter
} from '../lib/detail-panel-width';

describe('detail panel width', () => {
  test('clamps node detail width against min width and reserved canvas width', () => {
    expect(NODE_DETAIL_DEFAULT_WIDTH).toBe(420);
    expect(clampNodeDetailWidth(320, 1440)).toBe(420);
    expect(getMaxNodeDetailWidth(1000)).toBe(600);
    expect(clampNodeDetailWidth(760, 1000)).toBe(600);
  });

  test('uses the last splitter panel width as the persisted detail width', () => {
    expect(getNodeDetailWidthFromSplitter([560, 440], 1200)).toBe(440);
  });
});
```

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('renders node detail inside a docked splitter panel on orchestration page', async () => {
  vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
  vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
    createInitialState()
  );

  render(
    <AppProviders>
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    </AppProviders>
  );

  expect(await screen.findByTestId('agent-flow-editor-splitter')).toBeInTheDocument();
  expect(screen.getByLabelText('节点详情')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '配置' })).toBeInTheDocument();
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/detail-panel-width.test.ts \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected: FAIL because `detail-panel-width.ts` does not exist yet and the page still renders an absolutely-positioned detail overlay instead of a docked splitter layout.

- [x] **Step 3: Implement bounded width helpers and docked splitter layout**

```ts
// web/app/src/features/agent-flow/lib/detail-panel-width.ts
export const NODE_DETAIL_DEFAULT_WIDTH = 420;
export const NODE_DETAIL_MIN_WIDTH = 420;
export const NODE_DETAIL_MIN_CANVAS_WIDTH = 400;

export function getMaxNodeDetailWidth(containerWidth: number) {
  return Math.max(
    containerWidth - NODE_DETAIL_MIN_CANVAS_WIDTH,
    NODE_DETAIL_MIN_WIDTH
  );
}

export function clampNodeDetailWidth(width: number, containerWidth: number) {
  return Math.min(
    Math.max(width, NODE_DETAIL_MIN_WIDTH),
    getMaxNodeDetailWidth(containerWidth)
  );
}

export function getNodeDetailWidthFromSplitter(
  sizes: number[],
  containerWidth: number
) {
  const detailWidth = sizes.at(-1) ?? NODE_DETAIL_DEFAULT_WIDTH;

  return clampNodeDetailWidth(detailWidth, containerWidth);
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx
import { Button, Splitter, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  NODE_DETAIL_DEFAULT_WIDTH,
  NODE_DETAIL_MIN_CANVAS_WIDTH,
  NODE_DETAIL_MIN_WIDTH,
  clampNodeDetailWidth,
  getMaxNodeDetailWidth,
  getNodeDetailWidthFromSplitter
} from '../../lib/detail-panel-width';

const bodyRef = useRef<HTMLDivElement | null>(null);
const [bodyWidth, setBodyWidth] = useState(0);
const nodeDetailWidth = useAgentFlowEditorStore((state) => state.nodeDetailWidth);

useEffect(() => {
  const element = bodyRef.current;
  if (!element) {
    return;
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }

    setBodyWidth(entry.contentRect.width);
  });

  resizeObserver.observe(element);
  setBodyWidth(element.getBoundingClientRect().width);

  return () => resizeObserver.disconnect();
}, []);

const boundedNodeDetailWidth = clampNodeDetailWidth(
  nodeDetailWidth,
  bodyWidth || NODE_DETAIL_DEFAULT_WIDTH + NODE_DETAIL_MIN_CANVAS_WIDTH
);

<div
  ref={bodyRef}
  className="agent-flow-editor__body agent-flow-editor__shell"
  data-testid="agent-flow-editor-body"
>
  {selectedNodeId ? (
    <div
      className="agent-flow-editor__splitter-shell"
      data-testid="agent-flow-editor-splitter"
    >
      <Splitter
        className="agent-flow-editor__splitter"
        layout="horizontal"
        onResizeEnd={(sizes) =>
          setPanelState({
            nodeDetailWidth: getNodeDetailWidthFromSplitter(sizes, bodyWidth)
          })
        }
      >
        <Splitter.Panel
          className="agent-flow-editor__canvas-panel"
          min={NODE_DETAIL_MIN_CANVAS_WIDTH}
        >
          <AgentFlowCanvas
            issueCountByNodeId={issueCountByNodeId}
            onViewportSnapshotChange={(viewport) => {
              viewportSnapshotRef.current = viewport;
            }}
            onViewportGetterReady={(getter) => {
              viewportGetterRef.current = getter;
            }}
          />
        </Splitter.Panel>
        <Splitter.Panel
          className="agent-flow-editor__detail-panel"
          min={NODE_DETAIL_MIN_WIDTH}
          max={getMaxNodeDetailWidth(bodyWidth || boundedNodeDetailWidth)}
          size={boundedNodeDetailWidth}
        >
          <NodeDetailPanel
            onClose={detailActions.closeDetail}
            onRunNode={undefined}
          />
        </Splitter.Panel>
      </Splitter>
    </div>
  ) : (
    <AgentFlowCanvas
      issueCountByNodeId={issueCountByNodeId}
      onViewportSnapshotChange={(viewport) => {
        viewportSnapshotRef.current = viewport;
      }}
      onViewportGetterReady={(getter) => {
        viewportGetterRef.current = getter;
      }}
    />
  )}
</div>
```

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx
export function NodeDetailPanel({
  onClose,
  onRunNode
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
}) {
  const nodeDetailTab = useAgentFlowEditorStore((state) => state.nodeDetailTab);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);

  return (
    <aside aria-label="节点详情" className="agent-flow-node-detail">
      <NodeDetailHeader onClose={onClose} onRunNode={onRunNode} />
      <Tabs
        activeKey={nodeDetailTab}
        onChange={(key) =>
          setPanelState({ nodeDetailTab: key as 'config' | 'lastRun' })
        }
        items={[
          { key: 'config', label: '配置', children: <NodeConfigTab /> },
          { key: 'lastRun', label: '上次运行', children: <NodeLastRunTab /> }
        ]}
      />
    </aside>
  );
}
```

```css
/* web/app/src/features/agent-flow/components/editor/agent-flow-editor.css */
.agent-flow-editor__splitter-shell,
.agent-flow-editor__splitter {
  display: flex;
  flex: 1;
  min-height: 0;
}

.agent-flow-editor__canvas-panel,
.agent-flow-editor__detail-panel {
  min-width: 0;
  min-height: 0;
}

.agent-flow-node-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border-left: 1px solid #e4eadf;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: none;
  overflow: hidden;
}
```

- [x] **Step 4: Re-run the focused tests and confirm the docked layout passes**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/detail-panel-width.test.ts \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected: PASS with width clamping covered in unit tests and the orchestration page rendering a `Splitter`-backed docked detail panel.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/lib/detail-panel-width.ts \
  web/app/src/features/agent-flow/_tests/detail-panel-width.test.ts \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx \
  web/app/src/features/agent-flow/components/editor/agent-flow-editor.css \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "feat: dock node detail panel with splitter"
```

## Task 2: Restore Editable Header Identity And Make Summary Card Read-Only

**Files:**
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

- [x] **Step 1: Write the failing header-identity tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
test('renders alias and description editors exactly once in the header', () => {
  render(
    <AgentFlowEditorStoreProvider initialState={createInitialState()}>
      <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
    </AgentFlowEditorStoreProvider>
  );

  expect(screen.getAllByLabelText('节点别名')).toHaveLength(1);
  expect(screen.getAllByLabelText('节点简介')).toHaveLength(1);
  expect(screen.getByLabelText('节点别名')).toHaveValue('LLM');
});

test('keeps the summary card read-only after identity editing moves into header', () => {
  render(
    <AgentFlowEditorStoreProvider initialState={createInitialState()}>
      <NodeConfigTab />
    </AgentFlowEditorStoreProvider>
  );

  expect(screen.getByText('节点说明')).toBeInTheDocument();
  expect(screen.queryByText('节点别名')).not.toBeInTheDocument();
  expect(screen.queryByText('节点简介')).not.toBeInTheDocument();
});
```

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('saves alias changes from the header editor', async () => {
  const initialState = createInitialState();
  const saveDraftOverride = vi.fn(async (input) => ({
    ...initialState,
    draft: {
      ...initialState.draft,
      id: 'draft-2',
      updated_at: '2026-04-16T10:15:00Z',
      document: input.document
    }
  }));

  render(
    <div style={{ width: 1280, height: 720 }}>
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={initialState}
        saveDraftOverride={saveDraftOverride}
      />
    </div>
  );

  fireEvent.change(screen.getByLabelText('节点别名'), {
    target: { value: 'Support LLM' }
  });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => {
    expect(saveDraftOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          graph: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({
                id: 'node-llm',
                alias: 'Support LLM'
              })
            ])
          })
        })
      })
    );
  });
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected: FAIL because the current header only renders a read-only alias and the summary card still owns the editable alias and description fields.

- [x] **Step 3: Move alias and description editing into the header**

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx
import { CloseOutlined } from '@ant-design/icons';
import { Button, Input, Space, Typography } from 'antd';

import { useInspectorInteractions } from '../../hooks/interactions/use-inspector-interactions';
import {
  getNodeDefinitionMeta,
  nodeDefinitions
} from '../../lib/node-definitions';

const { updateField } = useInspectorInteractions();
const definitionMeta = selectedNode ? getNodeDefinitionMeta(selectedNode.type) : null;

<header className="agent-flow-node-detail__header">
  <div className="agent-flow-node-detail__header-main">
    <Space
      align="center"
      className="agent-flow-node-detail__header-meta"
      size={8}
    >
      <Typography.Text className="agent-flow-node-detail__header-type">
        {definition.label}
      </Typography.Text>
      {definitionMeta?.helpHref ? (
        <Typography.Link href={definitionMeta.helpHref} target="_blank">
          帮助文档
        </Typography.Link>
      ) : null}
    </Space>
    <Input
      aria-label="节点别名"
      className="agent-flow-editor__inspector-title-input"
      value={selectedNode.alias}
      onChange={(event) => updateField('alias', event.target.value)}
    />
    <Input.TextArea
      aria-label="节点简介"
      autoSize={{ minRows: 1, maxRows: 3 }}
      className="agent-flow-editor__inspector-description-input"
      placeholder="补充该节点的作用与上下文"
      value={selectedNode.description ?? ''}
      onChange={(event) => updateField('description', event.target.value)}
    />
  </div>
  <Space size={4}>
    <NodeRunButton onRunNode={onRunNode} />
    <NodeActionMenu
      onLocate={detailActions.locateSelectedNode}
      onCopy={detailActions.duplicateSelectedNode}
    />
    <Button
      aria-label="关闭节点详情"
      icon={<CloseOutlined />}
      type="text"
      onClick={onClose}
    />
  </Space>
</header>
```

```tsx
// web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx
import { Card, Typography } from 'antd';

export function NodeSummaryCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;
  const definitionMeta = selectedNode
    ? getNodeDefinitionMeta(selectedNode.type)
    : null;

  if (!selectedNode || !definition || !definitionMeta) {
    return null;
  }

  return (
    <Card
      extra={
        definitionMeta.helpHref ? (
          <Typography.Link href={definitionMeta.helpHref} target="_blank">
            帮助文档
          </Typography.Link>
        ) : null
      }
      title="节点说明"
    >
      <Typography.Paragraph>
        {definition.summary ?? definitionMeta.summary}
      </Typography.Paragraph>
    </Card>
  );
}
```

```css
/* web/app/src/features/agent-flow/components/editor/agent-flow-editor.css */
.agent-flow-node-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #edf2ea;
}

.agent-flow-node-detail__header-main {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 8px;
}

.agent-flow-node-detail__header-meta {
  min-width: 0;
}

.agent-flow-node-detail__header-type.ant-typography {
  margin: 0;
  color: #60756a;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

- [x] **Step 4: Re-run the focused tests and confirm the header contract passes**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected: PASS with exactly one editable `节点别名 / 节点简介` pair rendered in the header and the save flow still writing alias changes back into the draft.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx \
  web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts \
  web/app/src/features/agent-flow/components/editor/agent-flow-editor.css \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "feat: restore node detail identity header"
```

## Task 3: Lock The Same-Container Tab Contract And Re-Verify Frontend Behavior

**Files:**
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/editor-store.test.ts`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [x] **Step 1: Write the failing tab-container and style-boundary assertions**

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('keeps last-run content inside the same docked detail panel shell', async () => {
  vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
  vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
    createInitialState()
  );

  render(
    <AppProviders>
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    </AppProviders>
  );

  const splitter = await screen.findByTestId('agent-flow-editor-splitter');
  fireEvent.click(screen.getByRole('tab', { name: '上次运行' }));

  expect(screen.getByText('运行摘要')).toBeInTheDocument();
  expect(splitter).toBeInTheDocument();
  expect(screen.getByLabelText('节点详情')).toBeInTheDocument();
});
```

```ts
// web/app/src/features/agent-flow/_tests/editor-store.test.ts
test('keeps node detail width when switching tabs', () => {
  const store = createAgentFlowEditorStore({
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    autosave_interval_seconds: 30,
    versions: []
  });

  store.getState().setPanelState({
    nodeDetailWidth: 560,
    nodeDetailTab: 'config'
  });
  store.getState().setPanelState({ nodeDetailTab: 'lastRun' });

  expect(store.getState().nodeDetailWidth).toBe(560);
  expect(store.getState().nodeDetailTab).toBe('lastRun');
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  src/features/agent-flow/_tests/editor-store.test.ts
```

Expected: FAIL until the regression coverage explicitly asserts the new same-container behavior and store persistence contract.

- [x] **Step 3: Update page regression coverage and style-boundary selectors**

```json
// web/app/src/style-boundary/scenario-manifest.json
{
  "id": "page.application-detail",
  "boundaryNodes": [
    {
      "id": "editor-splitter",
      "selector": ".agent-flow-editor__splitter",
      "propertyAssertions": [
        {
          "property": "display",
          "expected": "flex"
        }
      ]
    },
    {
      "id": "editor-detail-panel",
      "selector": ".agent-flow-node-detail",
      "propertyAssertions": [
        {
          "property": "display",
          "expected": "flex"
        },
        {
          "property": "height",
          "expected": "100%"
        }
      ]
    }
  ]
}
```

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('keeps last-run content inside the same docked detail panel shell', async () => {
  vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);
  vi.spyOn(orchestrationApi, 'fetchOrchestrationState').mockResolvedValueOnce(
    createInitialState()
  );

  render(
    <AppProviders>
      <AgentFlowEditorPage
        applicationId="app-1"
        applicationName="Support Agent"
      />
    </AppProviders>
  );

  const splitter = await screen.findByTestId('agent-flow-editor-splitter');
  fireEvent.click(screen.getByRole('tab', { name: '上次运行' }));

  expect(screen.getByText('运行摘要')).toBeInTheDocument();
  expect(splitter).toBeInTheDocument();
  expect(screen.getByLabelText('节点详情')).toBeInTheDocument();
  expect(screen.queryByText('请使用桌面端编辑')).not.toBeInTheDocument();
});
```

- [x] **Step 4: Run the full verification matrix**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/detail-panel-width.test.ts \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-last-run-tab.test.tsx \
  src/features/agent-flow/_tests/node-action-menu.test.tsx \
  src/features/agent-flow/_tests/document-transforms.test.ts \
  src/features/agent-flow/_tests/node-inspector.test.tsx \
  src/features/agent-flow/_tests/editor-store.test.ts \
  src/features/agent-flow/_tests/validate-document.test.ts \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
node scripts/node/check-style-boundary.js page.application-detail
```

Expected:

- All targeted Vitest files PASS
- `pnpm --dir web lint` exits `0`
- `pnpm --dir web test` exits `0`
- `pnpm --dir web/app build` exits `0`
- `style-boundary` passes `page.application-detail`

Manual verification:

```bash
pnpm --dir web/app exec vite --host 127.0.0.1 --port 3100
```

Then verify:

- Desktop orchestration page renders a docked right panel instead of an overlay
- Dragging the splitter updates the detail width and keeps the canvas visible
- Switching from `配置` to `上次运行` preserves the same panel shell and width
- Header exposes editable `别名 / 简介`
- Narrow viewport still follows the existing “请使用桌面端编辑” downgrade path

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  web/app/src/features/agent-flow/_tests/editor-store.test.ts \
  web/app/src/style-boundary/scenario-manifest.json
git commit -m "test: cover docked node detail panel revision"
```

## Self-Review

### Spec coverage

- 右侧停靠 panel：Task 1
- `Ant Design Splitter` 拖宽与宽度边界：Task 1
- header 中可编辑 `别名 / 简介`：Task 2
- `NodeSummaryCard` 只读说明：Task 2
- `配置 / 上次运行` 共用同一容器：Task 3
- 页面级回归与 `style-boundary`：Task 3
- 窄视口保持现有降级策略：Task 3

### Placeholder scan

- 没有 `TODO / TBD / similar to task N`
- 每个任务都给了具体测试代码、实现片段、执行命令和提交命令
- 宽度、容器和 header contract 都有明确的可验证断言

### Type consistency

- 宽度常量统一使用 `NODE_DETAIL_DEFAULT_WIDTH / NODE_DETAIL_MIN_WIDTH / NODE_DETAIL_MIN_CANVAS_WIDTH`
- 宽度收口统一走 `clampNodeDetailWidth / getMaxNodeDetailWidth / getNodeDetailWidthFromSplitter`
- panel 结构统一使用 `AgentFlowCanvasFrame -> Splitter -> NodeDetailPanel`
