import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRunSnapshotWithContext,
  fetchRunSnapshots,
  fetchRunSnapshot,
  normalizeOperatorRunFollowUp,
  normalizeOperatorRunSnapshot,
  resolveCanonicalOperatorRunSnapshot
} from "@/app/actions/run-snapshot";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

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

  it("resolveCanonicalOperatorRunSnapshot 优先使用 run_snapshot，缺失时回退到同响应里的 sampled run snapshot", () => {
    expect(
      resolveCanonicalOperatorRunSnapshot({
        runId: "run-1",
        runSnapshot: {
          workflow_id: "workflow-direct",
          status: "running",
          current_node_id: "review"
        },
        runFollowUp: {
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "workflow-sampled",
                status: "waiting",
                current_node_id: "approval_gate"
              }
            }
          ]
        }
      })
    ).toMatchObject({
      workflowId: "workflow-direct",
      status: "running",
      currentNodeId: "review"
    });

    expect(
      resolveCanonicalOperatorRunSnapshot({
        runId: "run-1",
        runSnapshot: null,
        runFollowUp: {
          sampled_runs: [
            {
              run_id: "run-2",
              snapshot: {
                workflow_id: "workflow-other",
                status: "failed",
                current_node_id: "other"
              }
            },
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "workflow-sampled",
                status: "waiting",
                current_node_id: "approval_gate",
                waiting_reason: "waiting approval"
              }
            }
          ]
        }
      })
    ).toMatchObject({
      workflowId: "workflow-sampled",
      status: "waiting",
      currentNodeId: "approval_gate",
      waitingReason: "waiting approval"
    });
  });

  it("normalizeOperatorRunFollowUp 会保留 sampled run 的 callback 与审批上下文", () => {
    const legacyAuthGovernance = buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "workflow-sampled",
        workflow_name: "Sampled Workflow"
      }
    });
    const summary = normalizeOperatorRunFollowUp({
      sampled_runs: [
        {
          run_id: "run-1",
          snapshot: {
            workflow_id: "workflow-sampled",
            status: "waiting",
            current_node_id: "approval_gate"
          },
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacy_auth_governance: legacyAuthGovernance,
          callback_tickets: [
            {
              ticket: "callback-ticket-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              tool_call_index: 0,
              created_at: "2026-03-20T10:00:00Z"
            }
          ],
          sensitive_access_entries: [
            {
              request: {
                id: "request-1",
                run_id: "run-1",
                node_run_id: "node-run-1"
              },
              approval_ticket: {
                id: "approval-ticket-1",
                access_request_id: "request-1",
                run_id: "run-1",
                node_run_id: "node-run-1",
                status: "pending",
                waiting_status: "waiting",
                created_at: "2026-03-20T10:00:00Z"
              },
              notifications: []
            }
          ]
        }
      ]
    } as unknown as Parameters<typeof normalizeOperatorRunFollowUp>[0]);

    expect(summary?.sampledRuns[0]).toMatchObject({
      runId: "run-1",
      toolGovernance: {
        missing_tool_ids: ["native.catalog-gap"]
      },
      legacyAuthGovernance: {
        binding_count: 1,
        workflows: [
          expect.objectContaining({ workflow_id: "workflow-sampled" })
        ]
      },
      callbackTickets: [
        expect.objectContaining({
          ticket: "callback-ticket-1",
          node_run_id: "node-run-1"
        })
      ],
      sensitiveAccessEntries: [
        expect.objectContaining({
          approval_ticket: expect.objectContaining({
            id: "approval-ticket-1"
          })
        })
      ]
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

  it("execution view 提供 canonical snapshot 时不再混拼旧版 body 的 focus 字段", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-conflict")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-1",
          current_node_id: "tool-a",
          execution_focus_reason: "waiting_callback",
          execution_focus_node: {
            node_id: "legacy-node",
            node_run_id: "node-run-legacy"
          },
          node_runs: [
            {
              node_id: "tool-a",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-conflict/execution-view")) {
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
            execution_focus_artifact_count: 0,
            execution_focus_artifact_ref_count: 0,
            execution_focus_tool_call_count: 1,
            execution_focus_raw_ref_count: 0,
            execution_focus_artifact_refs: [],
            execution_focus_artifacts: [],
            execution_focus_tool_calls: [
              {
                id: "tool-call-1",
                tool_id: "tool-a",
                tool_name: "Tool A",
                phase: "execute",
                status: "blocked",
                effective_execution_class: "microvm",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "container",
                execution_blocking_reason: "still waiting approval",
                response_summary: null,
                response_content_type: null,
                raw_ref: null
              }
            ]
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshot("run-conflict")).resolves.toMatchObject({
      status: "waiting",
      workflowId: "workflow-1",
      currentNodeId: "tool-a",
      waitingReason: "waiting approval",
      executionFocusReason: "blocked_execution",
      executionFocusNodeId: "tool-a",
      executionFocusNodeRunId: "node-run-1",
      executionFocusNodeName: "Tool A",
      executionFocusNodeType: "tool"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetchRunSnapshotWithContext 会在 canonical run detail 下继续保留 sampled run 的 callback 与审批上下文", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-context")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-ctx",
          current_node_id: "approval_gate",
          execution_focus_reason: "waiting_callback",
          execution_focus_node: {
            node_id: "approval_gate",
            node_run_id: "node-run-ctx",
            node_name: "Approval Gate",
            node_type: "tool",
            callback_waiting_explanation: {
              primary_signal: "当前 run 已有 canonical callback waiting snapshot。",
              follow_up: "仍需把 operator 带回 inbox slice。"
            },
            artifact_refs: [],
            artifacts: [],
            tool_calls: []
          },
          execution_focus_explanation: {
            primary_signal: "执行焦点已经稳定定位到 approval_gate。",
            follow_up: "下一步仍是回 inbox。"
          },
          execution_focus_skill_trace: null,
          node_runs: [
            {
              node_id: "approval_gate",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-context/execution-view")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-ctx",
          run_follow_up: {
            affected_run_count: 1,
            sampled_run_count: 1,
            sampled_runs: [
              {
                run_id: "run-context",
                callback_tickets: [
                  {
                    ticket: "callback-ticket-ctx",
                    run_id: "run-context",
                    node_run_id: "node-run-ctx",
                    status: "pending",
                    waiting_status: "waiting",
                    tool_call_index: 0,
                    created_at: "2026-03-20T10:00:00Z"
                  }
                ],
                sensitive_access_entries: [
                  {
                    request: {
                      id: "request-ctx",
                      run_id: "run-context",
                      node_run_id: "node-run-ctx"
                    },
                    approval_ticket: {
                      id: "approval-ticket-ctx",
                      access_request_id: "request-ctx",
                      run_id: "run-context",
                      node_run_id: "node-run-ctx",
                      status: "pending",
                      waiting_status: "waiting",
                      created_at: "2026-03-20T10:00:00Z"
                    },
                    notifications: []
                  }
                ]
              }
            ]
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshotWithContext("run-context")).resolves.toMatchObject({
      runId: "run-context",
      snapshot: {
        workflowId: "workflow-ctx",
        currentNodeId: "approval_gate",
        executionFocusNodeRunId: "node-run-ctx",
        callbackWaitingExplanation: {
          primary_signal: "当前 run 已有 canonical callback waiting snapshot。",
          follow_up: "仍需把 operator 带回 inbox slice。"
        }
      },
      callbackTickets: [
        {
          ticket: "callback-ticket-ctx"
        }
      ],
      sensitiveAccessEntries: [
        {
          request: {
            id: "request-ctx"
          },
          approval_ticket: {
            id: "approval-ticket-ctx"
          }
        }
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetchRunSnapshots 不再把 sampled run 的 callback 与审批上下文清空", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-batch")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-batch",
          current_node_id: "approval_gate",
          execution_focus_reason: "waiting_callback",
          execution_focus_node: {
            node_id: "approval_gate",
            node_run_id: "node-run-batch",
            node_name: "Approval Gate",
            node_type: "tool",
            callback_waiting_explanation: {
              primary_signal: "当前 run 仍在 waiting callback。",
              follow_up: "需要继续保留 inbox context。"
            },
            artifact_refs: [],
            artifacts: [],
            tool_calls: []
          },
          execution_focus_explanation: null,
          execution_focus_skill_trace: null,
          node_runs: [
            {
              node_id: "approval_gate",
              waiting_reason: "waiting approval"
            }
          ]
        });
      }

      if (url.endsWith("/api/runs/run-batch/execution-view")) {
        return createJsonResponse({
          status: "waiting",
          workflow_id: "workflow-batch",
          run_follow_up: {
            affected_run_count: 1,
            sampled_run_count: 1,
            sampled_runs: [
              {
                run_id: "run-batch",
                callback_tickets: [
                  {
                    ticket: "callback-ticket-batch",
                    run_id: "run-batch",
                    node_run_id: "node-run-batch",
                    status: "pending",
                    waiting_status: "waiting",
                    tool_call_index: 0,
                    created_at: "2026-03-20T10:00:00Z"
                  }
                ],
                sensitive_access_entries: [
                  {
                    request: {
                      id: "request-batch",
                      run_id: "run-batch",
                      node_run_id: "node-run-batch"
                    },
                    approval_ticket: {
                      id: "approval-ticket-batch",
                      access_request_id: "request-batch",
                      run_id: "run-batch",
                      node_run_id: "node-run-batch",
                      status: "pending",
                      waiting_status: "waiting",
                      created_at: "2026-03-20T10:00:00Z"
                    },
                    notifications: []
                  }
                ]
              }
            ]
          }
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRunSnapshots(["run-batch"]))
      .resolves.toMatchObject([
        {
          runId: "run-batch",
          callbackTickets: [
            {
              ticket: "callback-ticket-batch"
            }
          ],
          sensitiveAccessEntries: [
            {
              approval_ticket: {
                id: "approval-ticket-batch"
              }
            }
          ]
        }
      ]);
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
