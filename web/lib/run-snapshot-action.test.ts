import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRunSnapshot } from "@/app/actions/run-snapshot";

type MockJsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function createJsonResponse(body: unknown, ok = true): MockJsonResponse {
  return {
    ok,
    json: async () => body
  };
}

describe("fetchRunSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("run detail 已带 execution focus 时不再额外请求 execution view", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-123")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-1",
          current_node_id: "tool-a",
          execution_focus_reason: "blocked_execution",
          execution_focus_node: {
            node_id: "tool-a",
            node_run_id: "node-run-1",
            callback_waiting_explanation: {
              primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
              follow_up: "下一步：先处理审批，再观察 waiting 节点是否恢复。"
            }
          },
          execution_focus_explanation: {
            primary_signal: "执行阻断：当前节点仍在等待审批。",
            follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
          },
          node_runs: [
            {
              node_id: "tool-a",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-123")).resolves.toEqual({
      status: "waiting",
      workflowId: "workflow-1",
      currentNodeId: "tool-a",
      waitingReason: "waiting approval",
      executionFocusReason: "blocked_execution",
      executionFocusNodeId: "tool-a",
      executionFocusNodeRunId: "node-run-1",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
        follow_up: "下一步：先处理审批，再观察 waiting 节点是否恢复。"
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("旧版 run detail 缺少 callback waiting explanation 时回退读取 execution view", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-legacy")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-1",
          current_node_id: "tool-a",
          execution_focus_reason: "blocked_execution",
          execution_focus_node: {
            node_id: "tool-a",
            node_run_id: "node-run-legacy"
          },
          execution_focus_explanation: {
            primary_signal: "执行阻断：当前节点仍在等待审批。",
            follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
          },
          node_runs: [
            {
              node_id: "tool-a",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-legacy/execution-view")) {
        return createJsonResponse({
          execution_focus_node: {
            node_id: "tool-a",
            node_run_id: "node-run-legacy",
            callback_waiting_explanation: {
              primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
              follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
            }
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-legacy")).resolves.toEqual({
      status: "waiting",
      workflowId: "workflow-1",
      currentNodeId: "tool-a",
      waitingReason: "waiting approval",
      executionFocusReason: "blocked_execution",
      executionFocusNodeId: "tool-a",
      executionFocusNodeRunId: "node-run-legacy",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
        follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("run detail 尚未带 execution focus 时回退读取 execution view", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-234")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-1",
          current_node_id: "tool-a",
          node_runs: [
            {
              node_id: "tool-a",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-234/execution-view")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-1",
          execution_focus_reason: "blocked_execution",
          execution_focus_node: {
            node_id: "tool-a",
            node_run_id: "node-run-1",
            callback_waiting_explanation: {
              primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
              follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
            }
          },
          execution_focus_explanation: {
            primary_signal: "执行阻断：当前节点仍在等待审批。",
            follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-234")).resolves.toEqual({
      status: "waiting",
      workflowId: "workflow-1",
      currentNodeId: "tool-a",
      waitingReason: "waiting approval",
      executionFocusReason: "blocked_execution",
      executionFocusNodeId: "tool-a",
      executionFocusNodeRunId: "node-run-1",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
        follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("execution view 不可用时仍返回基础 run snapshot", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-456")) {
        return createJsonResponse({
          status: "running",
          workflow_id: "workflow-2",
          current_node_id: "tool-b",
          node_runs: [
            {
              node_id: "tool-b",
              waiting_reason: null
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-456/execution-view")) {
        return createJsonResponse({ detail: "not found" }, false);
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-456")).resolves.toEqual({
      status: "running",
      workflowId: "workflow-2",
      currentNodeId: "tool-b",
      waitingReason: null,
      executionFocusReason: null,
      executionFocusNodeId: null,
      executionFocusNodeRunId: null,
      executionFocusExplanation: null,
      callbackWaitingExplanation: null
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("run detail 不可用时返回 null", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/missing-run")) {
        return createJsonResponse({ detail: "Run not found." }, false);
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("missing-run")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
