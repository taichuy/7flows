import { describe, expect, it } from "vitest";

import {
  formatToolReferenceIssueSummary,
  formatCatalogGapResourceSummary,
  formatCatalogGapSummary,
  formatCatalogGapToolSummary,
  formatWorkflowMissingToolSummary,
  getToolReferenceMissingToolIds,
  getWorkflowLegacyPublishAuthIssues,
  getWorkflowMissingToolIds,
  hasOnlyLegacyPublishAuthModeIssues,
  hasWorkflowLegacyPublishAuthIssues,
  hasWorkflowMissingToolIssues,
  isLegacyPublishAuthModeIssue
} from "@/lib/workflow-definition-governance";

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
      formatCatalogGapResourceSummary("Catalog gap workflow", workflow.tool_governance.missing_tool_ids)
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

  it("falls back to catalog reference wording for non-missing tool drift issues", () => {
    const issues = [
      {
        category: "tool_reference",
        message:
          "Tool node 'search:Search' declares ecosystem 'native' for catalog tool 'compat.drifted', but the current catalog reports 'compat'.",
        path: "nodes.0.config.tool.ecosystem",
        field: "ecosystem"
      }
    ];

    expect(getToolReferenceMissingToolIds(issues)).toEqual([]);
    expect(formatToolReferenceIssueSummary(issues)).toBe(
      "tool catalog reference：Tool node 'search:Search' declares ecosystem 'native' for catalog tool 'compat.drifted', but the current catalog reports 'compat'."
    );
  });
});
