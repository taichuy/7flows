import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { loadWorkflowEditorWorkbenchBootstrap } from "@/components/workflow-editor-workbench/bootstrap";
import { WorkflowEditorWorkbenchEntry } from "@/components/workflow-editor-workbench-entry";
import type {
  WorkflowEditorWorkbenchBootstrapData,
  WorkflowEditorWorkbenchEntryProps
} from "@/components/workflow-editor-workbench/types";

Object.assign(globalThis, { React });

vi.mock("@/components/workflow-editor-workbench", () => ({
  WorkflowEditorWorkbench: ({
    workflow,
    workflows
  }: {
    workflow: { id: string };
    workflows: unknown[];
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-editor-workbench",
        "data-workflow-id": workflow.id,
        "data-workflows-count": workflows.length
      },
      workflow.id
    )
}));

vi.mock("@/components/workflow-editor-workbench/bootstrap", () => ({
  loadWorkflowEditorWorkbenchBootstrap: vi.fn()
}));

const workflow = {
  id: "workflow-1",
  name: "Workflow 1",
  version: "0.1.0",
  status: "draft",
  created_at: "2026-04-01T08:00:00Z",
  updated_at: "2026-04-01T09:00:00Z",
  node_count: 0,
  publish_count: 0,
  versions: [],
  definition: {
    nodes: [],
    edges: [],
    variables: [],
    publish: []
  },
  definition_issues: [],
  tool_governance: {
    referenced_tool_ids: [],
    missing_tool_ids: [],
    governed_tool_count: 0,
    strong_isolation_tool_count: 0
  }
} as WorkflowEditorWorkbenchEntryProps["workflow"];

const bootstrapData: WorkflowEditorWorkbenchBootstrapData = {
  workflows: [
    { id: "workflow-1", name: "Workflow 1" },
    { id: "workflow-2", name: "Workflow 2" }
  ] as WorkflowEditorWorkbenchBootstrapData["workflows"],
  nodeCatalog: [],
  nodeSourceLanes: [],
  toolSourceLanes: [],
  tools: [],
  adapters: [],
  callbackWaitingAutomation: null,
  sandboxReadiness: null,
  sandboxBackends: [],
  initialModelProviderCatalog: [],
  initialModelProviderConfigs: [],
  initialModelProviderRegistryStatus: "ready"
};

function renderEntry(overrides: Partial<WorkflowEditorWorkbenchEntryProps> = {}) {
  return renderToStaticMarkup(
    createElement(WorkflowEditorWorkbenchEntry, {
      bootstrapRequest: {
        workflowId: "workflow-1",
        surface: "editor"
      },
      workflow,
      currentEditorHref: "/workflows/workflow-1/editor",
      ...overrides
    })
  );
}

describe("WorkflowEditorWorkbenchEntry", () => {
  it("renders the workbench on the server when bootstrap data is already available", () => {
    const html = renderEntry({ initialBootstrapData: bootstrapData });

    expect(html).toContain('data-component="workflow-editor-workbench"');
    expect(html).toContain('data-workflow-id="workflow-1"');
    expect(html).toContain('data-workflows-count="2"');
    expect(html).not.toContain('data-component="authoring-surface-loading-state"');
    expect(vi.mocked(loadWorkflowEditorWorkbenchBootstrap)).not.toHaveBeenCalled();
  });

  it("keeps the bootstrap loading seam when server bootstrap data is absent", () => {
    const html = renderEntry();

    expect(html).toContain('data-component="authoring-surface-loading-state"');
    expect(html).toContain("正在接入交互画布");
    expect(html).not.toContain('data-component="workflow-editor-workbench"');
    expect(vi.mocked(loadWorkflowEditorWorkbenchBootstrap)).not.toHaveBeenCalled();
  });
});
