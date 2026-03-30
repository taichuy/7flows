import { describe, expect, it } from "vitest";

import { buildWorkflowCreateWizardPresentation } from "@/components/workflow-create-wizard/presentation";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowListItem } from "@/lib/get-workflows";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";
import type { WorkflowStarterTemplate } from "@/lib/workflow-starters";

const governanceQueryScope: WorkspaceStarterGovernanceQueryScope = {
  activeTrack: "应用新建编排",
  sourceGovernanceKind: "all",
  needsFollowUp: false,
  searchQuery: " catalog gap ",
  selectedTemplateId: "starter-gap"
};

const nodeCatalog: WorkflowNodeCatalogItem[] = [
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
    type: "tool",
    label: "Tool",
    description: "Tool node",
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
    capabilityGroup: "integration",
    businessTrack: "应用新建编排",
    tags: [],
    supportStatus: "available",
    supportSummary: "",
    bindingRequired: true,
    bindingSourceLanes: [],
    palette: { enabled: true, order: 1, defaultPosition: { x: 0, y: 0 } },
    defaults: { name: "Tool", config: {} }
  }
];

const selectedStarter: WorkflowStarterTemplate = {
  id: "starter-gap",
  origin: "workspace",
  name: "Catalog Gap Starter",
  description: "Starter with a missing tool binding",
  businessTrack: "应用新建编排",
  priority: "P0",
  trackSummary: "从空白应用开始",
  trackFocus: "创建应用",
  defaultWorkflowName: "Catalog Gap App",
  source: {
    kind: "starter",
    scope: "workspace",
    status: "available",
    governance: "workspace",
    ecosystem: "native",
    label: "Workspace starters",
    shortLabel: "workspace",
    summary: "Workspace starter library"
  },
  createdFromWorkflowId: null,
  workflowFocus: "Create from starter",
  recommendedNextStep: "创建 workflow",
  nodeCount: 2,
  nodeLabels: ["Trigger", "Tool"],
  referencedTools: [],
  missingToolIds: ["native.catalog-gap"],
  governedToolCount: 1,
  strongIsolationToolCount: 0,
  sandboxGovernance: {
    sandboxNodeCount: 0,
    explicitExecutionCount: 0,
    executionClasses: [],
    dependencyModes: [],
    dependencyModeCounts: {},
    builtinPackageSets: [],
    dependencyRefs: [],
    backendExtensionNodeCount: 0,
    backendExtensionKeys: [],
    nodes: []
  },
  sourceGovernance: null,
  archived: false,
  tags: [],
  definition: {
    nodes: [
      { id: "trigger", type: "trigger", name: "", config: {} },
      { id: "tool", type: "tool", name: "", config: {} }
    ],
    edges: [],
    variables: [],
    publish: []
  }
};

const workflows: WorkflowListItem[] = [
  {
    id: "draft-gap",
    name: "Catalog Gap Draft",
    version: "0.1.0",
    status: "draft",
    node_count: 2,
    tool_governance: {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    },
    legacy_auth_governance: null
  }
];

describe("buildWorkflowCreateWizardPresentation", () => {
  it("prioritizes catalog-gap follow-up and keeps preview facts out of the top shell", () => {
    const presentation = buildWorkflowCreateWizardPresentation({
      legacyAuthGovernanceSnapshot: null,
      nodeCatalog,
      selectedStarter,
      workflows,
      workspaceStarterGovernanceScope: governanceQueryScope
    });

    expect(presentation.selectedStarterMissingToolBlockingSurface?.blockedMessage).toContain(
      "catalog gap"
    );
    expect(presentation.selectedStarterNextStepSurface?.label).toBe("catalog gap");
    expect(presentation.shouldRenderSelectedStarterNextStep).toBe(true);
    expect(presentation.selectedStarterPreviewNodes).toEqual(["Trigger", "Tool"]);
    expect(presentation.selectedStarterFactPills).toEqual([
      "团队模板",
      "2 个节点",
      "1 个工具"
    ]);
    expect(presentation.recentDrafts[0]?.missingToolSummary).toBe("1 个工具缺口");
  });
});
