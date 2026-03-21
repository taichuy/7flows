import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import { buildWorkspaceStarterTemplateListSurfaceCopy } from "@/lib/workbench-entry-surfaces";

import { WorkspaceStarterTemplateListPanel } from "./template-list-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterTemplateListPanel", () => {
  it("surfaces source governance directly on starter cards", () => {
    const surfaceCopy = buildWorkspaceStarterTemplateListSurfaceCopy({
      createWorkflowHref: "/workflows/new"
    });
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
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "",
        createWorkflowHref: "/workflows/new",
        activeTemplateCount: 1,
        archivedTemplateCount: 0,
        templateToolGovernanceById: new Map(),
        bulkPreview: null,
        bulkPreviewNotice: null,
        isBulkMutating: false,
        isLoadingBulkPreview: false,
        isLoadingSourceGovernanceScope: false,
        lastBulkResult: null,
        sourceGovernanceScope: {
          workspace_id: "default",
          total_count: 1,
          attention_count: 1,
          counts: {
            drifted: 1,
            missing_source: 0,
            no_source: 0,
            synced: 0
          },
          chips: ["来源漂移 1"],
          summary: "当前筛选范围 1 个 starter 中，来源漂移 1 个；AI/operator 可以直接按 follow-up queue 继续治理。",
          follow_up_template_ids: ["starter-drifted"]
        },
        onTrackChange: () => {},
        onArchiveFilterChange: () => {},
        onSourceGovernanceKindChange: () => {},
        onNeedsFollowUpChange: () => {},
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
    expect(html).toContain("全部治理状态");
    expect(html).toContain(surfaceCopy.sourceGovernanceMeta);
    expect(html).toContain(surfaceCopy.followUpQueueLabel);
    expect(html).toContain(surfaceCopy.followUpQueueMeta);
    expect(html).toContain("后端 summary 已把当前范围里的 follow-up queue 编成统一清单");
  });

  it("reuses the shared create entry contract in the empty state CTA", () => {
    const createWorkflowHref =
      "/workflows/new?needs_follow_up=true&q=sandbox&source_governance_kind=drifted";
    const surfaceCopy = buildWorkspaceStarterTemplateListSurfaceCopy({
      createWorkflowHref
    });
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterTemplateListPanel, {
        templates: [],
        filteredTemplates: [],
        selectedTemplateId: null,
        activeTrack: "all",
        archiveFilter: "active",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        searchQuery: " sandbox ",
        createWorkflowHref,
        activeTemplateCount: 0,
        archivedTemplateCount: 0,
        templateToolGovernanceById: new Map(),
        bulkPreview: null,
        bulkPreviewNotice: null,
        isBulkMutating: false,
        isLoadingBulkPreview: false,
        isLoadingSourceGovernanceScope: false,
        lastBulkResult: null,
        sourceGovernanceScope: null,
        onTrackChange: () => {},
        onArchiveFilterChange: () => {},
        onSourceGovernanceKindChange: () => {},
        onNeedsFollowUpChange: () => {},
        onSearchQueryChange: () => {},
        onSelectTemplate: () => {},
        onFocusTemplate: () => {},
        onBulkAction: () => {}
      })
    );

    expect(html).toContain(surfaceCopy.emptyStateDescription);
    expect(html).toContain(surfaceCopy.emptyStateLinks.overrides?.createWorkflow?.label ?? "");
    expect(html).toContain(
      '/workflows/new?needs_follow_up=true&amp;q=sandbox&amp;source_governance_kind=drifted'
    );
  });
});
