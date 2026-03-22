import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import { buildWorkflowCreateWizardSurfaceCopy } from "@/lib/workbench-entry-surfaces";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

describe("WorkflowCreateWizard", () => {
  it("surfaces workspace starter source governance follow-up in the create flow", () => {
    const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
      starterGovernanceHref:
        "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    });
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 1,
        governanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        workflows: [],
        starterSourceLanes: [
          {
            kind: "starter",
            scope: "workspace",
            status: "available",
            governance: "workspace",
            ecosystem: "native",
            label: "Workspace starters",
            shortLabel: "workspace ready",
            summary: "Workspace starter library",
            count: 1
          }
        ],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          },
          {
            type: "output",
            label: "Output",
            description: "Output node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "output",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 1, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Output", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-1",
            origin: "workspace",
            workspaceId: "default",
            name: "Governed Workspace Starter",
            description: "Starter with source governance follow-up.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Governed Workflow",
            workflowFocus: "Keep source-aligned starter facts visible before creating.",
            recommendedNextStep: "Create the draft after reviewing source governance.",
            tags: ["workspace starter"],
            definition: {
              nodes: [
                { id: "trigger", type: "trigger", name: "Trigger", config: {} },
                { id: "output", type: "output", name: "Output", config: {} }
              ],
              edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
            sourceGovernance: {
              kind: "drifted",
              statusLabel: "建议 refresh",
              summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。",
              sourceWorkflowId: "wf-demo",
              sourceWorkflowName: "Demo Workflow",
              templateVersion: "0.1.0",
              sourceVersion: "0.2.0",
              actionDecision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["template 0.1.0", "source 0.2.0", "rebase 2"]
              },
              outcomeExplanation: {
                primary_signal: "来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。",
                follow_up: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。"
              }
            }
          }
        ]
      })
    );

    expect(html).toContain("Source governance");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("建议 refresh");
    expect(html).toContain("来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。");
    expect(html).toContain("管理这个 workspace starter");
    expect(html).toContain(
      "/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("falls back to the shared action decision when source governance follow-up is absent", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 0,
        governanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: "",
          selectedTemplateId: "workspace-starter-fallback"
        },
        workflows: [],
        starterSourceLanes: [],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-fallback",
            origin: "workspace",
            workspaceId: "default",
            name: "Fallback Workspace Starter",
            description: "Starter with action-decision fallback.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Fallback Workflow",
            workflowFocus: "Project the shared governance action before creating.",
            recommendedNextStep: "Create after the governance signal is clear.",
            tags: ["workspace starter"],
            definition: {
              nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
              edges: [],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            createdFromWorkflowId: "wf-fallback",
            archived: false,
            sourceGovernance: {
              kind: "drifted",
              statusLabel: "建议 refresh",
              summary: "当前主要是来源快照漂移。",
              sourceWorkflowId: "wf-fallback",
              sourceWorkflowName: "Fallback Workflow",
              templateVersion: "0.3.0",
              sourceVersion: "0.4.0",
              actionDecision: {
                recommended_action: "refresh",
                status_label: "建议 refresh",
                summary: "优先 refresh，再进入画布创建草稿。",
                can_refresh: true,
                can_rebase: true,
                fact_chips: ["template 0.3.0", "source 0.4.0"]
              },
              outcomeExplanation: {
                primary_signal: "来源 workflow 已推进到 0.4.0。"
              }
            }
          }
        ]
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("优先 refresh，再进入画布创建草稿。");
    expect(html).toContain("来源 workflow 已推进到 0.4.0。");
  });

  it("shows the no-source clear state for workspace starters in the create flow", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 0,
        governanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "all",
          needsFollowUp: false,
          searchQuery: "",
          selectedTemplateId: "workspace-starter-no-source"
        },
        workflows: [],
        starterSourceLanes: [],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-no-source",
            origin: "workspace",
            workspaceId: "default",
            name: "No source workspace starter",
            description: "Starter without a source workflow binding.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Standalone Workflow",
            workflowFocus: "Show the no-source clear state before creating.",
            recommendedNextStep: "Create directly when no upstream source is needed.",
            tags: ["workspace starter"],
            definition: {
              nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
              edges: [],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
            sourceGovernance: null
          }
        ]
      })
    );

    expect(html).toContain("Source governance");
    expect(html).toContain("这个 starter 没有绑定来源 workflow，当前只保留模板快照。");
    expect(html).toContain("管理这个 workspace starter");
  });

  it("keeps workspace starter governance filters in the manage link", () => {
    const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
      starterGovernanceHref:
        "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    });
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 0,
        governanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        workflows: [],
        starterSourceLanes: [],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-1",
            origin: "workspace",
            workspaceId: "default",
            name: "Governed Workspace Starter",
            description: "Starter with source governance follow-up.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Governed Workflow",
            workflowFocus: "Keep source-aligned starter facts visible before creating.",
            recommendedNextStep: "Create the draft after reviewing source governance.",
            tags: ["workspace starter"],
            definition: {
              nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
              edges: [],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
            sourceGovernance: {
              kind: "drifted",
              statusLabel: "建议 refresh",
              summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。"
            }
          }
        ]
      })
    );

    expect(html).toContain(surfaceCopy.scopedGovernanceDescription);
    expect(html).toContain(surfaceCopy.sourceGovernanceDescription);
    expect(html).toContain(surfaceCopy.scopedGovernanceBackLinkLabel);
    expect(html).toContain(
      "/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("reuses the shared workbench entry contract in hero actions", () => {
    const scopedWorkflowHref =
      '/workflows/workflow%20latest%2F1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"';
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 0,
        governanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        workflows: [
          {
            id: "  workflow latest/1  ",
            name: "Latest workflow",
            status: "draft",
            version: "0.1.0",
            node_count: 1,
            tool_governance: {
              referenced_tool_ids: [],
              missing_tool_ids: [],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            }
          }
        ],
        starterSourceLanes: [],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-1",
            origin: "workspace",
            workspaceId: "default",
            name: "Governed Workspace Starter",
            description: "Starter with source governance follow-up.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Governed Workflow",
            workflowFocus: "Keep source-aligned starter facts visible before creating.",
            recommendedNextStep: "Create the draft after reviewing source governance.",
            tags: ["workspace starter"],
            definition: {
              nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
              edges: [],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
            sourceGovernance: {
              kind: "drifted",
              statusLabel: "建议 refresh",
              summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。"
            }
          }
        ]
      })
    );

    expect(html).toContain("返回系统首页");
    expect(html).toContain('href="/"');
    expect(html).toContain("管理 workspace starters");
    expect(html).toContain(
      '/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain("打开最近 workflow");
    expect(html).toContain(`href="${scopedWorkflowHref}`);
    expect(html.split(scopedWorkflowHref).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("keeps the original governance scope when the incoming track is all", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 0,
        governanceQueryScope: {
          activeTrack: "all",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        workflows: [],
        starterSourceLanes: [],
        nodeCatalog: [
          {
            type: "trigger",
            label: "Trigger",
            description: "Trigger node",
            ecosystem: "native",
            source: {
              kind: "node",
              scope: "builtin",
              status: "available",
              governance: "repo",
              ecosystem: "native",
              label: "Native node catalog",
              shortLabel: "native nodes",
              summary: "Native nodes"
            },
            capabilityGroup: "entry",
            businessTrack: "应用新建编排",
            tags: [],
            supportStatus: "available",
            supportSummary: "",
            bindingRequired: false,
            bindingSourceLanes: [],
            palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
            defaults: { name: "Trigger", config: {} }
          }
        ],
        tools: [],
        starters: [
          {
            id: "workspace-starter-1",
            origin: "workspace",
            workspaceId: "default",
            name: "Governed Workspace Starter",
            description: "Starter with source governance follow-up.",
            businessTrack: "应用新建编排",
            defaultWorkflowName: "Governed Workflow",
            workflowFocus: "Keep source-aligned starter facts visible before creating.",
            recommendedNextStep: "Create the draft after reviewing source governance.",
            tags: ["workspace starter"],
            definition: {
              nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
              edges: [],
              variables: [],
              publish: []
            },
            source: {
              kind: "starter",
              scope: "workspace",
              status: "available",
              governance: "workspace",
              ecosystem: "native",
              label: "Workspace starters",
              shortLabel: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
            sourceGovernance: {
              kind: "drifted",
              statusLabel: "建议 refresh",
              summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。"
            }
          }
        ]
      })
    );

    expect(html).toContain(
      '/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1'
    );
    expect(html).not.toContain(
      '/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track='
    );
  });
});
