import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowPublishLegacyAuthCleanupCard } from "@/components/workflow-publish-legacy-auth-cleanup-card";
import type { CleanupLegacyPublishedEndpointBindingsState } from "@/app/actions/publish";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";

type MockActionState = Record<string, unknown>;

let actionStateQueue: MockActionState[] = [];

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [actionStateQueue.shift() ?? { status: "idle", message: "" }, vi.fn()],
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  };
});

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

describe("WorkflowPublishLegacyAuthCleanupCard", () => {
  beforeEach(() => {
    actionStateQueue = [];
  });

  it("surfaces candidate, blocker and inventory buckets for legacy auth bindings", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLegacyAuthCleanupCard, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        bindings: [
          buildBinding({ id: "binding-draft", workflow_version: "1.2.0", lifecycle_status: "draft" }),
          buildBinding({ id: "binding-live", workflow_version: "1.1.0", lifecycle_status: "published" }),
          buildBinding({ id: "binding-offline", workflow_version: "1.0.0", lifecycle_status: "offline" }),
        ],
        action: async (state: CleanupLegacyPublishedEndpointBindingsState) => state,
      })
    );

    expect(html).toContain("Legacy publish auth cleanup");
    expect(html).toContain("Draft cleanup candidate");
    expect(html).toContain("Published blocker");
    expect(html).toContain("Public Search (endpoint-1) · workflow 1.0.0 · offline");
    expect(html).toContain("Operator checklist");
    expect(html).toContain("Governance export");
    expect(html).toContain("导出 JSON 清单");
    expect(html).toContain("导出 JSONL 清单");
    expect(html).toContain("批量下线 legacy draft bindings");
  });

  it("keeps feedback visible after a successful bulk cleanup submission", () => {
    actionStateQueue = [
      {
        status: "success",
        message: "已批量下线 1 条 legacy auth draft binding。",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLegacyAuthCleanupCard, {
        workflowId: "workflow-1",
        bindings: [buildBinding({ id: "binding-draft", lifecycle_status: "draft" })],
        action: async (state: CleanupLegacyPublishedEndpointBindingsState) => state,
      })
    );

    expect(html).toContain("已批量下线 1 条 legacy auth draft binding。");
    expect(html).toContain('class="sync-message success"');
  });
});
