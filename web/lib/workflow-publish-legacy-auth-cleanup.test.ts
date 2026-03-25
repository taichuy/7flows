import { describe, expect, it } from "vitest";

import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import {
  buildLegacyPublishAuthModeContractFixture,
  buildLegacyPublishUnsupportedAuthIssueFixture,
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";
import {
  buildWorkflowPublishLegacyAuthExportHint,
  buildWorkflowPublishLegacyAuthCleanupExportFilename,
  buildWorkflowPublishLegacyAuthCleanupExportPayload,
  buildWorkflowPublishLegacyAuthCleanupExportSuccessMessage,
  buildWorkflowPublishLegacyAuthCleanupSuccessMessage,
  buildWorkflowPublishLegacyAuthCleanupSurface,
  serializeWorkflowPublishLegacyAuthCleanupExportJsonl,
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
    issues: [buildLegacyPublishUnsupportedAuthIssueFixture({ field: undefined })],
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
    expect(surface.candidateBindings[0]?.detail).toContain(
      "Publish auth contract：supported api_key / internal；legacy token。"
    );
    expect(surface.publishedBindings[0]?.detail).toContain(
      "Publish auth contract：supported api_key / internal；legacy token。"
    );
    expect(surface.publishedBindings[0]?.detail).toContain(
      "先把 workflow draft endpoint 切回 api_key/internal 并保存"
    );
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

  it("builds governance export payload and jsonl records from the current buckets", () => {
    const payload = buildWorkflowPublishLegacyAuthCleanupExportPayload({
      workflowId: "workflow-1",
      workflowName: "Demo workflow",
      workflow: {
        tool_governance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0,
        },
      },
      bindings: [
        buildBinding({ id: "binding-draft", lifecycle_status: "draft", workflow_version: "1.2.0" }),
        buildBinding({ id: "binding-live", lifecycle_status: "published", workflow_version: "1.1.0" }),
        buildBinding({ id: "binding-offline", lifecycle_status: "offline", workflow_version: "1.0.0" }),
      ],
      exportedAt: "2026-03-24T08:30:00Z",
    });

    expect(payload.export.exported_at).toBe("2026-03-24T08:30:00Z");
    expect(payload.auth_mode_contract).toEqual(buildLegacyPublishAuthModeContractFixture());
    expect(payload.summary).toEqual({
      draft_candidate_count: 1,
      published_blocker_count: 1,
      offline_inventory_count: 1,
    });
    expect(payload.checklist.map((item) => item.key)).toEqual([
      "draft_cleanup",
      "published_follow_up",
      "offline_inventory",
    ]);
    expect(payload.buckets.draft_candidates[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-1?definition_issue=missing_tool",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: "missing_tool",
    });
    expect(payload.buckets.published_blockers[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-1?definition_issue=missing_tool",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: "missing_tool",
    });
    expect(payload.buckets.offline_inventory[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-1?definition_issue=missing_tool",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: "missing_tool",
    });

    const jsonl = serializeWorkflowPublishLegacyAuthCleanupExportJsonl({
      ...payload,
      export: {
        ...payload.export,
        format: "jsonl",
      },
    });
    const lines = jsonl.trim().split("\n").map((line) => JSON.parse(line));

    expect(lines[0]).toMatchObject({
      record_type: "legacy_publish_auth_governance_export",
      auth_mode_contract: buildLegacyPublishAuthModeContractFixture(),
      workflow: {
        workflow_id: "workflow-1",
        workflow_name: "Demo workflow",
      },
    });
    expect(lines[1]).toMatchObject({
      record_type: "legacy_publish_auth_binding",
      bucket: "draft_candidates",
      bindingId: "binding-draft",
      workflow_follow_up: {
        workflow_detail_href: "/workflows/workflow-1?definition_issue=missing_tool",
        workflow_detail_label: "回到 workflow 编辑器",
        definition_issue: "missing_tool",
      },
    });
    expect(lines[3]).toMatchObject({
      record_type: "legacy_publish_auth_binding",
      bucket: "offline_inventory",
      bindingId: "binding-offline",
      workflow_follow_up: {
        workflow_detail_href: "/workflows/workflow-1?definition_issue=missing_tool",
        workflow_detail_label: "回到 workflow 编辑器",
        definition_issue: "missing_tool",
      },
    });
  });

  it("builds readable export filenames and success feedback", () => {
    expect(buildWorkflowPublishLegacyAuthCleanupExportFilename("Demo workflow", "jsonl")).toBe(
      "demo-workflow-legacy-publish-auth-governance.jsonl"
    );
    expect(buildWorkflowPublishLegacyAuthCleanupExportSuccessMessage("json")).toBe(
      "Legacy publish auth 治理JSON清单已开始下载。"
    );
  });

  it("builds publish activity export hints from workflow-level legacy auth backlog", () => {
    const surface = buildWorkflowPublishLegacyAuthCleanupSurface([
      buildBinding({ id: "binding-live", lifecycle_status: "published" }),
      buildBinding({ id: "binding-offline", lifecycle_status: "offline" }),
    ]);

    expect(buildWorkflowPublishLegacyAuthExportHint(surface)).toBe(
      "导出的 published invocation JSON / JSONL 也会附带当前 workflow 的 legacy publish auth handoff：draft 0 / published 1 / offline 1。"
    );
    expect(
      buildWorkflowPublishLegacyAuthExportHint(
        buildWorkflowPublishLegacyAuthCleanupSurface([
          buildBinding({ id: "binding-clean", auth_mode: "api_key", issues: [] }),
        ])
      )
    ).toBeNull();
  });
});
