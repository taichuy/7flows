import { describe, expect, it } from "vitest";

import type { WorkflowDefinition } from "@/lib/workflow-editor";

import {
  buildWorkflowEditorGraphResetSignature,
  createWorkflowEditorDocumentHistory,
  isWorkflowEditorGraphDirty,
  recordWorkflowEditorDocumentHistory,
  redoWorkflowEditorDocumentHistory,
  shouldRetainNodeSelectionAfterTransientCanvasReset,
  undoWorkflowEditorDocumentHistory
} from "@/components/workflow-editor-workbench/use-workflow-editor-graph";

function buildDefinition(): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "trigger_1",
        type: "startNode",
        name: "开始",
        config: {
          ui: {
            position: {
              x: 120,
              y: 120
            }
          }
        }
      },
      {
        id: "output_1",
        type: "endNode",
        name: "结束",
        config: {
          ui: {
            position: {
              x: 420,
              y: 120
            }
          }
        }
      }
    ],
    edges: [
      {
        id: "edge_trigger_output",
        sourceNodeId: "trigger_1",
        targetNodeId: "output_1",
        channel: "control"
      }
    ],
    variables: [],
    publish: []
  };
}


function buildNodeCatalog() {
  return [
    {
      type: "startNode",
      label: "开始",
      description: "",
      ecosystem: "7flows",
      source: {
        kind: "node",
        scope: "builtin",
        status: "available",
        governance: "repo",
        ecosystem: "7flows",
        label: "Builtin",
        shortLabel: "Builtin",
        summary: ""
      },
      capabilityGroup: "entry",
      businessTrack: "general",
      tags: [],
      supportStatus: "available",
      supportSummary: "",
      bindingRequired: false,
      bindingSourceLanes: [],
      palette: {
        enabled: true,
        order: 0,
        defaultPosition: { x: 120, y: 120 }
      },
      defaults: {
        name: "开始",
        config: {}
      }
    }
  ] as const;
}

describe("workflow editor graph history helpers", () => {
  it("records graph and workflow-level drafts in the same history seam", () => {
    const initialDefinition = buildDefinition();
    const changedDefinition: WorkflowDefinition = {
      ...structuredClone(initialDefinition),
      variables: [{ key: "ticket_id", label: "Ticket ID" }],
      publish: [{ protocol: "openai", route: "/tickets" }]
    };

    const history = recordWorkflowEditorDocumentHistory(
      createWorkflowEditorDocumentHistory(initialDefinition),
      changedDefinition
    );

    expect(history.past).toHaveLength(1);
    expect(history.present.variables).toEqual([{ key: "ticket_id", label: "Ticket ID" }]);
    expect(history.present.publish).toEqual([{ protocol: "openai", route: "/tickets" }]);
    expect(history.future).toEqual([]);
  });

  it("skips duplicate snapshots so selection-only churn does not pollute history", () => {
    const initialDefinition = buildDefinition();
    const history = createWorkflowEditorDocumentHistory(initialDefinition);

    expect(
      recordWorkflowEditorDocumentHistory(history, structuredClone(initialDefinition))
    ).toBe(history);
  });


  it("keeps reset signatures stable across equivalent workflow and bootstrap refs", () => {
    const definition = buildDefinition();
    const nodeCatalog = buildNodeCatalog();

    expect(
      buildWorkflowEditorGraphResetSignature({
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflowVersion: "0.1.0",
        workflowDefinition: definition,
        nodeCatalog: nodeCatalog as never
      })
    ).toBe(
      buildWorkflowEditorGraphResetSignature({
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflowVersion: "0.1.0",
        workflowDefinition: structuredClone(definition),
        nodeCatalog: structuredClone(nodeCatalog) as never
      })
    );
  });

  it("retains the selected node when a trial-run rerender emits one transient empty selection", () => {
    expect(
      shouldRetainNodeSelectionAfterTransientCanvasReset({
        retainedNodeId: "trigger_1",
        nextNodeId: null,
        nextEdgeId: null,
        selectedNodeId: "trigger_1",
        nodes: [
          {
            id: "trigger_1",
            type: "workflowNode",
            position: { x: 120, y: 120 },
            data: {
              label: "开始",
              nodeType: "startNode",
              config: {}
            },
            selected: true
          }
        ]
      })
    ).toBe(true);
  });

  it("does not retain selection when the canvas has really moved away from the retained node", () => {
    expect(
      shouldRetainNodeSelectionAfterTransientCanvasReset({
        retainedNodeId: "trigger_1",
        nextNodeId: "llm_1",
        nextEdgeId: null,
        selectedNodeId: "trigger_1",
        nodes: [
          {
            id: "trigger_1",
            type: "workflowNode",
            position: { x: 120, y: 120 },
            data: {
              label: "开始",
              nodeType: "startNode",
              config: {}
            },
            selected: true
          }
        ]
      })
    ).toBe(false);
  });

  it("undo and redo recover dirty state against the persisted workflow definition", () => {
    const initialDefinition = buildDefinition();
    const changedDefinition: WorkflowDefinition = {
      ...structuredClone(initialDefinition),
      nodes: [
        ...(initialDefinition.nodes ?? []),
        {
          id: "llm_1",
          type: "llmAgentNode",
          name: "总结",
          config: {
            ui: {
              position: {
                x: 280,
                y: 260
              }
            }
          }
        }
      ]
    };

    const historyWithEdit = recordWorkflowEditorDocumentHistory(
      createWorkflowEditorDocumentHistory(initialDefinition),
      changedDefinition
    );

    expect(
      isWorkflowEditorGraphDirty({
        workflowName: "Demo workflow",
        persistedWorkflowName: "Demo workflow",
        currentDefinition: historyWithEdit.present,
        persistedDefinition: initialDefinition
      })
    ).toBe(true);

    const historyAfterUndo = undoWorkflowEditorDocumentHistory(historyWithEdit);

    expect(historyAfterUndo.present).toEqual(initialDefinition);
    expect(
      isWorkflowEditorGraphDirty({
        workflowName: "Demo workflow",
        persistedWorkflowName: "Demo workflow",
        currentDefinition: historyAfterUndo.present,
        persistedDefinition: initialDefinition
      })
    ).toBe(false);

    const historyAfterRedo = redoWorkflowEditorDocumentHistory(historyAfterUndo);

    expect(historyAfterRedo.present).toEqual(changedDefinition);
    expect(
      isWorkflowEditorGraphDirty({
        workflowName: "Demo workflow",
        persistedWorkflowName: "Demo workflow",
        currentDefinition: historyAfterRedo.present,
        persistedDefinition: initialDefinition
      })
    ).toBe(true);
  });
});
