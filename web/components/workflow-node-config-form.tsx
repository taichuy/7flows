"use client";

import dynamic from "next/dynamic";

import { BranchNodeConfigForm } from "@/components/workflow-node-config-form/branch-node-config-form";
import { McpQueryNodeConfigForm } from "@/components/workflow-node-config-form/mcp-query-node-config-form";
import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";
import { ReferenceNodeConfigForm } from "@/components/workflow-node-config-form/reference-node-config-form";
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
  modelProviderCatalog,
  modelProviderConfigs,
  currentHref,
  sandboxReadiness,
  highlightedFieldPath,
  focusedValidationItem,
  onChange
}: WorkflowNodeConfigFormProps) {
  switch (node.data.nodeType) {
    case "llmAgentNode":
      return (
        <LazyLlmAgentNodeConfigForm
          node={node}
          nodes={nodes}
          tools={tools}
          credentials={credentials}
          modelProviderCatalog={modelProviderCatalog}
          modelProviderConfigs={modelProviderConfigs}
          currentHref={currentHref}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedFieldPath}
          focusedValidationItem={focusedValidationItem}
          onChange={onChange}
        />
      );
    case "toolNode":
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
    case "mcpQueryNode":
      return <McpQueryNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    case "referenceNode":
      return <ReferenceNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    case "sandboxCodeNode":
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
    case "conditionNode":
    case "routerNode":
      return <BranchNodeConfigForm node={node} onChange={onChange} />;
    case "endNode":
      return <OutputNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    default:
      return null;
  }
}
