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
            node_name: "Tool A",
            node_type: "tool",
            callback_waiting_explanation: {
              primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
              follow_up: "下一步：先处理审批，再观察 waiting 节点是否恢复。"
            },
            artifact_refs: ["artifact://artifact-1"],
            artifacts: [
              {
                artifact_kind: "tool_result",
                content_type: "application/json",
                summary: "tool raw payload",
                uri: "artifact://artifact-1"
              }
            ],
            tool_calls: [
              {
                id: "tool-call-1",
                tool_id: "tool-a",
                tool_name: "Tool A",
                phase: "execute",
                status: "succeeded",
                requested_execution_class: "microvm",
                requested_execution_source: "runtime_policy",
                requested_execution_profile: "risk-reviewed",
                requested_execution_timeout_ms: 3000,
                requested_execution_network_policy: "isolated",
                requested_execution_filesystem_policy: "ephemeral",
                effective_execution_class: "microvm",
                execution_executor_ref: "tool:compat-adapter:dify-default",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_backend_executor_ref: "sandbox-backend:sandbox-default",
                execution_sandbox_runner_kind: "container",
                response_summary: "tool completed",
                response_content_type: "application/json",
                raw_ref: "artifact://artifact-1"
              }
            ]
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
      executionFocusNodeName: "Tool A",
      executionFocusNodeType: "tool",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
        follow_up: "下一步：先处理审批，再观察 waiting 节点是否恢复。"
      },
      executionFocusArtifactCount: 1,
      executionFocusArtifactRefCount: 1,
      executionFocusToolCallCount: 1,
      executionFocusRawRefCount: 1,
      executionFocusArtifactRefs: ["artifact://artifact-1"],
      executionFocusArtifacts: [
        {
          artifact_kind: "tool_result",
          content_type: "application/json",
          summary: "tool raw payload",
          uri: "artifact://artifact-1"
        }
      ],
      executionFocusToolCalls: [
        {
          id: "tool-call-1",
          tool_id: "tool-a",
          tool_name: "Tool A",
          phase: "execute",
          status: "succeeded",
          requested_execution_class: "microvm",
          requested_execution_source: "runtime_policy",
          requested_execution_profile: "risk-reviewed",
          requested_execution_timeout_ms: 3000,
          requested_execution_network_policy: "isolated",
          requested_execution_filesystem_policy: "ephemeral",
          effective_execution_class: "microvm",
          execution_executor_ref: "tool:compat-adapter:dify-default",
          execution_sandbox_backend_id: "sandbox-default",
          execution_sandbox_backend_executor_ref: "sandbox-backend:sandbox-default",
          execution_sandbox_runner_kind: "container",
          execution_blocking_reason: null,
          execution_fallback_reason: null,
          response_summary: "tool completed",
          response_content_type: "application/json",
          raw_ref: "artifact://artifact-1"
        }
      ],
      executionFocusSkillTrace: null
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
            node_name: "Tool A",
            node_type: "tool",
            callback_waiting_explanation: {
              primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
              follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
            },
            artifact_refs: ["artifact://artifact-legacy"],
            artifacts: [
              {
                artifact_kind: "tool_result",
                content_type: "application/json",
                summary: "legacy raw payload",
                uri: "artifact://artifact-legacy"
              }
            ],
            tool_calls: [
              {
                id: "tool-call-legacy",
                tool_id: "tool-a",
                tool_name: "Tool A",
                phase: "execute",
                status: "succeeded",
                effective_execution_class: "microvm",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "container",
                response_summary: "legacy completed",
                response_content_type: "application/json",
                raw_ref: "artifact://artifact-legacy"
              }
            ]
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
      executionFocusNodeName: "Tool A",
      executionFocusNodeType: "tool",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
        follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
      },
      executionFocusArtifactCount: 1,
      executionFocusArtifactRefCount: 1,
      executionFocusToolCallCount: 1,
      executionFocusRawRefCount: 1,
      executionFocusArtifactRefs: ["artifact://artifact-legacy"],
      executionFocusArtifacts: [
        {
          artifact_kind: "tool_result",
          content_type: "application/json",
          summary: "legacy raw payload",
          uri: "artifact://artifact-legacy"
        }
      ],
      executionFocusToolCalls: [
        {
          id: "tool-call-legacy",
          tool_id: "tool-a",
          tool_name: "Tool A",
          phase: "execute",
          status: "succeeded",
          effective_execution_class: "microvm",
          execution_sandbox_backend_id: "sandbox-default",
          execution_sandbox_runner_kind: "container",
          execution_blocking_reason: null,
          execution_fallback_reason: null,
          response_summary: "legacy completed",
          response_content_type: "application/json",
          raw_ref: "artifact://artifact-legacy"
        }
      ],
      executionFocusSkillTrace: null
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
            node_name: "Tool A",
            node_type: "tool",
            callback_waiting_explanation: {
              primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
              follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
            },
            artifact_refs: ["artifact://artifact-234"],
            artifacts: [
              {
                artifact_kind: "tool_result",
                content_type: "application/json",
                summary: "tool payload 234",
                uri: "artifact://artifact-234"
              }
            ],
            tool_calls: [
              {
                id: "tool-call-234",
                tool_id: "tool-a",
                tool_name: "Tool A",
                phase: "execute",
                status: "succeeded",
                effective_execution_class: "microvm",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "container",
                response_summary: "tool 234 completed",
                response_content_type: "application/json",
                raw_ref: "artifact://artifact-234"
              }
            ]
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
      executionFocusNodeName: "Tool A",
      executionFocusNodeType: "tool",
      executionFocusExplanation: {
        primary_signal: "执行阻断：当前节点仍在等待审批。",
        follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
      },
      callbackWaitingExplanation: {
        primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
        follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
      },
      executionFocusArtifactCount: 1,
      executionFocusArtifactRefCount: 1,
      executionFocusToolCallCount: 1,
      executionFocusRawRefCount: 1,
      executionFocusArtifactRefs: ["artifact://artifact-234"],
      executionFocusArtifacts: [
        {
          artifact_kind: "tool_result",
          content_type: "application/json",
          summary: "tool payload 234",
          uri: "artifact://artifact-234"
        }
      ],
      executionFocusToolCalls: [
        {
          id: "tool-call-234",
          tool_id: "tool-a",
          tool_name: "Tool A",
          phase: "execute",
          status: "succeeded",
          effective_execution_class: "microvm",
          execution_sandbox_backend_id: "sandbox-default",
          execution_sandbox_runner_kind: "container",
          execution_blocking_reason: null,
          execution_fallback_reason: null,
          response_summary: "tool 234 completed",
          response_content_type: "application/json",
          raw_ref: "artifact://artifact-234"
        }
      ],
      executionFocusSkillTrace: null
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
      executionFocusNodeName: null,
      executionFocusNodeType: null,
      executionFocusExplanation: null,
      callbackWaitingExplanation: null,
      executionFocusArtifactCount: 0,
      executionFocusArtifactRefCount: 0,
      executionFocusToolCallCount: 0,
      executionFocusRawRefCount: 0,
      executionFocusArtifactRefs: [],
      executionFocusArtifacts: [],
      executionFocusToolCalls: [],
      executionFocusSkillTrace: null
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
