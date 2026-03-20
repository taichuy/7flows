import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRunSnapshot,
  normalizeOperatorRunSnapshot
} from "@/app/actions/run-snapshot";

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

  it("normalizeOperatorRunSnapshot 会保留 callback waiting 的定时恢复事实", () => {
    const snapshot = normalizeOperatorRunSnapshot({
      status: "waiting",
      callback_waiting_explanation: {
        primary_signal: "系统已经安排 30s 后再次尝试恢复 callback waiting。",
        follow_up: "下一步：先观察自动恢复链路。"
      },
      callback_waiting_lifecycle: {
        wait_cycle_count: 1,
        issued_ticket_count: 1,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 1,
        max_expired_ticket_count: 3,
        terminated: false,
        termination_reason: null,
        terminated_at: null,
        last_ticket_status: "pending",
        last_ticket_reason: "callback pending",
        last_ticket_updated_at: "2026-03-20T10:00:00Z",
        last_late_callback_status: null,
        last_late_callback_reason: null,
        last_late_callback_at: null,
        last_resume_delay_seconds: 30,
        last_resume_reason: "callback pending",
        last_resume_source: "callback_ticket_monitor",
        last_resume_backoff_attempt: 1
      },
      scheduled_resume_delay_seconds: 30,
      scheduled_resume_reason: "callback pending",
      scheduled_resume_source: "callback_ticket_monitor",
      scheduled_waiting_status: "waiting_callback",
      scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
      scheduled_resume_due_at: "2026-03-20T10:00:30Z",
      scheduled_resume_requeued_at: "2026-03-20T10:01:00Z",
      scheduled_resume_requeue_source: "scheduler_waiting_resume_monitor"
    });

    expect(snapshot).toMatchObject({
      status: "waiting",
      callbackWaitingExplanation: {
        primary_signal: "系统已经安排 30s 后再次尝试恢复 callback waiting。",
        follow_up: "下一步：先观察自动恢复链路。"
      },
      callbackWaitingLifecycle: {
        resume_schedule_count: 1,
        last_resume_delay_seconds: 30,
        last_resume_source: "callback_ticket_monitor"
      },
      scheduledResumeDelaySeconds: 30,
      scheduledResumeReason: "callback pending",
      scheduledResumeSource: "callback_ticket_monitor",
      scheduledWaitingStatus: "waiting_callback",
      scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
      scheduledResumeDueAt: "2026-03-20T10:00:30Z",
      scheduledResumeRequeuedAt: "2026-03-20T10:01:00Z",
      scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
    });
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
                requested_execution_dependency_mode: "builtin",
                requested_execution_builtin_package_set: "research-default",
                requested_execution_backend_extensions: {
                  image: "python:3.12",
                  mount: "workspace"
                },
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
          execution_focus_skill_trace: {
            reference_count: 1,
            phase_counts: {
              main_plan: 1
            },
            source_counts: {
              skill_binding: 1
            },
            loads: [
              {
                phase: "main_plan",
                references: [
                  {
                    skill_id: "skill-ops-review",
                    skill_name: "Ops Review",
                    reference_id: "ref-escalation",
                    reference_name: "Escalation Checklist",
                    load_source: "skill_binding",
                    fetch_reason: null,
                    fetch_request_index: null,
                    fetch_request_total: null,
                    retrieval_http_path: "/api/skills/skill-ops-review/references/ref-escalation",
                    retrieval_mcp_method: "skills.get_reference",
                    retrieval_mcp_params: {
                      skill_id: "skill-ops-review",
                      reference_id: "ref-escalation"
                    }
                  }
                ]
              }
            ]
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

    await expect(fetchRunSnapshot("run-123")).resolves.toMatchObject({
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
          requested_execution_dependency_mode: "builtin",
          requested_execution_builtin_package_set: "research-default",
          requested_execution_backend_extensions: {
            image: "python:3.12",
            mount: "workspace"
          },
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
      executionFocusSkillTrace: {
        reference_count: 1,
        phase_counts: {
          main_plan: 1
        },
        source_counts: {
          skill_binding: 1
        },
        loads: [
          {
            phase: "main_plan",
            references: [
              {
                skill_id: "skill-ops-review",
                skill_name: "Ops Review",
                reference_id: "ref-escalation",
                reference_name: "Escalation Checklist",
                load_source: "skill_binding",
                fetch_reason: null,
                fetch_request_index: null,
                fetch_request_total: null,
                retrieval_http_path: "/api/skills/skill-ops-review/references/ref-escalation",
                retrieval_mcp_method: "skills.get_reference",
                retrieval_mcp_params: {
                  skill_id: "skill-ops-review",
                  reference_id: "ref-escalation"
                }
              }
            ]
          }
        ]
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

    await expect(fetchRunSnapshot("run-legacy")).resolves.toMatchObject({
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
          run_snapshot: {
            status: "waiting",
            workflow_id: "workflow-1",
            current_node_id: "tool-a",
            waiting_reason: "waiting approval",
            execution_focus_reason: "blocked_execution",
            execution_focus_node_id: "tool-a",
            execution_focus_node_run_id: "node-run-1",
            execution_focus_node_name: "Tool A",
            execution_focus_node_type: "tool",
            execution_focus_explanation: {
              primary_signal: "执行阻断：当前节点仍在等待审批。",
              follow_up: "下一步：优先回看审批时间线，而不是只看 waiting reason。"
            },
            callback_waiting_explanation: {
              primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
              follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
            },
            execution_focus_artifact_count: 1,
            execution_focus_artifact_ref_count: 1,
            execution_focus_tool_call_count: 1,
            execution_focus_raw_ref_count: 1,
            execution_focus_artifact_refs: ["artifact://artifact-234"],
            execution_focus_artifacts: [
              {
                artifact_kind: "tool_result",
                content_type: "application/json",
                summary: "tool payload 234",
                uri: "artifact://artifact-234"
              }
            ],
            execution_focus_tool_calls: [
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
          run_follow_up: {
            affected_run_count: 1,
            sampled_run_count: 1
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-234")).resolves.toMatchObject({
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

    await expect(fetchRunSnapshot("run-456")).resolves.toMatchObject({
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
