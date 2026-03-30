"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { Node } from "@xyflow/react";

import type { CredentialItem } from "@/lib/get-credentials";
import {
  getNativeLlmProviderPreset,
  NATIVE_LLM_PROVIDER_PRESETS
} from "@/lib/llm-provider-presets";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { AuthorizedContextFields } from "@/components/workflow-node-config-form/authorized-context-fields";
import { CredentialPicker } from "@/components/workflow-node-config-form/credential-picker";
import { LlmAgentSkillBindingSection } from "@/components/workflow-node-config-form/llm-agent-skill-binding-section";
import { LlmAgentSkillSection } from "@/components/workflow-node-config-form/llm-agent-skill-section";
import { LlmAgentToolPolicyForm } from "@/components/workflow-node-config-form/llm-agent-tool-policy-form";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
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
  credentials: CredentialItem[];
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

const LazyLlmProviderCredentialManager = dynamic(
  () =>
    import("@/components/workflow-node-config-form/llm-provider-credential-manager").then(
      (module) => module.LlmProviderCredentialManager
    ),
  {
    ssr: false,
    loading: () => (
      <section
        className="payload-card compact-card"
        data-component="llm-provider-credential-manager"
      >
        <div className="payload-card-header">
          <div>
            <span className="status-meta">Provider credential</span>
            <strong>Provider 凭证快捷管理</strong>
          </div>
          <span className="event-chip">按需挂载</span>
        </div>
        <p className="section-copy">
          当前 provider 的凭证 CRUD 面板会在节点配置区挂载后继续补齐，避免默认 editor
          首屏把凭证管理逻辑提前塞进热路径。
        </p>
      </section>
    )
  }
);

export function LlmAgentNodeConfigForm({
  node,
  nodes,
  tools,
  credentials,
  currentHref = null,
  sandboxReadiness,
  highlightedFieldPath,
  focusedValidationItem,
  onChange
}: LlmAgentNodeConfigFormProps) {
  const focusedFieldPath = focusedValidationItem?.target.fieldPath ?? null;
  const skillIdsHighlightedField = normalizeSkillCatalogFieldKey(highlightedFieldPath);
  const skillBindingHighlightedField = normalizeSkillBindingFieldKey(highlightedFieldPath);
  const contextAccessHighlightedField = normalizeContextAccessFieldKey(highlightedFieldPath);
  const skillIdsValidationItem = isSkillCatalogFieldPath(focusedFieldPath) ? focusedValidationItem : null;
  const skillBindingValidationItem = isSkillBindingFieldPath(focusedFieldPath)
    ? focusedValidationItem
    : null;
  const contextAccessValidationItem = isContextAccessFieldPath(focusedFieldPath)
    ? focusedValidationItem
    : null;

  const config = cloneRecord(node.data.config);
  const model = toRecord(config.model) ?? {};
  const assistant = toRecord(config.assistant) ?? {};
  const contextAccess = toRecord(config.contextAccess) ?? {};
  const skillIds = dedupeStrings(toStringArray(config.skillIds));
  const skillBinding = toRecord(config.skillBinding) ?? {};
  const availableNodes = nodes.filter((candidate) => candidate.id !== node.id);
  const readableArtifacts = readReadableArtifacts(contextAccess.readableArtifacts);
  const readableNodeIds = Array.from(
    new Set([
      ...toStringArray(contextAccess.readableNodeIds),
      ...readableArtifacts.map((artifact) => artifact.nodeId)
    ])
  );
  const currentProviderValue = typeof model.provider === "string" ? model.provider : "";
  const providerPreset = getNativeLlmProviderPreset(currentProviderValue);
  const selectedCredential =
    typeof model.apiKey === "string"
      ? credentials.find((credential) => `credential://${credential.id}` === model.apiKey) ?? null
      : null;

  const updateModel = (
    field: "provider" | "modelId" | "temperature" | "baseUrl",
    value: unknown
  ) => {
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
      delete nextConfig.skillBinding;
    } else {
      nextConfig.skillIds = dedupeStrings(nextSkillIds);

      const nextSkillBinding = toRecord(nextConfig.skillBinding);
      const referenceBindings = Array.isArray(nextSkillBinding?.references)
        ? nextSkillBinding.references
        : null;
      if (nextSkillBinding && referenceBindings) {
        const filteredReferenceBindings = referenceBindings.filter((item) => {
          const reference = toRecord(item);
          return reference && typeof reference.skillId === "string"
            ? nextSkillIds.includes(reference.skillId)
            : false;
        });
        nextSkillBinding.references = filteredReferenceBindings;
        if (filteredReferenceBindings.length === 0) {
          delete nextSkillBinding.references;
        }
        if (Object.keys(nextSkillBinding).length === 0) {
          delete nextConfig.skillBinding;
        } else {
          nextConfig.skillBinding = nextSkillBinding;
        }
      }
    }
    onChange(nextConfig);
  };

  const updateSkillBinding = (nextSkillBinding: Record<string, unknown> | undefined) => {
    const nextConfig = cloneRecord(config);
    if (!nextSkillBinding || Object.keys(nextSkillBinding).length === 0) {
      delete nextConfig.skillBinding;
    } else {
      nextConfig.skillBinding = nextSkillBinding;
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
        <select
          className="binding-select"
          value={providerPreset?.providerValue ?? (currentProviderValue || "openai")}
          onChange={(event) => updateModel("provider", event.target.value.trim() || undefined)}
        >
          {providerPreset === null && currentProviderValue ? (
            <option value={currentProviderValue}>{`保留现有 provider：${currentProviderValue}`}</option>
          ) : null}
          {NATIVE_LLM_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.providerValue}>
              {preset.label}
            </option>
          ))}
        </select>
        <small className="section-copy">
          {providerPreset
            ? `${providerPreset.description} 当前协议面：${providerPreset.protocolLabel}。`
            : "当前 provider 不是内置厂商预设；保留原值，避免覆盖已有 runtime 契约。"}
        </small>
      </label>

      <label className="binding-field">
        <span className="binding-label">Model ID</span>
        <input
          className="trace-text-input"
          value={typeof model.modelId === "string" ? model.modelId : ""}
          onChange={(event) => updateModel("modelId", event.target.value.trim() || undefined)}
          placeholder={providerPreset?.modelPlaceholder ?? "例如 gpt-4.1 / claude-sonnet"}
        />
      </label>

      <label className="binding-field">
        <span className="binding-label">Base URL</span>
        <input
          className="trace-text-input"
          value={typeof model.baseUrl === "string" ? model.baseUrl : ""}
          onChange={(event) => updateModel("baseUrl", event.target.value.trim() || undefined)}
          placeholder={providerPreset?.baseUrlPlaceholder ?? "例如 https://proxy.example/v1"}
        />
        <small className="section-copy">
          留空时沿用 {providerPreset?.label ?? "provider"} 默认 endpoint；填写后会继续落到 runtime 的 <code>model.baseUrl</code>。
        </small>
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
        credentials={credentials}
        credentialTypes={providerPreset?.compatibleCredentialTypes}
        hint="选择后会自动写入 credential://{id}，运行时自动解密注入。"
        placeholder="选择模型 API Key 凭证"
        emptyStateCopy={
          providerPreset
            ? `当前还没有可用于 ${providerPreset.label} 的凭证，可直接在下方新建。`
            : "当前 provider 没有命中内置厂商预设，请先选择 OpenAI / Anthropic / OpenAI-compatible。"
        }
      />

      {selectedCredential ? (
        <div className="binding-help">
          <strong>当前节点正在使用</strong>
          <span>
            {selectedCredential.name} · <code>{selectedCredential.credential_type}</code>
          </span>
          <span>
            workflow definition 会继续保存为 <code>{typeof model.apiKey === "string" ? model.apiKey : ""}</code>，运行时再统一解密。
          </span>
        </div>
      ) : null}

      {providerPreset ? (
        <LazyLlmProviderCredentialManager
          providerPreset={providerPreset}
          credentials={credentials}
          selectedCredentialValue={typeof model.apiKey === "string" ? model.apiKey : ""}
          onSelectCredential={updateModelApiKey}
        />
      ) : null}

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

      <LlmAgentSkillSection
        currentHref={currentHref}
        skillIds={skillIds}
        highlightedFieldKey={skillIdsHighlightedField}
        focusedValidationItem={skillIdsValidationItem}
        onChange={updateSkillIds}
      />

      {skillBindingValidationItem ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={skillBindingValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <LlmAgentSkillBindingSection
        skillBinding={skillBinding}
        skillIds={skillIds}
        highlightedFieldKey={skillBindingHighlightedField}
        onChange={updateSkillBinding}
      />

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

      <LlmAgentToolPolicyForm
        config={config}
        tools={tools}
        currentHref={currentHref}
        sandboxReadiness={sandboxReadiness}
        highlightedFieldPath={highlightedFieldPath}
        focusedValidationItem={focusedValidationItem}
        onChange={onChange}
      />

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

      {contextAccessValidationItem ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={contextAccessValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}
      <AuthorizedContextFields
        nodeId={node.id}
        availableNodes={availableNodes}
        readableNodeIds={readableNodeIds}
        readableArtifacts={readableArtifacts}
        onToggleReadableNode={toggleReadableNode}
        onToggleReadableArtifact={toggleReadableArtifact}
        readableNodesLabel="Readable upstream context"
        readableNodesHint="LLM Agent 默认不读全部前序节点，仍需显式声明可见来源。"
        highlightedFieldKey={contextAccessHighlightedField}
      />
    </div>
  );
}

function isSkillBindingFieldPath(fieldPath: string | null) {
  if (!fieldPath) {
    return false;
  }
  return fieldPath.startsWith("config.skillBinding.");
}

function isSkillCatalogFieldPath(fieldPath: string | null) {
  if (!fieldPath) {
    return false;
  }
  return fieldPath.startsWith("config.skillIds");
}

function isContextAccessFieldPath(fieldPath: string | null) {
  if (!fieldPath) {
    return false;
  }
  return (
    fieldPath === "config.contextAccess" ||
    fieldPath.startsWith("config.contextAccess.readableNodeIds") ||
    fieldPath.startsWith("config.contextAccess.readableArtifacts")
  );
}

function normalizeSkillBindingFieldKey(fieldPath?: string | null) {
  if (!fieldPath) {
    return null;
  }
  if (fieldPath === "config.skillBinding") {
    return "skillBinding.references";
  }
  if (fieldPath.startsWith("config.skillBinding.references")) {
    return "skillBinding.references";
  }
  if (fieldPath.startsWith("config.skillBinding.enabledPhases")) {
    return "skillBinding.enabledPhases";
  }
  if (fieldPath.startsWith("config.skillBinding.promptBudgetChars")) {
    return "skillBinding.promptBudgetChars";
  }
  return null;
}

function normalizeSkillCatalogFieldKey(fieldPath?: string | null) {
  if (!fieldPath) {
    return null;
  }
  if (fieldPath.startsWith("config.skillIds")) {
    return "skillIds";
  }
  return null;
}

function normalizeContextAccessFieldKey(fieldPath?: string | null) {
  if (!fieldPath) {
    return null;
  }
  if (fieldPath.startsWith("config.contextAccess.readableArtifacts")) {
    return "contextAccess.readableArtifacts";
  }
  if (
    fieldPath === "config.contextAccess" ||
    fieldPath.startsWith("config.contextAccess.readableNodeIds")
  ) {
    return "contextAccess.readableNodeIds";
  }
  return null;
}
