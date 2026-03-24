import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  WorkspaceStarterBulkPreview,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterSourceGovernanceScopeSummary,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import { WorkspaceStarterBulkGovernanceCard } from "./bulk-governance-card";
import {
  buildBulkActionMessage,
  buildWorkspaceStarterBulkAffectedStarterTargets,
  buildWorkspaceStarterBulkPreviewFocusTargets,
  buildWorkspaceStarterBulkResultFocusTargets,
  buildWorkspaceStarterSourceGovernanceFocusTargets,
  buildWorkspaceStarterSourceGovernancePrimaryFollowUp
} from "./shared";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterBulkGovernanceCard", () => {
  it("renders sandbox dependency drift narrative for the latest bulk run", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-sandbox",
        workspace_id: "default",
        name: "Sandbox starter",
        description: "",
        business_track: "编排节点能力",
        default_workflow_name: "Sandbox starter",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-demo",
        created_from_workflow_version: "0.1.4",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:00:00Z",
        source_governance: {
          kind: "drifted",
          status_label: "来源漂移",
          summary: "Starter 与来源 workflow 仍有差异。",
          source_workflow_id: "wf-demo",
          source_workflow_name: "Demo workflow",
          template_version: "0.1.4",
          source_version: "0.1.5",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "当前主要是来源快照漂移。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["source 0.1.5"]
          },
          outcome_explanation: {
            primary_signal: "当前 starter 与来源 workflow 版本不一致。",
            follow_up: "先看 result receipt，再决定是否继续 refresh 或 rebase。"
          }
        }
      },
      {
        id: "starter-manual",
        workspace_id: "default",
        name: "Manual starter",
        description: "",
        business_track: "应用新建编排",
        default_workflow_name: "Manual starter",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: null,
        created_from_workflow_version: null,
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:00:00Z",
        source_governance: {
          kind: "no_source",
          status_label: "无来源",
          summary: "这个 starter 没有绑定来源 workflow。",
          source_workflow_id: null,
          source_workflow_name: null,
          template_version: null,
          source_version: null,
          action_decision: null,
          outcome_explanation: {
            primary_signal: "当前 starter 只保留模板快照。",
            follow_up: "如果希望批量 refresh / rebase，需要先补来源绑定。"
          }
        }
      }
    ];
    const lastResult: WorkspaceStarterBulkActionResult = {
      workspace_id: "default",
      action: "refresh",
      requested_count: 2,
      updated_count: 1,
      skipped_count: 1,
      updated_items: [],
      deleted_items: [],
      skipped_items: [
        {
          template_id: "starter-manual",
          name: "Manual starter",
          archived: false,
          reason: "no_source_workflow",
          detail: "Workspace starter has no source workflow.",
          source_workflow_id: null,
          source_workflow_version: null,
          action_decision: null,
          sandbox_dependency_changes: null,
          sandbox_dependency_nodes: []
        }
      ],
      skipped_reason_summary: [
        {
          reason: "no_source_workflow",
          count: 1,
          detail: "Workspace starter has no source workflow."
        }
      ],
      sandbox_dependency_changes: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      sandbox_dependency_items: [
        {
          template_id: "starter-sandbox",
          name: "Sandbox starter",
          source_workflow_id: "wf-demo",
          source_workflow_version: "0.1.5",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"]
        }
      ],
      receipt_items: [
        {
          template_id: "starter-sandbox",
          name: "Sandbox starter",
          outcome: "updated",
          archived: false,
          reason: null,
          detail: "已把 starter 快照应用到最新来源事实。",
          source_workflow_id: "wf-demo",
          source_workflow_version: "0.1.5",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "当前主要是来源快照漂移。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["source 0.1.5"]
          },
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"],
          changed: true,
          rebase_fields: []
        },
        {
          template_id: "starter-manual",
          name: "Manual starter",
          outcome: "skipped",
          archived: false,
          reason: "no_source_workflow",
          detail: "Workspace starter has no source workflow.",
          source_workflow_id: null,
          source_workflow_version: null,
          action_decision: null,
          sandbox_dependency_changes: null,
          sandbox_dependency_nodes: [],
          changed: false,
          rebase_fields: []
        }
      ],
      outcome_explanation: {
        primary_signal:
          "本次批量刷新请求 2 个 starter；实际处理 1 个。 结果回执里还有 1 个跳过项（无来源 1）。 其中 1 个 starter / 1 个 sandbox 依赖漂移节点已沉淀进同一份 result receipt。",
        follow_up:
          "先修复来源 workflow 的缺失或无效问题，再重新执行批量刷新。 优先复核 result receipt 中带 sandbox drift 的 starter，确认依赖节点与隔离策略是否仍符合预期。"
      },
      follow_up_template_ids: ["starter-manual", "starter-sandbox"]
    };
    const preview: WorkspaceStarterBulkPreview = {
      workspace_id: "default",
      requested_count: 2,
      previews: {
        archive: emptyBulkPreviewAction("archive"),
        restore: emptyBulkPreviewAction("restore"),
        refresh: {
          action: "refresh",
          candidate_count: 1,
          blocked_count: 1,
          candidate_items: [
            {
              template_id: "starter-sandbox",
              name: "Sandbox starter",
              archived: false,
              source_workflow_id: "wf-demo",
              source_workflow_version: "0.1.5",
              action_decision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "当前主要是来源快照漂移。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["source 0.1.5"]
              },
              sandbox_dependency_changes: {
                template_count: 1,
                source_count: 1,
                added_count: 0,
                removed_count: 0,
                changed_count: 1
              },
              sandbox_dependency_nodes: ["sandbox"]
            }
          ],
          blocked_items: [
            {
              template_id: "starter-manual",
              name: "Manual starter",
              archived: false,
              reason: "no_source_workflow",
              detail: "Workspace starter has no source workflow.",
              source_workflow_id: null,
              source_workflow_version: null,
              action_decision: null,
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            }
          ],
          blocked_reason_summary: [
            {
              reason: "no_source_workflow",
              count: 1,
              detail: "Workspace starter has no source workflow."
            }
          ]
        },
        rebase: {
          action: "rebase",
          candidate_count: 1,
          blocked_count: 0,
          candidate_items: [
            {
              template_id: "starter-sandbox",
              name: "Sandbox starter",
              archived: false,
              source_workflow_id: "wf-demo",
              source_workflow_version: "0.1.5",
              action_decision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "当前主要是来源快照漂移。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["source 0.1.5"]
              },
              sandbox_dependency_changes: {
                template_count: 1,
                source_count: 1,
                added_count: 0,
                removed_count: 0,
                changed_count: 1
              },
              sandbox_dependency_nodes: ["sandbox"]
            }
          ],
          blocked_items: [],
          blocked_reason_summary: []
        },
        delete: emptyBulkPreviewAction("delete")
      }
    };
    const sourceGovernanceScope: WorkspaceStarterSourceGovernanceScopeSummary = {
      workspace_id: "default",
      total_count: 2,
      attention_count: 1,
      counts: {
        drifted: 1,
        missing_source: 0,
        no_source: 1,
        synced: 0
      },
      chips: ["来源漂移 1", "无来源 1"],
      summary:
        "当前筛选范围 2 个 starter 中，来源漂移 1 个，无来源 1 个；AI/operator 可以直接按 follow-up queue 继续治理。",
      follow_up_template_ids: ["starter-sandbox"]
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterBulkGovernanceCard, {
        inScopeCount: 2,
        sourceGovernanceScope,
        sourceGovernancePrimaryFollowUp: buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
          sourceGovernanceScope,
          templates
        }),
        sourceGovernanceFocusTargets: buildWorkspaceStarterSourceGovernanceFocusTargets(
          sourceGovernanceScope,
          templates
        ),
        preview,
        previewNotice: null,
        isMutating: false,
        isLoadingPreview: false,
        isLoadingSourceGovernanceScope: false,
        lastResult,
        previewFocusTargets: buildWorkspaceStarterBulkPreviewFocusTargets(preview, templates),
        resultFocusTargets: buildWorkspaceStarterBulkResultFocusTargets(lastResult, templates),
        selectedTemplateId: "starter-sandbox",
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "all",
          sourceGovernanceKind: "all",
          needsFollowUp: false,
          searchQuery: "",
          selectedTemplateId: "starter-sandbox"
        },
        onSelectQueuedTemplate: () => {},
        onFocusTemplate: () => {},
        onAction: () => {}
      })
    );

    expect(html).toContain("last run: 刷新");
    expect(html).toContain("刷新 1 · block 1");
    expect(html).toContain("Scope");
    expect(html).toContain("来源漂移 1");
    expect(html).toContain("无来源 1");
    expect(html).toContain(
      "当前筛选范围 2 个 starter 中，来源漂移 1 个，无来源 1 个；AI/operator 可以直接按 follow-up queue 继续治理。"
    );
    expect(html).toContain("Primary follow-up");
    expect(html).toContain("Sandbox starter 当前是共享来源治理队列的首个待处理 starter。");
    expect(html).toContain(
      "Primary governed starter: Sandbox starter · 建议 refresh · source 0.1.5."
    );
    expect(html).toContain("优先聚焦 starter：Sandbox starter");
    expect(html).toContain("后端 summary 已把当前范围里的 follow-up queue 编成统一清单");
    expect(html).toContain("刷新 preview:");
    expect(html).toContain("候选 1 个；阻塞 1 个（无来源 1）");
    expect(html).toContain("Preview focus");
    expect(html).toContain("Sandbox starter · 建议 refresh · source 0.1.5");
    expect(html).toContain("sandbox drift 1");
    expect(html).toContain("Result receipt:");
    expect(html).toContain("本次批量刷新请求 2 个 starter。 实际处理 1 个。 跳过 1 个（无来源 1）。");
    expect(html).toContain("Sandbox drift:");
    expect(html).toContain("本次批量刷新涉及 1 个 starter、1 个 sandbox 依赖漂移节点");
    expect(html).toContain("Affected starters:");
    expect(html).toContain("Sandbox starter（sandbox）");
    expect(html).toContain("无来源 1");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Primary signal:");
    expect(html).toContain(
      "同一份 result receipt 现在会先投影稳定的 next-step presenter；`follow_up` 只保留为解释文本"
    );
    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain(
      "当前 starter 缺少可用来源绑定；先补来源 workflow 或确认来源仍可访问，再重新执行批量刷新。"
    );
    expect(html).toContain("Primary governed starter: Manual starter · 无来源.");
    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain('/workflows/new?starter=starter-manual');
    expect(html).toContain("先修复来源 workflow 的缺失或无效问题，再重新执行批量刷新。");
    expect(html).toContain("优先聚焦 starter：Manual starter");
    expect(html).toContain("Result receipt focus");
    expect(html).toContain("Sandbox starter · 已刷新 · 建议 refresh · source 0.1.5 · sandbox · drift 1");
  });

  it("adds sandbox dependency drift summary into the bulk action message", () => {
    const message = buildBulkActionMessage({
      action: "rebase",
      updated_count: 2,
      skipped_count: 0,
      deleted_items: [],
      skipped_reason_summary: [],
      sandbox_dependency_changes: {
        template_count: 2,
        source_count: 2,
        added_count: 0,
        removed_count: 1,
        changed_count: 2
      },
      sandbox_dependency_items: [
        {
          template_id: "starter-a",
          name: "Starter A",
          source_workflow_id: "wf-a",
          source_workflow_version: "0.2.0",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"]
        },
        {
          template_id: "starter-b",
          name: "Starter B",
          source_workflow_id: "wf-b",
          source_workflow_version: "0.3.0",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 1,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox", "auditor"]
        }
      ]
    });

    expect(message).toContain("已rebase 2 个模板");
    expect(message).toContain("涉及 2 个 starter / 3 个 sandbox 依赖漂移节点");
  });

  it("builds focus targets from bulk sandbox drift items", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-a",
        workspace_id: "default",
        name: "Starter A",
        description: "",
        business_track: "应用新建编排",
        default_workflow_name: "Starter A",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-a",
        created_from_workflow_version: "0.2.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:00:00Z"
      },
      {
        id: "starter-b",
        workspace_id: "default",
        name: "Starter B",
        description: "",
        business_track: "编排节点能力",
        default_workflow_name: "Starter B",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-b",
        created_from_workflow_version: "0.3.0",
        archived: true,
        archived_at: "2026-03-21T11:00:00Z",
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T11:00:00Z"
      }
    ];

    const targets = buildWorkspaceStarterBulkAffectedStarterTargets(
      {
        sandbox_dependency_items: [
          {
            template_id: "starter-a",
            name: "Starter A",
            source_workflow_id: "wf-a",
            source_workflow_version: "0.2.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 1,
              changed_count: 1
            },
            sandbox_dependency_nodes: ["sandbox", "auditor"]
          },
          {
            template_id: "starter-b",
            name: "Starter B",
            source_workflow_id: "wf-b",
            source_workflow_version: "0.3.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 0,
              changed_count: 1
            },
            sandbox_dependency_nodes: []
          },
          {
            template_id: "starter-a",
            name: "Starter A duplicate",
            source_workflow_id: "wf-a",
            source_workflow_version: "0.2.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 0,
              changed_count: 1
            },
            sandbox_dependency_nodes: ["sandbox"]
          }
        ]
      },
      templates
    );

    expect(targets).toEqual([
      {
        templateId: "starter-a",
        name: "Starter A",
        sourceWorkflowVersion: "0.2.0",
        sandboxNodeSummary: "sandbox、auditor",
        driftNodeCount: 2,
        archived: false
      },
      {
        templateId: "starter-b",
        name: "Starter B",
        sourceWorkflowVersion: "0.3.0",
        sandboxNodeSummary: "未命名节点",
        driftNodeCount: 1,
        archived: true
      }
    ]);
  });
});

function emptyBulkPreviewAction(
  action: "archive" | "restore" | "refresh" | "rebase" | "delete"
): WorkspaceStarterBulkPreview["previews"]["archive"] {
  return {
    action,
    candidate_count: 0,
    blocked_count: 0,
    candidate_items: [],
    blocked_items: [],
    blocked_reason_summary: []
  };
}
