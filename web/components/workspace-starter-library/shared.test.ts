import { describe, expect, it } from "vitest";

import type {
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterBulkPreview,
  WorkspaceStarterSourceDiff,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterEmptyStateFollowUp,
  buildWorkspaceStarterMutationFallbackErrorMessage,
  buildWorkspaceStarterMutationNetworkErrorMessage,
  buildWorkspaceStarterMutationPendingMessage,
  buildWorkspaceStarterMutationSuccessMessage,
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowCreateSearchParamsFromWorkspaceStarterViewState,
  buildWorkspaceStarterBulkPreviewFocusTargets,
  buildWorkspaceStarterBulkPreviewNarrative,
  buildWorkspaceStarterBulkResultFocusTargets,
  buildWorkspaceStarterBulkResultNarrative,
  buildWorkspaceStarterBulkResultSurface,
  buildWorkspaceStarterHistoryPayloadSnapshot,
  buildWorkspaceStarterSourceActionDecision,
  buildWorkspaceStarterSourceCardSurface,
  buildWorkspaceStarterSourceDiffSurface,
  buildWorkspaceStarterSourceGovernanceSurface,
  buildWorkspaceStarterSourceGovernanceFocusTargets,
  buildWorkspaceStarterSourceGovernancePrimaryFollowUp,
  buildWorkspaceStarterLibrarySearchParams,
  resolveWorkspaceStarterLibraryViewState
} from "./shared";

const templates: WorkspaceStarterTemplateItem[] = [
  {
    id: "starter-active-a",
    workspace_id: "default",
    name: "Active starter A",
    description: "active template",
    business_track: "应用新建编排",
    default_workflow_name: "Starter A",
    workflow_focus: "entry flow",
    recommended_next_step: "",
    tags: ["entry"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-a",
    created_from_workflow_version: "0.1.0",
    archived: false,
    archived_at: null,
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T10:00:00Z"
  },
  {
    id: "starter-archived-sandbox",
    workspace_id: "default",
    name: "Archived sandbox starter",
    description: "sandbox template",
    business_track: "编排节点能力",
    default_workflow_name: "Sandbox starter",
    workflow_focus: "sandbox authoring",
    recommended_next_step: "",
    tags: ["sandbox"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-b",
    created_from_workflow_version: "0.2.0",
    archived: true,
    archived_at: "2026-03-21T12:00:00Z",
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T12:00:00Z"
  },
  {
    id: "starter-active-sandbox",
    workspace_id: "default",
    name: "Active sandbox starter",
    description: "sandbox template",
    business_track: "编排节点能力",
    default_workflow_name: "Sandbox starter active",
    workflow_focus: "sandbox authoring",
    recommended_next_step: "",
    tags: ["sandbox"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-c",
    created_from_workflow_version: "0.3.0",
    archived: false,
    archived_at: null,
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T12:00:00Z"
  }
];

describe("workspace starter library URL state", () => {
  it("restores focused starter from coherent query filters", () => {
    const viewState = resolveWorkspaceStarterLibraryViewState(
      {
        track: "编排节点能力",
        archive: "archived",
        q: " sandbox ",
        starter: "starter-archived-sandbox"
      },
      templates
    );

    expect(viewState).toEqual({
      activeTrack: "编排节点能力",
      archiveFilter: "archived",
      sourceGovernanceKind: "all",
      needsFollowUp: false,
      searchQuery: "sandbox",
      selectedTemplateId: "starter-archived-sandbox"
    });
  });

  it("falls back to the first filtered starter when requested focus is stale", () => {
    const viewState = resolveWorkspaceStarterLibraryViewState(
      {
        track: "编排节点能力",
        archive: "active",
        starter: "missing-starter"
      },
      templates
    );

    expect(viewState.selectedTemplateId).toBe("starter-active-sandbox");
    expect(viewState.activeTrack).toBe("编排节点能力");
    expect(viewState.archiveFilter).toBe("active");
    expect(viewState.sourceGovernanceKind).toBe("all");
    expect(viewState.needsFollowUp).toBe(false);
  });

  it("serializes only non-default filters while keeping the selected starter", () => {
    const searchParams = buildWorkspaceStarterLibrarySearchParams({
      activeTrack: "编排节点能力",
      archiveFilter: "archived",
      sourceGovernanceKind: "all",
      needsFollowUp: false,
      searchQuery: " sandbox ",
      selectedTemplateId: "starter-archived-sandbox"
    });

    expect(searchParams.get("track")).toBe("编排节点能力");
    expect(searchParams.get("archive")).toBe("archived");
    expect(searchParams.get("q")).toBe("sandbox");
    expect(searchParams.get("starter")).toBe("starter-archived-sandbox");
    expect(searchParams.get("source_governance_kind")).toBeNull();
    expect(searchParams.get("needs_follow_up")).toBeNull();
  });

  it("restores source governance deep link and clears stale focus when the filtered scope is empty", () => {
    const viewState = resolveWorkspaceStarterLibraryViewState(
      {
        source_governance_kind: "missing_source",
        needs_follow_up: "true",
        starter: "starter-active-a"
      },
      templates
    );

    expect(viewState).toEqual({
      activeTrack: "all",
      archiveFilter: "active",
      sourceGovernanceKind: "missing_source",
      needsFollowUp: true,
      searchQuery: "",
      selectedTemplateId: null
    });
  });

  it("serializes source governance filters into the canonical query params", () => {
    const searchParams = buildWorkspaceStarterLibrarySearchParams({
      activeTrack: "all",
      archiveFilter: "all",
      sourceGovernanceKind: "drifted",
      needsFollowUp: true,
      searchQuery: "",
      selectedTemplateId: null
    });

    expect(searchParams.get("archive")).toBe("all");
    expect(searchParams.get("source_governance_kind")).toBe("drifted");
    expect(searchParams.get("needs_follow_up")).toBe("true");
  });

  it("builds create-page query params from the shared governance view state", () => {
    const searchParams = buildWorkflowCreateSearchParamsFromWorkspaceStarterViewState({
      activeTrack: "编排节点能力",
      sourceGovernanceKind: "drifted",
      needsFollowUp: true,
      searchQuery: " sandbox ",
      selectedTemplateId: "starter-active-sandbox"
    });

    expect(searchParams.get("track")).toBe("编排节点能力");
    expect(searchParams.get("source_governance_kind")).toBe("drifted");
    expect(searchParams.get("needs_follow_up")).toBe("true");
    expect(searchParams.get("q")).toBe("sandbox");
    expect(searchParams.get("starter")).toBe("starter-active-sandbox");
    expect(searchParams.get("archive")).toBeNull();
  });

  it("builds a create-page href without leaking archive-only filters", () => {
    expect(
      buildWorkflowCreateHrefFromWorkspaceStarterViewState({
        activeTrack: "all",
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "",
        selectedTemplateId: null
      })
    ).toBe("/workflows/new");

    expect(
      buildWorkflowCreateHrefFromWorkspaceStarterViewState({
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        searchQuery: " starter ",
        selectedTemplateId: "starter-active-a"
      })
    ).toBe(
      "/workflows/new?needs_follow_up=true&q=starter&source_governance_kind=drifted&starter=starter-active-a&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });
});

describe("workspace starter source action decision", () => {
  it("builds backend-driven bulk preview narratives and focus targets", () => {
    const preview: WorkspaceStarterBulkPreview = {
      workspace_id: "default",
      requested_count: 3,
      previews: {
        archive: emptyBulkPreviewAction("archive"),
        restore: emptyBulkPreviewAction("restore"),
        refresh: {
          action: "refresh",
          candidate_count: 1,
          blocked_count: 2,
          candidate_items: [
            {
              template_id: "starter-active-a",
              name: "Active starter A",
              archived: false,
              source_workflow_id: "wf-a",
              source_workflow_version: "0.2.0",
              action_decision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "当前主要是来源快照漂移。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["source 0.2.0"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            }
          ],
          blocked_items: [
            {
              template_id: "starter-active-sandbox",
              name: "Active sandbox starter",
              archived: false,
              reason: "name_drift_only",
              detail: "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
              source_workflow_id: "wf-c",
              source_workflow_version: "0.3.0",
              action_decision: {
                recommended_action: "rebase",
                status_label: "建议 rebase",
                summary: "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
                can_refresh: false,
                can_rebase: true,
                fact_chips: ["source 0.3.0", "name drift"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            },
            {
              template_id: "starter-archived-sandbox",
              name: "Archived sandbox starter",
              archived: true,
              reason: "already_aligned",
              detail: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
              source_workflow_id: "wf-b",
              source_workflow_version: "0.2.0",
              action_decision: {
                recommended_action: "none",
                status_label: "已对齐",
                summary: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
                can_refresh: false,
                can_rebase: false,
                fact_chips: ["source 0.2.0"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            }
          ],
          blocked_reason_summary: [
            {
              reason: "already_aligned",
              count: 1,
              detail: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。"
            },
            {
              reason: "name_drift_only",
              count: 1,
              detail: "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。"
            }
          ]
        },
        rebase: {
          action: "rebase",
          candidate_count: 2,
          blocked_count: 1,
          candidate_items: [
            {
              template_id: "starter-active-a",
              name: "Active starter A",
              archived: false,
              source_workflow_id: "wf-a",
              source_workflow_version: "0.2.0",
              action_decision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "当前主要是来源快照漂移。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["source 0.2.0"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            },
            {
              template_id: "starter-active-sandbox",
              name: "Active sandbox starter",
              archived: false,
              source_workflow_id: "wf-c",
              source_workflow_version: "0.3.0",
              action_decision: {
                recommended_action: "rebase",
                status_label: "建议 rebase",
                summary: "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
                can_refresh: false,
                can_rebase: true,
                fact_chips: ["source 0.3.0", "name drift"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            }
          ],
          blocked_items: [
            {
              template_id: "starter-archived-sandbox",
              name: "Archived sandbox starter",
              archived: true,
              reason: "already_aligned",
              detail: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
              source_workflow_id: "wf-b",
              source_workflow_version: "0.2.0",
              action_decision: {
                recommended_action: "none",
                status_label: "已对齐",
                summary: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
                can_refresh: false,
                can_rebase: false,
                fact_chips: ["source 0.2.0"]
              },
              sandbox_dependency_changes: null,
              sandbox_dependency_nodes: []
            }
          ],
          blocked_reason_summary: [
            {
              reason: "already_aligned",
              count: 1,
              detail: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。"
            }
          ]
        },
        delete: emptyBulkPreviewAction("delete")
      }
    };

    expect(buildWorkspaceStarterBulkPreviewNarrative(preview)).toEqual([
      {
        label: "刷新 preview",
        text: "候选 1 个；阻塞 2 个（已对齐 1 / 仅名称漂移 1）"
      },
      {
        label: "rebase preview",
        text: "候选 2 个；阻塞 1 个（已对齐 1）"
      }
    ]);
    expect(buildWorkspaceStarterBulkPreviewFocusTargets(preview, templates)).toEqual([
      {
        templateId: "starter-active-a",
        name: "Active starter A",
        sourceWorkflowVersion: "0.2.0",
        statusLabel: "建议 refresh",
        archived: false
      },
      {
        templateId: "starter-active-sandbox",
        name: "Active sandbox starter",
        sourceWorkflowVersion: "0.3.0",
        statusLabel: "建议 rebase",
        archived: false
      },
      {
        templateId: "starter-archived-sandbox",
        name: "Archived sandbox starter",
        sourceWorkflowVersion: "0.2.0",
        statusLabel: "已对齐",
        archived: true
      }
    ]);
  });

  it("builds source governance follow-up targets from backend summary ids", () => {
    const targets = buildWorkspaceStarterSourceGovernanceFocusTargets(
      {
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
        summary: "当前筛选范围 2 个 starter 中，来源漂移 1 个，无来源 1 个。",
        follow_up_template_ids: ["starter-active-a", "missing-starter", "starter-active-a"]
      },
      [
        {
          ...templates[0],
          source_governance: {
            kind: "drifted",
            status_label: "来源漂移",
            summary: "Starter 与来源 workflow 存在差异。",
            source_workflow_id: "wf-a",
            source_workflow_name: "Active workflow",
            template_version: "0.1.0",
            source_version: "0.2.0",
            action_decision: {
              recommended_action: "refresh",
              status_label: "建议 refresh",
              summary: "当前主要是来源快照漂移。",
              can_refresh: true,
              can_rebase: true,
              fact_chips: ["source 0.2.0"]
            },
            outcome_explanation: {
              primary_signal: "当前 starter 与来源 workflow 版本不一致。",
              follow_up: "先看 source diff，再决定 refresh 还是 rebase。"
            }
          }
        },
        templates[1]
      ]
    );

    expect(targets).toEqual([
      {
        templateId: "starter-active-a",
        name: "Active starter A",
        sourceWorkflowVersion: "0.2.0",
        statusLabel: "建议 refresh",
        archived: false
      }
    ]);
  });

  it("builds a stable primary follow-up from the shared source governance queue", () => {
    const primaryFollowUp = buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
      sourceGovernanceScope: {
        workspace_id: "default",
        total_count: 2,
        attention_count: 2,
        counts: {
          drifted: 1,
          missing_source: 1,
          no_source: 0,
          synced: 0
        },
        chips: ["来源漂移 1", "来源缺失 1"],
        summary:
          "当前筛选范围 2 个 starter 中，来源漂移 1 个，来源缺失 1 个；AI/operator 可以直接按 follow-up queue 继续治理。",
        follow_up_template_ids: ["missing-template", "starter-active-a", "starter-active-sandbox"]
      },
      templates: [
        {
          ...templates[0],
          source_governance: {
            kind: "drifted",
            status_label: "来源漂移",
            summary: "Starter 与来源 workflow 存在差异。",
            source_workflow_id: "wf-a",
            source_workflow_name: "Active workflow",
            template_version: "0.1.0",
            source_version: "0.2.0",
            action_decision: {
              recommended_action: "refresh",
              status_label: "建议 refresh",
              summary: "当前主要是来源快照漂移。",
              can_refresh: true,
              can_rebase: true,
              fact_chips: ["source 0.2.0"]
            },
            outcome_explanation: {
              primary_signal: "当前 starter 与来源 workflow 版本不一致。",
              follow_up: "先看 source diff，再决定 refresh 还是 rebase。"
            }
          }
        },
        templates[2]
      ]
    });

    expect(primaryFollowUp).toEqual({
      kind: "prioritized",
      label: "建议 refresh",
      headline: "Active starter A 当前是共享来源治理队列的首个待处理 starter。",
      detail:
        "后端 follow-up queue 已把 Active starter A 排在当前范围的首位，后面还有 1 个待处理 starter。 当前主要是来源快照漂移。 先看 source diff，再决定 refresh 还是 rebase。 当前 starter 与来源 workflow 版本不一致。",
      primaryResourceSummary: "Active starter A · 建议 refresh · source 0.2.0",
      focusTemplateId: "starter-active-a",
      focusLabel: "优先聚焦 starter：Active starter A"
    });
  });

  it("builds a reusable governance surface for create-entry callers", () => {
    const surface = buildWorkspaceStarterSourceGovernanceSurface({
      template: {
        ...templates[0],
        source_governance: {
          kind: "missing_source",
          status_label: "来源缺失",
          summary: "原始来源 workflow 已不可访问。",
          source_workflow_id: "wf-a",
          source_workflow_name: "Active workflow",
          template_version: "0.1.0",
          source_version: null,
          action_decision: null,
          outcome_explanation: {
            primary_signal: "原始来源 workflow 已不可访问。",
            follow_up: "优先确认来源是否迁移；如需继续推进，回到创建页重建治理链路。"
          }
        }
      },
      createWorkflowHref: "/workflows/new?starter=starter-active-a"
    });

    expect(surface.presenter).toEqual({
      kind: "missing_source",
      statusLabel: "来源缺失",
      actionStatusLabel: null,
      summary: "原始来源 workflow 已不可访问。",
      followUp: "优先确认来源是否迁移；如需继续推进，回到创建页重建治理链路。",
      sourceVersion: null,
      factChips: [],
      needsAttention: true
    });
    expect(surface.actionDecision).toEqual({
      recommendedAction: "none",
      statusLabel: "来源缺失",
      summary: "优先确认来源是否迁移；如需继续推进，回到创建页重建治理链路。",
      canRefresh: false,
      canRebase: false,
      factChips: []
    });
    expect(surface.recommendedNextStep).toEqual({
      action: "create_workflow",
      label: "确认模板后带此 starter 回到创建页",
      detail: "优先确认来源是否迁移；如需继续推进，回到创建页重建治理链路。",
      primaryResourceSummary: "Active starter A · 来源缺失 · source Active workflow",
      focusTemplateId: null,
      focusLabel: null,
      entryKey: "createWorkflow",
      entryOverride: {
        href: "/workflows/new?starter=starter-active-a",
        label: "确认模板后带此 starter 回到创建页"
      }
    });
  });

  it("offers the same create-entry next step for starters without source bindings", () => {
    const surface = buildWorkspaceStarterSourceGovernanceSurface({
      template: {
        ...templates[0],
        created_from_workflow_id: null,
        source_governance: null
      },
      createWorkflowHref: "/workflows/new?starter=starter-active-a"
    });

    expect(surface.presenter).toEqual({
      kind: "no_source",
      statusLabel: "无来源",
      actionStatusLabel: null,
      summary: "这个 starter 没有绑定来源 workflow，当前只保留模板快照。",
      followUp: null,
      sourceVersion: null,
      factChips: [],
      needsAttention: false
    });
    expect(surface.recommendedNextStep).toEqual({
      action: "create_workflow",
      label: "带此 starter 回到创建页",
      detail: "带此 starter 回到创建页继续创建 workflow，并保留当前模板上下文。",
      primaryResourceSummary: "Active starter A · 无来源",
      focusTemplateId: null,
      focusLabel: null,
      entryKey: "createWorkflow",
      entryOverride: {
        href: "/workflows/new?starter=starter-active-a",
        label: "带此 starter 回到创建页"
      }
    });
  });

  it("builds a scoped create CTA for the primary follow-up starter instead of reusing the current selection", () => {
    const scopedTemplates: WorkspaceStarterTemplateItem[] = [
      templates[0],
      {
        ...templates[0],
        id: "starter-active-b",
        name: "Active starter B",
        created_from_workflow_id: "wf-b",
        created_from_workflow_version: "0.3.0",
        source_governance: {
          kind: "missing_source",
          status_label: "来源缺失",
          summary: "当前 starter 绑定的来源 workflow 已缺失。",
          source_workflow_id: "wf-b",
          source_workflow_name: "Workflow B",
          template_version: "0.3.0",
          source_version: null,
          action_decision: null,
          outcome_explanation: {
            primary_signal: "当前 starter 绑定的来源 workflow 已缺失。",
            follow_up: "来源 workflow 当前不可访问。"
          }
        }
      }
    ];

    const primaryFollowUp = buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
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
        follow_up_template_ids: ["starter-active-b"]
      },
      templates: scopedTemplates,
      workspaceStarterGovernanceQueryScope: {
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "missing_source",
        needsFollowUp: true,
        searchQuery: "source",
        selectedTemplateId: "starter-active-a"
      }
    });

    expect(primaryFollowUp).toEqual({
      kind: "prioritized",
      label: "确认模板后带此 starter 回到创建页",
      headline: "Active starter B 当前是共享来源治理队列的首个待处理 starter。",
      detail:
        "后端 follow-up queue 已把 Active starter B 排在当前范围的首位。 来源 workflow 当前不可访问。 当前 starter 绑定的来源 workflow 已缺失。",
      primaryResourceSummary: "Active starter B · 来源缺失 · source Workflow B",
      focusTemplateId: "starter-active-b",
      focusLabel: "优先聚焦 starter：Active starter B",
      entryKey: "createWorkflow",
      entryOverride: {
        href:
          "/workflows/new?needs_follow_up=true&q=source&source_governance_kind=missing_source&starter=starter-active-b&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        label: "确认模板后带此 starter 回到创建页"
      }
    });
  });

  it("projects source status cards without leaking raw governance enums", () => {
    const sourceGovernanceSurface = buildWorkspaceStarterSourceGovernanceSurface({
      template: {
        ...templates[0],
        source_governance: {
          kind: "drifted",
          status_label: "建议 refresh",
          summary: "当前 starter 与来源 workflow 版本不一致。",
          source_workflow_id: "wf-a",
          source_workflow_name: "Active workflow",
          template_version: "0.1.0",
          source_version: "0.2.0",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "优先 refresh 同步最新 definition / version。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["template 0.1.0", "source 0.2.0"]
          },
          outcome_explanation: {
            primary_signal: "当前 starter 与来源 workflow 版本不一致。",
            follow_up: "优先 refresh 同步最新 definition / version。"
          }
        }
      },
      createWorkflowHref: "/workflows/new?starter=starter-active-a"
    });

    expect(
      buildWorkspaceStarterSourceCardSurface({
        template: templates[0],
        sourceGovernance: {
          kind: "drifted",
          status_label: "建议 refresh",
          summary: "当前 starter 与来源 workflow 版本不一致。",
          source_workflow_id: "wf-a",
          source_workflow_name: "Active workflow",
          template_version: "0.1.0",
          source_version: "0.2.0",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "优先 refresh 同步最新 definition / version。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["template 0.1.0", "source 0.2.0"]
          },
          outcome_explanation: {
            primary_signal: "当前 starter 与来源 workflow 版本不一致。",
            follow_up: "优先 refresh 同步最新 definition / version。"
          }
        },
        sourceGovernanceSurface,
        isLoadingSourceDiff: false
      })
    ).toEqual({
      sourceLabel: "Active workflow",
      actionStatusLabel: "建议 refresh",
      fallbackDetail: "优先 refresh 同步最新 definition / version。",
      summaryCards: [
        { label: "Template ver", value: "0.1.0" },
        { label: "Source ver", value: "0.2.0" },
        { label: "Governance", value: "建议 refresh" },
        { label: "Next step", value: "建议 refresh" }
      ]
    });
  });

  it("falls back to a clear state when the shared source governance queue is empty", () => {
    const primaryFollowUp = buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
      sourceGovernanceScope: {
        workspace_id: "default",
        total_count: 1,
        attention_count: 0,
        counts: {
          drifted: 0,
          missing_source: 0,
          no_source: 1,
          synced: 0
        },
        chips: ["无来源 1"],
        summary: "当前筛选范围 1 个 starter 中，无来源 1 个；当前没有明显的来源治理阻塞，可以直接复用这些 starter。",
        follow_up_template_ids: []
      },
      templates
    });

    expect(primaryFollowUp).toEqual({
      kind: "idle",
      label: "无需治理",
      headline: "当前筛选范围没有共享来源治理 backlog。",
      detail:
        "可以继续复用这些 starter；如需进一步治理，再看 bulk preview 或逐个进入右侧 source diff / metadata 详情。",
      focusTemplateId: null,
      focusLabel: null
    });
  });

  it("falls back to the shared create-entry card when the primary queue is idle", () => {
    const emptyStateFollowUp = buildWorkspaceStarterEmptyStateFollowUp({
      sourceGovernancePrimaryFollowUp: {
        kind: "idle",
        label: "无需治理",
        headline: "当前筛选范围没有共享来源治理 backlog。",
        detail:
          "可以继续复用这些 starter；如需进一步治理，再看 bulk preview 或逐个进入右侧 source diff / metadata 详情。",
        focusTemplateId: null,
        focusLabel: null
      },
      createWorkflowHref: "/workflows/new?needs_follow_up=true"
    });

    expect(emptyStateFollowUp).toEqual({
      label: "去创建第一个 starter",
      headline: "当前筛选条件下还没有可继续治理的 workspace starter。",
      detail:
        "当前筛选条件下还没有 workspace starter。可以先回到创建页新建 workflow，再从 editor 保存一个模板进入治理库。",
      focusTemplateId: null,
      focusLabel: null,
      entryKey: "createWorkflow",
      entryOverride: {
        href: "/workflows/new?needs_follow_up=true",
        label: "去创建第一个 starter"
      }
    });
  });

  it("builds bulk result receipt narratives and focus targets", () => {
    const result: WorkspaceStarterBulkActionResult = {
      workspace_id: "default",
      action: "refresh",
      requested_count: 3,
      updated_count: 1,
      skipped_count: 2,
      updated_items: [],
      deleted_items: [],
      skipped_items: [],
      skipped_reason_summary: [
        {
          reason: "name_drift_only",
          count: 1,
          detail:
            "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。"
        },
        {
          reason: "not_found",
          count: 1,
          detail: "Workspace starter template not found."
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
          template_id: "starter-active-a",
          name: "Active starter A",
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
      ],
      receipt_items: [
        {
          template_id: "starter-active-a",
          name: "Active starter A",
          outcome: "updated",
          archived: false,
          reason: null,
          detail: "已把 starter 快照应用到最新来源事实。",
          source_workflow_id: "wf-a",
          source_workflow_version: "0.2.0",
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "当前主要是来源快照漂移，建议 refresh 对齐模板快照。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["source 0.2.0", "sandbox drift 1"]
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
          template_id: "starter-active-sandbox",
          name: "Active sandbox starter",
          outcome: "skipped",
          archived: false,
          reason: "name_drift_only",
          detail:
            "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
          source_workflow_id: "wf-c",
          source_workflow_version: "0.3.0",
          action_decision: {
            recommended_action: "rebase",
            status_label: "建议 rebase",
            summary:
              "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
            can_refresh: false,
            can_rebase: true,
            fact_chips: ["name drift", "rebase 1"]
          },
          sandbox_dependency_changes: null,
          sandbox_dependency_nodes: [],
          changed: false,
          rebase_fields: []
        },
        {
          template_id: "missing-template",
          name: "Missing starter",
          outcome: "skipped",
          archived: false,
          reason: "not_found",
          detail: "Workspace starter template not found.",
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
          "本次批量刷新请求 3 个 starter；实际处理 1 个。 结果回执里还有 2 个跳过项（仅名称漂移 1 / 不存在 1）。 其中 1 个 starter / 1 个 sandbox 依赖漂移节点已沉淀进同一份 result receipt。",
        follow_up:
          "优先对标记为“仅名称漂移”的 starter 执行 rebase，让命名与来源 workflow 保持一致。 优先复核 result receipt 中带 sandbox drift 的 starter，确认依赖节点与隔离策略是否仍符合预期。"
      },
      follow_up_template_ids: ["starter-active-sandbox", "starter-active-a"]
    };

    expect(buildWorkspaceStarterBulkResultNarrative(result)).toEqual([
      {
        label: "Result receipt",
        text: "本次批量刷新请求 3 个 starter。 实际处理 1 个。 跳过 2 个（仅名称漂移 1 / 不存在 1）。"
      },
      {
        label: "Sandbox drift",
        text: "本次批量刷新涉及 1 个 starter、1 个 sandbox 依赖漂移节点；新增 0 / 移除 0 / 变更 1"
      },
      {
        label: "Affected starters",
        text: "Active starter A（sandbox）"
      }
    ]);
    expect(buildWorkspaceStarterBulkResultFocusTargets(result, templates)).toEqual([
      {
        templateId: "starter-active-sandbox",
        name: "Active sandbox starter",
        sourceWorkflowVersion: "0.3.0",
        statusLabel: "仅名称漂移",
        detail:
          "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
        sandboxNodeSummary: null,
        driftNodeCount: 0,
        archived: false
      },
      {
        templateId: "starter-active-a",
        name: "Active starter A",
        sourceWorkflowVersion: "0.2.0",
        statusLabel: "已刷新 · 建议 refresh",
        detail: "已把 starter 快照应用到最新来源事实。",
        sandboxNodeSummary: "sandbox",
        driftNodeCount: 1,
        archived: false
      }
    ]);
  });

  it("builds bulk result surface from the shared presenter layer", () => {
    const result: WorkspaceStarterBulkActionResult = {
      workspace_id: "default",
      action: "refresh",
      requested_count: 2,
      updated_count: 0,
      skipped_count: 1,
      updated_items: [],
      deleted_items: [],
      skipped_items: [],
      skipped_reason_summary: [
        {
          reason: "no_source_workflow",
          count: 1,
          detail: "Workspace starter has no source workflow."
        }
      ],
      sandbox_dependency_changes: null,
      sandbox_dependency_items: [],
      receipt_items: [
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
        primary_signal: null,
        follow_up: "先补来源 workflow，再重新执行批量刷新。"
      },
      follow_up_template_ids: ["starter-manual"]
    };

    expect(buildWorkspaceStarterBulkResultSurface(result)).toEqual({
      primarySignal: "本次批量刷新请求 2 个 starter。 当前没有 starter 被刷新。 跳过 1 个（无来源 1）。",
      followUpExplanation: "先补来源 workflow，再重新执行批量刷新。",
      recommendedNextStep: {
        action: "review_result_receipt",
        label: "修复来源绑定",
        detail: "当前 starter 缺少可用来源绑定；先补来源 workflow 或确认来源仍可访问，再重新执行批量刷新。",
        primaryResourceSummary: "Manual starter · 无来源",
        focusTemplateId: "starter-manual",
        focusLabel: "优先聚焦 starter：Manual starter"
      },
      shouldRenderStandaloneFollowUpExplanation: true
    });
  });

  it("builds structured history payload snapshots without raw governance blobs", () => {
    expect(
      buildWorkspaceStarterHistoryPayloadSnapshot({
        id: "history-1",
        template_id: "starter-sandbox",
        workspace_id: "default",
        action: "rebased",
        summary: "批量从源 workflow 同步了 rebase 所需字段。",
        created_at: "2026-03-21T11:30:00Z",
        payload: {
          bulk: true,
          changed: true,
          action_decision: {
            recommended_action: "rebase",
            status_label: "建议 rebase",
            summary: "当前主要是默认 workflow 名称漂移。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["name drift"]
          },
          outcome_explanation: {
            primary_signal: "当前主要是名称漂移。",
            follow_up: "优先 rebase。"
          },
          node_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          edge_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 0
          },
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"],
          rebase_fields: ["definition", "default_workflow_name"]
        }
      })
    ).toEqual([
      {
        label: "Scope flag",
        text: "这条记录来自批量治理回执。"
      },
      {
        label: "Change flag",
        text: "payload 标记本轮已应用来源变更。"
      },
      {
        label: "Node summary",
        text: "新增 0 / 移除 0 / 变更 1"
      },
      {
        label: "Sandbox summary",
        text: "新增 0 / 移除 0 / 变更 1；涉及节点：sandbox"
      },
      {
        label: "Rebase payload",
        text: "definition、default_workflow_name"
      }
    ]);
  });

  it("builds shared source diff surfaces for summary, rebase guidance and structured sections", () => {
    const surface = buildWorkspaceStarterSourceDiffSurface({
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring",
      template_version: "0.1.0",
      source_version: "0.2.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring",
      workflow_name_changed: false,
      changed: true,
      rebase_fields: ["definition", "created_from_workflow_version"],
      node_summary: {
        template_count: 1,
        source_count: 2,
        added_count: 1,
        removed_count: 0,
        changed_count: 0
      },
      edge_summary: emptyDiffSummary(),
      sandbox_dependency_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      action_decision: {
        recommended_action: "refresh",
        status_label: "建议 refresh",
        summary:
          "当前主要是 sandbox 依赖治理漂移。优先 refresh 同步最新 definition / version，并重点复核 dependencyMode、builtinPackageSet、dependencyRef 与 backendExtensions。",
        can_refresh: true,
        can_rebase: true,
        fact_chips: ["source 0.2.0", "sandbox drift 1", "rebase 2"]
      },
      node_entries: [
        {
          id: "node-sandbox",
          label: "Sandbox node",
          status: "added",
          changed_fields: ["config.timeout"],
          template_facts: [],
          source_facts: ["sandbox_code", "explicit execution"]
        }
      ],
      edge_entries: [],
      sandbox_dependency_entries: [
        {
          id: "sandbox-node",
          label: "sandbox_code",
          status: "changed",
          changed_fields: ["dependencyMode", "builtinPackageSet"],
          template_facts: ["host execution"],
          source_facts: ["strong isolation"]
        }
      ]
    });

    expect(surface).not.toBeNull();
    expect(surface?.eyebrow).toBe("Diff");
    expect(surface?.title).toBe("Source drift detail");
    expect(surface?.description).toContain("template snapshot");
    expect(surface?.loadingMessage).toBe("正在加载 source diff...");
    expect(surface?.emptyMessage).toBe("当前模板没有可用的 source diff。");
    expect(surface?.summaryCards).toEqual([
      { label: "Node changes", value: "1" },
      { label: "Edge changes", value: "0" },
      { label: "Workflow name", value: "Synced" },
      { label: "Sandbox drift", value: "1" },
      { label: "Rebase fields", value: "2" }
    ]);
    expect(surface?.rebaseCard).toEqual({
      title: "Suggested rebase fields",
      meta: "当源 workflow 已发生演进时，rebase 会同步这些 source-derived 字段。",
      statusLabel: "建议 refresh",
      summary:
        "当前主要是 sandbox 依赖治理漂移。优先 refresh 同步最新 definition / version，并重点复核 dependencyMode、builtinPackageSet、dependencyRef 与 backendExtensions。",
      chips: [
        "definition",
        "created_from_workflow_version",
        "source 0.2.0",
        "sandbox drift 1",
        "rebase 2"
      ],
      canRebase: true,
      actionLabel: "执行 rebase",
      pendingLabel: "Rebase 中..."
    });
    expect(surface?.sections).toEqual([
      {
        key: "node-diff",
        title: "Node diff",
        summary: "template 1 / source 2",
        changeBadge: "+1 / -0 / ~0",
        emptyMessage: "当前这一层没有差异。",
        entries: [
          {
            key: "node-diff-added-node-sandbox",
            title: "Sandbox node",
            meta: "node-sandbox",
            statusLabel: "Added",
            changedFields: ["config.timeout"],
            factGroups: [
              {
                key: "node-diff-added-node-sandbox-source",
                label: "Source workflow",
                facts: ["sandbox_code", "explicit execution"]
              }
            ]
          }
        ]
      },
      {
        key: "edge-diff",
        title: "Edge diff",
        summary: "template 0 / source 0",
        changeBadge: "+0 / -0 / ~0",
        emptyMessage: "当前这一层没有差异。",
        entries: []
      },
      {
        key: "sandbox-diff",
        title: "Sandbox dependency drift",
        summary: "template 1 / source 1",
        changeBadge: "+0 / -0 / ~1",
        emptyMessage: "当前这一层没有差异。",
        entries: [
          {
            key: "sandbox-diff-changed-sandbox-node",
            title: "sandbox_code",
            meta: "sandbox-node",
            statusLabel: "Changed",
            changedFields: ["dependencyMode", "builtinPackageSet"],
            factGroups: [
              {
                key: "sandbox-diff-changed-sandbox-node-template",
                label: "Template snapshot",
                facts: ["host execution"]
              },
              {
                key: "sandbox-diff-changed-sandbox-node-source",
                label: "Source workflow",
                facts: ["strong isolation"]
              }
            ]
          }
        ]
      }
    ]);
  });

  it("recommends rebase when workflow name drift is the only remaining change", () => {
    const decision = buildWorkspaceStarterSourceActionDecision({
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring v2",
      template_version: "0.1.0",
      source_version: "0.1.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring v2",
      workflow_name_changed: true,
      changed: true,
      rebase_fields: ["default_workflow_name"],
      node_summary: emptyDiffSummary(),
      edge_summary: emptyDiffSummary(),
      sandbox_dependency_summary: emptyDiffSummary(),
      action_decision: {
        recommended_action: "rebase",
        status_label: "建议 rebase",
        summary:
          "当前只漂移默认 workflow 名称；refresh 不会改名，如需让 starter 命名跟随来源，请执行 rebase。",
        can_refresh: false,
        can_rebase: true,
        fact_chips: ["template 0.1.0", "source 0.1.0", "name drift", "rebase 1"]
      },
      node_entries: [],
      edge_entries: [],
      sandbox_dependency_entries: []
    });

    expect(decision.recommendedAction).toBe("rebase");
    expect(decision.canRefresh).toBe(false);
    expect(decision.canRebase).toBe(true);
    expect(decision.summary).toContain("refresh 不会改名");
  });

  it("recommends refresh when snapshot drift does not require renaming", () => {
    const decision = buildWorkspaceStarterSourceActionDecision({
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring",
      template_version: "0.1.0",
      source_version: "0.2.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring",
      workflow_name_changed: false,
      changed: true,
      rebase_fields: ["definition", "created_from_workflow_version"],
      node_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      edge_summary: emptyDiffSummary(),
      sandbox_dependency_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 1,
        changed_count: 0
      },
      action_decision: {
        recommended_action: "refresh",
        status_label: "建议 refresh",
        summary:
          "当前主要是 sandbox 依赖治理漂移。优先 refresh 同步最新 definition / version，并重点复核 dependencyMode、builtinPackageSet、dependencyRef 与 backendExtensions。",
        can_refresh: true,
        can_rebase: true,
        fact_chips: [
          "template 0.1.0",
          "source 0.2.0",
          "structure drift 1",
          "sandbox drift 1",
          "rebase 2"
        ]
      },
      node_entries: [],
      edge_entries: [],
      sandbox_dependency_entries: []
    });

    expect(decision.recommendedAction).toBe("refresh");
    expect(decision.canRefresh).toBe(true);
    expect(decision.canRebase).toBe(true);
    expect(decision.summary).toContain("优先 refresh");
    expect(decision.factChips).toContain("sandbox drift 1");
  });

  it("marks synced templates as no-op", () => {
    const decision = buildWorkspaceStarterSourceActionDecision({
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring",
      template_version: "0.2.0",
      source_version: "0.2.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring",
      workflow_name_changed: false,
      changed: false,
      rebase_fields: [],
      node_summary: emptyDiffSummary(),
      edge_summary: emptyDiffSummary(),
      sandbox_dependency_summary: emptyDiffSummary(),
      action_decision: {
        recommended_action: "none",
        status_label: "已对齐",
        summary: "当前模板快照和来源 workflow 已对齐，无需 refresh 或 rebase。",
        can_refresh: false,
        can_rebase: false,
        fact_chips: ["template 0.2.0", "source 0.2.0"]
      },
      node_entries: [],
      edge_entries: [],
      sandbox_dependency_entries: []
    });

    expect(decision.recommendedAction).toBe("none");
    expect(decision.statusLabel).toBe("已对齐");
    expect(decision.summary).toContain("无需 refresh 或 rebase");
  });
});

describe("workspace starter mutation messages", () => {
  it("builds refresh success messages from the latest sandbox drift diff", () => {
    expect(
      buildWorkspaceStarterMutationSuccessMessage({
        action: "refresh",
        templateName: "Sandbox starter",
        sourceDiff: {
          template_id: "starter-a",
          workspace_id: "default",
          source_workflow_id: "wf-a",
          source_workflow_name: "Sandbox authoring",
          template_version: "0.1.0",
          source_version: "0.2.0",
          template_default_workflow_name: "Sandbox starter",
          source_default_workflow_name: "Sandbox authoring",
          workflow_name_changed: false,
          changed: true,
          rebase_fields: [],
          node_summary: emptyDiffSummary(),
          edge_summary: emptyDiffSummary(),
          sandbox_dependency_summary: {
            template_count: 2,
            source_count: 3,
            added_count: 1,
            removed_count: 0,
            changed_count: 2
          },
          action_decision: {
            recommended_action: "refresh",
            status_label: "建议 refresh",
            summary: "当前主要是 sandbox 依赖治理漂移。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: ["sandbox drift 3"]
          },
          node_entries: [],
          edge_entries: [],
          sandbox_dependency_entries: []
        }
      })
    ).toBe("已刷新 workspace starter：Sandbox starter。 已同步 3 个 sandbox 依赖漂移节点。");
  });

  it("omits sandbox suffix when rebase has no drift", () => {
    expect(
      buildWorkspaceStarterMutationSuccessMessage({
        action: "rebase",
        templateName: "Sandbox starter",
        sourceDiff: {
          template_id: "starter-a",
          workspace_id: "default",
          source_workflow_id: "wf-a",
          source_workflow_name: "Sandbox authoring",
          template_version: "0.1.0",
          source_version: "0.2.0",
          template_default_workflow_name: "Sandbox starter",
          source_default_workflow_name: "Sandbox authoring",
          workflow_name_changed: true,
          changed: true,
          rebase_fields: ["default_workflow_name"],
          node_summary: emptyDiffSummary(),
          edge_summary: emptyDiffSummary(),
          sandbox_dependency_summary: emptyDiffSummary(),
          action_decision: {
            recommended_action: "rebase",
            status_label: "建议 rebase",
            summary: "当前只漂移默认 workflow 名称。",
            can_refresh: false,
            can_rebase: true,
            fact_chips: ["name drift"]
          },
          node_entries: [],
          edge_entries: [],
          sandbox_dependency_entries: []
        }
      })
    ).toBe("已完成 workspace starter rebase：Sandbox starter。");
  });

  it("builds pending and fallback messages from the shared presenter layer", () => {
    expect(buildWorkspaceStarterMutationPendingMessage("delete")).toBe(
      "正在永久删除 workspace starter..."
    );
    expect(buildWorkspaceStarterMutationFallbackErrorMessage("refresh")).toBe("刷新失败。");
    expect(buildWorkspaceStarterMutationNetworkErrorMessage("rebase")).toBe(
      "无法连接后端执行 starter rebase，请确认 API 已启动。"
    );
  });
});

function emptyDiffSummary(): WorkspaceStarterSourceDiff["node_summary"] {
  return {
    template_count: 0,
    source_count: 0,
    added_count: 0,
    removed_count: 0,
    changed_count: 0
  };
}

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
