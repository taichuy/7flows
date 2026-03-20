import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationEntryCard } from "@/components/workflow-publish-invocation-entry-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildInvocationItem(): PublishedEndpointInvocationListResponse["items"][number] {
  return {
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
    run_current_node_id: "legacy-node",
    run_waiting_reason: "legacy waiting reason",
    run_waiting_lifecycle: null,
    run_snapshot: {
      status: "waiting",
      current_node_id: "snapshot-node",
      waiting_reason: "snapshot waiting reason",
      callback_waiting_explanation: {
        primary_signal: "顶层快照说明该 invocation 仍在等待 callback。",
        follow_up: "优先看 snapshot waiting reason 与 callback lifecycle。"
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
    }
  };
}

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: true
  };
}

describe("WorkflowPublishInvocationEntryCard", () => {
  it("renders callback sampled run cards through shared callback waiting follow-up", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item: buildInvocationItem(),
        detailHref: "/published/invocation-1",
        detailActive: false
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).toContain("优先观察定时恢复是否已重新排队");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("requeued by waiting_resume_monitor");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Watch the requeued resume");
    expect(html).toContain("watch the worker consume that attempt before forcing another resume");
    expect(html).not.toContain("Optional callback override");
    expect(html).toContain("snapshot-node");
    expect(html).toContain("snapshot waiting reason");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).not.toContain("legacy-node");
    expect(html).toContain("Waiting node focus evidence");
    expect(html).toContain("Callback recovery checklist");
    expect(html).not.toContain("Sampled run focus evidence");
    expect(html.match(/Focused skill trace/g)?.length ?? 0).toBe(1);
    expect(html).toContain("打开 invocation detail");
  });

  it("prefers the current run sample and surfaces its execution badges before evidence", () => {
    const item = buildInvocationItem();
    const runFollowUp = item.run_follow_up!;
    item.run_follow_up = {
      ...runFollowUp,
      affected_run_count: 2,
      sampled_run_count: 2,
      sampled_runs: [
        {
          run_id: "run-stale-1",
          snapshot: {
            status: "waiting",
            current_node_id: "stale-node",
            waiting_reason: "stale callback pending",
            execution_focus_node_id: "stale-node",
            execution_focus_node_run_id: "node-run-stale",
            execution_focus_node_name: "Stale wait",
            callback_waiting_explanation: {
              primary_signal: "stale callback blocker",
              follow_up: "stale callback follow-up"
            },
            execution_focus_tool_calls: [
              {
                id: "tool-call-stale",
                tool_id: "callback.wait.stale",
                tool_name: "Callback Wait Stale",
                phase: "execute",
                status: "waiting",
                effective_execution_class: "host",
                execution_executor_ref: "tool:stale-host",
                execution_sandbox_backend_id: "sandbox-stale",
                execution_sandbox_runner_kind: "process"
              }
            ]
          }
        },
        ...runFollowUp.sampled_runs
      ]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: false
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).not.toContain("stale callback blocker");
    expect(html).not.toContain("tool:stale-host");
    expect(html).not.toContain("run-stale-1");
    expect(html.indexOf("effective sandbox")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Waiting node focus evidence")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("effective sandbox")).toBeLessThan(html.indexOf("Waiting node focus evidence"));
  });

  it("hides duplicate header snapshot and waiting recommendation when a sampled callback summary is present", () => {
    const item = buildInvocationItem();
    item.execution_focus_explanation = {
      primary_signal: "顶层 execution focus 仍在等待 callback。",
      follow_up: "顶层 execution focus 建议先观察重排队。"
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: false
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("本次影响 1 个 run；已回读 1 个样本。");
    expect(html).not.toContain("顶层 execution focus 仍在等待 callback。");
    expect(html).not.toContain("顶层 execution focus 建议先观察重排队。");
    expect(html).not.toContain("顶层快照说明该 invocation 仍在等待 callback。");
    expect(html).not.toContain("优先看 snapshot waiting reason 与 callback lifecycle。");
    expect(html).not.toContain("当前 run 状态：waiting。");
    expect(html).not.toContain("run run-callback-1：继续观察 callback waiting。");
  });

  it("prioritizes approval blocker inbox links when waiting lifecycle exposes sensitive-access blockers", () => {
    const item = buildInvocationItem();
    item.callback_waiting_explanation = {
      primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
      follow_up: "先处理审批票据，再观察 waiting 节点是否恢复。"
    };
    item.run_waiting_lifecycle = {
      node_run_id: "node-run-tool-wait",
      node_status: "waiting_callback",
      waiting_reason: "approval pending",
      callback_ticket_count: 1,
      callback_ticket_status_counts: { pending: 1 },
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
      callback_waiting_explanation: item.callback_waiting_explanation,
      sensitive_access_summary: {
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0
      },
      scheduled_resume_delay_seconds: 45,
      scheduled_resume_source: "callback_ticket_monitor",
      scheduled_waiting_status: "waiting_callback",
      scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
      scheduled_resume_due_at: "2026-03-20T10:00:45Z",
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: false
      })
    );

    expect(html).toContain("approval blocker");
    expect(html).toContain("open blocker inbox slice");
    expect(html).toContain("run_id=run-callback-1");
    expect(html).toContain("node_run_id=node-run-tool-wait");
    expect(html).not.toContain("open waiting inbox");
  });

  it("uses shared entry CTA and error prefix copy", () => {
    const item = buildInvocationItem();
    item.error_message = "sandbox backend offline during invocation";

    const inactiveHtml = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: false
      })
    );

    const activeHtml = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: true
      })
    );

    expect(inactiveHtml).toContain("打开 invocation detail");
    expect(activeHtml).toContain("查看当前详情");
    expect(inactiveHtml).toContain("error: sandbox backend offline during invocation");
  });

  it("shows live sandbox readiness when the sampled run carries a blocked strong-isolation snapshot", () => {
    const item = buildInvocationItem();
    item.run_follow_up = {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 0,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 1,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "sampled run blocked by sandbox availability",
        follow_up: "check sandbox readiness"
      },
      sampled_runs: [
        {
          run_id: "run-callback-1",
          snapshot: {
            status: "failed",
            current_node_id: "tool_wait",
            waiting_reason: null,
            execution_focus_node_id: "tool_wait",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Tool wait",
            execution_focus_node_type: "tool",
            execution_focus_explanation: {
              primary_signal: "strong isolation failed on historical run",
              follow_up: "compare with live readiness"
            },
            execution_focus_tool_calls: [
              {
                id: "tool-call-1",
                tool_id: "callback.wait",
                tool_name: "Callback Wait",
                phase: "execute",
                status: "failed",
                requested_execution_class: "sandbox",
                effective_execution_class: "inline",
                execution_executor_ref: "tool:compat-adapter:dify-default",
                execution_sandbox_backend_id: "sandbox-stale",
                execution_sandbox_runner_kind: "container",
                execution_blocking_reason: "No compatible sandbox backend is available."
              }
            ]
          }
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationEntryCard, {
        item,
        detailHref: "/published/invocation-1",
        detailActive: false,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("execution focus");
    expect(html).toContain("open run");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 已 ready。");
    expect(html).toContain("历史 run 记录的 backend 是 sandbox-stale");
    expect(html).toContain("compare with live readiness");
  });
});
