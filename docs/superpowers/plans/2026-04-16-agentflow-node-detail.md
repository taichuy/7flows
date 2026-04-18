# AgentFlow Node Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `Application` 的 `orchestration` 分区交付统一 `Node Detail Panel`，覆盖全部已接入节点的配置详情、通用 authoring 块和 `Last Run` 壳层，并为 `05 runtime orchestration` 接入真实运行态预留稳定扩展点。

**Architecture:** 前端在现有 `AgentFlowCanvasFrame` 右侧用统一 `Node Detail Panel` 替换当前薄 `NodeInspector`，把“外层壳层 / header / tabs / 通用卡片”和“内部 schema-driven 字段渲染”明确分层。`04` 只落 authoring 真值与 `Last Run` 壳层，运行数据、单节点执行结果和 trace 仍留在 `05`，但从这次开始通过稳定的 `NodeLastRunTab` contract 接入，而不是后续推翻 panel 结构重做。

**Tech Stack:** React 19, TypeScript, `@xyflow/react`, Zustand, Ant Design 5, Vitest, Testing Library, existing `style-boundary` regression tooling

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-16-agentflow-node-detail-design.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。前端实现完成后必须执行 `pnpm --dir web lint`、`pnpm --dir web test`、`pnpm --dir web/app build`，并补一次 `style-boundary` 页面回归。

---

## File Structure

### New detail shell and tabs

- Create: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
  - 统一右侧详情面板壳层，负责 header、tabs、宽度和内容切换。
- Create: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
  - 负责类型图标、类型名、别名、简介、帮助、运行按钮、更多操作和关闭。
- Create: `web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx`
  - 负责 header 主操作区的一键运行按钮壳层。
- Create: `web/app/src/features/agent-flow/components/detail/NodeActionMenu.tsx`
  - 负责 `定位节点 / 复制节点` 菜单。
- Create: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
  - 负责配置 tab 的四层信息架构装配。
- Create: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
  - 负责 `Last Run` tab 壳层与空态。

### New reusable cards and fields

- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
  - 负责节点短说明、帮助文档、容器入口说明。
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx`
  - 统一展示节点输出契约，明确只读。
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx`
  - 统一展示直接上游和直接下游。
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx`
  - 统一装配 `Retry / Error / Next Step`。
- Create: `web/app/src/features/agent-flow/components/detail/fields/OutputContractDefinitionField.tsx`
  - 用于少数节点在配置区定义输出契约，不直接在输出展示区编辑。
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx`
  - 承载 `状态 / 运行时间 / 总 token` 的摘要壳层。
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx`
  - 承载 `节点输入输出` 摘要与展开位。
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx`
  - 承载 `状态 / 执行人 / 开始时间 / 运行时间 / 总 token` 的元数据壳层。

### New interactions and document helpers

- Create: `web/app/src/features/agent-flow/hooks/interactions/use-node-detail-actions.ts`
  - 详情面板动作交互入口，统一处理关闭、定位、复制、打开节点选择器、运行按钮壳层状态。
- Create: `web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts`
  - 负责普通节点复制和容器整子图复制，并重写内部 `nodeId / edgeId / caseId / container 引用`。
- Create: `web/app/src/features/agent-flow/lib/document/relations.ts`
  - 负责计算直接上游、直接下游和当前节点可见上游摘要。

### Tests

- Create: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-action-menu.test.tsx`

### Existing files to modify

- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Modify: `web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/lib/document/transforms/node.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts`
- Modify: `web/app/src/features/agent-flow/_tests/editor-store.test.ts`
- Modify: `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

## Task 1: Build The Node Detail Shell And Editor State

**Files:**
- Create: `web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- Modify: `web/app/src/features/agent-flow/_tests/editor-store.test.ts`

- [x] **Step 1: Write the failing shell and store tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { AgentFlowEditorStoreProvider } from '../store/editor/provider';
import { NodeDetailPanel } from '../components/detail/NodeDetailPanel';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

describe('NodeDetailPanel', () => {
  test('renders header, config tab and last-run tab for the selected node', () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel
          onClose={vi.fn()}
          onRunNode={undefined}
        />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getByRole('tab', { name: '配置' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: '上次运行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭节点详情' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LLM' })).toBeInTheDocument();
  });
});
```

```ts
// web/app/src/features/agent-flow/_tests/editor-store.test.ts
test('tracks node detail tab and width in panel state', () => {
  const store = createAgentFlowEditorStore(createInitialState());

  expect(store.getState().nodeDetailTab).toBe('config');
  expect(store.getState().nodeDetailWidth).toBe(420);

  store.getState().setPanelState({
    nodeDetailTab: 'lastRun',
    nodeDetailWidth: 488
  });

  expect(store.getState().nodeDetailTab).toBe('lastRun');
  expect(store.getState().nodeDetailWidth).toBe(488);
});
```

- [x] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/editor-store.test.ts
```

Expected: FAIL with missing `NodeDetailPanel` exports and missing `nodeDetailTab` / `nodeDetailWidth` state.

- [x] **Step 3: Implement the panel slice additions and shell components**

```ts
// web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts
export interface PanelSlice {
  issuesOpen: boolean;
  historyOpen: boolean;
  publishConfigOpen: boolean;
  nodeDetailTab: 'config' | 'lastRun';
  nodeDetailWidth: number;
  nodePickerState: {
    open: boolean;
    anchorNodeId: string | null;
    anchorEdgeId: string | null;
    anchorCanvasPosition: { x: number; y: number } | null;
  };
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx
import { Button } from 'antd';

export function NodeRunButton({
  onRunNode
}: {
  onRunNode?: (() => void) | undefined;
}) {
  return (
    <Button
      aria-label="运行当前节点"
      disabled={!onRunNode}
      type="text"
      onClick={() => onRunNode?.()}
    >
      预览
    </Button>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx
import { CloseOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';

import { nodeDefinitions } from '../../lib/node-definitions';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { NodeRunButton } from './NodeRunButton';

export function NodeDetailHeader({
  onClose,
  onRunNode
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;

  if (!selectedNode || !definition) {
    return null;
  }

  return (
    <header className="agent-flow-node-detail__header">
      <div className="agent-flow-node-detail__header-main">
        <Typography.Title level={4}>{definition.label}</Typography.Title>
        <Typography.Text type="secondary">{selectedNode.alias}</Typography.Text>
      </div>
      <Space size={4}>
        <NodeRunButton onRunNode={onRunNode} />
        <Button
          aria-label="关闭节点详情"
          icon={<CloseOutlined />}
          type="text"
          onClick={onClose}
        />
      </Space>
    </header>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx
import { Tabs } from 'antd';

import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { NodeConfigTab } from './tabs/NodeConfigTab';
import { NodeDetailHeader } from './NodeDetailHeader';
import { NodeLastRunTab } from './tabs/NodeLastRunTab';

export function NodeDetailPanel({
  onClose,
  onRunNode
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
}) {
  const nodeDetailTab = useAgentFlowEditorStore((state) => state.nodeDetailTab);
  const nodeDetailWidth = useAgentFlowEditorStore((state) => state.nodeDetailWidth);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);

  return (
    <aside
      aria-label="节点详情"
      className="agent-flow-node-detail"
      style={{ width: nodeDetailWidth }}
    >
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

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx
export function NodeConfigTab() {
  return <div className="agent-flow-node-detail__config-tab" />;
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
export function NodeLastRunTab() {
  return <div className="agent-flow-node-detail__last-run" />;
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx
import { NodeDetailPanel } from '../detail/NodeDetailPanel';
import { useAgentFlowEditorStore } from '../../store/editor/provider';

const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

{selectedNodeId ? (
  <NodeDetailPanel
    onClose={() =>
      setSelection({
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null
      })
    }
    onRunNode={undefined}
  />
) : null}
```

```css
/* web/app/src/features/agent-flow/components/editor/agent-flow-editor.css */
.agent-flow-node-detail {
  position: absolute;
  top: var(--agent-flow-secondary-top);
  right: 16px;
  bottom: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  border: 1px solid #e4eadf;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
```

- [x] **Step 4: Re-run the targeted tests and confirm the shell passes**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/editor-store.test.ts
```

Expected: PASS with the new panel state and shell rendering.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/NodeDetailPanel.tsx \
  web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx \
  web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx \
  web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx \
  web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/features/agent-flow/components/editor/agent-flow-editor.css \
  web/app/src/features/agent-flow/store/editor/index.ts \
  web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/editor-store.test.ts
git commit -m "feat: add node detail panel shell"
```

## Task 2: Add Header Actions, Locate Behavior And Safe Node Duplication

**Files:**
- Create: `web/app/src/features/agent-flow/components/detail/NodeActionMenu.tsx`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-node-detail-actions.ts`
- Create: `web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts`
- Create: `web/app/src/features/agent-flow/_tests/node-action-menu.test.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts`
- Modify: `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`

- [x] **Step 1: Write the failing duplication and action tests**

```ts
// web/app/src/features/agent-flow/_tests/document-transforms.test.ts
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { createEdgeDocument } from '../lib/document/edge-factory';
import { createNodeDocument } from '../lib/document/node-factory';
import { duplicateNodeSubgraph } from '../lib/document/transforms/duplicate';

function createNestedContainerDocument() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(
    {
      ...createNodeDocument('iteration', 'node-iteration-1', 640, 240),
      containerId: null
    },
    {
      ...createNodeDocument('answer', 'node-inner-answer-1', 920, 240),
      containerId: 'node-iteration-1'
    }
  );
  document.graph.edges.push(
    createEdgeDocument({
      id: 'edge-iteration-answer',
      source: 'node-iteration-1',
      target: 'node-inner-answer-1',
      containerId: 'node-iteration-1'
    })
  );

  return document;
}

test('duplicates a container subtree and rewrites internal ids', () => {
  const document = createNestedContainerDocument();

  const next = duplicateNodeSubgraph(document, { nodeId: 'node-iteration-1' });

  expect(next.graph.nodes.some((node) => node.id === 'node-iteration-1-copy')).toBe(true);
  expect(
    next.graph.nodes.some((node) => node.containerId === 'node-iteration-1-copy')
  ).toBe(true);
  expect(
    next.graph.edges.some((edge) => edge.source.includes('-copy') && edge.target.includes('-copy'))
  ).toBe(true);
});
```

```tsx
// web/app/src/features/agent-flow/_tests/node-action-menu.test.tsx
test('exposes locate and copy actions only', async () => {
  render(<NodeActionMenu onLocate={vi.fn()} onCopy={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: '更多操作' }));

  expect(screen.getByRole('menuitem', { name: '定位节点' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '复制节点' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: '删除节点' })).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/document-transforms.test.ts \
  src/features/agent-flow/_tests/node-action-menu.test.tsx
```

Expected: FAIL because `duplicateNodeSubgraph` and `NodeActionMenu` do not exist yet.

- [x] **Step 3: Implement the duplicate transform, locate state and header actions**

```ts
// web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts
function collectDuplicatedNodeIds(
  document: FlowAuthoringDocument,
  rootNodeId: string
) {
  const queue = [rootNodeId];
  const collectedIds: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;

    collectedIds.push(currentNodeId);
    for (const candidate of document.graph.nodes) {
      if (candidate.containerId === currentNodeId) {
        queue.push(candidate.id);
      }
    }
  }

  return collectedIds;
}

export function duplicateNodeSubgraph(
  document: FlowAuthoringDocument,
  payload: { nodeId: string }
) {
  const sourceNode = getNodeById(document, payload.nodeId);
  if (!sourceNode) return document;

  const sourceIds = sourceNode.type === 'iteration' || sourceNode.type === 'loop'
    ? collectDuplicatedNodeIds(document, sourceNode.id)
    : [sourceNode.id];
  const idMap = new Map(sourceIds.map((id) => [id, `${id}-copy`]));

  return {
    ...document,
    graph: {
      nodes: [
        ...document.graph.nodes,
        ...document.graph.nodes
          .filter((node) => sourceIds.includes(node.id))
          .map((node) => ({
            ...node,
            id: idMap.get(node.id)!,
            alias: `${node.alias} 副本`,
            containerId: node.containerId ? idMap.get(node.containerId)! : node.containerId,
            position: { x: node.position.x + 48, y: node.position.y + 48 }
          }))
      ],
      edges: [
        ...document.graph.edges,
        ...document.graph.edges
          .filter(
            (edge) => sourceIds.includes(edge.source) && sourceIds.includes(edge.target)
          )
          .map((edge) => ({
            ...edge,
            id: `${edge.id}-copy`,
            source: idMap.get(edge.source)!,
            target: idMap.get(edge.target)!,
            containerId: edge.containerId ? idMap.get(edge.containerId)! : edge.containerId
          }))
      ]
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts
export interface InteractionSlice {
  activeContainerPath: string[];
  connectingPayload: {
    sourceNodeId: string | null;
    sourceHandleId: string | null;
    sourceNodeType: string | null;
  };
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  highlightedIssueId: string | null;
  pendingLocateNodeId: string | null;
}
```

```ts
// web/app/src/features/agent-flow/store/editor/index.ts
pendingLocateNodeId: null,

setInteractionState: (payload) =>
  set((current) => ({
    activeContainerPath:
      payload.activeContainerPath ?? current.activeContainerPath,
    connectingPayload: payload.connectingPayload
      ? {
          ...current.connectingPayload,
          ...payload.connectingPayload
        }
      : current.connectingPayload,
    hoveredNodeId: payload.hoveredNodeId ?? current.hoveredNodeId,
    hoveredEdgeId: payload.hoveredEdgeId ?? current.hoveredEdgeId,
    highlightedIssueId:
      payload.highlightedIssueId ?? current.highlightedIssueId,
    pendingLocateNodeId:
      payload.pendingLocateNodeId ?? current.pendingLocateNodeId
  })),
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-node-detail-actions.ts
export function useNodeDetailActions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  const setInteractionState = useAgentFlowEditorStore((state) => state.setInteractionState);
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  return {
    closeDetail() {
      setSelection({ selectedNodeId: null, selectedNodeIds: [], selectedEdgeId: null });
    },
    locateSelectedNode() {
      if (!selectedNodeId) return;
      setInteractionState({ pendingLocateNodeId: selectedNodeId });
    },
    duplicateSelectedNode() {
      if (!selectedNodeId) return;
      setWorkingDocument(duplicateNodeSubgraph(document, { nodeId: selectedNodeId }));
    }
  };
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx
const actions = useNodeDetailActions();

<Space size={8}>
  <NodeRunButton onRunNode={onRunNode} />
  <NodeActionMenu
    onLocate={actions.locateSelectedNode}
    onCopy={actions.duplicateSelectedNode}
  />
  <Button
    aria-label="关闭节点详情"
    type="text"
    icon={<CloseOutlined />}
    onClick={actions.closeDetail}
  />
</Space>
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx
function PendingLocateNodeEffect() {
  const reactFlow = useReactFlow();
  const pendingLocateNodeId = useAgentFlowEditorStore(
    (state) => state.pendingLocateNodeId
  );
  const setInteractionState = useAgentFlowEditorStore(
    (state) => state.setInteractionState
  );

  useEffect(() => {
    if (!pendingLocateNodeId) {
      return;
    }

    void reactFlow.fitView({
      nodes: [{ id: pendingLocateNodeId }],
      duration: 240,
      padding: 0.24
    });
    setInteractionState({ pendingLocateNodeId: null });
  }, [pendingLocateNodeId, reactFlow, setInteractionState]);

  return null;
}

<ReactFlow
  edges={edges}
  nodes={nodes}
  viewport={document.editor.viewport}
  nodeTypes={agentFlowNodeTypes}
  edgeTypes={agentFlowEdgeTypes}
>
  <Background gap={20} size={1} />
  <PendingLocateNodeEffect />
</ReactFlow>
```

- [x] **Step 4: Re-run the focused tests and confirm the actions pass**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/document-transforms.test.ts \
  src/features/agent-flow/_tests/node-action-menu.test.tsx
```

Expected: PASS with copied subgraphs rewriting ids and the action menu staying minimal.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/NodeActionMenu.tsx \
  web/app/src/features/agent-flow/components/detail/NodeDetailHeader.tsx \
  web/app/src/features/agent-flow/hooks/interactions/use-node-detail-actions.ts \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx \
  web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts \
  web/app/src/features/agent-flow/store/editor/index.ts \
  web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts \
  web/app/src/features/agent-flow/_tests/document-transforms.test.ts \
  web/app/src/features/agent-flow/_tests/node-action-menu.test.tsx
git commit -m "feat: add node detail actions and duplication"
```

## Task 3: Assemble The Config Tab With Summary, Read-Only Outputs And Direct Relations

**Files:**
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx`
- Create: `web/app/src/features/agent-flow/lib/document/relations.ts`
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`

- [x] **Step 1: Write the failing config-tab composition tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
test('shows node summary, read-only output contract and direct relations in config tab', () => {
  render(
    <AgentFlowEditorStoreProvider initialState={createInitialState()}>
      <NodeConfigTab />
    </AgentFlowEditorStoreProvider>
  );

  expect(screen.getByText('节点说明')).toBeInTheDocument();
  expect(screen.getByText('输出契约')).toBeInTheDocument();
  expect(screen.getByText('上游节点')).toBeInTheDocument();
  expect(screen.getByText('下游节点')).toBeInTheDocument();
  expect(screen.getByText('模型输出')).toBeInTheDocument();
});
```

```tsx
// web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
function FocusIssueSeed() {
  const focusIssueField = useAgentFlowEditorStore(
    (state) => state.focusIssueField
  );

  useEffect(() => {
    focusIssueField({
      nodeId: 'node-llm',
      sectionKey: 'inputs',
      fieldKey: 'config.model'
    });
  }, [focusIssueField]);

  return null;
}

test('keeps issue-driven focus working after the inspector loses its header chrome', async () => {
  render(
    <AgentFlowEditorStoreProvider initialState={createInitialState()}>
      <FocusIssueSeed />
      <NodeConfigTab />
    </AgentFlowEditorStoreProvider>
  );

  await waitFor(() => {
    expect(screen.getByLabelText('模型')).toHaveFocus();
  });
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected: FAIL because `NodeConfigTab` 仍是空壳，且 summary / output / relations cards 尚未存在。

- [x] **Step 3: Implement the config-tab composition and relation helpers**

```ts
// web/app/src/features/agent-flow/lib/document/relations.ts
export function getDirectUpstreamNodes(
  document: FlowAuthoringDocument,
  nodeId: string
) {
  const incomingIds = document.graph.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source);

  return document.graph.nodes.filter((node) => incomingIds.includes(node.id));
}

export function getDirectDownstreamNodes(
  document: FlowAuthoringDocument,
  nodeId: string
) {
  const outgoingIds = document.graph.edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.target);

  return document.graph.nodes.filter((node) => outgoingIds.includes(node.id));
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx
export function NodeConfigTab() {
  return (
    <div className="agent-flow-node-detail__config-tab">
      <NodeSummaryCard />
      <NodeInspector />
      <NodeOutputContractCard />
      <NodeRelationsCard />
    </div>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx
import { Card, Descriptions, Typography } from 'antd';

import { nodeDefinitions } from '../../../lib/node-definitions';
import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodeSummaryCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;

  if (!selectedNode || !definition) {
    return null;
  }

  return (
    <Card title="节点说明">
      <Typography.Paragraph>{definition.summary}</Typography.Paragraph>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="别名">{selectedNode.alias}</Descriptions.Item>
        <Descriptions.Item label="简介">
          {selectedNode.description || '暂无节点简介'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx
import { Card, List, Tag, Typography } from 'antd';

import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodeOutputContractCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  if (!selectedNode) {
    return null;
  }

  return (
    <Card title="输出契约">
      <List
        dataSource={selectedNode.outputs}
        renderItem={(output) => (
          <List.Item>
            <Typography.Text>{output.title}</Typography.Text>
            <Tag>{output.valueType}</Tag>
          </List.Item>
        )}
      />
    </Card>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx
import { Card, Space, Tag, Typography } from 'antd';

import {
  getDirectDownstreamNodes,
  getDirectUpstreamNodes
} from '../../../lib/document/relations';
import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodeRelationsCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);

  if (!selectedNodeId) {
    return null;
  }

  const upstreamNodes = getDirectUpstreamNodes(document, selectedNodeId);
  const downstreamNodes = getDirectDownstreamNodes(document, selectedNodeId);

  return (
    <Card title="节点关系">
      <Space direction="vertical" size={12}>
        <div>
          <Typography.Text strong>上游节点</Typography.Text>
          <div>
            {upstreamNodes.map((node) => (
              <Tag key={node.id}>{node.alias}</Tag>
            ))}
          </div>
        </div>
        <div>
          <Typography.Text strong>下游节点</Typography.Text>
          <div>
            {downstreamNodes.map((node) => (
              <Tag key={node.id}>{node.alias}</Tag>
            ))}
          </div>
        </div>
      </Space>
    </Card>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx
export function NodeInspector() {
  return (
    <section ref={rootRef} className="agent-flow-node-detail__inspector">
      <Collapse
        activeKey={activeSectionKeys}
        className="agent-flow-editor__inspector-sections"
        onChange={(nextActiveKeys) =>
          setActiveSectionKeys(
            Array.isArray(nextActiveKeys)
              ? (nextActiveKeys.map(String) as InspectorSectionKey[])
              : []
          )
        }
        items={visibleSections.map((section) => ({
          key: section.key,
          label: section.title,
          children: (
            <div className="agent-flow-editor__inspector-fields">
              {section.fields.map((field) => (
                <div
                  key={field.key}
                  className="agent-flow-editor__inspector-field"
                  data-field-key={field.key}
                >
                  <Typography.Text strong>{field.label}</Typography.Text>
                  {renderField(field)}
                </div>
              ))}
            </div>
          )
        }))}
      />
    </section>
  );
}
```

```ts
// web/app/src/features/agent-flow/lib/node-definitions.tsx
export interface NodeDefinition {
  label: string;
  summary: string;
  helpHref: string | null;
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: NodeDefinitionField[];
  }>;
}
```

- [x] **Step 4: Re-run the focused tests and confirm the config composition passes**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-inspector.test.tsx
```

Expected: PASS with the summary, output contract and direct relation cards rendering around the stripped-down inspector.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeOutputContractCard.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeRelationsCard.tsx \
  web/app/src/features/agent-flow/lib/document/relations.ts \
  web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx \
  web/app/src/features/agent-flow/lib/node-definitions.tsx \
  web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
git commit -m "feat: compose node detail config tab"
```

## Task 4: Add The Last Run Tab Shell And Placeholder Contract

**Files:**
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`

- [x] **Step 1: Write the failing last-run shell test**

```tsx
// web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { NodeLastRunTab } from '../components/detail/tabs/NodeLastRunTab';

describe('NodeLastRunTab', () => {
  test('renders summary, io and metadata shells without faking runtime values', () => {
    render(<NodeLastRunTab />);

    expect(screen.getByText('运行摘要')).toBeInTheDocument();
    expect(screen.getByText('节点输入输出')).toBeInTheDocument();
    expect(screen.getByText('元数据')).toBeInTheDocument();
    expect(screen.getByText('当前版本暂未接入运行数据')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the targeted test and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-last-run-tab.test.tsx
```

Expected: FAIL because `NodeLastRunTab` still是空壳，且三层 placeholder cards 尚未存在。

- [x] **Step 3: Implement the placeholder contract and tab wiring**

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
export function NodeLastRunTab() {
  return (
    <div className="agent-flow-node-detail__last-run">
      <NodeRunSummaryCard />
      <NodeRunIOCard />
      <NodeRunMetadataCard />
    </div>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx
export function NodeRunSummaryCard() {
  return (
    <Card title="运行摘要">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">--</Descriptions.Item>
        <Descriptions.Item label="运行时间">--</Descriptions.Item>
        <Descriptions.Item label="总 token 数">--</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary">
        当前版本暂未接入运行数据
      </Typography.Text>
    </Card>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx
export function NodeRunIOCard() {
  return (
    <Card title="节点输入输出">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="当前版本暂未接入运行输入输出"
      />
    </Card>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx
export function NodeRunMetadataCard() {
  return (
    <Card title="元数据">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">--</Descriptions.Item>
        <Descriptions.Item label="执行人">N/A</Descriptions.Item>
        <Descriptions.Item label="开始时间">--</Descriptions.Item>
        <Descriptions.Item label="运行时间">--</Descriptions.Item>
        <Descriptions.Item label="总 token 数">--</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
```

- [x] **Step 4: Re-run the focused test and confirm the tab shell passes**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-last-run-tab.test.tsx
```

Expected: PASS with the three-layer placeholder structure rendered.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx \
  web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx \
  web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx \
  web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx \
  web/app/src/features/agent-flow/components/editor/agent-flow-editor.css \
  web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx
git commit -m "feat: add node detail last-run shell"
```

## Task 5: Expand Node Definitions, Output Contract Editing And Common Policy Blocks

**Files:**
- Create: `web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx`
- Create: `web/app/src/features/agent-flow/components/detail/fields/OutputContractDefinitionField.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Modify: `web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- Modify: `web/app/src/features/agent-flow/lib/document/transforms/node.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`

- [x] **Step 1: Write the failing output-contract and policy tests**

```tsx
// web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
function createInitialStateWithCodeNode() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(createNodeDocument('code', 'node-code', 720, 240));

  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

test('renders code output contract definition inside config fields while keeping output display read-only', async () => {
  render(
    <AgentFlowEditorStoreProvider initialState={createInitialStateWithCodeNode()}>
      <SelectionSeed nodeId="node-code" />
      <NodeConfigTab />
    </AgentFlowEditorStoreProvider>
  );

  expect(screen.getByText('输出契约')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新增输出变量' })).toBeInTheDocument();
  expect(screen.queryByLabelText('代码结果')).not.toBeInTheDocument();
});
```

```ts
// web/app/src/features/agent-flow/_tests/validate-document.test.ts
function createCodeDocumentWithOutputs(outputs: Array<{
  key: string;
  title: string;
  valueType: 'string' | 'number' | 'boolean' | 'array' | 'json' | 'unknown';
}>) {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes = document.graph.nodes.map((node) =>
    node.id === 'node-llm'
      ? {
          ...createNodeDocument('code', 'node-code', node.position.x, node.position.y),
          outputs
        }
      : node
  );
  document.graph.edges = document.graph.edges.map((edge) =>
    edge.source === 'node-llm'
      ? { ...edge, source: 'node-code' }
      : edge.target === 'node-llm'
        ? { ...edge, target: 'node-code' }
        : edge
  );

  return document;
}

test('flags duplicate code output keys in the editable output contract', () => {
  const document = createCodeDocumentWithOutputs([
    { key: 'result', title: '结果', valueType: 'string' },
    { key: 'result', title: '重复结果', valueType: 'string' }
  ]);

  const issues = validateDocument(document);

  expect(issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'node-code',
        message: '输出契约中的变量名必须唯一'
      })
    ])
  );
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-inspector.test.tsx \
  src/features/agent-flow/_tests/validate-document.test.ts
```

Expected: FAIL because the new editor kind, policy section and validation rules do not exist yet.

- [x] **Step 3: Implement definition metadata, editable output contracts and common policy blocks**

```ts
// web/app/src/features/agent-flow/lib/node-definitions.tsx
export type NodeEditorKind =
  | 'text'
  | 'number'
  | 'selector'
  | 'selector_list'
  | 'templated_text'
  | 'named_bindings'
  | 'condition_group'
  | 'state_write'
  | 'output_contract_definition';

export interface NodeDefinition {
  label: string;
  summary: string;
  helpHref: string | null;
  canEnterContainer?: boolean;
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: NodeDefinitionField[];
  }>;
}

// example: code node
code: {
  label: 'Code',
  summary: '执行用户自定义代码并输出 JSON object 属性。',
  helpHref: '/docs/agentflow/nodes/code',
  sections: [
    {
      key: 'inputs',
      title: 'Inputs',
      fields: [
        {
          key: 'bindings.named_bindings',
          label: '输入变量',
          editor: 'named_bindings'
        }
      ]
    },
    {
      key: 'advanced',
      title: 'Advanced',
      fields: [
        { key: 'config.language', label: '运行语言', editor: 'text' },
        {
          key: 'config.output_contract',
          label: '输出契约',
          editor: 'output_contract_definition'
        }
      ]
    }
  ]
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx
export function NodeConfigTab() {
  return (
    <div className="agent-flow-node-detail__config-tab">
      <NodeSummaryCard />
      <NodeInspector />
      <NodeOutputContractCard />
      <NodeRelationsCard />
      <NodePolicySection />
    </div>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/fields/OutputContractDefinitionField.tsx
export function OutputContractDefinitionField({
  value,
  onChange
}: {
  value: Array<{ key: string; title: string; valueType: string }>;
  onChange: (value: Array<{ key: string; title: string; valueType: string }>) => void;
}) {
  return (
    <div className="agent-flow-output-contract-editor">
      {value.map((output, index) => (
        <Space key={`${output.key}-${index}`} align="start">
          <Input
            aria-label={`输出变量名 ${index + 1}`}
            value={output.key}
            onChange={(event) =>
              onChange(
                value.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, key: event.target.value }
                    : candidate
                )
              )
            }
          />
          <Select
            aria-label={`输出类型 ${index + 1}`}
            value={output.valueType}
            options={[
              { value: 'string', label: 'String' },
              { value: 'number', label: 'Number' },
              { value: 'object', label: 'Object' }
            ]}
            onChange={(valueType) =>
              onChange(
                value.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, valueType }
                    : candidate
                )
              )
            }
          />
        </Space>
      ))}
      <Button onClick={() => onChange([...value, { key: '', title: '', valueType: 'string' }])}>
        新增输出变量
      </Button>
    </div>
  );
}
```

```ts
// web/app/src/features/agent-flow/lib/document/transforms/node.ts
export function replaceNodeOutputs(
  document: FlowAuthoringDocument,
  nodeId: string,
  outputs: FlowNodeDocument['outputs']
) {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              outputs
            }
          : node
      )
    }
  };
}
```

```tsx
// web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx
case 'output_contract_definition':
  return (
    <OutputContractDefinitionField
      value={activeNode.outputs}
      onChange={(nextValue) => updateField('config.output_contract', nextValue)}
    />
  );
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts
import {
  replaceNodeOutputs,
  updateNodeField
} from '../../lib/document/transforms/node';

updateField(fieldKey: string, value: unknown) {
  if (!selectedNodeId) return;

  if (
    fieldKey === 'config.output_contract' &&
    Array.isArray(value)
  ) {
    setWorkingDocument(replaceNodeOutputs(document, selectedNodeId, value as any));
    return;
  }

  setWorkingDocument(
    updateNodeField(document, {
      nodeId: selectedNodeId,
      fieldKey,
      value: value as never
    })
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx
export function NodePolicySection() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const { updateField } = useInspectorInteractions();
  const { openNodePicker } = useNodeInteractions();
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  if (!selectedNode) return null;

  return (
    <div className="agent-flow-node-detail__policies">
      <Card title="失败重试">
        <Switch
          checked={Boolean(selectedNode.config.retry_enabled)}
          onChange={(checked) => updateField('config.retry_enabled', checked)}
        />
      </Card>
      <Card title="异常处理">
        <Select
          value={(selectedNode.config.error_policy as string | undefined) ?? 'fail'}
          options={[
            { value: 'fail', label: '直接失败' },
            { value: 'ignore', label: '忽略并继续' }
          ]}
          onChange={(value) => updateField('config.error_policy', value)}
        />
      </Card>
      <Card title="下一步">
        <Button onClick={() => selectedNodeId && openNodePicker(selectedNodeId)}>
          添加下一个节点
        </Button>
      </Card>
    </div>
  );
}
```

```ts
// web/app/src/features/agent-flow/lib/validate-document.ts
for (const node of document.graph.nodes) {
  const seenOutputKeys = new Set<string>();

  for (const output of node.outputs) {
    if (!output.key.trim()) {
      pushFieldIssue(
        issues,
        node,
        'config.output_contract',
        '输出变量名未配置',
        '输出契约中的变量名不能为空。'
      );
      continue;
    }

    if (seenOutputKeys.has(output.key)) {
      pushFieldIssue(
        issues,
        node,
        'config.output_contract',
        '输出契约重复',
        '输出契约中的变量名必须唯一'
      );
      continue;
    }

    seenOutputKeys.add(output.key);
  }
}
```

- [x] **Step 4: Re-run the focused tests and confirm the schema and policy layer pass**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-inspector.test.tsx \
  src/features/agent-flow/_tests/validate-document.test.ts
```

Expected: PASS with editable `Code` output contracts, read-only output display and duplicate-contract validation.

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/components/detail/cards/NodePolicySection.tsx \
  web/app/src/features/agent-flow/components/detail/fields/OutputContractDefinitionField.tsx \
  web/app/src/features/agent-flow/components/detail/tabs/NodeConfigTab.tsx \
  web/app/src/features/agent-flow/components/detail/cards/NodeSummaryCard.tsx \
  web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx \
  web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts \
  web/app/src/features/agent-flow/lib/node-definitions.tsx \
  web/app/src/features/agent-flow/lib/document/transforms/node.ts \
  web/app/src/features/agent-flow/lib/validate-document.ts \
  web/app/src/features/agent-flow/_tests/node-inspector.test.tsx \
  web/app/src/features/agent-flow/_tests/validate-document.test.ts
git commit -m "feat: add node detail schema and policy blocks"
```

## Task 6: Finish Page-Level Regression Coverage And Frontend Verification

**Files:**
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`

- [x] **Step 1: Add the failing page-level regression for the new panel contract**

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('renders node detail shell with config and last-run tabs on orchestration page', async () => {
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

  expect(await screen.findByRole('tab', { name: '配置' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '上次运行' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '运行当前节点' })).toBeDisabled();
});
```

- [x] **Step 2: Run the page test and confirm failure**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
```

Expected: FAIL until the new detail panel contract is fully wired.

- [x] **Step 3: Add the page-level assertion and style-boundary selector**

```json
// web/app/src/style-boundary/scenario-manifest.json
{
  "id": "page.application-detail",
  "boundaryNodes": [
    {
      "id": "editor-detail-panel",
      "selector": ".agent-flow-node-detail",
      "propertyAssertions": [
        {
          "property": "display",
          "expected": "flex"
        }
      ]
    }
  ]
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx
const detailActions = useNodeDetailActions();

<div
  className={`agent-flow-editor__body agent-flow-editor__shell${selectedNodeId ? ' agent-flow-editor__body--with-detail' : ''}`}
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
  {selectedNodeId ? (
    <NodeDetailPanel
      onClose={detailActions.closeDetail}
      onRunNode={undefined}
    />
  ) : null}
</div>
```

- [x] **Step 4: Run the full verification matrix**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx \
  src/features/agent-flow/_tests/node-last-run-tab.test.tsx \
  src/features/agent-flow/_tests/node-action-menu.test.tsx \
  src/features/agent-flow/_tests/document-transforms.test.ts \
  src/features/agent-flow/_tests/node-inspector.test.tsx \
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

- Desktop orchestration page shows the new detail panel shell, header actions and both tabs
- Narrow viewport follows the existing host downgrade path and keeps the page shell stable

Verification record:

- `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-last-run-tab.test.tsx src/features/agent-flow/_tests/node-action-menu.test.tsx src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/validate-document.test.ts src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx` -> PASS
- `pnpm --dir web lint` -> PASS
- `pnpm --dir web test` -> PASS
- `pnpm --dir web/app build` -> PASS
- `node scripts/node/check-style-boundary.js page.application-detail` -> PASS
- Manual verification on `http://127.0.0.1:3100/applications/019d8f3a-5b3b-71e1-a32b-c97ec4139ab8/orchestration`:
  desktop shows detail shell, header actions, `配置 / 上次运行` tabs, and disabled run button
  `390x844` viewport shows the existing desktop-only notice and keeps the host shell stable

- [x] **Step 5: Commit**

```bash
git add \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/style-boundary/scenario-manifest.json
git commit -m "test: cover node detail page integration"
```

## Self-Review

### Spec coverage

- `Node Detail Panel` 壳层：Task 1
- Header、运行按钮、更多操作：Task 2
- `配置` tab 四层结构：Task 3 + Task 5
- `Last Run` 壳层：Task 4
- 全部节点 section 级真值与高频节点字段级设计：Task 5
- 输出契约只读、`Code` 节点输出定义：Task 5
- 直接上游 / 下游关系：Task 3
- 容器复制与定位：Task 2
- 页面级回归与 style-boundary：Task 6

### Placeholder scan

- 没有 `TODO / TBD / similar to task N`
- 每个测试步骤都给了具体测试代码和执行命令
- 每个实现步骤都给了具体文件路径和代码片段

### Type consistency

- 统一使用 `nodeDetailTab: 'config' | 'lastRun'`
- 统一使用 `NodeDetailPanel / NodeConfigTab / NodeLastRunTab`
- 输出契约编辑统一走 `config.output_contract`
- 输出展示统一只读，编辑入口统一叫 `OutputContractDefinitionField`
