import { describe, expect, it } from "vitest";

import type { PublishedEndpointApiKeyItem } from "@/lib/get-workflow-publish";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { buildLegacyPublishUnsupportedAuthIssueFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";
import {
  buildWorkflowPublishApiKeyManagerSurface,
  buildWorkflowPublishApiKeyMutationFallbackErrorMessage,
  buildWorkflowPublishApiKeyMutationNetworkErrorMessage,
  buildWorkflowPublishApiKeyMutationSuccessMessage,
  buildWorkflowPublishApiKeyMutationValidationMessage,
  buildWorkflowPublishExportActionSurface,
  buildWorkflowPublishExportFallbackErrorMessage,
  buildWorkflowPublishExportNetworkErrorMessage,
  buildWorkflowPublishExportReadinessHint,
  buildWorkflowPublishExportSuccessMessage,
  buildWorkflowPublishLifecycleMutationFallbackErrorMessage,
  buildWorkflowPublishLifecycleMutationNetworkErrorMessage,
  buildWorkflowPublishLifecycleMutationSuccessMessage,
  buildWorkflowPublishLifecycleMutationValidationMessage,
  buildWorkflowPublishApiKeySecretReceiptCopy,
  buildWorkflowPublishBindingCardSurface,
  buildWorkflowPublishLifecycleActionSurface
} from "@/lib/workflow-publish-binding-presenters";

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
    auth_mode: "session",
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
      varyBy: ["messages"]
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
      vary_by: [],
      active_entry_count: 2,
      total_hit_count: 9,
      last_hit_at: "2026-03-20T10:11:00Z",
      nearest_expires_at: "2026-03-20T10:15:00Z",
      latest_created_at: "2026-03-20T10:10:30Z"
    }
  };
}

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 0,
    degraded_backend_count: 1,
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

function buildApiKeys(): PublishedEndpointApiKeyItem[] {
  return [
    {
      id: "key-1",
      workflow_id: "workflow-1",
      endpoint_id: "endpoint-1",
      name: "New key",
      key_prefix: "sf_pub_new",
      status: "active",
      last_used_at: "2026-03-20T10:05:00Z",
      revoked_at: null,
      created_at: "2026-03-20T10:10:00Z",
      updated_at: "2026-03-20T10:10:00Z"
    },
    {
      id: "key-2",
      workflow_id: "workflow-1",
      endpoint_id: "endpoint-1",
      name: "Hot path",
      key_prefix: "sf_pub_hot",
      status: "active",
      last_used_at: "2026-03-20T10:30:00Z",
      revoked_at: null,
      created_at: "2026-03-20T09:00:00Z",
      updated_at: "2026-03-20T10:30:00Z"
    },
    {
      id: "key-3",
      workflow_id: "workflow-1",
      endpoint_id: "endpoint-1",
      name: "Revoked key",
      key_prefix: "sf_pub_old",
      status: "revoked",
      last_used_at: "2026-03-20T11:00:00Z",
      revoked_at: "2026-03-20T11:05:00Z",
      created_at: "2026-03-20T08:00:00Z",
      updated_at: "2026-03-20T11:05:00Z"
    }
  ];
}

describe("workflow-publish-binding-presenters", () => {
  it("builds a canonical surface for publish binding metadata and cache summaries", () => {
    const surface = buildWorkflowPublishBindingCardSurface(buildBinding());

    expect(surface.headerEyebrow).toBe("Endpoint");
    expect(surface.lifecycleLabel).toBe("已发布");
    expect(surface.endpointSummary).toBe(
      "endpoint-1 · alias search.public · path /search/public"
    );
    expect(surface.protocolChips).toEqual([
      "openai",
      "session",
      "workflow 1.0.0 -> 1.0.0",
      "streaming"
    ]);
    expect(surface.activityRows).toContainEqual({
      key: "cache",
      label: "Cache",
      value: "hit 1 / miss 2"
    });
    expect(surface.activityTitle).toBe("Activity");
    expect(surface.policyRows).toContainEqual({
      key: "rate-limit",
      label: "Rate limit",
      value: "60 / 60s"
    });
    expect(surface.policyRows).toContainEqual({
      key: "cache-policy",
      label: "Cache policy",
      value: "ttl 300s · max 128"
    });
    expect(surface.cacheInventorySummaryCards).toContainEqual({
      key: "entries",
      label: "Entries",
      value: "2"
    });
    expect(surface.policyTitle).toBe("Policy");
    expect(surface.sandboxReadinessTitle).toBe("Strong-isolation publish preflight");
    expect(surface.sandboxReadinessDescription).toContain("sampled run");
    expect(surface.cacheInventoryTitle).toBe("Cache inventory");
    expect(surface.cacheInventoryGuardedActionLabel).toBe("cache inventory 查看");
    expect(surface.cacheInventoryBlockedFallbackTitle).toBe("Cache inventory access blocked");
    expect(surface.cacheInventoryVaryLabels).toEqual(["vary full-payload"]);
    expect(surface.cacheEntryTitle).toBe("Cache entry");
    expect(surface.issueSurface).toBeNull();
    expect(surface.apiKeyGovernanceTitle).toBe("API key governance");
    expect(surface.apiKeyGovernanceEmptyState).toContain("auth_mode=session");
  });

  it("surfaces lifecycle blockers for legacy unsupported auth modes", () => {
    const surface = buildWorkflowPublishBindingCardSurface({
      ...buildBinding(),
      auth_mode: "token",
      issues: [buildLegacyPublishUnsupportedAuthIssueFixture()]
    });

    expect(surface.issueSurface).toEqual({
      title: "Publish governance blocker",
      message: "Legacy token auth is still persisted on this binding.",
      remediation: "Switch back to api_key or internal before publishing.",
      followUpHref: null,
      followUpLabel: null
    });
    expect(surface.apiKeyGovernanceEmptyState).toContain(
      "当前 binding 仍处于 legacy publish auth handoff。"
    );
    expect(surface.apiKeyGovernanceEmptyState).toContain(
      "Publish auth contract：supported api_key / internal；legacy token。"
    );
  });

  it("uses current publish draft context to turn legacy auth blockers into actionable follow-up", () => {
    const surface = buildWorkflowPublishBindingCardSurface(
      {
        ...buildBinding(),
        auth_mode: "token",
        issues: [buildLegacyPublishUnsupportedAuthIssueFixture()]
      },
      {
        currentWorkflowVersion: "1.1.0",
        currentDraftPublishEndpoints: [
          {
            id: "endpoint-1",
            name: "Public Search",
            authMode: "api_key"
          }
        ]
      }
    );

    expect(surface.issueSurface).toEqual({
      title: "Publish governance blocker",
      message: "Legacy token auth is still persisted on this binding.",
      remediation:
        "当前 draft endpoint Public Search (endpoint-1) 已切回 authMode=api_key（当前 workflow 1.1.0）。Publish auth contract：supported api_key / internal；legacy token。 现在可以直接从这张 draft 卡片补发 replacement binding，把历史 1.0.0 legacy binding 保持 offline。",
      followUpHref: "#workflow-editor-publish-endpoint-endpoint-1",
      followUpLabel: "Open current draft endpoint"
    });
  });

  it("maps binding lifecycle enums to shared user-facing labels", () => {
    const draftSurface = buildWorkflowPublishBindingCardSurface({
      ...buildBinding(),
      lifecycle_status: "draft"
    });
    const offlineSurface = buildWorkflowPublishBindingCardSurface({
      ...buildBinding(),
      lifecycle_status: "offline"
    });

    expect(draftSurface.lifecycleLabel).toBe("草稿");
    expect(offlineSurface.lifecycleLabel).toBe("已下线");
  });

  it("builds api key governance surface from the canonical key list", () => {
    const surface = buildWorkflowPublishApiKeyManagerSurface(buildApiKeys());

    expect(surface.summaryCards).toContainEqual({
      key: "active-keys",
      label: "Active keys",
      value: "2"
    });
    expect(surface.summaryCards).toContainEqual({
      key: "last-used",
      label: "Last used",
      value: formatTimestamp("2026-03-20T10:30:00Z")
    });
    expect(surface.createButtonLabel).toBe("创建 API key");
    expect(surface.revokePendingLabel).toBe("撤销中...");
    expect(surface.emptyState).toContain("建议先创建独立 key 再分发");
    expect(buildWorkflowPublishApiKeySecretReceiptCopy("sf_pub_hot")).toContain("sf_pub_hot");
  });

  it("builds shared api key mutation messages", () => {
    expect(buildWorkflowPublishApiKeyMutationValidationMessage("create")).toBe(
      "缺少 API key 所需信息，无法创建。"
    );
    expect(buildWorkflowPublishApiKeyMutationFallbackErrorMessage("revoke")).toBe(
      "撤销 API key 失败。"
    );
    expect(buildWorkflowPublishApiKeyMutationNetworkErrorMessage("create")).toContain(
      "请确认 API 已启动"
    );
    expect(
      buildWorkflowPublishApiKeyMutationSuccessMessage({
        action: "create",
        name: "Production Gateway"
      })
    ).toBe("Production Gateway 已创建，请立即保存 secret，本页不会再次展示。");
    expect(
      buildWorkflowPublishApiKeyMutationSuccessMessage({
        action: "revoke",
        name: "Production Gateway"
      })
    ).toBe("Production Gateway 已撤销。");
  });

  it("builds lifecycle action copy from status and live sandbox readiness", () => {
    const surface = buildWorkflowPublishLifecycleActionSurface({
      currentStatus: "published",
      sandboxReadiness: buildSandboxReadiness()
    });

    expect(surface.nextStatus).toBe("offline");
    expect(surface.submitLabel).toBe("下线 endpoint");
    expect(surface.pendingLabel).toBe("提交中...");
    expect(surface.submitDisabled).toBe(false);
    expect(surface.preflightDescription).toContain("当前 lifecycle action 只切换 binding 对外状态");
    expect(surface.preflightDescription).toContain("当前 sandbox readiness：");
    expect(surface.preflightDescription).toContain("degraded");
  });

  it("adds legacy auth blocker guidance before publish lifecycle actions", () => {
    const surface = buildWorkflowPublishLifecycleActionSurface({
      currentStatus: "draft",
      issues: [
        buildLegacyPublishUnsupportedAuthIssueFixture({
          field: undefined,
          auth_mode_contract: null,
        })
      ]
    });

    expect(surface.nextStatus).toBe("published");
    expect(surface.submitDisabled).toBe(true);
    expect(surface.preflightDescription).toContain(
      "Legacy token auth is still persisted on this binding."
    );
    expect(surface.preflightDescription).toContain(
      "Switch back to api_key or internal before publishing."
    );
  });

  it("builds shared lifecycle mutation messages", () => {
    expect(buildWorkflowPublishLifecycleMutationValidationMessage()).toBe(
      "缺少发布 binding 信息，无法更新发布状态。"
    );
    expect(buildWorkflowPublishLifecycleMutationFallbackErrorMessage("published")).toBe(
      "发布 endpoint 失败。"
    );
    expect(buildWorkflowPublishLifecycleMutationNetworkErrorMessage("offline")).toContain(
      "请确认 API 已启动"
    );
    expect(
      buildWorkflowPublishLifecycleMutationSuccessMessage({
        endpointName: "Public Search",
        nextStatus: "published"
      })
    ).toBe("Public Search 已发布。");
    expect(
      buildWorkflowPublishLifecycleMutationSuccessMessage({
        bindingId: "binding-1",
        lifecycleStatus: "offline",
        nextStatus: "published"
      })
    ).toBe("binding-1 已下线。");
  });

  it("builds shared publish export feedback", () => {
    const jsonlSurface = buildWorkflowPublishExportActionSurface("jsonl");

    expect(jsonlSurface.idleLabel).toBe("导出 activity JSONL");
    expect(jsonlSurface.pendingLabel).toBe("导出 JSONL...");
    expect(
      buildWorkflowPublishExportSuccessMessage({
        format: "json",
        limit: 200
      })
    ).toBe("导出 activity JSON 已开始下载（最多 200 条过滤后的 invocation）。");
    expect(buildWorkflowPublishExportNetworkErrorMessage("jsonl")).toContain(
      "请确认 API 已启动"
    );
    expect(
      buildWorkflowPublishExportFallbackErrorMessage({
        format: "json",
        status: 503
      })
    ).toBe("导出 JSON 失败，API 返回 503。");
    expect(buildWorkflowPublishExportReadinessHint(buildSandboxReadiness())).toContain(
      "当前 activity export 只导出历史 invocation 事实"
    );
  });
});
