import { describe, expect, it } from "vitest";

import type { WorkflowDefinition } from "@/lib/workflow-editor";

import {
  createWorkflowEditorDocumentHistory,
  isWorkflowEditorGraphDirty,
  recordWorkflowEditorDocumentHistory,
  redoWorkflowEditorDocumentHistory,
  undoWorkflowEditorDocumentHistory
} from "@/components/workflow-editor-workbench/use-workflow-editor-graph";

function buildDefinition(): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "trigger_1",
        type: "trigger",
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
        type: "output",
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

  it("undo and redo recover dirty state against the persisted workflow definition", () => {
    const initialDefinition = buildDefinition();
    const changedDefinition: WorkflowDefinition = {
      ...structuredClone(initialDefinition),
      nodes: [
        ...(initialDefinition.nodes ?? []),
        {
          id: "llm_1",
          type: "llm_agent",
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
