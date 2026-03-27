import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import { buildWorkflowEditorHeroSurfaceCopy } from "@/lib/workbench-entry-surfaces";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkflowEditorHero", () => {
  it("shows the shared save gate summary and blocker chips", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowId: "workflow-1",
        workflowVersion: "1.0.0",
        nodesCount: 4,
        edgesCount: 3,
        toolsCount: 2,
        availableRunsCount: 1,
        isDirty: true,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        workflowsCount: 1,
        selectedRunAttached: false,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 2,
        publishDraftValidationIssuesCount: 1,
        currentHref: "/workflows/workflow-1?pane=editor",
        persistBlockedMessage: "blocked",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "execution detail",
            nextStep: "execution next step"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "publish detail",
            nextStep: "publish next step"
          }
        ],
        persistBlockerRecommendedNextStep: {
          label: "sandbox readiness",
          detail:
            "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
          href: "/workflows?execution=sandbox",
          href_label: "Open workflow library"
        },
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html).toContain("Execution capability");
    expect(html).toContain("Publish draft");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow library");
    expect(html).toContain("Hero save gate");
    expect(html).toContain("execution detail execution next step");
    expect(html).toContain("publish detail publish next step");
  });

  it("reuses structured workflow governance handoffs in the hero save gate", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowId: "workflow-1",
        workflowVersion: "1.0.0",
        nodesCount: 4,
        edgesCount: 3,
        toolsCount: 2,
        availableRunsCount: 1,
        isDirty: true,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        workflowsCount: 1,
        selectedRunAttached: false,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 1,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 1,
        currentHref: "/workflows/workflow-1?pane=publish",
        persistBlockedMessage: "blocked",
        persistBlockerSummary: "当前保存会被 2 类问题阻断：Catalog gap / Publish draft。",
        persistBlockers: [
          {
            id: "tool_reference",
            label: "Catalog gap",
            detail: "当前 workflow definition 仍有 catalog gap · native.catalog-gap。",
            nextStep:
              "请先补齐 catalog gap（native.catalog-gap）里的 tool binding / LLM Agent tool policy 后再保存。",
            catalogGapToolIds: ["native.catalog-gap"]
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail:
              "当前 workflow definition 还有 publish draft 待修正问题：Public Search 当前不能使用 authMode = token。",
            nextStep:
              "先把 workflow draft endpoint 切回 api_key/internal 并保存，再补发 replacement binding，最后清理 draft/offline legacy backlog。",
            hasLegacyPublishAuthModeIssues: true,
            hasGenericPublishDraftIssues: false
          }
        ],
        persistBlockerRecommendedNextStep: {
          label: "workflow governance",
          detail: "先回到当前 workflow 处理 catalog gap 与 publish auth contract。",
          href: "/workflows/workflow-1?definition_issue=missing_tool",
          href_label: "Open workflow editor"
        },
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("Save-gate publish auth contract");
    expect(html).toContain("legacy token");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain('href="/workflows/workflow-1?pane=publish&amp;definition_issue=missing_tool"');
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow editor");
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
  });

  it("labels tool reference blockers as catalog gap issues in hero pills", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowId: "workflow-1",
        workflowVersion: "1.0.0",
        nodesCount: 4,
        edgesCount: 3,
        toolsCount: 2,
        availableRunsCount: 1,
        isDirty: false,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        workflowsCount: 1,
        selectedRunAttached: false,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 2,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 0,
        currentHref: "/workflows/workflow-1",
        persistBlockedMessage: null,
        persistBlockerSummary: null,
        persistBlockers: [],
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("2 catalog gap issues");
    expect(html).not.toContain("tool reference issues");
  });

  it("keeps workspace starter governance scope in editor actions", () => {
    const surfaceCopy = buildWorkflowEditorHeroSurfaceCopy({
      workflowLibraryHref:
        "/workflows?starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      createWorkflowHref:
        "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      workspaceStarterLibraryHref:
        "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      plannedNodeSummary: null
    });
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowId: "workflow-1",
        workflowVersion: "1.0.0",
        nodesCount: 4,
        edgesCount: 3,
        toolsCount: 2,
        availableRunsCount: 1,
        isDirty: false,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        workflowsCount: 1,
        selectedRunAttached: false,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 0,
        currentHref: "/workflows/workflow-1",
        persistBlockedMessage: null,
        persistBlockerSummary: null,
        persistBlockers: [],
        isSaving: false,
        isSavingStarter: false,
        workflowLibraryHref:
          "/workflows?starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        createWorkflowHref:
          "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        workspaceStarterLibraryHref:
          "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        hasScopedWorkspaceStarterFilters: true,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain(surfaceCopy.scopedGovernancePrefix);
    expect(html).toContain(surfaceCopy.scopedGovernanceBackLinkLabel);
    expect(html).toContain(surfaceCopy.scopedGovernanceCreateWorkflowLabel);
    expect(html).toContain(
      '/workflows?starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      "/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(html).toContain(
      "/workflows/new?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });
});
