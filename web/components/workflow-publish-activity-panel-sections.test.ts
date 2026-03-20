import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WorkflowPublishActivityDetails,
  WorkflowPublishActivityInsights
} from "@/components/workflow-publish-activity-panel-sections";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";

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
});
