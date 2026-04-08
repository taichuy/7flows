import type { Node } from "@xyflow/react";

import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";

export type WorkflowNodeTemplateDefinition = {
  nodeType: string;
  hasUpstreamSummary: boolean;
  showsContractInRuntime: boolean;
  settingsMode: "trigger" | "generic";
  runtimeMode: "start" | "generic";
};

export function resolveWorkflowNodeTemplateDefinition(
  node: Node<WorkflowCanvasNodeData>
): WorkflowNodeTemplateDefinition {
  if (node.data.nodeType === "startNode") {
    return {
      nodeType: node.data.nodeType,
      hasUpstreamSummary: false,
      showsContractInRuntime: true,
      settingsMode: "trigger",
      runtimeMode: "start"
    };
  }

  return {
    nodeType: node.data.nodeType,
    hasUpstreamSummary: true,
    showsContractInRuntime: false,
    settingsMode: "generic",
    runtimeMode: "generic"
  };
}
