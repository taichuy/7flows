// @vitest-environment jsdom

import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";

import { WorkflowEditorNodeRuntimePanel } from "@/components/workflow-editor-inspector-panels/workflow-editor-node-runtime-panel";
import type { RunDetail } from "@/lib/get-run-detail";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";

const { triggerWorkflowNodeTrialRunMock } = vi.hoisted(() => ({
  triggerWorkflowNodeTrialRunMock: vi.fn().mockResolvedValue({
    status: "success",
    message: "ok"
  })
}));

vi.mock("@/app/actions/runs", () => ({
  triggerWorkflowNodeTrialRun: triggerWorkflowNodeTrialRunMock
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });

  Object.defineProperty(window, "getComputedStyle", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      getPropertyValue: () => "",
      overflow: "visible"
    }))
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  triggerWorkflowNodeTrialRunMock.mockClear();
  window.localStorage.clear();
  container?.remove();
  root = null;
  container = null;
});

function buildNode(
  overrides: Partial<WorkflowCanvasNodeData>,
  nodeId = "node-1"
): Node<WorkflowCanvasNodeData> {
  return {
    id: nodeId,
    position: { x: 0, y: 0 },
    type: "workflow",
    data: {
      label: "startNode",
      nodeType: "startNode",
      config: {},
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            title: "Query"
          }
        }
      },
      outputSchema: {},
      ...overrides
    }
  } as Node<WorkflowCanvasNodeData>;
}

function buildRuntimeRequest(nodeId = "node-1", requestId = 1) {
  return {
    nodeId,
    requestId
  };
}

function buildRunDetail(): RunDetail {
  return {
    id: "run-demo-1",
    workflow_id: "workflow-demo",
    workflow_version: "0.1.0",
    status: "succeeded",
    input_payload: { query: "你好" },
    output_payload: { accepted: true },
    created_at: "2026-04-04T00:00:00Z",
    event_count: 2,
    event_type_counts: {},
    node_runs: [
      {
        id: "node-run-1",
        node_id: "node-1",
        node_name: "startNode",
        node_type: "startNode",
        status: "succeeded",
        input_payload: {
          query: "你好"
        },
        output_payload: {
          query: "你好"
        }
      }
    ],
    events: []
  };
}

describe("WorkflowEditorNodeRuntimePanel client render", () => {
  it("keeps single-node trial runs from auto-opening the run overlay for non-start nodes", async () => {
    const handleRunSuccess = vi.fn();

    triggerWorkflowNodeTrialRunMock.mockResolvedValueOnce({
      status: "success",
      message: "ok",
      runId: "run-node-1"
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({
            label: "LLM Agent",
            nodeType: "llmAgentNode",
            inputSchema: {}
          }),
          onRunSuccess: handleRunSuccess
        })
      );
    });

    const submitButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("试运行当前节点")
    ) as HTMLButtonElement | undefined;
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton?.click();
    });

    expect(triggerWorkflowNodeTrialRunMock).toHaveBeenCalledWith("workflow-demo", "node-1", {});
    expect(handleRunSuccess).toHaveBeenCalledWith({
      runId: "run-node-1",
      revealRunOverlay: false
    });
  });

  it("runs immediately when cached required fields are complete for the requested node", async () => {
    window.localStorage.setItem(
      "sevenflows.editor.start-node-trial-run:workflow-demo:node-1",
      JSON.stringify({ query: "缓存值" })
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          React.StrictMode,
          null,
          createElement(WorkflowEditorNodeRuntimePanel, {
            workflowId: "workflow-demo",
            node: buildNode({}),
            runtimeRequest: buildRuntimeRequest()
          })
        )
      );
    });

    expect(triggerWorkflowNodeTrialRunMock).toHaveBeenCalledWith(
      "workflow-demo",
      "node-1",
      { query: "缓存值" }
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("style") ?? "").toContain("display: none");
  });

  it("ignores runtime requests targeting another node", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({}, "node-1"),
          runtimeRequest: buildRuntimeRequest("node-2")
        })
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("style") ?? "").toContain("display: none");
    expect(triggerWorkflowNodeTrialRunMock).not.toHaveBeenCalled();
  });

  it("opens the start-node input modal when a targeted runtime request arrives after mount", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(
          React.StrictMode,
          null,
          createElement(WorkflowEditorNodeRuntimePanel, {
            workflowId: "workflow-demo",
            node: buildNode({}),
            runtimeRequest: null
          })
        )
      );
    });

    const initialDialog = document.querySelector('[role="dialog"]');
    expect(initialDialog?.getAttribute("style") ?? "").toContain("display: none");

    act(() => {
      root?.render(
        createElement(
          React.StrictMode,
          null,
          createElement(WorkflowEditorNodeRuntimePanel, {
            workflowId: "workflow-demo",
            node: buildNode({}),
            runtimeRequest: buildRuntimeRequest()
          })
        )
      );
    });

    const openedDialog = document.querySelector('[role="dialog"]');
    expect(openedDialog?.getAttribute("style") ?? "").not.toContain("display: none");
    expect(document.body.textContent).toContain("开始试运行");
    expect(triggerWorkflowNodeTrialRunMock).not.toHaveBeenCalled();
  });

  it("keeps the start-node input modal open across run-detail rerenders", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({}),
          runtimeRequest: buildRuntimeRequest()
        })
      );
    });

    expect(document.body.textContent).toContain("开始试运行");

    act(() => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({ runStatus: "succeeded" }),
          run: buildRunDetail(),
          runtimeRequest: buildRuntimeRequest()
        })
      );
    });

    expect(document.body.textContent).toContain("开始试运行");
  });

  it("consumes a targeted runtime request only once", async () => {
    const handleRuntimeRequest = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({}),
          runtimeRequest: buildRuntimeRequest(),
          onRuntimeRequestHandled: handleRuntimeRequest
        })
      );
    });

    expect(handleRuntimeRequest).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("开始试运行");

    await act(async () => {
      root?.render(
        createElement(WorkflowEditorNodeRuntimePanel, {
          workflowId: "workflow-demo",
          node: buildNode({ runStatus: "succeeded" }),
          run: buildRunDetail(),
          runtimeRequest: buildRuntimeRequest(),
          onRuntimeRequestHandled: handleRuntimeRequest
        })
      );
    });

    expect(handleRuntimeRequest).toHaveBeenCalledTimes(1);
    expect(triggerWorkflowNodeTrialRunMock).not.toHaveBeenCalled();
  });
});
