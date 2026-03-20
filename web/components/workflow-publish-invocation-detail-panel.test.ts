import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationDetailPanel } from "@/components/workflow-publish-invocation-detail-panel";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-diagnostics-execution/execution-node-card", () => ({
  ExecutionNodeCard: () => createElement("div", { "data-testid": "execution-node-card" })
}));

vi.mock("@/components/sensitive-access-timeline-entry-list", () => ({
  SensitiveAccessTimelineEntryList: () =>
    createElement("div", { "data-testid": "sensitive-access-timeline-entry-list" })
}));

vi.mock("@/components/tool-governance-summary", () => ({
  ToolGovernanceSummary: () => createElement("div", { "data-testid": "tool-governance-summary" })
}));

vi.mock("@/components/workflow-publish-invocation-callback-section", () => ({
  WorkflowPublishInvocationCallbackSection: () =>
    createElement("div", { "data-testid": "workflow-publish-invocation-callback-section" })
}));

function buildDetail(): PublishedEndpointInvocationDetailResponse {
  return {
    invocation: {
      id: "invocation-1",
      workflow_id: "workflow-1",
      binding_id: "binding-1",
      endpoint_id: "endpoint-1",
      endpoint_alias: "alias-1",
      route_path: "/published/test",
      protocol: "openai",
      auth_mode: "api_key",
      request_source: "workflow",
      request_surface: "native.workflow",
      status: "succeeded",
      cache_status: "miss",
      request_preview: {
        key_count: 1,
        keys: ["query"]
      },
      response_preview: {
        ok: true
      },
      created_at: "2026-03-20T10:00:00Z",
      finished_at: "2026-03-20T10:00:01Z",
      duration_ms: 1000,
      error_message: null,
      reason_code: null,
      api_key_name: null,
      api_key_prefix: null,
      run_id: "run-callback-1",
      run_status: "running",
      run_current_node_id: "legacy-invocation-node",
      run_waiting_reason: "legacy invocation waiting reason",
      run_waiting_lifecycle: null,
      run_follow_up: {
        affected_run_count: 1,
        sampled_run_count: 1,
        waiting_run_count: 1,
        running_run_count: 0,
        succeeded_run_count: 0,
        failed_run_count: 0,
        unknown_run_count: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-callback-1：继续观察 callback waiting。"
        },
        sampled_runs: [
          {
            run_id: "run-callback-1",
            snapshot: {
              status: "waiting",
              current_node_id: "tool_wait",
              waiting_reason: "callback pending",
              execution_focus_node_id: "tool_wait",
              execution_focus_node_run_id: "node-run-tool-wait",
              execution_focus_node_name: "Tool wait",
              callback_waiting_explanation: {
                primary_signal: "当前 waiting 节点仍在等待 callback。",
                follow_up: "优先观察定时恢复是否已重新排队。"
              },
              callback_waiting_lifecycle: {
                wait_cycle_count: 1,
                issued_ticket_count: 1,
                expired_ticket_count: 0,
                consumed_ticket_count: 0,
                canceled_ticket_count: 0,
                late_callback_count: 0,
                resume_schedule_count: 1,
                max_expired_ticket_count: 0,
                terminated: false,
                last_resume_delay_seconds: 45,
                last_resume_source: "callback_ticket_monitor",
                last_resume_backoff_attempt: 0
              },
              scheduled_resume_delay_seconds: 45,
              scheduled_resume_source: "callback_ticket_monitor",
              scheduled_waiting_status: "waiting_callback",
              scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
              scheduled_resume_due_at: "2026-03-20T10:00:45Z",
              scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
              scheduled_resume_requeue_source: "waiting_resume_monitor",
              execution_focus_artifact_count: 1,
              execution_focus_artifact_ref_count: 1,
              execution_focus_tool_call_count: 1,
              execution_focus_artifact_refs: ["artifact://callback-artifact"],
              execution_focus_tool_calls: [
                {
                  id: "tool-call-1",
                  tool_id: "callback.wait",
                  tool_name: "Callback Wait",
                  phase: "execute",
                  status: "waiting",
                  effective_execution_class: "sandbox",
                  execution_sandbox_backend_id: "sandbox-default",
                  response_summary: "callback payload 已写入 artifact",
                  raw_ref: "artifact://callback-tool-raw"
                }
              ],
              execution_focus_skill_trace: {
                reference_count: 1,
                phase_counts: {
                  plan: 1
                },
                source_counts: {
                  explicit: 1
                },
                loads: [
                  {
                    phase: "plan",
                    references: [
                      {
                        skill_id: "skill-callback",
                        skill_name: "Callback skill",
                        reference_id: "ref-1",
                        reference_name: "Callback recovery checklist",
                        load_source: "explicit",
                        retrieval_mcp_params: {}
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]
      },
      execution_focus_explanation: null,
      callback_waiting_explanation: null
    },
    run: {
      id: "run-callback-1",
      status: "running",
      current_node_id: "legacy-run-node",
      created_at: "2026-03-20T10:00:00Z"
    },
    run_snapshot: {
      status: "waiting",
      current_node_id: "detail-snapshot-node",
      waiting_reason: "detail snapshot waiting reason",
      callback_waiting_explanation: {
        primary_signal: "详情顶层快照确认当前仍在等待 callback。",
        follow_up: "先看 waiting reason，再结合 callback summary。"
      }
    },
    run_follow_up: {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-callback-1：继续观察 callback waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-callback-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            execution_focus_node_id: "tool_wait",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Tool wait",
            callback_waiting_explanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            },
            callback_waiting_lifecycle: {
              wait_cycle_count: 1,
              issued_ticket_count: 1,
              expired_ticket_count: 0,
              consumed_ticket_count: 0,
              canceled_ticket_count: 0,
              late_callback_count: 0,
              resume_schedule_count: 1,
              max_expired_ticket_count: 0,
              terminated: false,
              last_resume_delay_seconds: 45,
              last_resume_source: "callback_ticket_monitor",
              last_resume_backoff_attempt: 0
            },
            scheduled_resume_delay_seconds: 45,
            scheduled_resume_source: "callback_ticket_monitor",
            scheduled_waiting_status: "waiting_callback",
            scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
            scheduled_resume_due_at: "2026-03-20T10:00:45Z",
            scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
            scheduled_resume_requeue_source: "waiting_resume_monitor",
            execution_focus_artifact_count: 1,
            execution_focus_artifact_ref_count: 1,
            execution_focus_tool_call_count: 1,
            execution_focus_artifact_refs: ["artifact://callback-artifact"],
            execution_focus_tool_calls: [
              {
                id: "tool-call-1",
                tool_id: "callback.wait",
                tool_name: "Callback Wait",
                phase: "execute",
                status: "waiting",
                effective_execution_class: "sandbox",
                execution_executor_ref: "tool:compat-adapter:dify-default",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "container",
                response_summary: "callback payload 已写入 artifact",
                raw_ref: "artifact://callback-tool-raw"
              }
            ],
            execution_focus_skill_trace: {
              reference_count: 1,
              phase_counts: {
                plan: 1
              },
              source_counts: {
                explicit: 1
              },
              loads: [
                {
                  phase: "plan",
                  references: [
                    {
                      skill_id: "skill-callback",
                      skill_name: "Callback skill",
                      reference_id: "ref-1",
                      reference_name: "Callback recovery checklist",
                      load_source: "explicit",
                      retrieval_mcp_params: {}
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    },
    callback_tickets: [],
    blocking_node_run_id: null,
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    callback_waiting_explanation: null,
    skill_trace: null,
    blocking_sensitive_access_entries: [],
    sensitive_access_entries: [],
    cache: {
      cache_status: "miss",
      cache_key: null,
      cache_entry_id: null,
      inventory_entry: null
    }
  };
}

const callbackWaitingAutomation: CallbackWaitingAutomationCheck = {
  status: "healthy",
  scheduler_required: true,
  detail: "callback automation healthy",
  scheduler_health_status: "healthy",
  scheduler_health_detail: "scheduler ok",
  steps: []
};

describe("WorkflowPublishInvocationDetailPanel", () => {
  it("renders sampled callback runs with shared callback waiting summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail: buildDetail(),
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).toContain("优先观察定时恢复是否已重新排队");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("requeued by waiting_resume_monitor");
    expect(html).toContain("detail-snapshot-node");
    expect(html).toContain("detail snapshot waiting reason");
    expect(html).not.toContain("legacy-run-node");
    expect(html).toContain("Waiting node focus evidence");
    expect(html).toContain("Callback recovery checklist");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).not.toContain("Sampled run focus evidence");
    expect(html.match(/Focused skill trace/g)?.length ?? 0).toBe(1);
  });
});
