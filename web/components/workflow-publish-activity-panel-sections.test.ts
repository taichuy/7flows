import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  WorkflowPublishActivityDetails,
  WorkflowPublishActivityInsights
} from "@/components/workflow-publish-activity-panel-sections";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/sensitive-access-blocked-card", () => ({
  SensitiveAccessBlockedCard: ({
    title,
    summary,
    sandboxReadiness
  }: {
    title: string;
    summary?: string;
    sandboxReadiness?: SandboxReadinessCheck | null;
  }) =>
    createElement(
      "div",
      null,
      `${title} :: ${summary ?? ""} :: sandbox:${sandboxReadiness?.execution_classes?.[0]?.execution_class ?? "none"}`
    )
}));

vi.mock("@/components/workflow-publish-invocation-entry-card", () => ({
  WorkflowPublishInvocationEntryCard: () =>
    createElement("div", { "data-testid": "workflow-publish-invocation-entry-card" })
}));

vi.mock("@/components/workflow-publish-invocation-detail-panel", () => ({
  WorkflowPublishInvocationDetailPanel: ({
    selectedNextStepSurface
  }: {
    selectedNextStepSurface?: {
      title?: string;
      label?: string;
      hrefLabel?: string;
      detail?: string;
    } | null;
  }) =>
    createElement(
      "div",
      { "data-testid": "workflow-publish-invocation-detail-panel" },
      [
        selectedNextStepSurface?.title,
        selectedNextStepSurface?.label,
        selectedNextStepSurface?.hrefLabel,
        selectedNextStepSurface?.detail
      ]
        .filter(Boolean)
        .join(" :: ")
    )
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

function buildCallbackWaitingAutomation(
  overrides: Partial<CallbackWaitingAutomationCheck> = {}
): CallbackWaitingAutomationCheck {
  return {
    status: "disabled",
    scheduler_required: false,
    detail: "disabled in test",
    scheduler_health_status: "idle",
    scheduler_health_detail: "not configured",
    steps: [],
    ...overrides
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

function buildInvocationAuditWithTrafficMix(): PublishedEndpointInvocationListResponse {
  return {
    ...buildInvocationAudit(),
    facets: {
      ...buildInvocationAudit().facets,
      request_source_counts: [
        { value: "workflow", count: 3 },
        { value: "alias", count: 1 },
        { value: "path", count: 2 }
      ],
      request_surface_counts: [
        { value: "openai.responses", count: 2 },
        { value: "native.workflow", count: 1 }
      ],
      cache_status_counts: [
        { value: "hit", count: 2 },
        { value: "miss", count: 1 }
      ],
      run_status_counts: [
        { value: "failed", count: 2 },
        { value: "waiting_callback", count: 1 }
      ]
    }
  };
}

function buildInvocationAuditWithApiKeyUsage(): PublishedEndpointInvocationListResponse {
  return {
    ...buildInvocationAudit(),
    facets: {
      ...buildInvocationAudit().facets,
      api_key_usage: [
        {
          api_key_id: "key-1",
          name: "Primary Key",
          key_prefix: null,
          status: "active",
          invocation_count: 3,
          succeeded_count: 1,
          failed_count: 1,
          rejected_count: 1,
          last_invoked_at: "2026-03-21T00:16:00Z",
          last_status: "failed"
        }
      ]
    }
  };
}

function buildInvocationAuditWithApiKeyUsageFallbackStatus(): PublishedEndpointInvocationListResponse {
  return {
    ...buildInvocationAudit(),
    facets: {
      ...buildInvocationAudit().facets,
      api_key_usage: [
        {
          api_key_id: "key-2",
          name: null,
          key_prefix: null,
          status: null,
          invocation_count: 1,
          succeeded_count: 0,
          failed_count: 0,
          rejected_count: 0,
          last_invoked_at: "2026-03-21T00:16:00Z",
          last_status: null
        }
      ]
    }
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

function buildSampleApprovalEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      requester_type: "human",
      requester_id: "ops-reviewer",
      resource_id: "resource-1",
      action_type: "read",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "approval_required_high_risk",
      reason_label: "Approval required",
      policy_summary: "High risk resource requires approval",
      created_at: "2026-03-21T00:00:00Z",
      decided_at: null,
      purpose_text: null
    },
    resource: {
      id: "resource-1",
      label: "Sensitive approval",
      description: "Approval required resource",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {},
      created_at: "2026-03-21T00:00:00Z",
      updated_at: "2026-03-21T00:05:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      status: "pending",
      waiting_status: "waiting",
      created_at: "2026-03-21T00:00:00Z",
      decided_at: null,
      expires_at: null,
      approved_by: null
    },
    notifications: []
  };
}

function buildBlockedPayload(): SensitiveAccessBlockingPayload {
  return {
    detail: "Invocation detail is guarded by sensitive access control.",
    resource: {
      id: "resource-1",
      label: "Invocation detail",
      description: "Protected invocation detail payload",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {}
    },
    access_request: {
      id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      requester_type: "human",
      requester_id: "ops-reviewer",
      resource_id: "resource-1",
      action_type: "read",
      decision: "require_approval",
      reason_code: "approval_required_high_sensitive_access",
      policy_summary: null
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "审批票据仍在等待处理。",
      follow_up: "先处理审批票据，再申请查看 invocation detail。"
    },
    run_snapshot: null,
    run_follow_up: null
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
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("quota hit 与执行链路异常拆开排查");
    expect(html).toContain("结合 live sandbox readiness");
    expect(html).toContain("强隔离 execution class 会 fail-closed");
    expect(html).toContain("Last run status");
    expect(html).toContain("Waiting follow-up");
    expect(html).toContain("Rate limit window");
    expect(html).toContain("Issue signals");
  });

  it("bridges selected invocation next step into issue signals when failure matches", () => {
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
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: buildSelectedInvocationDetail()
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("Issue signals");
    expect(html).toContain("当前打开的 invocation-1 已对齐聚合 failure reason");
    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("优先处理 blocker inbox，再观察 waiting 节点是否恢复。");
    expect(html).toContain("open blocker inbox slice");
  });

  it("bridges selected invocation next step into issue signals when a secondary failure reason matches", () => {
    const invocationAudit = buildInvocationAudit();
    invocationAudit.facets.recent_failure_reasons = [
      {
        message: "quota hit before runtime failed",
        count: 1,
        last_invoked_at: "2026-03-21T00:16:00Z"
      },
      {
        message: "sandbox backend offline during invocation",
        count: 2,
        last_invoked_at: "2026-03-21T00:15:00Z"
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: {
            requests: 3,
            windowSeconds: 60
          }
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit,
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: buildSelectedInvocationDetail()
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("Issue signals");
    expect(html).toContain("当前打开的 invocation-1 已对齐聚合 failure reason");
    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open blocker inbox slice");
  });

  it("bridges sampled approval ticket ids into issue-signal CTA when top-level blocker scope is generic", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

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
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: detail
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("open blocker inbox slice");
    expect(html).toContain("approval_ticket_id=ticket-1");
  });

  it("reuses shared callback recovery CTA inside waiting follow-up", () => {
    const invocationAudit = buildInvocationAudit();
    invocationAudit.summary.last_run_status = "waiting_callback";
    invocationAudit.facets.run_status_counts = [{ value: "waiting_callback", count: 2 }];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: null
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit,
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation({
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          }
        }),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("当前 callback recovery 仍影响 3 个 run / 2 个 workflow");
    expect(html).toContain("Open run library");
    expect(html).toContain('/runs?focus=callback-waiting');
  });

  it("reuses approval inbox CTA inside waiting follow-up when waiting input is blocked on approvals", () => {
    const invocationAudit = buildInvocationAudit();
    invocationAudit.summary.last_run_status = "waiting_input";
    invocationAudit.summary.approval_ticket_count = 2;
    invocationAudit.summary.pending_approval_count = 2;
    invocationAudit.summary.approved_approval_count = 0;
    invocationAudit.summary.rejected_approval_count = 0;
    invocationAudit.summary.expired_approval_count = 0;
    invocationAudit.summary.pending_notification_count = 0;
    invocationAudit.summary.delivered_notification_count = 0;
    invocationAudit.summary.failed_notification_count = 0;
    invocationAudit.facets.run_status_counts = [{ value: "waiting_input", count: 2 }];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: null
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit,
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("2 approval tickets are still pending in sensitive access inbox");
    expect(html).toContain("open approval inbox slice");
    expect(html).toContain('/sensitive-access?status=pending');
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
        sandboxReadiness: {
          ...buildSandboxReadiness(),
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            label: "Open workflow library",
            href: "/workflows?execution=sandbox",
            entry_key: "workflowLibrary"
          }
        },
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Failure reason");
    expect(html).toContain("当前 live sandbox readiness 仍在报警");
    expect(html).toContain("优先回到 workflow library 处理强隔离 execution class 与隔离需求");
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution=sandbox');
  });

  it("uses shared activity details copy for API key usage and failure cards", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAuditWithApiKeyUsage(),
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

    expect(html).toContain("Primary Key");
    expect(html).toContain("no-prefix");
    expect(html).toContain("Calls");
    expect(html).toContain("Status mix");
    expect(html).toContain("ok 1 / failed 1 / rejected 1");
    expect(html).toContain("Failure reason");
    expect(html).toContain("count 2");
  });

  it("uses shared activity insights copy for publish summary labels", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: null
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit: buildInvocationAudit(),
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("Total calls");
    expect(html).toContain("Succeeded");
    expect(html).toContain("Failed");
    expect(html).toContain("Rejected");
    expect(html).toContain("Last run status");
    expect(html).toContain("Run failed");
    expect(html).toContain("Waiting now");
    expect(html).toContain("Cache hit 0 / Cache miss 0 / Cache bypass 0");
    expect(html).toContain("Runtime failed 2");
    expect(html).toContain("Rate limit exceeded 1");
    expect(html).toContain("n/a");
  });

  it("uses shared traffic mix surface summaries and chips", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityInsights, {
        binding: {
          rate_limit_policy: null
        } as WorkflowPublishActivityPanelProps["binding"],
        invocationAudit: buildInvocationAuditWithTrafficMix(),
        rateLimitWindowAudit: buildRateLimitWindowAudit(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        activeTimeWindow: "24h"
      })
    );

    expect(html).toContain("Traffic mix");
    expect(html).toContain("Cache hit 2 / Cache miss 1");
    expect(html).toContain("Run failed 2 / Waiting callback 1");
    expect(html).toContain("OpenAI responses 2");
    expect(html).toContain("Native workflow route 1");
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

  it("ignores stale selected-invocation callback copy and keeps next step on execution focus", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = {
      primary_signal: "历史 callback waiting 曾卡住。",
      follow_up: "先观察 callback 是否恢复。"
    };
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = {
      primary_signal: "sandbox execution 仍被阻断。",
      follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
    };
    detail.invocation.run_waiting_lifecycle = null;
    detail.invocation.run_status = "failed";
    detail.invocation.run_waiting_reason = null;
    detail.run = {
      id: "run-selected-1",
      status: "failed",
      current_node_id: "tool_wait",
      started_at: "2026-03-21T00:10:00Z",
      finished_at: "2026-03-21T00:12:00Z"
    } as never;
    detail.run_snapshot = {
      status: "failed",
      current_node_id: "tool_wait",
      waiting_reason: null,
      execution_focus_reason: "blocked_execution",
      execution_focus_node_id: "tool_wait",
      execution_focus_node_run_id: "node-run-selected-focus",
      execution_focus_node_name: "Tool wait",
      execution_focus_node_type: "tool",
      execution_focus_explanation: {
        primary_signal: "sandbox execution 仍被阻断。",
        follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
      }
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAudit(),
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: detail
        },
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        sandboxReadiness: buildSandboxReadiness(),
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("execution focus");
    expect(html).toContain("优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。");
    expect(html).not.toContain("callback recovery");
    expect(html).not.toContain("Open run library");
  });

  it("prefers shared sandbox readiness CTA for selected invocation when execution follow-up is missing", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = null;
    detail.execution_focus_node = {
      node_run_id: "node-run-selected-focus",
      node_id: "tool_wait",
      node_name: "Tool wait",
      node_type: "tool",
      status: "blocked",
      phase: "execute",
      retry_count: 0,
      artifact_refs: [],
      error_message: null,
      waiting_reason: null,
      started_at: "2026-03-21T00:10:00Z",
      finished_at: null,
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      execution_profile: null,
      execution_timeout_ms: null,
      execution_network_policy: null,
      execution_filesystem_policy: null,
      execution_dependency_mode: null,
      execution_builtin_package_set: null,
      execution_dependency_ref: null,
      execution_backend_extensions: null,
      execution_dispatched_count: 1,
      execution_fallback_count: 0,
      execution_blocked_count: 1,
      execution_unavailable_count: 0,
      requested_execution_class: "sandbox",
      requested_execution_source: "runtime_policy",
      requested_execution_profile: null,
      requested_execution_timeout_ms: null,
      requested_execution_network_policy: null,
      requested_execution_filesystem_policy: null,
      requested_execution_dependency_mode: null,
      requested_execution_builtin_package_set: null,
      requested_execution_dependency_ref: null,
      requested_execution_backend_extensions: null,
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline",
      execution_sandbox_backend_id: "sandbox-stale",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_fallback_reason: null,
      event_count: 0,
      event_type_counts: {},
      last_event_type: null,
      artifacts: [],
      tool_calls: [],
      ai_calls: [],
      callback_tickets: [],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      sensitive_access_entries: []
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAudit(),
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: detail
        },
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        sandboxReadiness: {
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
              reason: "execution class blocked"
            }
          ],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            label: "Open workflow library",
            href: "/workflows?execution=sandbox",
            entry_key: "workflowLibrary"
          }
        },
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
  });

  it("prefers shared sandbox readiness CTA for selected invocation even when a local execution follow-up exists", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = {
      primary_signal: "sandbox execution 仍被阻断。",
      follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
    };
    detail.run_snapshot = {
      status: "failed",
      current_node_id: "tool_wait",
      waiting_reason: null,
      execution_focus_reason: "blocked_execution",
      execution_focus_node_id: "tool_wait",
      execution_focus_node_run_id: "node-run-selected-focus",
      execution_focus_node_name: "Tool wait",
      execution_focus_node_type: "tool",
      execution_focus_explanation: {
        primary_signal: "sandbox execution 仍被阻断。",
        follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
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
          execution_sandbox_backend_id: "sandbox-stale",
          execution_blocking_reason: "No compatible sandbox backend is available."
        }
      ]
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAudit(),
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "ok",
          data: detail
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: {
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
              reason: "execution class blocked"
            }
          ],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            label: "Open workflow library",
            href: "/workflows?execution=sandbox",
            entry_key: "workflowLibrary"
          }
        },
        buildInvocationDetailHref: () => "#",
        clearInvocationDetailHref: null
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("Open workflow library");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
  });

  it("reuses the projected selected next-step surface inside detail panel without duplicating narrative", () => {
    const invocationAudit = {
      ...buildInvocationAudit(),
      items: [{ id: "invocation-1" } as never]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit,
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
        clearInvocationDetailHref: "/workflows/workflow-1?publish_invocation=invocation-1"
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html.match(/Selected invocation next step/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open blocker inbox slice");
  });

  it("bridges the selected invocation CTA into the matching failure reason card when detail is open", () => {
    const invocationAudit = {
      ...buildInvocationAudit(),
      items: [{ id: "invocation-1" } as never]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit,
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
        clearInvocationDetailHref: "/workflows/workflow-1?publish_invocation=invocation-1"
      })
    );

    expect(html).toContain("sandbox backend offline during invocation");
    expect(html).toContain("invocation-1");
    expect(html).toContain("当前打开的 invocation-1 已对齐这条 failure reason。");
    expect(html).toContain("approval blocker");
    expect(html).toContain("优先处理 blocker inbox，再观察 waiting 节点是否恢复。");
    expect(html).not.toContain("当前 live sandbox readiness 仍在报警。");
  });

  it("uses shared API key status fallback copy inside activity details", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit: buildInvocationAuditWithApiKeyUsageFallbackStatus(),
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

    expect(html).toContain("Status");
    expect(html).toContain("n/a");
  });

  it("uses shared blocked surface copy for invocation detail access", () => {
    const invocationAudit = {
      ...buildInvocationAudit(),
      items: [{ id: "invocation-1" } as never]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit,
        selectedInvocationId: "invocation-1",
        selectedInvocationDetail: {
          kind: "blocked",
          statusCode: 403,
          payload: buildBlockedPayload()
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
        clearInvocationDetailHref: "/workflows/workflow-1?publish_invocation=invocation-1"
      })
    );

    expect(html).toContain("Invocation detail waiting on approval");
    expect(html).toContain("详情查看不会绕过审批、通知与 run follow-up 事实链");
    expect(html).toContain("当前信号：审批票据仍在等待处理。");
    expect(html).toContain("sandbox:sandbox");
    expect(html).not.toContain("Invocation detail access blocked");
  });

  it("uses shared unavailable surface copy for missing invocation detail", () => {
    const invocationAudit = {
      ...buildInvocationAudit(),
      items: [{ id: "invocation-1" } as never]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishActivityDetails, {
        tools: [],
        invocationAudit,
        selectedInvocationId: "invocation-1",
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
        clearInvocationDetailHref: "/workflows/workflow-1?publish_invocation=invocation-1"
      })
    );

    expect(html).toContain("Invocation detail unavailable");
    expect(html).toContain("当前未能拉取该 invocation 的详情 payload。");
    expect(html).toContain("审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。");
  });
});
