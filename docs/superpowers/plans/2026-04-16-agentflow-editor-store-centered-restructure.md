# AgentFlow Editor Store-Centered Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `web/app/src/features/agent-flow` 从当前 `Shell / Canvas / Inspector` 分散直接改 `FlowAuthoringDocument` 的实现，重构成 `editor store + document transforms + interaction hooks + presentational components` 的稳定前端内核，并保持现有 editor 外观、Draft/Version 业务规则和 orchestration API 合同不变。

**Architecture:** 第一阶段先建立纯函数 `document` 模块与 feature-local `zustand` store，把 `workingDocument`、选择态、面板态、container path、autosave 状态统一收口；第二阶段再把 `Canvas`、`NodeInspector`、`Issues`、`History` 的写操作迁移到 `hooks/interactions/*`，让 UI 组件只渲染和派发事件。为降低回归面，保留现有页面路由、`AgentFlowEditorShell`、`AgentFlowOverlay`、`agent-flow-editor.css` 和后端 orchestration API，不改变 editor 视觉结构，只替换内部数据流。

**Tech Stack:** React 19, TypeScript, Zustand 5, TanStack Query, Ant Design 5, `@xyflow/react`, `@1flowbase/flow-schema`, Vitest, Testing Library, `style-boundary`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-16-agentflow-editor-store-centered-restructure-design.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区推进。执行过程中每完成一个任务，都要同步勾选本计划中的复选框并回填验证结果。

---

## File Structure

**Create**
- `web/app/src/features/agent-flow/store/editor/index.ts`
- `web/app/src/features/agent-flow/store/editor/provider.tsx`
- `web/app/src/features/agent-flow/store/editor/selectors.ts`
- `web/app/src/features/agent-flow/store/editor/slices/document-slice.ts`
- `web/app/src/features/agent-flow/store/editor/slices/selection-slice.ts`
- `web/app/src/features/agent-flow/store/editor/slices/viewport-slice.ts`
- `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- `web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts`
- `web/app/src/features/agent-flow/store/editor/slices/sync-slice.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-canvas-interactions.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-node-interactions.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-edge-interactions.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-selection-interactions.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-container-navigation.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-draft-sync.ts`
- `web/app/src/features/agent-flow/hooks/interactions/use-editor-shortcuts.ts`
- `web/app/src/features/agent-flow/lib/document/default-document.ts`
- `web/app/src/features/agent-flow/lib/document/node-factory.ts`
- `web/app/src/features/agent-flow/lib/document/edge-factory.ts`
- `web/app/src/features/agent-flow/lib/document/change-kind.ts`
- `web/app/src/features/agent-flow/lib/document/selectors.ts`
- `web/app/src/features/agent-flow/lib/document/transforms/node.ts`
- `web/app/src/features/agent-flow/lib/document/transforms/edge.ts`
- `web/app/src/features/agent-flow/lib/document/transforms/container.ts`
- `web/app/src/features/agent-flow/lib/document/transforms/viewport.ts`
- `web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts`
- `web/app/src/features/agent-flow/lib/adapters/to-canvas-edges.ts`
- `web/app/src/features/agent-flow/components/canvas/custom-edge.tsx`
- `web/app/src/features/agent-flow/components/canvas/custom-connection-line.tsx`
- `web/app/src/features/agent-flow/components/canvas/node-types.tsx`
- `web/app/src/features/agent-flow/components/canvas/CanvasHandle.tsx`
- `web/app/src/features/agent-flow/components/canvas/EdgeInsertButton.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`
- `web/app/src/features/agent-flow/_tests/editor-store.test.ts`
- `web/app/src/features/agent-flow/_tests/draft-sync.test.tsx`

**Modify**
- `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- `web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx`
- `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
- `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts`
- `web/app/src/features/agent-flow/lib/draft-save.ts`
- `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`
- `web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts`
- `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
- `web/app/src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx`
- `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`

**Delete**
- `web/app/src/features/agent-flow/components/nodes/node-registry.tsx`
- `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts`

**Structure Notes**
- 保留 `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx` 作为稳定入口，但把真正的 `ReactFlow` 绑定和 custom edge/node 细节下沉到 `components/canvas/*`，这样可以减少路由、样式和 `style-boundary` 场景的震荡面。
- 保留 `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts` 作为过渡 facade，在最后一个任务里只做 re-export，避免迁移中同时大面积改 import。

### Task 1: 拆出纯 document 模块并锁定 graph 语义

**Files:**
- Create: `web/app/src/features/agent-flow/lib/document/default-document.ts`
- Create: `web/app/src/features/agent-flow/lib/document/node-factory.ts`
- Create: `web/app/src/features/agent-flow/lib/document/edge-factory.ts`
- Create: `web/app/src/features/agent-flow/lib/document/change-kind.ts`
- Create: `web/app/src/features/agent-flow/lib/document/selectors.ts`
- Create: `web/app/src/features/agent-flow/lib/document/transforms/node.ts`
- Create: `web/app/src/features/agent-flow/lib/document/transforms/edge.ts`
- Create: `web/app/src/features/agent-flow/lib/document/transforms/container.ts`
- Create: `web/app/src/features/agent-flow/lib/document/transforms/viewport.ts`
- Create: `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`
- Modify: `web/app/src/features/agent-flow/lib/default-agent-flow-document.ts`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts`

- [x] **Step 1: 写失败的 transform 测试**

```ts
import { describe, expect, test } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { classifyDocumentChange } from '../lib/document/change-kind';
import { createNodeDocument } from '../lib/document/node-factory';
import { getContainerPathForNode } from '../lib/document/transforms/container';
import {
  insertNodeOnEdge,
  reconnectEdge,
  validateConnection
} from '../lib/document/transforms/edge';
import { moveNodes, updateNodeField } from '../lib/document/transforms/node';
import { setViewport } from '../lib/document/transforms/viewport';

describe('agent flow document transforms', () => {
  test('inserts a node in the middle of an existing edge', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const inserted = createNodeDocument('template_transform', 'node-template-transform-1');

    const next = insertNodeOnEdge(document, {
      edgeId: 'edge-llm-answer',
      node: inserted
    });

    expect(next.graph.nodes.map((node) => node.id)).toContain('node-template-transform-1');
    expect(next.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'node-llm',
          target: 'node-template-transform-1'
        }),
        expect.objectContaining({
          source: 'node-template-transform-1',
          target: 'node-answer'
        })
      ])
    );
  });

  test('reconnects an edge only when source and target stay inside the same container', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const next = reconnectEdge(document, {
      edgeId: 'edge-start-llm',
      connection: {
        source: 'node-start',
        target: 'node-answer',
        sourceHandle: 'source-right',
        targetHandle: 'target-left'
      }
    });

    expect(next.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-answer',
          sourceHandle: 'source-right',
          targetHandle: 'target-left'
        })
      ])
    );
    expect(
      validateConnection(document, {
        source: 'node-start',
        target: 'missing-node'
      })
    ).toBe(false);
  });

  test('classifies viewport changes as layout and field changes as logical', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const moved = moveNodes(document, {
      'node-llm': { x: 520, y: 260 }
    });
    const viewport = setViewport(document, { x: 120, y: 48, zoom: 0.85 });
    const logical = updateNodeField(document, {
      nodeId: 'node-llm',
      fieldKey: 'alias',
      value: 'Dialogue Model'
    });

    expect(classifyDocumentChange(document, moved)).toBe('layout');
    expect(classifyDocumentChange(document, viewport)).toBe('layout');
    expect(classifyDocumentChange(document, logical)).toBe('logical');
  });

  test('resolves nested container path from document structure', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('iteration', 'node-iteration-1'),
      containerId: null
    });
    document.graph.nodes.push({
      ...createNodeDocument('answer', 'node-inner-answer-1'),
      containerId: 'node-iteration-1'
    });

    expect(getContainerPathForNode(document, 'node-inner-answer-1')).toEqual([
      'node-iteration-1'
    ]);
  });
});
```

- [x] **Step 2: 运行测试，确认当前模块边界还不存在**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/agent-flow-document.test.ts`

Expected: FAIL with module resolution errors for `../lib/document/*` and missing exports such as `insertNodeOnEdge`, `moveNodes`, or `classifyDocumentChange`.

Status note (`2026-04-16 10`): 已执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/agent-flow-document.test.ts`。第一次运行按预期失败，失败点为 `../lib/document/change-kind` 等新模块尚不存在。

- [x] **Step 3: 实现 document 模块与兼容 facade**

```ts
// web/app/src/features/agent-flow/lib/document/node-factory.ts
import type { FlowNodeDocument, FlowNodeType } from '@1flowbase/flow-schema';

function humanizeNodeType(nodeType: FlowNodeType) {
  if (nodeType === 'llm') {
    return 'LLM';
  }

  return nodeType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function createNodeDocument(
  nodeType: FlowNodeType,
  id: string
): FlowNodeDocument {
  return {
    id,
    type: nodeType,
    alias: humanizeNodeType(nodeType),
    description: '',
    containerId: null,
    position: { x: 0, y: 0 },
    configVersion: 1,
    config: {},
    bindings: {},
    outputs: []
  };
}

export function createNextNodeId(
  ids: string[],
  nodeType: FlowNodeType
) {
  const prefix = `node-${nodeType.replaceAll('_', '-')}`;
  let index = 1;

  while (ids.includes(`${prefix}-${index}`)) {
    index += 1;
  }

  return `${prefix}-${index}`;
}
```

```ts
// web/app/src/features/agent-flow/lib/document/transforms/node.ts
import type { FlowAuthoringDocument, FlowBinding } from '@1flowbase/flow-schema';

type NodeFieldValue = string | number | boolean | null | FlowBinding | string[] | string[][];

export function moveNodes(
  document: FlowAuthoringDocument,
  positions: Record<string, { x: number; y: number }>
) {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) =>
        positions[node.id]
          ? {
              ...node,
              position: positions[node.id]
            }
          : node
      )
    }
  };
}

export function updateNodeField(
  document: FlowAuthoringDocument,
  payload: {
    nodeId: string;
    fieldKey: string;
    value: NodeFieldValue;
  }
) {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
        if (node.id !== payload.nodeId) {
          return node;
        }

        if (payload.fieldKey === 'alias' && typeof payload.value === 'string') {
          return { ...node, alias: payload.value };
        }

        if (
          payload.fieldKey === 'description' &&
          typeof payload.value === 'string'
        ) {
          return { ...node, description: payload.value };
        }

        if (payload.fieldKey.startsWith('bindings.')) {
          const bindingKey = payload.fieldKey.slice('bindings.'.length);
          return {
            ...node,
            bindings: {
              ...node.bindings,
              [bindingKey]: payload.value as FlowBinding
            }
          };
        }

        if (payload.fieldKey.startsWith('config.')) {
          const configKey = payload.fieldKey.slice('config.'.length);
          return {
            ...node,
            config: {
              ...node.config,
              [configKey]: payload.value
            }
          };
        }

        return node;
      })
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/lib/document/transforms/edge.ts
import type { Connection, Viewport } from '@xyflow/react';
import type { FlowAuthoringDocument, FlowNodeDocument } from '@1flowbase/flow-schema';

export function validateConnection(
  document: FlowAuthoringDocument,
  connection: Pick<Connection, 'source' | 'target'>
) {
  if (!connection.source || !connection.target) {
    return false;
  }

  const sourceNode = document.graph.nodes.find((node) => node.id === connection.source);
  const targetNode = document.graph.nodes.find((node) => node.id === connection.target);

  return Boolean(
    sourceNode &&
      targetNode &&
      sourceNode.id !== targetNode.id &&
      sourceNode.containerId === targetNode.containerId
  );
}

export function reconnectEdge(
  document: FlowAuthoringDocument,
  payload: {
    edgeId: string;
    connection: Connection;
  }
) {
  if (!validateConnection(document, payload.connection)) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      edges: document.graph.edges.map((edge) =>
        edge.id === payload.edgeId
          ? {
              ...edge,
              source: payload.connection.source!,
              target: payload.connection.target!,
              sourceHandle: payload.connection.sourceHandle ?? null,
              targetHandle: payload.connection.targetHandle ?? null
            }
          : edge
      )
    }
  };
}

export function insertNodeOnEdge(
  document: FlowAuthoringDocument,
  payload: {
    edgeId: string;
    node: FlowNodeDocument;
  }
) {
  const edge = document.graph.edges.find((item) => item.id === payload.edgeId);

  if (!edge) {
    return document;
  }

  const sourceNode = document.graph.nodes.find((node) => node.id === edge.source);
  const targetNode = document.graph.nodes.find((node) => node.id === edge.target);

  if (!sourceNode || !targetNode) {
    return document;
  }

  const insertedNode = {
    ...payload.node,
    containerId: sourceNode.containerId,
    position: {
      x: Math.round((sourceNode.position.x + targetNode.position.x) / 2),
      y: Math.round((sourceNode.position.y + targetNode.position.y) / 2)
    }
  };

  return {
    ...document,
    graph: {
      nodes: [...document.graph.nodes, insertedNode],
      edges: [
        ...document.graph.edges.filter((item) => item.id !== payload.edgeId),
        {
          id: `edge-${edge.source}-${insertedNode.id}`,
          source: edge.source,
          target: insertedNode.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: null,
          containerId: edge.containerId,
          points: []
        },
        {
          id: `edge-${insertedNode.id}-${edge.target}`,
          source: insertedNode.id,
          target: edge.target,
          sourceHandle: null,
          targetHandle: edge.targetHandle,
          containerId: edge.containerId,
          points: []
        }
      ]
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/lib/document/transforms/container.ts
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export function getContainerPathForNode(
  document: FlowAuthoringDocument,
  nodeId: string | null
) {
  if (!nodeId) {
    return [];
  }

  const path: string[] = [];
  let current = document.graph.nodes.find((node) => node.id === nodeId) ?? null;

  while (current?.containerId) {
    path.unshift(current.containerId);
    current =
      document.graph.nodes.find((node) => node.id === current?.containerId) ?? null;
  }

  return path;
}
```

```ts
// web/app/src/features/agent-flow/lib/document/transforms/viewport.ts
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export function setViewport(
  document: FlowAuthoringDocument,
  viewport: FlowAuthoringDocument['editor']['viewport']
) {
  return {
    ...document,
    editor: {
      ...document.editor,
      viewport
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/lib/document/change-kind.ts
export { classifyDocumentChange } from '@1flowbase/flow-schema';

// web/app/src/features/agent-flow/lib/default-agent-flow-document.ts
export {
  createNextNodeId,
  createNodeDocument
} from './document/node-factory';
export { createDefaultAgentFlowDocument as buildDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
export { insertNodeOnEdge, reconnectEdge, validateConnection } from './document/transforms/edge';
export { moveNodes, updateNodeField } from './document/transforms/node';
export { setViewport } from './document/transforms/viewport';
```

- [x] **Step 4: 重跑 document 测试**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/agent-flow-document.test.ts`

Expected: PASS; `document-transforms.test.ts` 覆盖 edge insert、reconnect、layout/logical classify、container path，`agent-flow-document.test.ts` 继续通过默认三节点断言。

Status note (`2026-04-16 10`): 已重新执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/agent-flow-document.test.ts`，结果为 `2` 个文件、`7` 个测试全部 PASS。

- [x] **Step 5: Commit**

Status note (`2026-04-16 10:53`): 已提交 `refactor: route canvas interactions through editor hooks`，commit 为 `497a6a6c`。

```bash
git add web/app/src/features/agent-flow/lib/document \
  web/app/src/features/agent-flow/lib/default-agent-flow-document.ts \
  web/app/src/features/agent-flow/_tests/document-transforms.test.ts \
  web/app/src/features/agent-flow/_tests/agent-flow-document.test.ts
git commit -m "refactor: extract agent flow document transforms"
```

### Task 2: 引入 feature-local editor store 并把 Shell 收口成 Provider

**Files:**
- Create: `web/app/src/features/agent-flow/store/editor/index.ts`
- Create: `web/app/src/features/agent-flow/store/editor/provider.tsx`
- Create: `web/app/src/features/agent-flow/store/editor/selectors.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/document-slice.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/selection-slice.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/viewport-slice.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/interaction-slice.ts`
- Create: `web/app/src/features/agent-flow/store/editor/slices/sync-slice.ts`
- Create: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Create: `web/app/src/features/agent-flow/_tests/editor-store.test.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Modify: `web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx`

- [x] **Step 1: 写失败的 store 测试**

```ts
import { describe, expect, test } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { createAgentFlowEditorStore } from '../store/editor';

describe('agent flow editor store', () => {
  test('seeds working document, selection, panel state and sync state from server data', () => {
    const initialDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const store = createAgentFlowEditorStore({
      draft: {
        id: 'draft-1',
        version: 3,
        updated_at: '2026-04-16T10:00:00Z',
        document: initialDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().workingDocument.meta.flowId).toBe('flow-1');
    expect(store.getState().selectedNodeId).toBe('node-llm');
    expect(store.getState().issuesOpen).toBe(false);
    expect(store.getState().autosaveStatus).toBe('idle');
  });

  test('replaces server state and clears scratch interaction state after restore', () => {
    const initialDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const restoredDocument = {
      ...initialDocument,
      meta: {
        ...initialDocument.meta,
        name: 'Restored flow'
      }
    };
    const store = createAgentFlowEditorStore({
      draft: {
        id: 'draft-1',
        version: 3,
        updated_at: '2026-04-16T10:00:00Z',
        document: initialDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    store.getState().setPanelState({
      issuesOpen: true,
      historyOpen: true,
      nodePickerState: {
        open: true,
        anchorNodeId: 'node-llm',
        anchorEdgeId: null
      }
    });
    store.getState().focusIssueField({
      nodeId: 'node-answer',
      sectionKey: 'outputs',
      fieldKey: 'bindings.answer_template'
    });

    store.getState().replaceFromServerState({
      draft: {
        id: 'draft-1',
        version: 4,
        updated_at: '2026-04-16T10:05:00Z',
        document: restoredDocument
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    expect(store.getState().workingDocument.meta.name).toBe('Restored flow');
    expect(store.getState().issuesOpen).toBe(false);
    expect(store.getState().historyOpen).toBe(false);
    expect(store.getState().nodePickerState.open).toBe(false);
    expect(store.getState().focusedFieldKey).toBe(null);
    expect(store.getState().highlightedIssueId).toBe(null);
  });
});
```

- [x] **Step 2: 运行 store 测试，确认 provider/store 还不存在**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/editor-store.test.ts`

Expected: FAIL with `createAgentFlowEditorStore` missing and unresolved imports under `store/editor/*`.

Status note (`2026-04-16 10`): 已执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/editor-store.test.ts`。第一次运行按预期失败，失败点为 `../store/editor` 尚不存在。

- [x] **Step 3: 实现 store、slice 和 selector**

```ts
// web/app/src/features/agent-flow/store/editor/slices/document-slice.ts
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export interface DocumentSlice {
  workingDocument: FlowAuthoringDocument;
  lastSavedDocument: FlowAuthoringDocument;
  draftMeta: {
    draftId: string;
    draftVersion: number;
    updatedAt: string;
  };
  versions: Array<{
    id: string;
    sequence: number;
    trigger: 'autosave' | 'restore';
    change_kind: 'logical';
    summary: string;
    created_at: string;
  }>;
}
```

```ts
// web/app/src/features/agent-flow/store/editor/slices/selection-slice.ts
import type { InspectorSectionKey } from '../../lib/node-definitions';

export interface SelectionSlice {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
  focusedFieldKey: string | null;
  openInspectorSectionKey: InspectorSectionKey | null;
}
```

```ts
// web/app/src/features/agent-flow/store/editor/slices/sync-slice.ts
export interface SyncSlice {
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  isRestoringVersion: boolean;
  isDirty: boolean;
  lastChangeKind: 'layout' | 'logical' | null;
  lastChangeSummary: string | null;
}
```

```ts
// web/app/src/features/agent-flow/store/editor/index.ts
import { createStore } from 'zustand/vanilla';
import type { ConsoleApplicationOrchestrationState } from '@1flowbase/api-client';

import type { DocumentSlice } from './slices/document-slice';
import type { SelectionSlice } from './slices/selection-slice';
import type { SyncSlice } from './slices/sync-slice';

export interface AgentFlowEditorState
  extends DocumentSlice,
    SelectionSlice,
    SyncSlice {
  autosaveIntervalMs: number;
  issuesOpen: boolean;
  historyOpen: boolean;
  publishConfigOpen: boolean;
  nodePickerState: {
    open: boolean;
    anchorNodeId: string | null;
    anchorEdgeId: string | null;
  };
  activeContainerPath: string[];
  connectingPayload: {
    sourceNodeId: string | null;
    sourceHandleId: string | null;
    sourceNodeType: string | null;
  };
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  highlightedIssueId: string | null;
  setWorkingDocument: (document: DocumentSlice['workingDocument']) => void;
  setSelection: (payload: Partial<SelectionSlice>) => void;
  setPanelState: (
    payload: Partial<
      Pick<
        AgentFlowEditorState,
        'issuesOpen' | 'historyOpen' | 'publishConfigOpen' | 'nodePickerState'
      >
    >
  ) => void;
  setActiveContainerPath: (path: string[]) => void;
  setAutosaveStatus: (status: SyncSlice['autosaveStatus']) => void;
  setLastChange: (kind: SyncSlice['lastChangeKind'], summary: string | null) => void;
  focusIssueField: (payload: {
    nodeId: string;
    sectionKey: SelectionSlice['openInspectorSectionKey'];
    fieldKey: string | null;
  }) => void;
  replaceFromServerState: (state: ConsoleApplicationOrchestrationState) => void;
  resetTransientInteractionState: () => void;
}

export function createAgentFlowEditorStore(
  state: ConsoleApplicationOrchestrationState
) {
  return createStore<AgentFlowEditorState>((set) => ({
    workingDocument: state.draft.document,
    lastSavedDocument: state.draft.document,
    draftMeta: {
      draftId: state.draft.id,
      draftVersion: state.draft.version,
      updatedAt: state.draft.updated_at
    },
    versions: state.versions,
    autosaveIntervalMs: state.autosave_interval_seconds * 1000,
    selectedNodeId: 'node-llm',
    selectedEdgeId: null,
    selectedNodeIds: ['node-llm'],
    focusedFieldKey: null,
    openInspectorSectionKey: null,
    issuesOpen: false,
    historyOpen: false,
    publishConfigOpen: false,
    nodePickerState: {
      open: false,
      anchorNodeId: null,
      anchorEdgeId: null
    },
    activeContainerPath: [],
    connectingPayload: {
      sourceNodeId: null,
      sourceHandleId: null,
      sourceNodeType: null
    },
    hoveredNodeId: null,
    hoveredEdgeId: null,
    highlightedIssueId: null,
    autosaveStatus: 'idle',
    isRestoringVersion: false,
    isDirty: false,
    lastChangeKind: null,
    lastChangeSummary: null,
    setWorkingDocument: (workingDocument) =>
      set((current) => ({
        workingDocument,
        isDirty:
          JSON.stringify(workingDocument) !==
          JSON.stringify(current.lastSavedDocument)
      })),
    setSelection: (payload) => set(payload),
    setPanelState: (payload) => set(payload),
    setActiveContainerPath: (activeContainerPath) => set({ activeContainerPath }),
    setAutosaveStatus: (autosaveStatus) => set({ autosaveStatus }),
    setLastChange: (lastChangeKind, lastChangeSummary) =>
      set({ lastChangeKind, lastChangeSummary }),
    focusIssueField: ({ nodeId, sectionKey, fieldKey }) =>
      set({
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        openInspectorSectionKey: sectionKey,
        focusedFieldKey: fieldKey,
        issuesOpen: false
      }),
    resetTransientInteractionState: () =>
      set({
        selectedEdgeId: null,
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        },
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        },
        hoveredNodeId: null,
        hoveredEdgeId: null,
        highlightedIssueId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null,
        issuesOpen: false,
        historyOpen: false
      }),
    replaceFromServerState: (nextState) =>
      set(() => ({
        workingDocument: nextState.draft.document,
        lastSavedDocument: nextState.draft.document,
        draftMeta: {
          draftId: nextState.draft.id,
          draftVersion: nextState.draft.version,
          updatedAt: nextState.draft.updated_at
        },
        versions: nextState.versions,
        autosaveIntervalMs: nextState.autosave_interval_seconds * 1000,
        selectedNodeId: 'node-llm',
        selectedNodeIds: ['node-llm'],
        selectedEdgeId: null,
        activeContainerPath: [],
        issuesOpen: false,
        historyOpen: false,
        publishConfigOpen: false,
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        },
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        },
        hoveredNodeId: null,
        hoveredEdgeId: null,
        highlightedIssueId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null,
        autosaveStatus: 'idle',
        isRestoringVersion: false,
        isDirty: false,
        lastChangeKind: null,
        lastChangeSummary: null
      }))
  }));
}
```

```tsx
// web/app/src/features/agent-flow/store/editor/provider.tsx
import { createContext, useContext, useRef, type PropsWithChildren } from 'react';
import { useStore } from 'zustand';
import type { ConsoleApplicationOrchestrationState } from '@1flowbase/api-client';

import {
  createAgentFlowEditorStore,
  type AgentFlowEditorState
} from './index';

const AgentFlowEditorStoreContext =
  createContext<ReturnType<typeof createAgentFlowEditorStore> | null>(null);

export function AgentFlowEditorStoreProvider({
  initialState,
  children
}: PropsWithChildren<{
  initialState: ConsoleApplicationOrchestrationState;
}>) {
  const storeRef = useRef<ReturnType<typeof createAgentFlowEditorStore>>();

  if (!storeRef.current) {
    storeRef.current = createAgentFlowEditorStore(initialState);
  }

  return (
    <AgentFlowEditorStoreContext.Provider value={storeRef.current}>
      {children}
    </AgentFlowEditorStoreContext.Provider>
  );
}

export function useAgentFlowEditorStore<T>(
  selector: (state: AgentFlowEditorState) => T
) {
  const store = useContext(AgentFlowEditorStoreContext);

  if (!store) {
    throw new Error('AgentFlowEditorStoreProvider is missing');
  }

  return useStore(store, selector);
}
```

```ts
// web/app/src/features/agent-flow/store/editor/selectors.ts
import type { AgentFlowEditorState } from './index';

export const selectWorkingDocument = (state: AgentFlowEditorState) =>
  state.workingDocument;
export const selectLastSavedDocument = (state: AgentFlowEditorState) =>
  state.lastSavedDocument;
export const selectSelectedNodeId = (state: AgentFlowEditorState) =>
  state.selectedNodeId;
export const selectActiveContainerId = (state: AgentFlowEditorState) =>
  state.activeContainerPath.at(-1) ?? null;
export const selectAutosaveStatus = (state: AgentFlowEditorState) =>
  state.autosaveStatus;
export const selectVersions = (state: AgentFlowEditorState) => state.versions;
```

- [x] **Step 4: 把 Shell 收口成 Provider + 布局装配**

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx
import type { ConsoleApplicationOrchestrationState } from '@1flowbase/api-client';

import { AgentFlowEditorStoreProvider } from '../../store/editor/provider';
import { AgentFlowCanvasFrame } from './AgentFlowCanvasFrame';

export function AgentFlowEditorShell({
  applicationId,
  applicationName,
  initialState
}: {
  applicationId: string;
  applicationName: string;
  initialState: ConsoleApplicationOrchestrationState;
}) {
  return (
    <AgentFlowEditorStoreProvider initialState={initialState}>
      <AgentFlowCanvasFrame
        applicationId={applicationId}
        applicationName={applicationName}
      />
    </AgentFlowEditorStoreProvider>
  );
}
```

- [x] **Step 5: 重跑 store 测试和 editor page 测试**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

Expected: PASS; store 测试能读到 `workingDocument`、selection、panel、sync 初始值，`AgentFlowEditorPage` 继续通过桌面端展示、移动端降级和 query error state 断言。

Status note (`2026-04-16 10`): 已执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`，结果为 `2` 个文件、`9` 个测试全部 PASS。运行过程中出现 `React Flow` 关于测试容器尺寸与样式加载的既有警告，但未导致断言失败。

- [ ] **Step 6: Commit**

```bash
git add web/app/src/features/agent-flow/store/editor \
  web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx \
  web/app/src/features/agent-flow/_tests/editor-store.test.ts \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "refactor: add agent flow editor store"
```

### Task 3: 把 Canvas、Node、Edge 写操作迁移到 interaction hooks

**Files:**
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-canvas-interactions.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-node-interactions.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-edge-interactions.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-selection-interactions.ts`
- Create: `web/app/src/features/agent-flow/lib/adapters/to-canvas-nodes.ts`
- Create: `web/app/src/features/agent-flow/lib/adapters/to-canvas-edges.ts`
- Create: `web/app/src/features/agent-flow/components/canvas/custom-edge.tsx`
- Create: `web/app/src/features/agent-flow/components/canvas/custom-connection-line.tsx`
- Create: `web/app/src/features/agent-flow/components/canvas/node-types.tsx`
- Create: `web/app/src/features/agent-flow/components/canvas/CanvasHandle.tsx`
- Create: `web/app/src/features/agent-flow/components/canvas/EdgeInsertButton.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Modify: `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx`
- Delete: `web/app/src/features/agent-flow/components/nodes/node-registry.tsx`

- [x] **Step 1: 先让 Canvas 交互测试失败，锁定“无全局事件桥”的目标**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { AgentFlowEditorStoreProvider } from '../store/editor/provider';
import { AgentFlowCanvas } from '../components/editor/AgentFlowCanvas';

const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

describe('AgentFlowCanvas interactions', () => {
  beforeEach(() => {
    dispatchSpy.mockClear();
  });

  test('inserts a node from edge actions without window event bridge', async () => {
    render(
      <AgentFlowEditorStoreProvider
        initialState={{
          draft: {
            id: 'draft-1',
            version: 1,
            updated_at: '2026-04-16T10:00:00Z',
            document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
          },
          autosave_interval_seconds: 30,
          versions: []
        }}
      >
        <AgentFlowCanvas issueCountByNodeId={{}} />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '在此连线上新增节点' }));
    fireEvent.click(screen.getByRole('button', { name: 'Template Transform' }));
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: 运行交互测试，确认当前实现仍依赖 `window.dispatchEvent`**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx`

Expected: FAIL because `AgentFlowCanvas` 仍直接修改 document、仍监听 `agent-flow-insert-node`，并且组件 props 还没有从 store 中读取 selection / picker / viewport。

- [x] **Step 3: 实现 adapters、custom edge 和 interaction hooks**

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-canvas-interactions.ts
import type { NodeChange, Viewport } from '@xyflow/react';

import { moveNodes } from '../../lib/document/transforms/node';
import { setViewport } from '../../lib/document/transforms/viewport';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectWorkingDocument } from '../../store/editor/selectors';

export function useCanvasInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);

  return {
    onNodesChange(changes: NodeChange[]) {
      const positions = Object.fromEntries(
        changes
          .filter((change) => change.type === 'position' && change.position)
          .map((change) => [change.id, change.position!])
      );

      if (Object.keys(positions).length === 0) {
        return;
      }

      setWorkingDocument(moveNodes(document, positions));
    },
    onViewportChange(viewport: Viewport) {
      setWorkingDocument(
        setViewport(document, {
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom
        })
      );
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-node-interactions.ts
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectWorkingDocument } from '../../store/editor/selectors';
import {
  createNextNodeId,
  createNodeDocument
} from '../../lib/document/node-factory';
import { insertNodeOnEdge } from '../../lib/document/transforms/edge';

export function useNodeInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);

  return {
    selectNode(nodeId: string | null) {
      setSelection({
        selectedNodeId: nodeId,
        selectedNodeIds: nodeId ? [nodeId] : []
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        }
      });
    },
    openNodePicker(anchorNodeId: string) {
      setPanelState({
        nodePickerState: {
          open: true,
          anchorNodeId,
          anchorEdgeId: null
        }
      });
    },
    insertNodeFromEdge(edgeId: string, nodeType: Parameters<typeof createNodeDocument>[0]) {
      const nextNode = createNodeDocument(
        nodeType,
        createNextNodeId(
          document.graph.nodes.map((node) => node.id),
          nodeType
        )
      );
      const nextDocument = insertNodeOnEdge(document, {
        edgeId,
        node: nextNode
      });

      setWorkingDocument(nextDocument);
      setSelection({
        selectedNodeId: nextNode.id,
        selectedNodeIds: [nextNode.id]
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        }
      });
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-edge-interactions.ts
import type { Connection } from '@xyflow/react';

import { reconnectEdge, validateConnection } from '../../lib/document/transforms/edge';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectWorkingDocument } from '../../store/editor/selectors';

export function useEdgeInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  return {
    reconnect(edgeId: string, connection: Connection) {
      const nextDocument = reconnectEdge(document, {
        edgeId,
        connection
      });

      setWorkingDocument(nextDocument);
      setSelection({
        selectedEdgeId: edgeId,
        selectedNodeId: null,
        selectedNodeIds: []
      });
    },
    isValidConnection(connection: Connection) {
      return validateConnection(document, connection);
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-selection-interactions.ts
import { useAgentFlowEditorStore } from '../../store/editor/provider';

export function useSelectionInteractions() {
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);

  return {
    clearSelection() {
      setSelection({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: []
      });
      setPanelState({
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null
        }
      });
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/lib/adapters/to-canvas-edges.ts
import { MarkerType, type Edge } from '@xyflow/react';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export function toCanvasEdges(
  document: FlowAuthoringDocument,
  activeContainerId: string | null
): Edge[] {
  return document.graph.edges
    .filter((edge) => edge.containerId === activeContainerId)
    .map((edge) => ({
      id: edge.id,
      type: 'agentFlowEdge',
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      style: { stroke: '#b2c8b9', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#b2c8b9'
      },
      data: {
        edgeId: edge.id
      }
    }));
}
```

```tsx
// web/app/src/features/agent-flow/components/canvas/custom-connection-line.tsx
import type { ConnectionLineComponentProps } from '@xyflow/react';

export function AgentFlowCustomConnectionLine({
  fromX,
  fromY,
  toX,
  toY
}: ConnectionLineComponentProps) {
  return (
    <path
      className="agent-flow-custom-connection-line"
      d={`M ${fromX} ${fromY} L ${toX} ${toY}`}
      fill="none"
      stroke="#8fb39a"
      strokeWidth={2}
      strokeDasharray="6 4"
    />
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/canvas/custom-edge.tsx
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

import { EdgeInsertButton } from './EdgeInsertButton';

export function AgentFlowCustomEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  data
}: EdgeProps<{ onInsertNode: (edgeId: string, nodeType: string) => void }>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path agent-flow-custom-edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      <EdgeLabelRenderer>
        <div
          className="agent-flow-edge-label-container"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all'
          }}
        >
          <EdgeInsertButton
            onPickNode={(nodeType) => data?.onInsertNode(id, nodeType)}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx
import '@xyflow/react/dist/style.css';

import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react';

import { validateDocument } from '../../lib/validate-document';
import { toCanvasEdges } from '../../lib/adapters/to-canvas-edges';
import { toCanvasNodes } from '../../lib/adapters/to-canvas-nodes';
import { useCanvasInteractions } from '../../hooks/interactions/use-canvas-interactions';
import { useEdgeInteractions } from '../../hooks/interactions/use-edge-interactions';
import { useNodeInteractions } from '../../hooks/interactions/use-node-interactions';
import { useSelectionInteractions } from '../../hooks/interactions/use-selection-interactions';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectActiveContainerId,
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { AgentFlowCustomConnectionLine } from '../canvas/custom-connection-line';
import { agentFlowEdgeTypes, agentFlowNodeTypes } from '../canvas/node-types';

export function AgentFlowCanvas({
  issueCountByNodeId
}: {
  issueCountByNodeId: Record<string, number>;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const activeContainerId = useAgentFlowEditorStore(selectActiveContainerId);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const canvasInteractions = useCanvasInteractions();
  const nodeInteractions = useNodeInteractions();
  const edgeInteractions = useEdgeInteractions();
  const selectionInteractions = useSelectionInteractions();

  return (
    <ReactFlowProvider>
      <div className="agent-flow-canvas">
        <ReactFlow
          nodes={toCanvasNodes(document, activeContainerId, selectedNodeId, issueCountByNodeId, nodeInteractions)}
          edges={toCanvasEdges(document, activeContainerId).map((edge) => ({
            ...edge,
            data: {
              onInsertNode: nodeInteractions.insertNodeFromEdge
            }
          }))}
          nodeTypes={agentFlowNodeTypes}
          edgeTypes={agentFlowEdgeTypes}
          viewport={document.editor.viewport}
          onNodesChange={canvasInteractions.onNodesChange}
          onViewportChange={canvasInteractions.onViewportChange}
          onReconnect={(oldEdge, connection) =>
            edgeInteractions.reconnect(oldEdge.id, connection)
          }
          onPaneClick={selectionInteractions.clearSelection}
          isValidConnection={edgeInteractions.isValidConnection}
          connectionLineComponent={AgentFlowCustomConnectionLine}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
```

- [x] **Step 4: 重跑画布与交互测试**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx`

Expected: PASS; `AgentFlowCanvas` 不再依赖 `window.dispatchEvent`，拖拽节点、viewport 变化、edge reconnect、edge 中点插入都通过 store action 改写 `workingDocument`。

Status note (`2026-04-16 10:51`): 本任务从一个半完成的 Task 3 工作树继续推进，没有重新回到纯旧实现去复现“事件桥仍存在”的初始红灯；实际收口过程中先暴露的是 `AgentFlowCanvasFrame` 仍传旧 props、交互测试仍断言旧 `onDocumentChange` 桥、以及 custom edge / `NodeChange` 的 TypeScript 类型未收紧。随后已将断言迁移为观察 editor store 状态，并删除 `node-registry.tsx` 与全局事件桥依赖。

Status note (`2026-04-16 10:51`): 已执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx`，结果为 `2` 个文件、`8` 个测试全部 PASS。`React Flow` 仍在真实渲染测试中输出容器尺寸与样式加载警告，但未影响断言结果。

- [x] **Step 5: Commit**

Status note (`2026-04-16 11:04`): 已提交 `refactor: move agent flow sync and inspector into editor store`，commit 为 `b35f365f`。

```bash
git add -A web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx \
  web/app/src/features/agent-flow/components/canvas \
  web/app/src/features/agent-flow/hooks/interactions/use-canvas-interactions.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-node-interactions.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-edge-interactions.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-selection-interactions.ts \
  web/app/src/features/agent-flow/lib/adapters \
  web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx \
  web/app/src/features/agent-flow/components/nodes/node-registry.tsx
git commit -m "refactor: route canvas interactions through editor hooks"
```

### Task 4: 把 Inspector、Issues、History 和 Draft Sync 收口到 editor 内核

**Files:**
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-container-navigation.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-draft-sync.ts`
- Create: `web/app/src/features/agent-flow/hooks/interactions/use-editor-shortcuts.ts`
- Create: `web/app/src/features/agent-flow/_tests/draft-sync.test.tsx`
- Modify: `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
- Modify: `web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx`
- Modify: `web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Modify: `web/app/src/features/agent-flow/lib/draft-save.ts`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`

- [x] **Step 1: 写失败的 Inspector / restore / autosave 测试**

```tsx
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { AgentFlowEditorStoreProvider } from '../store/editor/provider';
import { useDraftSync } from '../hooks/interactions/use-draft-sync';

describe('useDraftSync', () => {
  test('restores server draft and clears transient editor state', async () => {
    const saveDraft = vi.fn();
    const restoreVersion = vi.fn().mockResolvedValue({
      draft: {
        id: 'draft-1',
        version: 5,
        updated_at: '2026-04-16T10:20:00Z',
        document: {
          ...createDefaultAgentFlowDocument({ flowId: 'flow-1' }),
          meta: {
            flowId: 'flow-1',
            name: 'Recovered flow',
            description: '',
            tags: []
          }
        }
      },
      autosave_interval_seconds: 30,
      versions: []
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentFlowEditorStoreProvider
        initialState={{
          draft: {
            id: 'draft-1',
            version: 4,
            updated_at: '2026-04-16T10:00:00Z',
            document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
          },
          autosave_interval_seconds: 30,
          versions: []
        }}
      >
        {children}
      </AgentFlowEditorStoreProvider>
    );

    const { result } = renderHook(
      () =>
        useDraftSync({
          applicationId: 'app-1',
          saveDraftRequest: saveDraft,
          restoreVersionRequest: restoreVersion
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.restoreVersion('version-5');
    });

    expect(restoreVersion).toHaveBeenCalledWith('app-1', 'version-5', expect.any(String));
    expect(result.current.status).toBe('idle');
  });
});
```

```tsx
// web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
test('updates node fields through inspector interactions instead of mutating document inline', async () => {
  render(
    <AgentFlowEditorStoreProvider initialState={buildInitialEditorState()}>
      <NodeInspector />
    </AgentFlowEditorStoreProvider>
  );

  await userEvent.clear(screen.getByLabelText('节点别名'));
  await userEvent.type(screen.getByLabelText('节点别名'), 'Dialogue Model');

  expect(screen.getByDisplayValue('Dialogue Model')).toBeInTheDocument();
});
```

- [x] **Step 2: 运行同步和 Inspector 测试，确认当前实现仍把逻辑写在组件里**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx`

Expected: FAIL because `use-draft-sync.ts` 尚不存在，`NodeInspector` 仍依赖 `onDocumentChange` 直接拼 document，而不是从 store 读取 selected node 并走 interaction hook。

- [x] **Step 3: 实现 Inspector、container navigation 与 draft sync hooks**

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts
import { updateNodeField } from '../../lib/document/transforms/node';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectSelectedNodeId, selectWorkingDocument } from '../../store/editor/selectors';

export function useInspectorInteractions() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const setWorkingDocument = useAgentFlowEditorStore((state) => state.setWorkingDocument);
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  return {
    updateField(fieldKey: string, value: unknown) {
      if (!selectedNodeId) {
        return;
      }

      setWorkingDocument(
        updateNodeField(document, {
          nodeId: selectedNodeId,
          fieldKey,
          value: value as never
        })
      );
    },
    closeInspector() {
      setSelection({
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null
      });
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-container-navigation.ts
import type { AgentFlowIssue } from '../../lib/validate-document';
import { getContainerPathForNode } from '../../lib/document/transforms/container';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { selectWorkingDocument } from '../../store/editor/selectors';

export function useContainerNavigation() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const setActiveContainerPath = useAgentFlowEditorStore((state) => state.setActiveContainerPath);
  const focusIssueField = useAgentFlowEditorStore((state) => state.focusIssueField);

  return {
    openContainer(nodeId: string) {
      setActiveContainerPath([...getContainerPathForNode(document, nodeId), nodeId]);
      focusIssueField({
        nodeId:
          document.graph.nodes.find((node) => node.containerId === nodeId)?.id ?? nodeId,
        sectionKey: null,
        fieldKey: null
      });
    },
    returnToRoot() {
      setActiveContainerPath([]);
    },
    jumpToIssue(issue: AgentFlowIssue) {
      if (!issue.nodeId) {
        return;
      }

      setActiveContainerPath(getContainerPathForNode(document, issue.nodeId));
      focusIssueField({
        nodeId: issue.nodeId,
        sectionKey: issue.sectionKey ?? null,
        fieldKey: issue.fieldKey ?? null
      });
    }
  };
}
```

```ts
// web/app/src/features/agent-flow/hooks/interactions/use-draft-sync.ts
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../../../../state/auth-store';
import { restoreVersion, saveDraft } from '../../api/orchestration';
import { buildDraftSaveInput } from '../../lib/draft-save';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectLastSavedDocument,
  selectWorkingDocument
} from '../../store/editor/selectors';

export function useDraftSync({
  applicationId,
  saveDraftRequest = saveDraft,
  restoreVersionRequest = restoreVersion
}: {
  applicationId: string;
  saveDraftRequest?: typeof saveDraft;
  restoreVersionRequest?: typeof restoreVersion;
}) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const workingDocument = useAgentFlowEditorStore(selectWorkingDocument);
  const lastSavedDocument = useAgentFlowEditorStore(selectLastSavedDocument);
  const autosaveIntervalMs = useAgentFlowEditorStore((state) => state.autosaveIntervalMs);
  const setAutosaveStatus = useAgentFlowEditorStore((state) => state.setAutosaveStatus);
  const setLastChange = useAgentFlowEditorStore((state) => state.setLastChange);
  const replaceFromServerState = useAgentFlowEditorStore((state) => state.replaceFromServerState);
  const saveInFlight = useRef(false);

  async function saveNow() {
    if (!csrfToken || saveInFlight.current) {
      return false;
    }

    saveInFlight.current = true;
    setAutosaveStatus('saving');

    try {
      const input = buildDraftSaveInput(lastSavedDocument, workingDocument);
      const nextState = await saveDraftRequest(applicationId, input, csrfToken);

      replaceFromServerState(nextState);
      setLastChange(input.change_kind, input.summary);
      setAutosaveStatus('saved');
      return true;
    } catch {
      setAutosaveStatus('error');
      return false;
    } finally {
      saveInFlight.current = false;
    }
  }

  async function restoreVersionById(versionId: string) {
    if (!csrfToken) {
      return;
    }

    setAutosaveStatus('saving');
    const nextState = await restoreVersionRequest(applicationId, versionId, csrfToken);
    replaceFromServerState(nextState);
    setAutosaveStatus('idle');
  }

  useEffect(() => {
    if (JSON.stringify(workingDocument) === JSON.stringify(lastSavedDocument)) {
      return;
    }

    const timer = window.setInterval(() => {
      void saveNow();
    }, autosaveIntervalMs);

    return () => window.clearInterval(timer);
  }, [autosaveIntervalMs, lastSavedDocument, workingDocument]);

  return {
    saveNow,
    restoreVersion: restoreVersionById,
    status: useAgentFlowEditorStore((state) => state.autosaveStatus)
  };
}
```

```tsx
// web/app/src/features/agent-flow/hooks/interactions/use-editor-shortcuts.ts
import { useEffect } from 'react';

import { useAgentFlowEditorStore } from '../../store/editor/provider';

export function useEditorShortcuts() {
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelection({
          selectedNodeId: null,
          selectedEdgeId: null,
          selectedNodeIds: []
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelection]);
}
```

```tsx
// web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx
import { useMemo } from 'react';

import { listVisibleSelectorOptions } from '../../lib/selector-options';
import { nodeDefinitions } from '../../lib/node-definitions';
import { useInspectorInteractions } from '../../hooks/interactions/use-inspector-interactions';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';

export function NodeInspector() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const openSectionKey = useAgentFlowEditorStore((state) => state.openInspectorSectionKey);
  const focusedFieldKey = useAgentFlowEditorStore((state) => state.focusedFieldKey);
  const inspectorInteractions = useInspectorInteractions();
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;
  const selectorOptions = useMemo(
    () =>
      selectedNode ? listVisibleSelectorOptions(document, selectedNode.id) : [],
    [document, selectedNode]
  );

  if (!selectedNode || !definition) {
    return null;
  }

  return (
    <aside className="agent-flow-editor__inspector">
      <Input
        aria-label="节点别名"
        value={selectedNode.alias}
        onChange={(event) =>
          inspectorInteractions.updateField('alias', event.target.value)
        }
      />
      {/* 其余 field editor 继续渲染，但都调用 inspectorInteractions.updateField */}
    </aside>
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx
import { useMemo } from 'react';

import { validateDocument } from '../../lib/validate-document';
import { useContainerNavigation } from '../../hooks/interactions/use-container-navigation';
import { useDraftSync } from '../../hooks/interactions/use-draft-sync';
import { useEditorShortcuts } from '../../hooks/interactions/use-editor-shortcuts';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectAutosaveStatus,
  selectVersions,
  selectWorkingDocument
} from '../../store/editor/selectors';

export function AgentFlowCanvasFrame({
  applicationId,
  applicationName
}: {
  applicationId: string;
  applicationName: string;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const versions = useAgentFlowEditorStore(selectVersions);
  const autosaveStatus = useAgentFlowEditorStore(selectAutosaveStatus);
  const issues = useMemo(() => validateDocument(document), [document]);
  const issueCountByNodeId = useMemo(
    () =>
      issues.reduce<Record<string, number>>((counts, issue) => {
        if (issue.nodeId) {
          counts[issue.nodeId] = (counts[issue.nodeId] ?? 0) + 1;
        }

        return counts;
      }, {}),
    [issues]
  );
  const issuesOpen = useAgentFlowEditorStore((state) => state.issuesOpen);
  const historyOpen = useAgentFlowEditorStore((state) => state.historyOpen);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const navigation = useContainerNavigation();
  const draftSync = useDraftSync({ applicationId });

  useEditorShortcuts();

  return (
    <section className="agent-flow-editor" aria-label={`${applicationName} editor`}>
      <AgentFlowOverlay
        applicationName={applicationName}
        autosaveLabel="30 秒自动保存"
        autosaveStatus={autosaveStatus}
        onSaveDraft={() => {
          void draftSync.saveNow();
        }}
        onOpenIssues={() => setPanelState({ issuesOpen: true })}
        onOpenHistory={() => setPanelState({ historyOpen: true })}
        onOpenPublish={() => setPanelState({ publishConfigOpen: true })}
        saveDisabled={autosaveStatus === 'saving'}
        saveLoading={autosaveStatus === 'saving'}
        publishDisabled={false}
      />
      <AgentFlowCanvas issueCountByNodeId={issueCountByNodeId} />
      <NodeInspector />
      <IssuesDrawer
        open={issuesOpen}
        issues={issues}
        onClose={() => setPanelState({ issuesOpen: false })}
        onSelectIssue={navigation.jumpToIssue}
      />
      <VersionHistoryDrawer
        open={historyOpen}
        onClose={() => setPanelState({ historyOpen: false })}
        versions={versions}
        restoring={autosaveStatus === 'saving'}
        onRestore={(versionId) => draftSync.restoreVersion(versionId)}
      />
    </section>
  );
}
```

- [x] **Step 4: 重跑同步、Inspector 和页面级交互测试**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

Expected: PASS; restore 成功后 scratch state 清空、autosave 状态从 `saving` 回到 `idle` 或 `saved`、Inspector 改动通过 store 写回 document，页面仍能打开 Issues 和 History。

Status note (`2026-04-16 10:58`): 已先补 `draft-sync.test.tsx` 与 provider-backed `node-inspector.test.tsx`。第一次执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx` 时按预期失败，失败点为 `../hooks/interactions/use-draft-sync` 不存在，且 `NodeInspector` 仍要求 `document` / `selectedNodeId` / `onDocumentChange` props，无法直接挂在 store provider 下。

Status note (`2026-04-16 11:02`): 已新增 `use-inspector-interactions.ts`、`use-container-navigation.ts`、`use-draft-sync.ts`、`use-editor-shortcuts.ts`，并将 `NodeInspector`、`AgentFlowCanvasFrame` 收口到 store + hooks 路径；`useNodeInteractions.openContainer` 也已复用容器导航 hook。

Status note (`2026-04-16 11:02`): 已执行 `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`，结果为 `3` 个文件、`11` 个测试全部 PASS。页面级测试仍有既有 `React Flow` 容器尺寸与样式加载警告，但未影响断言结果。

- [x] **Step 5: Commit**

Status note (`2026-04-16 11:19`): 已完成本计划的最终收尾提交，包含旧 autosave 路径删除、`style-boundary` 映射与校验稳定性修复、`agent-flow`/`style-boundary` 测试稳态调整，以及计划文档与本地记忆回填。

```bash
git add web/app/src/features/agent-flow/hooks/interactions/use-inspector-interactions.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-container-navigation.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-draft-sync.ts \
  web/app/src/features/agent-flow/hooks/interactions/use-editor-shortcuts.ts \
  web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx \
  web/app/src/features/agent-flow/components/issues/IssuesDrawer.tsx \
  web/app/src/features/agent-flow/components/history/VersionHistoryDrawer.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx \
  web/app/src/features/agent-flow/lib/draft-save.ts \
  web/app/src/features/agent-flow/_tests/draft-sync.test.tsx \
  web/app/src/features/agent-flow/_tests/node-inspector.test.tsx
git commit -m "refactor: move agent flow sync and inspector into editor store"
```

### Task 5: 清理旧路径、补齐边界回归并完成全量验证

**Files:**
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-canvas.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/draft-sync.test.tsx`
- Modify: `web/app/src/style-boundary/_tests/registry.test.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
- Modify: `scripts/node/check-style-boundary/core.js`
- Delete: `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts`
- Delete: `web/app/src/features/agent-flow/components/nodes/node-registry.tsx`

- [x] **Step 1: 先写失败的页面级回归断言**

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('renders provider-backed editor chrome and keeps desktop-only guard', async () => {
  render(
    <AgentFlowEditorPage
      applicationId="app-1"
      applicationName="Agent Flow"
    />
  );

  expect(await screen.findByText('历史版本')).toBeInTheDocument();
  expect(screen.getByText('Issues')).toBeInTheDocument();
  expect(screen.queryByText('请使用桌面端编辑')).not.toBeInTheDocument();
});
```

- [x] **Step 2: 运行页面测试，确认清理前还有旧依赖残留**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

Expected: FAIL if `AgentFlowEditorShell` 仍残留旧 props、`useEditorAutosave` 旧导入未清理、或 `node-registry.tsx` / `window.dispatchEvent` 路径仍被引用。

- [x] **Step 3: 删除旧桥接路径并刷新 style-boundary 映射**

```json
// web/app/src/style-boundary/scenario-manifest.json
{
  "id": "page.application-detail",
  "impactFiles": [
    "web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx",
    "web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx",
    "web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx",
    "web/app/src/features/agent-flow/components/editor/agent-flow-editor.css",
    "web/app/src/features/agent-flow/components/canvas/custom-edge.tsx",
    "web/app/src/features/agent-flow/components/canvas/custom-connection-line.tsx"
  ]
}
```

```bash
rg -n "agent-flow-insert-node|window.dispatchEvent|useEditorAutosave|node-registry" \
  web/app/src/features/agent-flow
```

Expected: no matches.

- [x] **Step 4: 跑最终验证套件**

Run: `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-document.test.ts src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

Expected: PASS on all targeted `agent-flow` tests.

Run: `pnpm --dir web lint`

Expected: PASS.

Run: `pnpm --dir web test`

Expected: PASS; if the already-known `src/features/me/_tests/me-page.test.tsx` timeout still appears, record it explicitly as an unrelated existing failure and keep the targeted `agent-flow` suite as the release gate for this refactor.

Run: `pnpm --dir web/app build`

Expected: PASS.

Run: `node scripts/node/check-style-boundary.js page page.application-detail`

Expected: `[1flowbase-style-boundary] PASS page.application-detail`.

Run: `node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`

Expected: `[1flowbase-style-boundary] PASS page.application-detail`.

Status note (`2026-04-16 11:09`): 已在 `agent-flow-editor-page.test.tsx` 新增桌面端 provider-backed 页面回归断言，并把 autosave 的 layout/manual-save 断言迁入 `draft-sync.test.tsx`。在真正删除 `useEditorAutosave.ts` 前，`rg -n "agent-flow-insert-node|window.dispatchEvent|useEditorAutosave|node-registry" web/app/src/features/agent-flow` 仍命中旧 hook 与旧测试引用，确认还有清理残留。

Status note (`2026-04-16 11:16`): 已删除 `web/app/src/features/agent-flow/hooks/useEditorAutosave.ts`，更新 `page.application-detail` 的 `style-boundary` impactFiles，并将 `agent-flow` / `style-boundary` 的慢测试 timeout 调整到更贴近全量运行负载。上述 `rg` 命令已返回空结果，不再存在 `agent-flow-insert-node`、`window.dispatchEvent`、`useEditorAutosave` 或 `node-registry` 残留引用。

Status note (`2026-04-16 11:17`): 为解决 `node scripts/node/check-style-boundary.js ...` 在 Vite dev server 下卡在 `waitUntil: "networkidle"` 的 30s 超时，已将 `scripts/node/check-style-boundary/core.js` 的导航等待改为 `domcontentloaded`，继续以 `window.__STYLE_BOUNDARY__.ready === true` 作为稳定就绪信号。

Status note (`2026-04-16 11:17`): 最终验证结果如下。
- `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-document.test.ts src/features/agent-flow/_tests/document-transforms.test.ts src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/draft-sync.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx` => `8` 个文件、`28` 个测试全部 PASS。
- `pnpm --dir web lint` => PASS；仅剩 `web/app/src/features/agent-flow/store/editor/provider.tsx` 的既有 `react-refresh/only-export-components` warning，不影响命令退出码。
- `pnpm --dir web/app build` => PASS。
- `node scripts/node/check-style-boundary.js page page.application-detail` => PASS。
- `node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css` => PASS。
- `pnpm --dir web test` => `33` 个文件、`99` 个测试全部 PASS；本次未复现计划里提到的 `me-page` 历史超时。

Status note (`2026-04-16 12`): 计划完成后，用户追加指出“节点出口 `+` 仍是覆盖按钮，不符合 Dify 式 click/drag 同入口”。已将 `AgentFlowNodeCard` 的 source trigger 从 `Handle > Button > Popover` 收口成 `Handle-first` 结构：真实 `Handle` 直接承担点击开菜单与拖线入口，`NodePickerPopover` 退回为复用菜单层；同时新增 `agent-flow-node-card.test.tsx` 锁定“入口本体就是 handle”的结构回归。跟进验证结果如下。
- `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/agent-flow-canvas-interactions.test.tsx src/features/agent-flow/_tests/agent-flow-node-card.test.tsx src/features/agent-flow/_tests/node-picker-popover.test.tsx src/features/agent-flow/_tests/editor-store.test.ts src/features/agent-flow/_tests/draft-sync.test.tsx` => `5` 个文件、`16` 个测试全部 PASS。
- `pnpm --dir web lint` => PASS；仍仅剩 `web/app/src/features/agent-flow/store/editor/provider.tsx` 的既有 `react-refresh/only-export-components` warning。
- `pnpm --dir web/app build` => PASS。
- `node scripts/node/check-style-boundary.js page page.application-detail` => PASS。
- `node scripts/node/check-style-boundary.js file web/app/src/features/agent-flow/components/editor/agent-flow-editor.css` => PASS。
- `pnpm --dir web test` => 第一次因 `src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx` 的桌面渲染用例命中 Vitest 默认 `5000ms` 超时失败；单文件复跑通过后，将该用例超时显式提高到 `10000ms`，再次执行后 `34` 个文件、`101` 个测试全部 PASS。

Status note (`2026-04-16 17`): 用户随后继续指出 3 个 editor 交互缺口：拖线松手后应直接弹出节点选择、通过拖线新增节点不应把原有出边改写成串行、现有连线需要支持选中并通过键盘删除。已在 `use-edge-interactions` 补 `connectNodeFromSource` / `removeEdge`，让 floating picker 从 source 直接分支新增节点；在 `AgentFlowCanvas`、`use-selection-interactions`、`use-editor-shortcuts`、`to-canvas-edges`、`custom-edge` 补齐 edge 选中态与 `Delete/Backspace` 删除链路；同时为 `node-inspector.test.tsx` 的慢测试显式提高超时，避免把 Vitest 默认 `5000ms` 超时误判为产品回归。跟进验证结果如下。
- `pnpm --dir web/app exec vitest run src/features/agent-flow/_tests/node-inspector.test.tsx` => `1` 个文件、`2` 个测试 PASS。
- `pnpm --dir web lint` => PASS；仍仅剩 `web/app/src/features/agent-flow/store/editor/provider.tsx` 的既有 `react-refresh/only-export-components` warning。
- `pnpm --dir web/app build` => PASS。
- `pnpm --dir web test` => `35` 个文件、`105` 个测试全部 PASS。
- 浏览器桌面端验收：已确认从 `LLM` source handle 拖到空白区域松手后，会出现 floating picker；选择 `Template Transform` 后画布同时保留 `LLM -> Answer` 并新增 `LLM -> Template Transform`，不会把原有出边改写为串行。
- 浏览器窄视口验收：重新打开 `style-boundary.html?scene=page.application-detail` 后，页面显示“请使用桌面端编辑 / 移动端只提供受限查看，不开放完整画布编辑。”，移动端降级边界保持不变。

- [ ] **Step 5: Commit**

```bash
git add -A web/app/src/features/agent-flow \
  web/app/src/style-boundary/scenario-manifest.json
git commit -m "refactor: finish store-centered agent flow editor restructure"
```

## Verification Notes

- `node scripts/node/check-style-boundary.js ...` 会内部触发 `node scripts/node/dev-up.js ensure --frontend-only --skip-docker`；如果在受限环境里报 `listen EPERM 127.0.0.1:3100`，按仓库既有权限流程提权执行，不要绕过 `dev-up ensure`。
- `pnpm --dir web test` 已有历史记录显示可能被 `src/features/me/_tests/me-page.test.tsx` 的超时阻塞；若再次出现同样失败，执行记录必须明确标注“与本次 `agent-flow` 重构无关”，并保留 targeted `agent-flow` 测试、`lint`、`build` 与 `style-boundary` 作为本计划的完成证据。
