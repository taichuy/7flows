import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

import { WorkspaceStarterTemplateListPanel } from "./template-list-panel";

describe("WorkspaceStarterTemplateListPanel", () => {
  it("surfaces source governance directly on starter cards", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-drifted",
        workspace_id: "default",
        name: "Drifted starter",
        description: "Starter with source governance facts.",
        business_track: "编排节点能力",
        default_workflow_name: "Drifted starter",
        workflow_focus: "Keep starter synced with source workflow.",
        recommended_next_step: "Review source drift.",
        tags: ["sync"],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-drifted",
        created_from_workflow_version: "0.2.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T11:00:00Z",
        source_governance: {
          kind: "drifted",
          status_label: "来源漂移",
          summary: "Starter 与来源 workflow 存在差异。",
          source_workflow_id: "wf-drifted",
          source_workflow_name: "Drifted workflow",
          template_version: "0.2.0",
          source_version: "0.3.0",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "当前主要是来源快照漂移。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["source 0.3.0"]
          },
          outcome_explanation: {
            primary_signal: "当前 starter 与来源 workflow 版本不一致。",
            follow_up: "先打开 source diff，再决定 refresh 还是 rebase。"
          }
        }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterTemplateListPanel, {
        templates,
        filteredTemplates: templates,
        selectedTemplateId: "starter-drifted",
        activeTrack: "all",
        archiveFilter: "all",
        searchQuery: "",
        activeTemplateCount: 1,
        archivedTemplateCount: 0,
        templateToolGovernanceById: new Map(),
        bulkPreview: null,
        bulkPreviewNotice: null,
        isBulkMutating: false,
        isLoadingBulkPreview: false,
        lastBulkResult: null,
        onTrackChange: () => {},
        onArchiveFilterChange: () => {},
        onSearchQueryChange: () => {},
        onSelectTemplate: () => {},
        onFocusTemplate: () => {},
        onBulkAction: () => {}
      })
    );

    expect(html).toContain("Drifted starter");
    expect(html).toContain("来源漂移");
    expect(html).toContain("建议 refresh");
    expect(html).toContain("source 0.3.0");
    expect(html).toContain("Source:</strong> 当前 starter 与来源 workflow 版本不一致。");
    expect(html).toContain("先打开 source diff，再决定 refresh 还是 rebase。");
  });
});
