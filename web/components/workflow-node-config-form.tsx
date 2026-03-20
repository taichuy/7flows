"use client";

import { BranchNodeConfigForm } from "@/components/workflow-node-config-form/branch-node-config-form";
import { LlmAgentNodeConfigForm } from "@/components/workflow-node-config-form/llm-agent-node-config-form";
import { McpQueryNodeConfigForm } from "@/components/workflow-node-config-form/mcp-query-node-config-form";
import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";
import type { WorkflowNodeConfigFormProps } from "@/components/workflow-node-config-form/shared";
import { ToolNodeConfigForm } from "@/components/workflow-node-config-form/tool-node-config-form";

export function WorkflowNodeConfigForm({
  node,
  nodes,
  tools,
  sandboxReadiness,
  highlightedFieldPath,
  focusedValidationItem,
  onChange
}: WorkflowNodeConfigFormProps) {
  switch (node.data.nodeType) {
    case "llm_agent":
      return (
        <LlmAgentNodeConfigForm
          node={node}
          nodes={nodes}
          tools={tools}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedFieldPath}
          focusedValidationItem={focusedValidationItem}
          onChange={onChange}
        />
      );
    case "tool":
      return (
        <ToolNodeConfigForm
          node={node}
          tools={tools}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedFieldPath}
          focusedValidationItem={focusedValidationItem}
          onChange={onChange}
        />
      );
    case "mcp_query":
      return <McpQueryNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    case "condition":
    case "router":
      return <BranchNodeConfigForm node={node} onChange={onChange} />;
    case "output":
      return <OutputNodeConfigForm node={node} onChange={onChange} />;
    default:
      return null;
  }
}
