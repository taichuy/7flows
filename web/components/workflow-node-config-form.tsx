"use client";

import dynamic from "next/dynamic";

import { BranchNodeConfigForm } from "@/components/workflow-node-config-form/branch-node-config-form";
import { McpQueryNodeConfigForm } from "@/components/workflow-node-config-form/mcp-query-node-config-form";
import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";
import { SandboxCodeNodeConfigForm } from "@/components/workflow-node-config-form/sandbox-code-node-config-form";
import type { WorkflowNodeConfigFormProps } from "@/components/workflow-node-config-form/shared";
import { ToolNodeConfigForm } from "@/components/workflow-node-config-form/tool-node-config-form";

type LlmAgentNodeConfigFormProps = Omit<WorkflowNodeConfigFormProps, "adapters">;

const LazyLlmAgentNodeConfigForm = dynamic<LlmAgentNodeConfigFormProps>(
  () =>
    import("@/components/workflow-node-config-form/llm-agent-node-config-form").then(
      (module) => module.LlmAgentNodeConfigForm
    ),
  {
    ssr: false,
    loading: () => (
      <section
        className="payload-card compact-card"
        data-component="workflow-node-config-form-loading"
      >
        <div className="payload-card-header">
          <div>
            <span className="status-meta">Node config</span>
            <strong>正在准备 LLM Agent 配置面板</strong>
          </div>
        </div>
        <p className="section-copy">
          当前节点的 provider、tool policy 和上下文授权表单会在 inspector
          打开后按需挂载，避免默认 editor 首屏把整套 LLM 配置表单提前打进热路径。
        </p>
      </section>
    )
  }
);

export function WorkflowNodeConfigForm({
  node,
  nodes,
  tools,
  adapters,
  credentials,
  currentHref,
  sandboxReadiness,
  highlightedFieldPath,
  focusedValidationItem,
  onChange
}: WorkflowNodeConfigFormProps) {
  switch (node.data.nodeType) {
    case "llm_agent":
      return (
        <LazyLlmAgentNodeConfigForm
          node={node}
          nodes={nodes}
          tools={tools}
          credentials={credentials}
          currentHref={currentHref}
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
          adapters={adapters}
          currentHref={currentHref}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedFieldPath}
          focusedValidationItem={focusedValidationItem}
          onChange={onChange}
        />
      );
    case "mcp_query":
      return <McpQueryNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    case "sandbox_code":
      return (
        <SandboxCodeNodeConfigForm
          node={node}
          currentHref={currentHref}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedFieldPath}
          focusedValidationItem={focusedValidationItem}
          onChange={onChange}
        />
      );
    case "condition":
    case "router":
      return <BranchNodeConfigForm node={node} onChange={onChange} />;
    case "output":
      return <OutputNodeConfigForm node={node} onChange={onChange} />;
    default:
      return null;
  }
}
