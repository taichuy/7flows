import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowPublishLegacyAuthCleanupCard } from "@/components/workflow-publish-legacy-auth-cleanup-card";
import type { CleanupLegacyPublishedEndpointBindingsState } from "@/app/actions/publish";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import type { WorkflowPublishLegacyAuthCleanupWorkflowLike } from "@/lib/workflow-publish-legacy-auth-cleanup";
import { buildLegacyPublishUnsupportedAuthIssueFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

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

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

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
    issues: [buildLegacyPublishUnsupportedAuthIssueFixture({ field: undefined })],
    ...overrides,
  };
}

function buildWorkflow(
  overrides: Partial<WorkflowPublishLegacyAuthCleanupWorkflowLike> = {}
): WorkflowPublishLegacyAuthCleanupWorkflowLike {
  return {
    definition_issues: [],
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0,
    },
    legacy_auth_governance: {
      binding_count: 3,
      draft_candidate_count: 1,
      published_blocker_count: 1,
      offline_inventory_count: 1,
    },
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
        workflowDetailHref: "/workflows/workflow-1?needs_follow_up=true&starter=starter-1",
        workflow: buildWorkflow({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0,
          },
        }),
        bindings: [
          buildBinding({ id: "binding-draft", workflow_version: "1.2.0", lifecycle_status: "draft" }),
          buildBinding({ id: "binding-live", workflow_version: "1.1.0", lifecycle_status: "published" }),
          buildBinding({ id: "binding-offline", workflow_version: "1.0.0", lifecycle_status: "offline" }),
        ],
        action: async (state: CleanupLegacyPublishedEndpointBindingsState) => state,
      })
    );

    expect(html).toContain("Legacy publish auth cleanup");
    expect(html).toContain("Publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain("legacy token");
    expect(html).toContain("Draft cleanup candidate");
    expect(html).toContain("Published blocker");
    expect(html).toContain("Public Search (endpoint-1) · workflow 1.0.0 · offline");
    expect(html).toContain("Operator checklist");
    expect(html).toContain("Governance export");
    expect(html).toContain("导出 JSON 清单");
    expect(html).toContain("导出 JSONL 清单");
    expect(html).toContain("批量下线 legacy draft bindings");
    expect(html).toContain("Workflow handoff");
    expect(html).toContain("Workflow governance");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再继续对照当前 legacy publish auth cleanup、governance export 与 publish activity export。"
    );
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      'href="/workflows/workflow-1?needs_follow_up=true&amp;starter=starter-1&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?needs_follow_up=true&amp;starter=starter-1&amp;definition_issue=legacy_publish_auth"'
    );
    expect(html).toContain("导出的治理清单会继续保留当前 workflow 的 shared governance handoff");
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

  it("marks the current legacy publish auth handoff as the active workflow issue", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLegacyAuthCleanupCard, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflowDetailHref: "/workflows/workflow-1?definition_issue=legacy_publish_auth",
        currentHref: "/workflows/workflow-1?definition_issue=legacy_publish_auth",
        workflow: buildWorkflow({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0,
          },
        }),
        bindings: [buildBinding()],
        action: async (state: CleanupLegacyPublishedEndpointBindingsState) => state,
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/workflows/workflow-1?definition_issue=legacy_publish_auth"');
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
  });
});
