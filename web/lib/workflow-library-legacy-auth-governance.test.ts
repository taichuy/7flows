import { describe, expect, it } from "vitest";

import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import {
  buildWorkflowLibraryLegacyAuthGovernanceExportFilename,
  buildWorkflowLibraryLegacyAuthGovernanceExportPayload,
  buildWorkflowLibraryLegacyAuthGovernanceExportSuccessMessage,
  serializeWorkflowLibraryLegacyAuthGovernanceExportJsonl,
  shouldRenderWorkflowLibraryLegacyAuthGovernance,
} from "@/lib/workflow-library-legacy-auth-governance";

function buildSnapshot(
  overrides: Partial<WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot> = {},
): WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot {
  return {
    generated_at: "2026-03-24T09:00:00Z",
    workflow_count: 2,
    binding_count: 4,
    summary: {
      draft_candidate_count: 1,
      published_blocker_count: 2,
      offline_inventory_count: 1,
    },
    checklist: [
      {
        key: "draft_cleanup",
        title: "先批量下线 draft legacy bindings",
        tone: "ready",
        tone_label: "可立即执行",
        count: 1,
        detail: "先处理 draft cleanup。",
      },
    ],
    workflows: [
      {
        workflow_id: "workflow-legacy-auth",
        workflow_name: "Legacy Auth workflow",
        binding_count: 3,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 1,
        tool_governance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0,
        },
      },
      {
        workflow_id: "workflow-replacement",
        workflow_name: "Replacement Ready workflow",
        binding_count: 1,
        draft_candidate_count: 0,
        published_blocker_count: 1,
        offline_inventory_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0,
        },
      },
    ],
    buckets: {
      draft_candidates: [
        {
          workflow_id: "workflow-legacy-auth",
          workflow_name: "Legacy Auth workflow",
          binding_id: "binding-draft",
          endpoint_id: "native-chat",
          endpoint_name: "Native Chat",
          workflow_version: "1.2.0",
          lifecycle_status: "draft",
          auth_mode: "token",
        },
      ],
      published_blockers: [
        {
          workflow_id: "workflow-replacement",
          workflow_name: "Replacement Ready workflow",
          binding_id: "binding-live",
          endpoint_id: "native-chat",
          endpoint_name: "Native Chat",
          workflow_version: "1.0.0",
          lifecycle_status: "published",
          auth_mode: "token",
        },
      ],
      offline_inventory: [
        {
          workflow_id: "workflow-legacy-auth",
          workflow_name: "Legacy Auth workflow",
          binding_id: "binding-offline",
          endpoint_id: "native-chat",
          endpoint_name: "Native Chat",
          workflow_version: "1.0.0",
          lifecycle_status: "offline",
          auth_mode: "token",
        },
      ],
    },
    ...overrides,
  };
}

describe("workflow library legacy auth governance helpers", () => {
  it("detects when the governance card should render", () => {
    expect(shouldRenderWorkflowLibraryLegacyAuthGovernance(buildSnapshot())).toBe(true);
    expect(
      shouldRenderWorkflowLibraryLegacyAuthGovernance(
        buildSnapshot({ workflow_count: 0, binding_count: 0, workflows: [] }),
      ),
    ).toBe(false);
  });

  it("builds export payload and jsonl records from the snapshot", () => {
    const payload = buildWorkflowLibraryLegacyAuthGovernanceExportPayload({
      snapshot: buildSnapshot(),
      exportedAt: "2026-03-24T09:30:00Z",
      format: "jsonl",
    });

    expect(payload.export).toEqual({
      exported_at: "2026-03-24T09:30:00Z",
      format: "jsonl",
      workflow_count: 2,
      binding_count: 4,
    });
    expect(payload.summary.published_blocker_count).toBe(2);
    expect(payload.workflows[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-legacy-auth?definition_issue=missing_tool",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: "missing_tool",
    });
    expect(payload.workflows[1]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-replacement",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: null,
    });
    expect(payload.buckets.draft_candidates[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-legacy-auth?definition_issue=missing_tool",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: "missing_tool",
    });
    expect(payload.buckets.published_blockers[0]?.workflow_follow_up).toEqual({
      workflow_detail_href: "/workflows/workflow-replacement",
      workflow_detail_label: "回到 workflow 编辑器",
      definition_issue: null,
    });

    const jsonl = serializeWorkflowLibraryLegacyAuthGovernanceExportJsonl(payload);
    const lines = jsonl.trim().split("\n").map((line) => JSON.parse(line));

    expect(lines[0]).toMatchObject({
      record_type: "legacy_publish_auth_library_export",
      export: {
        format: "jsonl",
        workflow_count: 2,
      },
    });
    expect(lines[1]).toMatchObject({
      record_type: "legacy_publish_auth_workflow",
      workflow_name: "Legacy Auth workflow",
      workflow_follow_up: {
        workflow_detail_href: "/workflows/workflow-legacy-auth?definition_issue=missing_tool",
        definition_issue: "missing_tool",
      },
    });
    expect(lines[3]).toMatchObject({
      record_type: "legacy_publish_auth_binding",
      bucket: "draft_candidates",
      binding_id: "binding-draft",
      workflow_follow_up: {
        workflow_detail_href: "/workflows/workflow-legacy-auth?definition_issue=missing_tool",
        definition_issue: "missing_tool",
      },
    });
    expect(lines[4]).toMatchObject({
      record_type: "legacy_publish_auth_binding",
      bucket: "published_blockers",
      binding_id: "binding-live",
      workflow_follow_up: {
        workflow_detail_href: "/workflows/workflow-replacement",
        definition_issue: null,
      },
    });
  });

  it("builds readable filenames and success feedback", () => {
    expect(buildWorkflowLibraryLegacyAuthGovernanceExportFilename("jsonl")).toBe(
      "workflow-library-legacy-publish-auth-governance.jsonl",
    );
    expect(buildWorkflowLibraryLegacyAuthGovernanceExportSuccessMessage("json")).toBe(
      "Workflow library legacy publish auth 治理JSON清单已开始下载。",
    );
  });
});
