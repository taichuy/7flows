import { describe, expect, it } from "vitest";

import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import {
  buildWorkflowPublishLegacyAuthCleanupSuccessMessage,
  buildWorkflowPublishLegacyAuthCleanupSurface,
} from "@/lib/workflow-publish-legacy-auth-cleanup";

function buildBinding(
  overrides: Partial<WorkflowPublishedEndpointItem> = {}
): WorkflowPublishedEndpointItem {
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
    auth_mode: "token",
    streaming: false,
    lifecycle_status: "draft",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    rate_limit_policy: null,
    cache_policy: null,
    published_at: null,
    unpublished_at: null,
    created_at: "2026-03-24T06:00:00Z",
    updated_at: "2026-03-24T06:00:00Z",
    issues: [
      {
        category: "unsupported_auth_mode",
        message: "Legacy token auth is still persisted on this binding.",
        remediation: "Switch back to api_key or internal before publishing.",
        blocks_lifecycle_publish: true,
      },
    ],
    ...overrides,
  };
}

describe("workflow publish legacy auth cleanup helpers", () => {
  it("classifies draft, published and offline legacy bindings into cleanup buckets", () => {
    const surface = buildWorkflowPublishLegacyAuthCleanupSurface([
      buildBinding({ id: "binding-draft", lifecycle_status: "draft", workflow_version: "1.2.0" }),
      buildBinding({ id: "binding-live", lifecycle_status: "published", workflow_version: "1.1.0" }),
      buildBinding({ id: "binding-offline", lifecycle_status: "offline", workflow_version: "1.0.0" }),
      buildBinding({ id: "binding-clean", auth_mode: "api_key", issues: [] }),
    ]);

    expect(surface.shouldRender).toBe(true);
    expect(surface.candidateBindingIds).toEqual(["binding-draft"]);
    expect(surface.candidateBindings[0]?.detail).toContain("可直接批量切到 offline");
    expect(surface.publishedBindings[0]?.detail).toContain("先补发支持 api_key/internal 的新版 binding");
    expect(surface.offlineBindings[0]?.detail).toContain("已 offline");
  });

  it("builds concise success feedback for mixed cleanup outcomes", () => {
    expect(
      buildWorkflowPublishLegacyAuthCleanupSuccessMessage({
        requested_count: 3,
        updated_count: 2,
        skipped_count: 1,
        updated_binding_ids: ["binding-1", "binding-2"],
        skipped_items: [],
      })
    ).toBe("已批量下线 2 条 legacy auth draft binding；另外 1 条仍需逐项处理。");
  });
});
