import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
import type { CallbackWaitingAutomationCheck, SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowDetail } from "@/lib/get-workflows";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import { buildLegacyPublishUnsupportedAuthIssueFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

vi.mock("@/components/workflow-publish-activity-panel", () => ({
  WorkflowPublishActivityPanel: ({ legacyAuthExportHint }: { legacyAuthExportHint?: string | null }) =>
    createElement("div", null, `activity-panel:${legacyAuthExportHint ?? "none"}`)
}));

vi.mock("@/components/workflow-publish-lifecycle-form", () => ({
  WorkflowPublishLifecycleForm: ({
    sandboxReadiness,
    workflowGovernanceHandoff,
    currentHref
  }: {
    sandboxReadiness?: SandboxReadinessCheck | null;
    workflowGovernanceHandoff?: {
      workflowCatalogGapHref?: string | null;
      workflowCatalogGapSummary?: string | null;
      legacyAuthHandoff?: { statusChipLabel: string } | null;
    } | null;
    currentHref?: string | null;
  }) =>
    createElement(
      "div",
      null,
      `lifecycle-form:${sandboxReadiness?.execution_classes?.[0]?.execution_class ?? "none"}:` +
        `catalog:${workflowGovernanceHandoff?.workflowCatalogGapSummary ?? "none"}:` +
        `legacy:${workflowGovernanceHandoff?.legacyAuthHandoff?.statusChipLabel ?? "none"}:` +
        `href:${workflowGovernanceHandoff?.workflowCatalogGapHref ?? "none"}:` +
        `current:${currentHref ?? "none"}`
    )
}));

vi.mock("@/components/workflow-publish-api-key-manager", () => ({
  WorkflowPublishApiKeyManager: () => createElement("div", null, "api-key-manager")
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
      publish: [
        {
          id: "endpoint-1",
          name: "Public Search",
          alias: "search.public",
          path: "/search/public",
          protocol: "openai",
          authMode: "api_key",
          streaming: true,
          inputSchema: { type: "object" }
        }
      ]
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

function buildBlockedPayload(): SensitiveAccessBlockingPayload {
  return {
    detail: "Cache inventory is guarded by sensitive access control.",
    resource: {
      id: "resource-1",
      label: "Cache inventory",
      description: "Protected cache entry inventory",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {}
    },
    access_request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
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
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "审批票据仍在等待处理。",
      follow_up: "先处理审批票据，再回来看 cache inventory。"
    },
    run_snapshot: null,
    run_follow_up: null
  };
}

describe("WorkflowPublishBindingCard", () => {
  it("shows Codex and OpenClaw handoff presets for openai bindings", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding: buildBinding(),
        cacheInventory: null as never,
        apiKeys: [
          {
            id: "key-1",
            workflow_id: "workflow-1",
            endpoint_id: "endpoint-1",
            name: "Published key",
            key_prefix: "pk-openai-live",
            status: "active",
            created_at: "2026-03-20T10:00:00Z",
            updated_at: "2026-03-20T10:00:00Z",
            last_used_at: null,
            revoked_at: null
          }
        ],
        invocationAudit: null,
        selectedInvocationId: null,
        selectedInvocationDetail: null as never,
        rateLimitWindowAudit: null,
        activeInvocationFilter: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Local agent handoff");
    expect(html).toContain("Codex");
    expect(html).toContain("OpenClaw");
    expect(html).toContain("http://localhost:8000/v1");
    expect(html).toContain("/chat/completions");
    expect(html).toContain("model");
    expect(html).toContain("search.public");
    expect(html).toContain("pk-openai-live");
  });

  it("shows Claude Code handoff preset for anthropic bindings", () => {
    const binding = buildBinding();
    binding.protocol = "anthropic";
    binding.endpoint_alias = "claude.workflow";
    const workflow = buildWorkflow();
    workflow.definition.publish = [
      {
        id: "endpoint-1",
        name: "Claude workflow",
        alias: "claude.workflow",
        path: "/claude/workflow",
        protocol: "anthropic",
        authMode: "api_key",
        streaming: true,
        inputSchema: { type: "object" }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
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

    expect(html).toContain("Claude Code");
    expect(html).toContain("/messages");
    expect(html).toContain("anthropic-version: 2023-06-01");
    expect(html).toContain("claude.workflow");
  });

  it("shows native OpenClaw handoff preset for native bindings", () => {
    const binding = buildBinding();
    binding.protocol = "native";
    binding.endpoint_alias = "native.workflow";
    binding.endpoint_id = "native-chat";
    binding.route_path = "/native/workflow";

    const workflow = buildWorkflow();
    workflow.definition.publish = [
      {
        id: "native-chat",
        name: "Native workflow",
        alias: "native.workflow",
        path: "/native/workflow",
        protocol: "native",
        authMode: "api_key",
        streaming: false,
        inputSchema: { type: "object" }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
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

    expect(html).toContain("OpenClaw");
    expect(html).toContain("7Flows native published run");
    expect(html).toContain("/v1/published-aliases/native.workflow/run");
    expect(html).toContain("endpoint alias");
    expect(html).toContain("native.workflow");
  });

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

    expect(html).toContain(">已发布</span>");
    expect(html).toContain("Strong-isolation publish preflight");
    expect(html).toContain("ready sandbox");
    expect(html).toContain("activity-panel:none");
    expect(html).toContain("lifecycle-form:sandbox");
  });

  it("passes workflow-level legacy auth handoff hints into the activity panel", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding: buildBinding(),
        legacyAuthExportHint:
          "导出的 published invocation JSON / JSONL 也会附带当前 workflow 的 legacy publish auth handoff：draft 1 / published 0 / offline 0。",
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

    expect(html).toContain(
      "activity-panel:导出的 published invocation JSON / JSONL 也会附带当前 workflow 的 legacy publish auth handoff：draft 1 / published 0 / offline 0。"
    );
  });

  it("renders publish governance blockers from binding issues", () => {
    const binding = buildBinding();
    binding.auth_mode = "token";
    binding.issues = [buildLegacyPublishUnsupportedAuthIssueFixture()];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding,
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

    expect(html).toContain("Publish governance blocker");
    expect(html).toContain("Legacy token auth is still persisted on this binding.");
    expect(html).toContain(
      "当前 draft endpoint Public Search (endpoint-1) 已切回 authMode=api_key（当前 workflow 1.0.0）。Publish auth contract：supported api_key / internal；legacy token。 现在可以直接从这张 draft 卡片补发 replacement binding，把历史 1.0.0 legacy binding 保持 offline。"
    );
    expect(html).toContain("Open current draft endpoint");
    expect(html).toContain("#workflow-editor-publish-endpoint-endpoint-1");
  });

  it("shares workflow governance handoff on binding blockers", () => {
    const workflow = buildWorkflow();
    workflow.tool_governance = {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0
    };
    workflow.legacy_auth_governance = {
      binding_count: 1,
      draft_candidate_count: 1,
      published_blocker_count: 1,
      offline_inventory_count: 0
    };

    const binding = buildBinding();
    binding.auth_mode = "token";
    binding.issues = [buildLegacyPublishUnsupportedAuthIssueFixture()];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
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

    expect(html).toContain("Workflow handoff");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("当前 publish binding 对应的 workflow 版本仍有 catalog gap");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
    expect(html).toContain(
      "lifecycle-form:sandbox:catalog:catalog gap · native.catalog-gap:legacy:publish auth blocker"
    );
  });

  it("shares workflow governance handoff inside auth governance empty states", () => {
    const workflow = buildWorkflow();
    workflow.tool_governance = {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0
    };
    workflow.legacy_auth_governance = {
      binding_count: 1,
      draft_candidate_count: 1,
      published_blocker_count: 1,
      offline_inventory_count: 0
    };

    const binding = buildBinding();
    binding.auth_mode = "session";
    binding.issues = [buildLegacyPublishUnsupportedAuthIssueFixture()];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
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

    expect(html).toContain(
      "当前 auth governance 空状态也直接复用 shared workflow governance handoff"
    );
    expect(html).toContain("当前 publish auth governance 对应的 workflow 版本仍有 catalog gap");
    expect(html).toContain(
      "先回到 workflow 编辑器补齐 catalog gap 与 publish auth contract，再回来决定当前 binding 是否仍需要 published API key。"
    );
  });

  it("keeps workspace starter governance scope on shared blocker handoff links", () => {
    const workflow = buildWorkflow();
    workflow.tool_governance = {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0
    };

    const binding = buildBinding();
    binding.auth_mode = "token";
    binding.issues = [buildLegacyPublishUnsupportedAuthIssueFixture()];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
        cacheInventory: null as never,
        apiKeys: [],
        invocationAudit: null,
        selectedInvocationId: null,
        selectedInvocationDetail: null as never,
        rateLimitWindowAudit: null,
        activeInvocationFilter: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "all",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: "catalog",
          selectedTemplateId: "starter-1"
        }
      })
    );

    expect(html).toContain("source_governance_kind=drifted");
    expect(html).toContain("needs_follow_up=true");
    expect(html).toContain("q=catalog");
    expect(html).toContain("starter=starter-1");
  });

  it("uses shared blocked surface copy for cache inventory", () => {
    const binding = buildBinding();
    binding.cache_inventory = {
      enabled: true,
      ttl: 300,
      max_entries: 20,
      vary_by: ["messages"],
      active_entry_count: 1,
      total_hit_count: 3,
      last_hit_at: "2026-03-20T10:11:00Z",
      nearest_expires_at: "2026-03-20T10:15:00Z",
      latest_created_at: "2026-03-20T10:10:30Z"
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding,
        cacheInventory: {
          kind: "blocked",
          statusCode: 403,
          payload: buildBlockedPayload()
        },
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

    expect(html).toContain("Cache inventory waiting on approval");
    expect(html).toContain("cache inventory 查看不会绕过审批、通知与 run follow-up 事实链");
    expect(html).toContain("当前信号：审批票据仍在等待处理。");
    expect(html).toContain("sandbox:sandbox");
    expect(html).not.toContain("Cache inventory access blocked");
  });

  it("uses shared auth governance fallback copy when api keys are not required", () => {
    const binding = buildBinding();
    binding.auth_mode = "session";

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow: buildWorkflow(),
        tools: [],
        binding,
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

    expect(html).toContain("当前 binding 使用 auth_mode=session，不需要单独管理 published API key。");
    expect(html).not.toContain("api-key-manager");
  });

  it("keeps binding-level workflow governance on the current issue scope", () => {
    const workflow = buildWorkflow();
    workflow.tool_governance = {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    };
    workflow.legacy_auth_governance = {
      binding_count: 1,
      draft_candidate_count: 0,
      published_blocker_count: 1,
      offline_inventory_count: 0
    };
    const binding = buildBinding();
    binding.auth_mode = "token";
    binding.issues = [buildLegacyPublishUnsupportedAuthIssueFixture()];
    const currentHref = "/workflows/workflow-1?definition_issue=legacy_publish_auth";

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishBindingCard, {
        workflow,
        tools: [],
        binding,
        cacheInventory: null as never,
        apiKeys: [],
        invocationAudit: null,
        selectedInvocationId: null,
        selectedInvocationDetail: null as never,
        rateLimitWindowAudit: null,
        activeInvocationFilter: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        currentHref
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/workflows/workflow-1?definition_issue=legacy_publish_auth"');
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
    expect(html).toContain(`current:${currentHref}`);
  });
});
