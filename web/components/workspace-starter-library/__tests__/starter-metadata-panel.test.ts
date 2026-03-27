import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterMetadataPanel", () => {
  it("shows the shared create-entry follow-up in the empty detail state", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: null,
        formState: null,
        selectedTrackPriority: null,
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?needs_follow_up=true&source_governance_kind=drifted",
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("选中一个模板后，这里会显示可更新的元数据与来源信息。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("当前筛选条件下还没有可继续治理的 workspace starter。");
    expect(html).toContain("去创建第一个 starter");
    expect(html).toContain(
      "/workflows/new?needs_follow_up=true&amp;source_governance_kind=drifted"
    );
  });

  it("reuses the shared create entry contract in metadata follow-up actions", () => {
    const scopedSourceWorkflowHref =
      '/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92';
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: {
          id: "starter-1",
          workspace_id: "default",
          name: "Governed Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep source governance visible.",
          recommended_next_step: "Return to create flow after reviewing metadata.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "  workflow alpha/beta  ",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z"
        },
        formState: {
          name: "Governed Starter",
          description: "Starter description",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep source governance visible.",
          recommendedNextStep: "Return to create flow after reviewing metadata.",
          tagsText: "workspace starter"
        },
        selectedTrackPriority: "P0 应用新建编排",
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?needs_follow_up=true&starter=starter-1",
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "starter-1"
        },
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("当前 starter 已绑定来源 workflow，但列表缺少统一来源治理摘要。");
    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain('/workflows/new?needs_follow_up=true&amp;starter=starter-1');
    expect(html).toContain("打开源 workflow");
    expect(html).toContain(scopedSourceWorkflowHref);
  });

  it("preserves source workflow legacy auth governance on the metadata source link", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: {
          id: "starter-legacy-auth",
          workspace_id: "default",
          name: "Legacy Auth Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep legacy auth governance visible.",
          recommended_next_step: "Review the source workflow before creating.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: " workflow alpha/beta ",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          source_governance: {
            kind: "drifted",
            status_label: "建议 refresh",
            summary: "当前主要是来源快照漂移。",
            source_workflow_id: " workflow alpha/beta ",
            source_workflow_name: "Governed workflow",
            template_version: "0.1.0",
            source_version: "0.2.0",
            action_decision: null,
            outcome_explanation: null
          }
        },
        formState: {
          name: "Legacy Auth Starter",
          description: "Starter description",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep legacy auth governance visible.",
          recommendedNextStep: "Review the source workflow before creating.",
          tagsText: "workspace starter"
        },
        selectedTrackPriority: "P0 应用新建编排",
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?needs_follow_up=true&starter=starter-legacy-auth",
        sourceWorkflowSummariesById: {
          "workflow alpha/beta": {
            id: "workflow alpha/beta",
            name: "Governed workflow",
            status: "draft",
            version: "0.2.0",
            node_count: 1,
            definition_issues: [],
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap"],
              missing_tool_ids: ["native.catalog-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            },
            legacy_auth_governance: {
              binding_count: 1,
              draft_candidate_count: 0,
              published_blocker_count: 0,
              offline_inventory_count: 1
            }
          }
        },
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " inventory ",
          selectedTemplateId: "starter-legacy-auth"
        },
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("打开源 workflow");
    expect(html).toContain(
      '/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&amp;q=inventory&amp;source_governance_kind=drifted&amp;starter=starter-legacy-auth&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=legacy_publish_auth'
    );
  });

  it("keeps the missing-source create-entry label aligned with the shared governance surface", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: {
          id: "starter-missing-source",
          workspace_id: "default",
          name: "Missing Source Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep source governance visible.",
          recommended_next_step: "Return to create flow after reviewing metadata.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "workflow-missing",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          source_governance: {
            kind: "missing_source",
            status_label: "来源缺失",
            summary: "原始来源 workflow 已不可访问。",
            source_workflow_id: "workflow-missing",
            source_workflow_name: null,
            template_version: "0.1.0",
            source_version: null,
            action_decision: null,
            outcome_explanation: {
              primary_signal: "原始来源 workflow 已不可访问。",
              follow_up: "确认模板后再回到创建页继续创建。"
            }
          }
        },
        formState: {
          name: "Missing Source Starter",
          description: "Starter description",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep source governance visible.",
          recommendedNextStep: "Return to create flow after reviewing metadata.",
          tagsText: "workspace starter"
        },
        selectedTrackPriority: "P0 应用新建编排",
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?starter=starter-missing-source",
        workspaceStarterGovernanceQueryScope: null,
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain(
      "Primary governed starter: Missing Source Starter · 来源缺失 · source workflow-missing."
    );
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain('/workflows/new?starter=starter-missing-source');
  });

  it("prioritizes the shared missing-tool follow-up over the generic create action", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: {
          id: "starter-missing-tool",
          workspace_id: "default",
          name: "Missing Tool Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep tool governance visible.",
          recommended_next_step: "Return to create flow after restoring the missing tool.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "workflow-source",
          created_from_workflow_version: "0.2.0",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          source_governance: {
            kind: "synced",
            status_label: "已对齐",
            summary: "当前 starter 与来源 workflow 已对齐。",
            source_workflow_id: "workflow-source",
            source_workflow_name: "Source Workflow",
            template_version: "0.2.0",
            source_version: "0.2.0",
            action_decision: null,
            outcome_explanation: null
          }
        },
        selectedTemplateToolGovernance: {
          referencedToolIds: ["native.missing"],
          referencedTools: [],
          governedToolCount: 0,
          strongIsolationToolCount: 0,
          missingToolIds: ["native.missing"]
        },
        formState: {
          name: "Missing Tool Starter",
          description: "Starter description",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep tool governance visible.",
          recommendedNextStep: "Return to create flow after restoring the missing tool.",
          tagsText: "workspace starter"
        },
        selectedTrackPriority: "P0 应用新建编排",
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?starter=starter-missing-tool",
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "all",
          needsFollowUp: true,
          searchQuery: "missing",
          selectedTemplateId: "starter-missing-tool"
        },
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain(
      "Primary governed starter: Missing Tool Starter · catalog gap · native.missing · source 0.2.0."
    );
    expect(html).toContain("当前 starter 仍有 catalog gap（native.missing）；先回源 workflow 补齐 binding，再回来继续复用或创建。");
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).not.toContain("带此 starter 回到创建页");
  });
});
