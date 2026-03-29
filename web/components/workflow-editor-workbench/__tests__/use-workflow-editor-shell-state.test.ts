import { describe, expect, it } from "vitest";

import { resolveWorkflowEditorInspectorFocusState } from "@/components/workflow-editor-workbench/use-workflow-editor-shell-state";

describe("resolveWorkflowEditorInspectorFocusState", () => {
  it("only keeps node highlights when the focused issue matches the selected node", () => {
    const focused = resolveWorkflowEditorInspectorFocusState(
      {
        key: "node:config.model",
        category: "missing_field",
        message: "LLM 节点缺少 model",
        target: {
          scope: "node",
          nodeId: "node-2",
          section: "config",
          fieldPath: "config.model",
          label: "LLM 节点 config"
        }
      },
      "node-1"
    );

    expect(focused.highlightedNodeSection).toBeNull();
    expect(focused.highlightedNodeFieldPath).toBeNull();
    expect(focused.highlightedPublishEndpointIndex).toBeNull();
  });

  it("keeps workflow-level publish focus even when no node is selected", () => {
    const focused = resolveWorkflowEditorInspectorFocusState(
      {
        key: "publish:workflowVersion",
        category: "publish_version",
        message: "发布版本不合法",
        target: {
          scope: "publish",
          endpointIndex: 1,
          fieldPath: "workflowVersion",
          label: "发布端点版本"
        }
      },
      null
    );

    expect(focused.highlightedPublishEndpointIndex).toBe(1);
    expect(focused.highlightedPublishEndpointFieldPath).toBe("workflowVersion");
    expect(focused.highlightedNodeSection).toBeNull();
    expect(focused.highlightedVariableIndex).toBeNull();
  });
});
