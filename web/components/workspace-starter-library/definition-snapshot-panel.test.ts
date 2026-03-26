import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceStarterDefinitionSnapshotPanel } from "./definition-snapshot-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterDefinitionSnapshotPanel", () => {
  it("shows the shared follow-up card when no starter is selected", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterDefinitionSnapshotPanel, {
        selectedTemplate: null,
        selectedTemplateSandboxGovernance: {
          sandboxNodeCount: 0,
          explicitExecutionCount: 0,
          executionClasses: [],
          dependencyModes: [],
          dependencyModeCounts: {},
          builtinPackageSets: [],
          dependencyRefs: [],
          backendExtensionNodeCount: 0,
          backendExtensionKeys: [],
          nodes: []
        },
        selectedTemplateToolGovernance: {
          referencedToolIds: [],
          referencedTools: [],
          missingToolIds: [],
          governedToolCount: 0,
          strongIsolationToolCount: 0
        },
        sourceGovernance: null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?needs_follow_up=true&source_governance_kind=drifted",
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("当前没有可预览的模板定义。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("当前筛选条件下还没有可继续治理的 workspace starter。");
    expect(html).toContain("去创建第一个 starter");
    expect(html).toContain(
      "/workflows/new?needs_follow_up=true&amp;source_governance_kind=drifted"
    );
  });

  it("surfaces the missing-tool follow-up and source workflow deep link in the snapshot sidebar", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterDefinitionSnapshotPanel, {
        selectedTemplate: {
          id: "starter-catalog-gap",
          workspace_id: "default",
          name: "Catalog gap starter",
          description: "Starter with a missing tool binding.",
          business_track: "应用新建编排",
          default_workflow_name: "Catalog gap starter",
          workflow_focus: "Keep authoring unblocked.",
          recommended_next_step: "Review the missing tool binding.",
          tags: ["catalog-gap"],
          definition: {
            nodes: [],
            edges: []
          },
          created_from_workflow_id: "wf-gap",
          created_from_workflow_version: "0.4.0",
          archived: false,
          archived_at: null,
          created_at: "2026-03-21T12:00:00Z",
          updated_at: "2026-03-21T12:30:00Z",
          source_governance: {
            kind: "synced",
            status_label: "已对齐",
            summary: "当前 starter 与来源 workflow 已对齐。",
            source_workflow_id: "wf-gap",
            source_workflow_name: "Catalog gap workflow",
            template_version: "0.4.0",
            source_version: "0.4.0",
            action_decision: {
              recommended_action: "none",
              status_label: "已对齐",
              summary: "当前无需额外治理。",
              can_refresh: false,
              can_rebase: false,
              fact_chips: []
            },
            outcome_explanation: {
              primary_signal: "当前 starter 与来源 workflow 已对齐。",
              follow_up: null
            }
          }
        },
        selectedTemplateSandboxGovernance: {
          sandboxNodeCount: 0,
          explicitExecutionCount: 0,
          executionClasses: [],
          dependencyModes: [],
          dependencyModeCounts: {},
          builtinPackageSets: [],
          dependencyRefs: [],
          backendExtensionNodeCount: 0,
          backendExtensionKeys: [],
          nodes: []
        },
        selectedTemplateToolGovernance: {
          referencedToolIds: ["catalog.tool.missing"],
          referencedTools: [],
          missingToolIds: ["catalog.tool.missing"],
          governedToolCount: 1,
          strongIsolationToolCount: 0
        },
        sourceWorkflowSummariesById: {
          "wf-gap": {
            id: "wf-gap",
            name: "Catalog gap workflow",
            version: "0.4.0",
            status: "draft",
            node_count: 3,
            definition_issues: [],
            tool_governance: {
              referenced_tool_ids: ["catalog.tool.missing"],
              missing_tool_ids: ["catalog.tool.missing"],
              governed_tool_count: 1,
              strong_isolation_tool_count: 0
            },
            legacy_auth_governance: {
              binding_count: 2,
              draft_candidate_count: 1,
              published_blocker_count: 1,
              offline_inventory_count: 0
            }
          }
        },
        sourceGovernance: {
          kind: "synced",
          status_label: "已对齐",
          summary: "当前 starter 与来源 workflow 已对齐。",
          source_workflow_id: "wf-gap",
          source_workflow_name: "Catalog gap workflow",
          template_version: "0.4.0",
          source_version: "0.4.0",
          action_decision: {
            recommended_action: "none",
            status_label: "已对齐",
            summary: "当前无需额外治理。",
            can_refresh: false,
            can_rebase: false,
            fact_chips: []
          },
          outcome_explanation: {
            primary_signal: "当前 starter 与来源 workflow 已对齐。",
            follow_up: null
          }
        },
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-catalog-gap",
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "all",
          needsFollowUp: false,
          searchQuery: "gap",
          selectedTemplateId: "starter-catalog-gap"
        },
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("Catalog gap starter");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("catalog gap");
    expect(html).toContain(
      "当前 starter 仍有 catalog gap（catalog.tool.missing）；来源 workflow 还保留 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory 的 publish auth blocker，先回源 workflow 统一收口 catalog gap / publish auth contract，再回来继续复用或创建。"
    );
    expect(html).toContain(
      "Primary governed starter: Catalog gap starter · catalog gap · catalog.tool.missing · publish auth blocker · source 0.4.0."
    );
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).toContain("wf-gap");
  });
});
