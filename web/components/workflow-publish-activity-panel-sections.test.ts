import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  WorkflowPublishActivityDetails,
  WorkflowPublishActivityInsights
} from "@/components/workflow-publish-activity-panel-sections";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason: "No sandbox backend is currently enabled."
      }
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false
  };
}

function buildInvocationAudit(): PublishedEndpointInvocationListResponse {
  return {
    filters: {},
    summary: {
      total_count: 4,
      succeeded_count: 1,
      failed_count: 2,
      rejected_count: 1,
      cache_hit_count: 0,
      cache_miss_count: 0,
      cache_bypass_count: 0,
      last_invoked_at: "2026-03-21T00:15:00Z",
      last_status: "failed",
      last_cache_status: "miss",
      last_run_id: "run-1",
      last_run_status: "failed",
      last_reason_code: "runtime_failed"
    },
    facets: {
      status_counts: [],
      request_source_counts: [],
      request_surface_counts: [],
      cache_status_counts: [],
      run_status_counts: [],
      reason_counts: [
        { value: "runtime_failed", count: 2 },
        { value: "rate_limit_exceeded", count: 1 }
      ],
      api_key_usage: [],
      recent_failure_reasons: [
        {
          message: "sandbox backend offline during invocation",
          count: 2,
          last_invoked_at: "2026-03-21T00:15:00Z"
        }
      ],
      timeline_granularity: "hour",
      timeline: []
    },
    items: []
  };
}

function buildRateLimitWindowAudit(): PublishedEndpointInvocationListResponse {
  return {
    filters: {
      created_from: "2026-03-21T00:00:00Z"
    },
    summary: {
      total_count: 4,
      succeeded_count: 1,
      failed_count: 2,
      rejected_count: 1,
      cache_hit_count: 0,
      cache_miss_count: 0,
      cache_bypass_count: 0
    },
    facets: {
      status_counts: [],
      request_source_counts: [],
      request_surface_counts: [],
      cache_status_counts: [],
      run_status_counts: [],
      reason_counts: [],
      api_key_usage: [],
      recent_failure_reasons: [],
      timeline_granularity: "hour",
      timeline: []
    },
    items: []
  };
}

function buildSelectedInvocationDetail(): PublishedEndpointInvocationDetailResponse {
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
      status: "failed",
      cache_status: "miss",
      request_preview: { key_count: 1, keys: ["query"] },
      response_preview: { ok: false },
      created_at: "2026-03-21T00:10:00Z",
      finished_at: "2026-03-21T00:10:01Z",
      duration_ms: 1000,
      error_message: "sandbox backend offline during invocation",
      reason_code: "runtime_failed",
      api_key_name: null,
      api_key_prefix: null,
      run_id: "run-selected-1",
      run_status: "waiting",
      run_current_node_id: "tool_wait",
      run_waiting_reason: "callback pending",
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
          follow_up: "run run-selected-1：继续观察 callback waiting。"
        },
        sampled_runs: [
          {
            run_id: "run-selected-1",
            snapshot: {
              status: "waiting",
              current_node_id: "tool_wait",
              waiting_reason: "callback pending",
              callback_waiting_explanation: {
                primary_signal: "当前 waiting 节点仍在等待 callback。",
                follow_up: "优先观察定时恢复是否已重新排队。"
              }
            }
          }
        ]
      }
    },
    run: {
      id: "run-selected-1",
      status: "waiting",
      current_node_id: "tool_wait",
      started_at: "2026-03-21T00:10:00Z",
      finished_at: null
    } as never,
    run_snapshot: null,
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
        follow_up: "run run-selected-1：继续观察 callback waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-selected-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            callback_waiting_explanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            }
          }
        }
      ]
    },
    callback_tickets: [],
    blocking_node_run_id: "node-run-wait",
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    callback_waiting_explanation: {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。"
    },
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

describe("WorkflowPublishActivityInsights", () => {
  it("explains rate-limit pressure and runtime failures against live sandbox readiness", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: {
            requests: 3,
            windowSeconds: 60
          }
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit: buildInvocationAudit(),
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("quota hit 与执行链路异常拆开排查");
    expect(html).toContain("结合 live sandbox readiness");
    expect(html).toContain("强隔离 execution class 会 fail-closed");
  });

  it("shows live diagnosis inside failure reason cards", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAudit(),
        selectedInvocationId: null,
        selectedInvocationDetail: null,
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        sandboxReadiness: buildSandboxReadiness(),
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Failure reason");
    expect(html).toContain("当前 live sandbox readiness 仍在报警");
    expect(html).toContain("先确认强隔离 backend / capability 是否仍 blocked");
  });

  it("bridges selected invocation next step into activity details", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAudit(),
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: buildSelectedInvocationDetail()
        },
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        sandboxReadiness: buildSandboxReadiness(),
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open blocker inbox slice");
    expect(html).toContain("优先处理 blocker inbox，再观察 waiting 节点是否恢复。");
  });
});
