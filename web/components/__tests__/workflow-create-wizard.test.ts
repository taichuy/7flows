import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import type { WorkflowCreateWizardProps } from "@/components/workflow-create-wizard/types";
import type {
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

function buildNodeCatalogItem(
  type: string,
  label: string,
  businessTrack = "应用新建编排"
): WorkflowNodeCatalogItem {
  return {
    type,
    label,
    description: `${label} description`,
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
    capabilityGroup: type === "startNode" ? "entry" : "integration",
    businessTrack,
    tags: [],
    supportStatus: "available",
    supportSummary: "",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
    defaults: { name: label, config: {} }
  };
}

function buildStarter(
  overrides: Partial<WorkflowLibraryStarterItem> = {}
): WorkflowLibraryStarterItem {
  return {
    id: "workspace-starter-1",
    origin: "workspace",
    workspaceId: "default",
    name: "Workspace starter",
    description: "Starter description",
    businessTrack: "应用新建编排",
    defaultWorkflowName: "Blank Workflow",
    workflowFocus: "Create from starter",
    recommendedNextStep: "Create workflow",
    tags: [],
    definition: {
      nodes: [{ id: "startNode", type: "startNode", name: "startNode", config: {} }],
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
    sourceGovernance: null,
    ...overrides
  };
}

function renderWizard(
  overrides: Partial<WorkflowCreateWizardProps> = {}
): string {
  const props: WorkflowCreateWizardProps = {
    catalogToolCount: 1,
    governanceQueryScope: {
      activeTrack: "应用新建编排",
      sourceGovernanceKind: "all",
      needsFollowUp: false,
      searchQuery: "",
      selectedTemplateId: "workspace-starter-1"
    },
    workflows: [],
    starterSourceLanes: [],
    nodeCatalog: [buildNodeCatalogItem("startNode", "Start")],
    tools: [],
    starters: [buildStarter()],
    ...overrides
  };

  return renderToStaticMarkup(createElement(WorkflowCreateWizard, props));
}

describe("WorkflowCreateWizard", () => {
  it("renders the simplified page form shell with starter defaults", () => {
    const html = renderWizard();

    expect(html).toContain("workflow-create-shell workflow-create-page-centered");
    expect(html).toContain("创建新应用");
    expect(html).toContain("基于预设模板快速开始构建您的工作流");
    expect(html).toContain("应用名称");
    expect(html).toContain("应用描述 (可选)");
    expect(html).toContain('value="Blank Workflow"');
    expect(html).toContain("返 回");
    expect(html).toContain("确认创建");
    expect(html).not.toContain('data-component="workflow-create-launcher-panel"');
    expect(html).not.toContain('data-component="workflow-create-preview-panel"');
  });

  it("prefills the workflow name from the selected starter", () => {
    const html = renderWizard({
      governanceQueryScope: {
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "",
        selectedTemplateId: "workspace-starter-2"
      },
      starters: [
        buildStarter(),
        buildStarter({
          id: "workspace-starter-2",
          name: "Chosen starter",
          defaultWorkflowName: "Chosen Workflow"
        })
      ]
    });

    expect(html).toContain('value="Chosen Workflow"');
    expect(html).not.toContain('value="Blank Workflow"');
  });

  it("renders the embedded workspace surface without page chrome", () => {
    const html = renderWizard({ surface: "workspace" });

    expect(html).toContain("workflow-create-shell-embedded");
    expect(html).not.toContain("workflow-create-page-centered");
    expect(html).not.toContain("创建新应用");
    expect(html).not.toContain("基于预设模板快速开始构建您的工作流");
    expect(html).not.toContain("<span>返回</span>");
    expect(html).toContain("确认创建");
  });

  it("falls back to an empty workflow name when no starter is available", () => {
    const html = renderWizard({
      governanceQueryScope: {
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "",
        selectedTemplateId: null
      },
      starters: []
    });

    expect(html).toContain('placeholder="例如：My Awesome Workflow"');
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="Blank Workflow"');
    expect(html).toContain("确认创建");
  });
});
