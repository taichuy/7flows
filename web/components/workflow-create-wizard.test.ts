import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";

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
    const html = renderToStaticMarkup(
      createElement(WorkflowCreateWizard, {
        catalogToolCount: 1,
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
    expect(html).toContain("建议 refresh");
    expect(html).toContain("来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。");
    expect(html).toContain("管理这个 workspace starter");
    expect(html).toContain("/workspace-starters?starter=workspace-starter-1");
  });
});
