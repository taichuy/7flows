import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
import type { CallbackWaitingAutomationCheck, SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowDetail } from "@/lib/get-workflows";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";

vi.mock("@/components/workflow-publish-activity-panel", () => ({
  WorkflowPublishActivityPanel: () => createElement("div", null, "activity-panel")
}));

vi.mock("@/components/workflow-publish-lifecycle-form", () => ({
  WorkflowPublishLifecycleForm: ({ sandboxReadiness }: { sandboxReadiness?: SandboxReadinessCheck | null }) =>
    createElement(
      "div",
      null,
      `lifecycle-form:${sandboxReadiness?.execution_classes?.[0]?.execution_class ?? "none"}`
    )
}));

vi.mock("@/components/workflow-publish-api-key-manager", () => ({
  WorkflowPublishApiKeyManager: () => createElement("div", null, "api-key-manager")
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
    cache_policy: null,
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
      enabled: false,
      ttl: null,
      max_entries: null,
      vary_by: [],
      active_entry_count: 0,
      total_hit_count: 0,
      last_hit_at: null,
      nearest_expires_at: null,
      latest_created_at: null
    }
  };
}

describe("WorkflowPublishBindingCard", () => {
  it("shows strong-isolation preflight at the binding layer", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding: buildBinding(),
        cacheInventory: null as never,
        apiKeys: [],
        invocationAudit: null,
        selectedInvocationId: null,
        selectedInvocationDetail: null as never,
        rateLimitWindowAudit: null,
        activeInvocationFilter: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Strong-isolation publish preflight");
    expect(html).toContain("ready sandbox");
    expect(html).toContain("activity-panel");
    expect(html).toContain("lifecycle-form:sandbox");
  });
});
