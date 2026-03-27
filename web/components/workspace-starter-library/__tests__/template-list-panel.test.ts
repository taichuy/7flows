import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import { buildWorkspaceStarterTemplateListSurfaceCopy } from "@/lib/workbench-entry-surfaces";

import { WorkspaceStarterTemplateListPanel } from "../template-list-panel";

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
    expect(html).toContain("Recommended next step");
    expect(html).toContain(
      "Primary governed starter: Drifted starter · 建议 refresh · source 0.3.0."
    );
    expect(html).toContain("先打开 source diff，再决定 refresh 还是 rebase。");
    expect(html).toContain("全部治理状态");
    expect(html).toContain("Primary follow-up");
    expect(html).toContain("Drifted starter 当前是共享来源治理队列的首个待处理 starter。");
    expect(html).toContain("优先聚焦 starter：Drifted starter");
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

    expect(html).toContain("Recommended next step");
    expect(html).toContain(surfaceCopy.emptyStateDescription);
    expect(html).toContain(surfaceCopy.emptyStateLinks.overrides?.createWorkflow?.label ?? "");
    expect(html).toContain(
      '/workflows/new?needs_follow_up=true&amp;q=sandbox&amp;source_governance_kind=drifted'
    );
  });

  it("projects the queued starter create CTA into the primary follow-up instead of reusing the current selection", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-selected",
        workspace_id: "default",
        name: "Selected starter",
        description: "Currently selected starter.",
        business_track: "应用新建编排",
        default_workflow_name: "Selected starter",
        workflow_focus: "Keep the current selection stable.",
        recommended_next_step: "Keep reviewing the selected starter.",
        tags: ["selected"],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-selected",
        created_from_workflow_version: "0.1.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:10:00Z",
        source_governance: {
          kind: "synced",
          status_label: "已对齐",
          summary: "当前 starter 与来源 workflow 已对齐。",
          source_workflow_id: "wf-selected",
          source_workflow_name: "Selected workflow",
          template_version: "0.1.0",
          source_version: "0.1.0",
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
      {
        id: "starter-missing-source",
        workspace_id: "default",
        name: "Missing source starter",
        description: "Starter with an unavailable source workflow.",
        business_track: "应用新建编排",
        default_workflow_name: "Missing source starter",
        workflow_focus: "Keep authoring unblocked.",
        recommended_next_step: "Confirm the template is still reusable.",
        tags: ["missing-source"],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-missing",
        created_from_workflow_version: "0.4.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T12:00:00Z",
        updated_at: "2026-03-21T12:30:00Z",
        source_governance: {
          kind: "missing_source",
          status_label: "来源缺失",
          summary: "记录中的来源 workflow 已不存在或当前不可访问。",
          source_workflow_id: "wf-missing",
          source_workflow_name: null,
          template_version: "0.4.0",
          source_version: null,
          action_decision: null,
          outcome_explanation: {
            primary_signal: "当前 starter 记录的来源 workflow 已不可用。",
            follow_up: "先在当前库里确认模板仍可复用，再从创建页继续创建。"
          }
        }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterTemplateListPanel, {
        templates,
        filteredTemplates: templates,
        selectedTemplateId: "starter-selected",
        activeTrack: "应用新建编排",
        archiveFilter: "active",
        sourceGovernanceKind: "missing_source",
        needsFollowUp: true,
        searchQuery: "source",
        createWorkflowHref:
          "/workflows/new?needs_follow_up=true&q=source&source_governance_kind=missing_source&starter=starter-selected&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        activeTemplateCount: 2,
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
          total_count: 2,
          attention_count: 1,
          counts: {
            drifted: 0,
            missing_source: 1,
            no_source: 0,
            synced: 1
          },
          chips: ["来源缺失 1", "已对齐 1"],
          summary: "当前筛选范围 2 个 starter 中，来源缺失 1 个；可以直接处理共享 follow-up。",
          follow_up_template_ids: ["starter-missing-source"]
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

    expect(html).toContain("Missing source starter 当前是共享来源治理队列的首个待处理 starter。");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    const primaryFollowUpSection =
      html.split("Primary follow-up")[1]?.split("后端 summary 已把当前范围里的 follow-up queue 编成统一清单")[0] ?? "";
    expect(primaryFollowUpSection).toContain(
      '/workflows/new?needs_follow_up=true&amp;q=source&amp;source_governance_kind=missing_source&amp;starter=starter-missing-source&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(primaryFollowUpSection).not.toContain(
      "starter-selected&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("keeps the scoped create CTA on the individual starter card when source governance is missing", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-missing-source",
        workspace_id: "default",
        name: "Missing source starter",
        description: "Starter with a deleted source workflow.",
        business_track: "应用新建编排",
        default_workflow_name: "Missing Source Workflow",
        workflow_focus: "Keep authoring unblocked.",
        recommended_next_step: "Confirm the template is still reusable.",
        tags: ["workspace starter"],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-missing",
        created_from_workflow_version: "0.4.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T12:00:00Z",
        updated_at: "2026-03-21T12:30:00Z",
        source_governance: {
          kind: "missing_source",
          status_label: "来源缺失",
          summary: "记录中的来源 workflow 已不存在或当前不可访问。",
          source_workflow_id: "wf-missing",
          source_workflow_name: null,
          template_version: "0.4.0",
          source_version: null,
          action_decision: null,
          outcome_explanation: {
            primary_signal: "当前 starter 记录的来源 workflow 已不可用。",
            follow_up: "先在当前库里确认模板仍可复用，再从创建页继续创建。"
          }
        }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterTemplateListPanel, {
        templates,
        filteredTemplates: templates,
        selectedTemplateId: "starter-missing-source",
        activeTrack: "应用新建编排",
        archiveFilter: "active",
        sourceGovernanceKind: "missing_source",
        needsFollowUp: true,
        searchQuery: "source",
        createWorkflowHref:
          "/workflows/new?needs_follow_up=true&q=source&source_governance_kind=missing_source&starter=starter-selected&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        activeTemplateCount: 1,
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

    expect(html).toContain("Missing source starter");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain(
      '/workflows/new?needs_follow_up=true&amp;q=source&amp;source_governance_kind=missing_source&amp;starter=starter-missing-source&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).not.toContain("starter-selected&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92");
  });

  it("prioritizes catalog gap follow-up on starter cards and deep-links back to the source workflow", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
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
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterTemplateListPanel, {
        templates,
        filteredTemplates: templates,
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
        selectedTemplateId: "starter-catalog-gap",
        activeTrack: "应用新建编排",
        archiveFilter: "active",
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "gap",
        createWorkflowHref:
          "/workflows/new?q=gap&starter=starter-catalog-gap&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        activeTemplateCount: 1,
        archivedTemplateCount: 0,
        templateToolGovernanceById: new Map([
          [
            "starter-catalog-gap",
            {
              referencedToolIds: ["catalog.tool.missing"],
              referencedTools: [],
              missingToolIds: ["catalog.tool.missing"],
              governedToolCount: 1,
              strongIsolationToolCount: 0
            }
          ]
        ]),
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

    expect(html).toContain("Catalog gap starter");
    expect(html).toContain("catalog gap");
    expect(html).toContain("当前 starter 仍有 catalog gap（catalog.tool.missing）");
    expect(html).toContain(
      "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。"
    );
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
    expect(html).toContain(
      "Primary governed starter: Catalog gap starter · catalog gap · catalog.tool.missing · publish auth blocker · source 0.4.0."
    );
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).toContain("starter=starter-catalog-gap");
    expect(html).toContain("wf-gap");
  });
});
