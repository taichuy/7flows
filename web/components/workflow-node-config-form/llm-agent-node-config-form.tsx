"use client";

import type { Node } from "@xyflow/react";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { AuthorizedContextFields } from "@/components/workflow-node-config-form/authorized-context-fields";
import { CredentialPicker } from "@/components/workflow-node-config-form/credential-picker";
import { LlmAgentSkillSection } from "@/components/workflow-node-config-form/llm-agent-skill-section";
import { LlmAgentToolPolicyForm } from "@/components/workflow-node-config-form/llm-agent-tool-policy-form";
import {
  cloneRecord,
  dedupeArtifactRefs,
  dedupeStrings,
  parseNumericFieldValue,
  readReadableArtifacts,
  toRecord,
  toStringArray
} from "@/components/workflow-node-config-form/shared";

type LlmAgentNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  tools: PluginToolRegistryItem[];
  onChange: (nextConfig: Record<string, unknown>) => void;
};

export function LlmAgentNodeConfigForm({
  node,
  nodes,
  tools,
  onChange
}: LlmAgentNodeConfigFormProps) {
  const config = cloneRecord(node.data.config);
  const model = toRecord(config.model) ?? {};
  const assistant = toRecord(config.assistant) ?? {};
  const contextAccess = toRecord(config.contextAccess) ?? {};
  const skillIds = dedupeStrings(toStringArray(config.skillIds));
  const availableNodes = nodes.filter((candidate) => candidate.id !== node.id);
  const readableArtifacts = readReadableArtifacts(contextAccess.readableArtifacts);
  const readableNodeIds = Array.from(
    new Set([
      ...toStringArray(contextAccess.readableNodeIds),
      ...readableArtifacts.map((artifact) => artifact.nodeId)
    ])
  );

  const updateModel = (field: "provider" | "modelId" | "temperature", value: unknown) => {
    const nextConfig = cloneRecord(config);
    const nextModel = cloneRecord(model);

    if (value === undefined || value === "") {
      delete nextModel[field];
    } else {
      nextModel[field] = value;
    }

    if (Object.keys(nextModel).length === 0) {
      delete nextConfig.model;
    } else {
      nextConfig.model = nextModel;
    }

    onChange(nextConfig);
  };

  const updateModelApiKey = (value: string | undefined) => {
    const nextConfig = cloneRecord(config);
    const nextModel = cloneRecord(model);

    if (value === undefined || value === "") {
      delete nextModel.apiKey;
    } else {
      nextModel.apiKey = value;
    }

    if (Object.keys(nextModel).length === 0) {
      delete nextConfig.model;
    } else {
      nextConfig.model = nextModel;
    }

    onChange(nextConfig);
  };

  const updateField = (field: string, value: unknown) => {
    const nextConfig = cloneRecord(config);
    if (value === undefined || value === "") {
      delete nextConfig[field];
    } else {
      nextConfig[field] = value;
    }
    onChange(nextConfig);
  };

  const updateBooleanField = (field: string, checked: boolean) => {
    const nextConfig = cloneRecord(config);
    nextConfig[field] = checked;
    onChange(nextConfig);
  };

  const updateSkillIds = (nextSkillIds: string[]) => {
    const nextConfig = cloneRecord(config);
    if (nextSkillIds.length === 0) {
      delete nextConfig.skillIds;
    } else {
      nextConfig.skillIds = dedupeStrings(nextSkillIds);
    }
    onChange(nextConfig);
  };

  const updateAssistantField = (field: string, value: unknown) => {
    const nextConfig = cloneRecord(config);
    const nextAssistant = cloneRecord(assistant);

    if (value === undefined || value === "") {
      delete nextAssistant[field];
    } else {
      nextAssistant[field] = value;
    }

    if (Object.keys(nextAssistant).length === 0) {
      delete nextConfig.assistant;
    } else {
      nextConfig.assistant = nextAssistant;
    }

    onChange(nextConfig);
  };

  const updateAssistantEnabled = (checked: boolean) => {
    const nextConfig = cloneRecord(config);
    const nextAssistant = cloneRecord(assistant);
    nextAssistant.enabled = checked;
    if (!checked && Object.keys(nextAssistant).length === 1) {
      delete nextConfig.assistant;
    } else {
      nextConfig.assistant = nextAssistant;
    }
    onChange(nextConfig);
  };

  const updateContextAccess = (
    nextReadableNodeIds: string[],
    nextReadableArtifacts: Array<{ nodeId: string; artifactType: string }>
  ) => {
    const nextConfig = cloneRecord(config);
    const nextContextAccess: Record<string, unknown> = {};
    const normalizedReadableNodeIds = dedupeStrings(nextReadableNodeIds);
    const normalizedReadableArtifacts = dedupeArtifactRefs(nextReadableArtifacts);

    if (normalizedReadableNodeIds.length > 0) {
      nextContextAccess.readableNodeIds = normalizedReadableNodeIds;
    }
    if (normalizedReadableArtifacts.length > 0) {
      nextContextAccess.readableArtifacts = normalizedReadableArtifacts;
    }

    if (Object.keys(nextContextAccess).length === 0) {
      delete nextConfig.contextAccess;
    } else {
      nextConfig.contextAccess = nextContextAccess;
    }

    onChange(nextConfig);
  };

  const toggleReadableNode = (readableNodeId: string, checked: boolean) => {
    const nextReadableNodeIds = checked
      ? dedupeStrings([...readableNodeIds, readableNodeId])
      : readableNodeIds.filter((currentNodeId) => currentNodeId !== readableNodeId);
    const nextReadableArtifacts = checked
      ? readableArtifacts
      : readableArtifacts.filter((artifact) => artifact.nodeId !== readableNodeId);

    updateContextAccess(nextReadableNodeIds, nextReadableArtifacts);
  };

  const toggleReadableArtifact = (
    readableNodeId: string,
    artifactType: string,
    checked: boolean
  ) => {
    const nextReadableArtifacts = checked
      ? [...readableArtifacts, { nodeId: readableNodeId, artifactType }]
      : readableArtifacts.filter(
          (artifact) =>
            artifact.nodeId !== readableNodeId || artifact.artifactType !== artifactType
        );

    updateContextAccess(readableNodeIds, nextReadableArtifacts);
  };

  return (
    <div className="binding-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>LLM agent basics</h3>
        </div>
      </div>

      <label className="binding-field">
        <span className="binding-label">Provider</span>
        <input
          className="trace-text-input"
          value={typeof model.provider === "string" ? model.provider : ""}
          onChange={(event) => updateModel("provider", event.target.value.trim() || undefined)}
          placeholder="例如 openai / anthropic / native"
        />
      </label>

      <label className="binding-field">
        <span className="binding-label">Model ID</span>
        <input
          className="trace-text-input"
          value={typeof model.modelId === "string" ? model.modelId : ""}
          onChange={(event) => updateModel("modelId", event.target.value.trim() || undefined)}
          placeholder="例如 gpt-4.1 / claude-sonnet"
        />
      </label>

      <label className="binding-field">
        <span className="binding-label">Temperature</span>
        <input
          className="trace-text-input"
          inputMode="decimal"
          value={typeof model.temperature === "number" ? String(model.temperature) : ""}
          onChange={(event) =>
            updateModel("temperature", parseNumericFieldValue(event.target.value))
          }
          placeholder="为空时沿用默认值"
        />
      </label>

      <CredentialPicker
        label="API Key credential"
        value={typeof model.apiKey === "string" ? model.apiKey : ""}
        onChange={updateModelApiKey}
        hint="选择后会自动写入 credential://{id}，运行时自动解密注入。"
        placeholder="选择模型 API Key 凭证"
      />

      <label className="binding-field">
        <span className="binding-label">System prompt</span>
        <textarea
          className="editor-json-area"
          value={typeof config.systemPrompt === "string" ? config.systemPrompt : ""}
          onChange={(event) => updateField("systemPrompt", event.target.value || undefined)}
          placeholder="描述 Agent 角色、规则和输出约束"
        />
      </label>

      <label className="binding-field">
        <span className="binding-label">Task prompt</span>
        <textarea
          className="editor-json-area"
          value={typeof config.prompt === "string" ? config.prompt : ""}
          onChange={(event) => updateField("prompt", event.target.value || undefined)}
          placeholder="说明当前节点如何消费输入并产出结果"
        />
      </label>

      <LlmAgentSkillSection skillIds={skillIds} onChange={updateSkillIds} />

      <div className="binding-field">
        <span className="binding-label">Capability toggles</span>
        <div className="tool-badge-row">
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.toolsEnabled)}
              onChange={(event) => updateBooleanField("toolsEnabled", event.target.checked)}
            />{" "}
            tools
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.mcpEnabled)}
              onChange={(event) => updateBooleanField("mcpEnabled", event.target.checked)}
            />{" "}
            MCP
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.sandboxEnabled)}
              onChange={(event) => updateBooleanField("sandboxEnabled", event.target.checked)}
            />{" "}
            sandbox
          </label>
        </div>
        <small className="section-copy">
          这层先把 LLM Agent 的主配置显式化；输入输出 schema 已移到 inspector 的 Node
          contract 区块，tool policy 在下方继续细化。
        </small>
      </div>

      <LlmAgentToolPolicyForm config={config} tools={tools} onChange={onChange} />

      <div className="binding-field">
        <span className="binding-label">Assistant distill</span>
        <div className="tool-badge-row">
          <label>
            <input
              type="checkbox"
              checked={Boolean(assistant.enabled)}
              onChange={(event) => updateAssistantEnabled(event.target.checked)}
            />{" "}
            enabled
          </label>
        </div>
        <label className="binding-field">
          <span className="binding-label">Trigger mode</span>
          <select
            className="trace-text-input"
            value={typeof assistant.trigger === "string" ? assistant.trigger : "on_multi_tool_results"}
            onChange={(event) => updateAssistantField("trigger", event.target.value)}
          >
            <option value="always">always</option>
            <option value="on_large_payload">on_large_payload</option>
            <option value="on_search_result">on_search_result</option>
            <option value="on_multi_tool_results">on_multi_tool_results</option>
            <option value="on_high_risk_mode">on_high_risk_mode</option>
          </select>
        </label>
        <small className="section-copy">
          Assistant 只负责提炼工具结果与生成 evidence，不拥有流程推进和最终决策权。
        </small>
      </div>

      <AuthorizedContextFields
        nodeId={node.id}
        availableNodes={availableNodes}
        readableNodeIds={readableNodeIds}
        readableArtifacts={readableArtifacts}
        onToggleReadableNode={toggleReadableNode}
        onToggleReadableArtifact={toggleReadableArtifact}
        readableNodesLabel="Readable upstream context"
        readableNodesHint="LLM Agent 默认不读全部前序节点，仍需显式声明可见来源。"
      />
    </div>
  );
}
