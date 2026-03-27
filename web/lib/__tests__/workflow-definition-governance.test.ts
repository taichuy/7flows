import { describe, expect, it } from "vitest";

import {
  formatCatalogGapResourceSummary,
  formatCatalogGapSummary,
  formatCatalogGapToolSummary,
  formatToolReferenceIssueSummary,
  formatWorkflowLegacyPublishAuthBacklogSummary,
  formatWorkflowMissingToolSummary,
  getToolReferenceMissingToolIds,
  getWorkflowLegacyPublishAuthBacklogCount,
  getWorkflowLegacyPublishAuthFollowUpCount,
  getWorkflowLegacyPublishAuthIssues,
  getWorkflowLegacyPublishAuthStatusLabel,
  getWorkflowMissingToolIds,
  hasOnlyLegacyPublishAuthModeIssues,
  hasWorkflowLegacyPublishAuthIssues,
  hasWorkflowMissingToolIssues,
  isLegacyPublishAuthModeIssue
} from "@/lib/workflow-definition-governance";
import { buildLegacyAuthGovernanceSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

describe("workflow-definition-governance", () => {
  it("recognizes publish auth blockers from workflow definition issues", () => {
    const issue = {
      category: "publish_draft",
      message: "Public Search 当前不能使用 authMode = token。",
      path: "publish.0.authMode",
      field: "authMode"
    };

    expect(isLegacyPublishAuthModeIssue(issue)).toBe(true);
    expect(
      getWorkflowLegacyPublishAuthIssues({
        definition_issues: [
          issue,
          {
            category: "tool_reference",
            message: "Missing tool",
            path: "nodes.0.config.toolId",
            field: "toolId"
          }
        ]
      })
    ).toEqual([issue]);
    expect(hasWorkflowLegacyPublishAuthIssues({ definition_issues: [issue] })).toBe(true);
    expect(hasOnlyLegacyPublishAuthModeIssues([issue])).toBe(true);
    expect(getWorkflowLegacyPublishAuthBacklogCount({ definition_issues: [issue] })).toBe(1);
    expect(getWorkflowLegacyPublishAuthFollowUpCount({ definition_issues: [issue] })).toBe(1);
    expect(getWorkflowLegacyPublishAuthStatusLabel({ definition_issues: [issue] })).toBe(
      "publish auth blocker"
    );
    expect(formatWorkflowLegacyPublishAuthBacklogSummary({ definition_issues: [issue] })).toBe(
      "1 个当前 publish draft"
    );
  });

  it("ignores non publish auth definition issues", () => {
    expect(
      hasWorkflowLegacyPublishAuthIssues({
        definition_issues: [
          {
            category: "publish_draft",
            message: "Endpoint name is missing.",
            path: "publish.0.name",
            field: "name"
          }
        ]
      })
    ).toBe(false);
    expect(
      hasOnlyLegacyPublishAuthModeIssues([
        {
          category: "publish_draft",
          message: "Endpoint name is missing.",
          path: "publish.0.name",
          field: "name"
        }
      ])
    ).toBe(false);
  });

  it("reuses persisted legacy auth backlog when workflow list items already carry governance summary", () => {
    const workflow = {
      definition_issues: [],
      legacy_auth_governance: {
        binding_count: 2,
        draft_candidate_count: 0,
        published_blocker_count: 1,
        offline_inventory_count: 1
      }
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(2);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(2);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "0 条 draft cleanup、1 条 published blocker、1 条 offline inventory"
    );
  });

  it("reuses workflow publish governance snapshots on runtime surfaces", () => {
    const workflow = {
      definition_issues: [],
      legacy_auth_governance: buildLegacyAuthGovernanceSnapshotFixture({
        binding_count: 3,
        summary: {
          draft_candidate_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 1
        }
      })
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(3);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(3);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "1 条 draft cleanup、1 条 published blocker、1 条 offline inventory"
    );
  });

  it("deduplicates current publish draft issues against persisted legacy auth cleanup counts", () => {
    const workflow = {
      definition_issues: [
        {
          category: "publish_draft",
          message: "Public Search 当前不能使用 authMode = token。",
          path: "publish.0.authMode",
          field: "authMode"
        }
      ],
      legacy_auth_governance: {
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0
      }
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(2);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(2);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "1 条 draft cleanup、1 条 published blocker、0 条 offline inventory"
    );
  });

  it("raises draft cleanup counts from current publish draft issues without double-counting bindings", () => {
    const workflow = {
      definition_issues: [
        {
          category: "publish_draft",
          message: "Endpoint A 当前不能使用 authMode = token。",
          path: "publish.0.authMode",
          field: "authMode"
        },
        {
          category: "publish_draft",
          message: "Endpoint B 当前不能使用 authMode = token。",
          path: "publish.1.authMode",
          field: "authMode"
        }
      ],
      legacy_auth_governance: {
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 0,
        offline_inventory_count: 1
      }
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(3);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(3);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "2 条 draft cleanup、0 条 published blocker、1 条 offline inventory"
    );
  });

  it("recognizes published workflow-item legacy auth backlog without nested summary", () => {
    const workflow = {
      workflow_id: "workflow-legacy-auth",
      binding_count: 2,
      draft_candidate_count: 0,
      published_blocker_count: 1,
      offline_inventory_count: 1,
      tool_governance: {
        referenced_tool_ids: [],
        missing_tool_ids: [],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      }
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(2);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(2);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "0 条 draft cleanup、1 条 published blocker、1 条 offline inventory"
    );
  });

  it("accepts publish governance snapshots as shared legacy auth blockers", () => {
    const workflow = {
      workflow_id: "workflow-legacy-auth",
      legacy_auth_governance: {
        generated_at: "2026-03-26T16:00:00Z",
        workflow_count: 1,
        binding_count: 2,
        auth_mode_contract: {
          supported_auth_modes: ["api_key", "internal"],
          retired_legacy_auth_modes: ["token"],
          summary: "legacy auth needs cleanup",
          follow_up: "switch auth mode"
        },
        summary: {
          draft_candidate_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 0
        },
        checklist: [],
        workflows: [
          {
            workflow_id: "workflow-legacy-auth",
            workflow_name: "Legacy Auth workflow",
            binding_count: 2,
            draft_candidate_count: 1,
            published_blocker_count: 1,
            offline_inventory_count: 0,
            tool_governance: {
              referenced_tool_ids: [],
              missing_tool_ids: [],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            }
          }
        ],
        buckets: {
          draft_candidates: [],
          published_blockers: [],
          offline_inventory: []
        }
      }
    };

    expect(getWorkflowLegacyPublishAuthBacklogCount(workflow)).toBe(2);
    expect(getWorkflowLegacyPublishAuthFollowUpCount(workflow)).toBe(2);
    expect(hasWorkflowLegacyPublishAuthIssues(workflow)).toBe(true);
    expect(getWorkflowLegacyPublishAuthStatusLabel(workflow)).toBe("publish auth blocker");
    expect(formatWorkflowLegacyPublishAuthBacklogSummary(workflow)).toBe(
      "1 条 draft cleanup、1 条 published blocker、0 条 offline inventory"
    );
  });

  it("normalizes workflow missing tool ids into a shared catalog-gap summary", () => {
    const workflow = {
      tool_governance: {
        referenced_tool_ids: ["native.catalog-gap", "native.second-gap", "native.third-gap"],
        missing_tool_ids: [
          " native.catalog-gap ",
          "native.second-gap",
          "native.catalog-gap",
          "native.third-gap",
          ""
        ],
        governed_tool_count: 2,
        strong_isolation_tool_count: 1
      }
    };

    expect(getWorkflowMissingToolIds(workflow)).toEqual([
      "native.catalog-gap",
      "native.second-gap",
      "native.third-gap"
    ]);
    expect(hasWorkflowMissingToolIssues(workflow)).toBe(true);
    expect(formatCatalogGapToolSummary(workflow.tool_governance.missing_tool_ids)).toBe(
      "native.catalog-gap、native.second-gap 等 3 个 tool"
    );
    expect(formatCatalogGapSummary(workflow.tool_governance.missing_tool_ids)).toBe(
      "catalog gap · native.catalog-gap、native.second-gap 等 3 个 tool"
    );
    expect(
      formatCatalogGapResourceSummary(
        "Catalog gap workflow",
        workflow.tool_governance.missing_tool_ids
      )
    ).toBe("Catalog gap workflow · catalog gap · native.catalog-gap、native.second-gap 等 3 个 tool");
    expect(formatWorkflowMissingToolSummary(workflow)).toBe(
      "catalog gap · native.catalog-gap、native.second-gap 等 3 个 tool"
    );
    expect(formatWorkflowMissingToolSummary(workflow, 3)).toBe(
      "catalog gap · native.catalog-gap、native.second-gap、native.third-gap"
    );
  });

  it("extracts missing tool ids from tool reference issues before formatting catalog-gap summaries", () => {
    const issues = [
      {
        category: "tool_reference",
        message: "Tool node 'search:Search' references missing catalog tool 'native.catalog-gap'.",
        path: "nodes.0.config.tool.toolId",
        field: "toolId"
      },
      {
        category: "tool_reference",
        message:
          "LLM agent node 'agent:Planner' toolPolicy.allowedToolIds references missing catalog tools: native.catalog-gap, native.second-gap.",
        path: "nodes.1.config.toolPolicy.allowedToolIds",
        field: "allowedToolIds"
      }
    ];

    expect(getToolReferenceMissingToolIds(issues)).toEqual([
      "native.catalog-gap",
      "native.second-gap"
    ]);
    expect(formatToolReferenceIssueSummary(issues, { maxVisibleToolIds: 3 })).toBe(
      "catalog gap · native.catalog-gap、native.second-gap"
    );
  });

  it("extracts catalog tool ids from ecosystem drift issues", () => {
    const issues = [
      {
        category: "tool_reference",
        message:
          "Tool node 'search:Search' declares ecosystem 'native' for catalog tool 'compat.drifted', but the current catalog reports 'compat'.",
        path: "nodes.0.config.tool.ecosystem",
        field: "ecosystem"
      }
    ];

    expect(getToolReferenceMissingToolIds(issues)).toEqual(["compat.drifted"]);
    expect(formatToolReferenceIssueSummary(issues)).toBe("catalog gap · compat.drifted");
  });

  it("keeps catalog-gap summary even when callers provide a fallback label", () => {
    const issues = [
      {
        category: "tool_reference",
        message:
          "Tool node 'search:Search' declares ecosystem 'native' for catalog tool 'compat.drifted', but the current catalog reports 'compat'.",
        path: "nodes.0.config.tool.ecosystem",
        field: "ecosystem"
      }
    ];

    expect(
      formatToolReferenceIssueSummary(issues, {
        fallbackLabel: "工具目录引用"
      })
    ).toBe("catalog gap · compat.drifted");
  });
});
