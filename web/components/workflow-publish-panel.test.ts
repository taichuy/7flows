import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import type { CallbackWaitingAutomationCheck, SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowDetail } from "@/lib/get-workflows";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/workflow-publish-binding-card", () => ({
  WorkflowPublishBindingCard: ({ binding }: { binding: { id: string } }) =>
    createElement("div", null, `binding:${binding.id}`)
}));

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
        supports_filesystem_policy: false,
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
    supports_filesystem_policy: false
  };
}

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "healthy",
    scheduler_required: true,
    detail: "callback waiting automation ready",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "scheduler ready",
    steps: []
  };
}

function buildWorkflow(): WorkflowDetail {
  return {
    id: "workflow-1",
    name: "Demo workflow",
    version: "1.0.0",
    status: "draft",
    node_count: 0,
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    },
    created_at: "2026-03-20T10:00:00Z",
    updated_at: "2026-03-20T10:00:00Z",
    definition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: []
    },
    versions: []
  };
}

function buildBinding(): WorkflowPublishedEndpointItem {
  return {
    id: "binding-1",
    workflow_id: "workflow-1",
    workflow_version_id: "workflow-version-1",
    workflow_version: "1.0.0",
    target_workflow_version_id: "workflow-version-1",
    target_workflow_version: "1.0.0",
    compiled_blueprint_id: "blueprint-1",
    endpoint_id: "endpoint-1",
    endpoint_name: "Public Search",
    endpoint_alias: "search.public",
    route_path: "/search/public",
    protocol: "openai",
    auth_mode: "api_key",
    streaming: true,
    lifecycle_status: "published",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    rate_limit_policy: {
      requests: 60,
      windowSeconds: 60
    },
    cache_policy: {
      enabled: true,
      ttl: 300,
      maxEntries: 128,
      varyBy: ["tenant"]
    },
    published_at: "2026-03-20T10:00:00Z",
    unpublished_at: null,
    created_at: "2026-03-20T10:00:00Z",
    updated_at: "2026-03-20T10:00:00Z",
    activity: {
      total_count: 3,
      succeeded_count: 3,
      failed_count: 0,
      rejected_count: 0,
      cache_hit_count: 1,
      cache_miss_count: 2,
      cache_bypass_count: 0,
      last_invoked_at: "2026-03-20T10:10:00Z",
      last_status: "succeeded",
      last_cache_status: "miss",
      last_run_id: "run-1",
      last_run_status: "succeeded",
      last_reason_code: null
    },
    cache_inventory: {
      enabled: true,
      ttl: 300,
      max_entries: 128,
      vary_by: ["tenant"],
      active_entry_count: 2,
      total_hit_count: 4,
      last_hit_at: "2026-03-20T10:10:00Z",
      nearest_expires_at: "2026-03-20T10:20:00Z",
      latest_created_at: "2026-03-20T10:10:00Z"
    }
  };
}

describe("WorkflowPublishPanel", () => {
  it("surfaces missing publish bindings as the primary follow-up instead of clear summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishPanel, {
        workflow: buildWorkflow(),
        tools: [],
        bindings: [],
        cacheInventories: {},
        apiKeysByBinding: {},
        invocationAuditsByBinding: {},
        invocationDetailsByBinding: {},
        selectedInvocationId: null,
        rateLimitWindowAuditsByBinding: {},
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: null,
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "all"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Primary follow-up");
    expect(html).toContain("Summary focus");
    expect(html).toContain("attention");
    expect(html).toContain("No publish bindings are configured for this workflow yet.");
    expect(html).toContain(
      "Add a publish binding before expecting live endpoint traffic, lifecycle actions or invocation backlog in this summary."
    );
    expect(html).toContain(
      "当前 workflow definition 还没有声明 `publish`，因此没有可治理的开放 API endpoint。"
    );
    expect(html).not.toContain("Current publish bindings do not show a shared operator backlog.");
    expect(html).not.toContain("clear");
  });

  it("surfaces live sandbox readiness in publish summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishPanel, {
        workflow: buildWorkflow(),
        tools: [],
        bindings: [buildBinding()],
        cacheInventories: {},
        apiKeysByBinding: {},
        invocationAuditsByBinding: {},
        invocationDetailsByBinding: {},
        selectedInvocationId: null,
        rateLimitWindowAuditsByBinding: {},
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: null,
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "all"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("sandbox");
    expect(html).toContain("backend");
    expect(html).toContain("ready sandbox");
    expect(html).toContain("binding:binding-1");
    expect(html).toContain("Summary focus");
    expect(html).toContain("clear");
    expect(html).toContain("Current publish bindings do not show a shared operator backlog.");
    expect(html).toContain("回到 workflow 列表");
    expect(html).toContain('/workflows');
    expect(html).toContain('/runs');
    expect(html).toContain('/sensitive-access');
    expect(html).toContain("返回系统首页");
    expect(html).toContain('href="/"');
  });

  it("surfaces the shared sensitive-access backlog at publish summary level", () => {
    const binding = buildBinding();
    binding.activity = {
      ...binding.activity!,
      total_count: 5,
      succeeded_count: 2,
      failed_count: 1,
      rejected_count: 2,
      pending_approval_count: 2,
      pending_notification_count: 0,
      failed_notification_count: 0,
      rejected_approval_count: 0,
      expired_approval_count: 0
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishPanel, {
        workflow: buildWorkflow(),
        tools: [],
        bindings: [binding],
        cacheInventories: {},
        apiKeysByBinding: {},
        invocationAuditsByBinding: {},
        invocationDetailsByBinding: {},
        selectedInvocationId: null,
        rateLimitWindowAuditsByBinding: {},
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: null,
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "all"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Primary follow-up");
    expect(html).toContain("Summary focus");
    expect(html).toContain("attention");
    expect(html).toContain("Sensitive access approvals remain the primary publish backlog");
    expect(html).toContain("2 pending approval tickets");
    expect(html).toContain("binding-level failures");
    expect(html).toContain('/sensitive-access?status=pending');
    expect(html).toContain("approval inbox slice");
  });

  it("falls back to binding-level diagnosis when no shared backlog remains", () => {
    const binding = buildBinding();
    binding.activity = {
      ...binding.activity!,
      total_count: 4,
      succeeded_count: 1,
      failed_count: 2,
      rejected_count: 1,
      pending_approval_count: 0,
      pending_notification_count: 0,
      failed_notification_count: 0,
      rejected_approval_count: 0,
      expired_approval_count: 0
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishPanel, {
        workflow: buildWorkflow(),
        tools: [],
        bindings: [binding],
        cacheInventories: {},
        apiKeysByBinding: {},
        invocationAuditsByBinding: {},
        invocationDetailsByBinding: {},
        selectedInvocationId: null,
        rateLimitWindowAuditsByBinding: {},
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: null,
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "all"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("No shared sensitive-access backlog remains at the publish summary level.");
    expect(html).toContain("Summary focus");
    expect(html).toContain("attention");
    expect(html).toContain("Continue from the binding activity panels below to inspect callback waiting, runtime failures or policy mismatches.");
    expect(html).toContain("2 failed invocations");
    expect(html).toContain("1 rejected invocation");
    expect(html).toContain("binding-level diagnosis");
    expect(html).not.toContain("Open inbox slice");
  });

  it("prioritizes lifecycle follow-up when bindings exist but none are live", () => {
    const draftBinding = buildBinding();
    draftBinding.lifecycle_status = "draft";
    draftBinding.activity = {
      ...draftBinding.activity!,
      failed_count: 0,
      rejected_count: 0
    };

    const offlineBinding = buildBinding();
    offlineBinding.id = "binding-2";
    offlineBinding.endpoint_id = "endpoint-2";
    offlineBinding.endpoint_name = "Offline Search";
    offlineBinding.endpoint_alias = "search.offline";
    offlineBinding.route_path = "/search/offline";
    offlineBinding.lifecycle_status = "offline";
    offlineBinding.activity = {
      ...offlineBinding.activity!,
      failed_count: 0,
      rejected_count: 0
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishPanel, {
        workflow: buildWorkflow(),
        tools: [],
        bindings: [draftBinding, offlineBinding],
        cacheInventories: {},
        apiKeysByBinding: {},
        invocationAuditsByBinding: {},
        invocationDetailsByBinding: {},
        selectedInvocationId: null,
        rateLimitWindowAuditsByBinding: {},
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: null,
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "all"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Primary follow-up");
    expect(html).toContain("Summary focus");
    expect(html).toContain("attention");
    expect(html).toContain("No live published endpoint is active in this publish slice.");
    expect(html).toContain("1 draft binding still needs an initial publish action.");
    expect(html).toContain(
      "1 offline binding needs to be re-enabled before this workflow exposes a live endpoint again."
    );
    expect(html).toContain(
      "Continue from the binding cards below to publish or re-enable an endpoint before treating this summary as operationally clear."
    );
    expect(html).not.toContain("Current publish bindings do not show a shared operator backlog.");
  });
});
