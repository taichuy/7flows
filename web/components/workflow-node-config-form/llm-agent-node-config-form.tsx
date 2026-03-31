"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useEffect, useMemo } from "react";
import type { Node } from "@xyflow/react";

import type { CredentialItem } from "@/lib/get-credentials";
import {
  formatProtocolLabel,
  getNativeLlmProviderPreset,
  listNativeLlmProviderPresets,
  NATIVE_LLM_PROVIDER_PRESETS
} from "@/lib/llm-provider-presets";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { AuthorizedContextFields } from "@/components/workflow-node-config-form/authorized-context-fields";
import { CredentialPicker } from "@/components/workflow-node-config-form/credential-picker";
import { LlmAgentSkillBindingSection } from "@/components/workflow-node-config-form/llm-agent-skill-binding-section";
import { LlmAgentSkillSection } from "@/components/workflow-node-config-form/llm-agent-skill-section";
import { LlmAgentToolPolicyForm } from "@/components/workflow-node-config-form/llm-agent-tool-policy-form";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  NativeModelProviderCatalogItem,
  WorkspaceModelProviderConfigItem,
  WorkspaceModelProviderRegistryStatus
} from "@/lib/model-provider-registry";
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
  modelProviderCatalog?: NativeModelProviderCatalogItem[];
  modelProviderConfigs?: WorkspaceModelProviderConfigItem[];
  modelProviderRegistryStatus?: WorkspaceModelProviderRegistryStatus;
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
  modelProviderCatalog = [],
  modelProviderConfigs = [],
  modelProviderRegistryStatus = "idle",
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
  const modelSignature = JSON.stringify(model);
  const stableModel = useMemo<Record<string, unknown>>(
    () => JSON.parse(modelSignature) as Record<string, unknown>,
    [modelSignature]
  );
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
  const currentProviderConfigRef =
    typeof model.providerConfigRef === "string"
      ? model.providerConfigRef
      : typeof model.provider_config_ref === "string"
        ? model.provider_config_ref
        : "";
  const currentProviderValue = typeof model.provider === "string" ? model.provider : "";
  const activeProviderConfigs = modelProviderConfigs.filter(
    (providerConfig) => providerConfig.status === "active"
  );
  const hasLegacyInlineModel = Boolean(
    currentProviderValue ||
      (typeof model.apiKey === "string" && model.apiKey.trim()) ||
      (typeof model.baseUrl === "string" && model.baseUrl.trim())
  );
  const effectiveProviderConfigRef =
    currentProviderConfigRef ||
    (modelProviderRegistryStatus === "ready" && !hasLegacyInlineModel
      ? activeProviderConfigs[0]?.id ?? ""
      : "");
  const selectedProviderConfig =
    activeProviderConfigs.find((providerConfig) => providerConfig.id === effectiveProviderConfigRef) ??
    null;
  const effectiveProviderValue = selectedProviderConfig?.provider_id ?? currentProviderValue;
  const providerPresets = useMemo(
    () =>
      modelProviderCatalog.length > 0
        ? listNativeLlmProviderPresets(modelProviderCatalog)
        : NATIVE_LLM_PROVIDER_PRESETS,
    [modelProviderCatalog]
  );
  const providerPreset = getNativeLlmProviderPreset(effectiveProviderValue, modelProviderCatalog);
  const selectedProviderProtocolLabel = selectedProviderConfig
    ? formatProtocolLabel(selectedProviderConfig.protocol)
    : null;
  const selectedCredential =
    typeof model.apiKey === "string"
      ? credentials.find((credential) => `credential://${credential.id}` === model.apiKey) ?? null
      : null;
  const shouldAutoBindProviderConfig =
    modelProviderRegistryStatus === "ready" &&
    !currentProviderConfigRef &&
    !hasLegacyInlineModel &&
    activeProviderConfigs.length > 0;
  const shouldShowProviderSetupCallout =
    !selectedProviderConfig &&
    !hasLegacyInlineModel &&
    (modelProviderRegistryStatus === "ready" || modelProviderRegistryStatus === "error");
  const shouldShowProviderRegistryLoading =
    !selectedProviderConfig &&
    !hasLegacyInlineModel &&
    (modelProviderRegistryStatus === "idle" || modelProviderRegistryStatus === "loading");

  useEffect(() => {
    if (!shouldAutoBindProviderConfig) {
      return;
    }

    const nextProviderConfig = activeProviderConfigs[0] ?? null;
    if (!nextProviderConfig) {
      return;
    }

    const nextModel = cloneRecord(stableModel);
    nextModel.providerConfigRef = nextProviderConfig.id;
    delete nextModel.provider;
    delete nextModel.baseUrl;
    delete nextModel.apiKey;
    if (typeof nextModel.modelId !== "string" || !nextModel.modelId.trim()) {
      nextModel.modelId = nextProviderConfig.default_model ?? "";
    }

    const nextConfig = cloneRecord(config);
    nextConfig.model = nextModel;
    onChange(nextConfig);
  }, [activeProviderConfigs, config, onChange, shouldAutoBindProviderConfig, stableModel]);

  const commitModel = (nextModel: Record<string, unknown>) => {
    const nextConfig = cloneRecord(config);

    if (Object.keys(nextModel).length === 0) {
      delete nextConfig.model;
    } else {
      nextConfig.model = nextModel;
    }

    onChange(nextConfig);
  };

  const updateModel = (
    field: "provider" | "modelId" | "temperature" | "baseUrl",
    value: unknown
  ) => {
    const nextModel = cloneRecord(model);

    if (value === undefined || value === "") {
      delete nextModel[field];
    } else {
      nextModel[field] = value;
    }

    commitModel(nextModel);
  };

  const updateModelApiKey = (value: string | undefined) => {
    const nextModel = cloneRecord(model);

    if (value === undefined || value === "") {
      delete nextModel.apiKey;
    } else {
      nextModel.apiKey = value;
    }

    commitModel(nextModel);
  };

  const updateModelProviderConfigRef = (providerConfigRef: string | undefined) => {
    const nextModel = cloneRecord(model);

    if (!providerConfigRef) {
      delete nextModel.providerConfigRef;
      commitModel(nextModel);
      return;
    }

    const nextProviderConfig =
      activeProviderConfigs.find((providerConfig) => providerConfig.id === providerConfigRef) ?? null;
    nextModel.providerConfigRef = providerConfigRef;
    delete nextModel.provider;
    delete nextModel.baseUrl;
    delete nextModel.apiKey;
    if (typeof nextModel.modelId !== "string" || !nextModel.modelId.trim()) {
      nextModel.modelId = nextProviderConfig?.default_model ?? "";
    }

    commitModel(nextModel);
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
        <span className="binding-label">Provider config ref</span>
        <select
          className="binding-select"
          value={effectiveProviderConfigRef}
          onChange={(event) =>
            updateModelProviderConfigRef(event.target.value.trim() || undefined)
          }
          disabled={shouldShowProviderRegistryLoading || shouldShowProviderSetupCallout}
        >
          {hasLegacyInlineModel ? (
            <option value="">保留当前 legacy inline config（仅兼容旧节点）</option>
          ) : null}
          {shouldShowProviderRegistryLoading ? (
            <option value="">正在读取团队 provider registry...</option>
          ) : null}
          {shouldShowProviderSetupCallout ? (
            <option value="">先到团队设置创建 provider config</option>
          ) : null}
          {activeProviderConfigs.map((providerConfig) => (
            <option key={providerConfig.id} value={providerConfig.id}>
              {providerConfig.label} · {providerConfig.provider_label}
            </option>
          ))}
        </select>
        <small className="section-copy">
          {selectedProviderConfig
            ? "团队 provider 已成为当前节点的主入口；definition 会优先收口到 providerConfigRef + modelId。"
            : hasLegacyInlineModel
              ? "当前节点仍在兼容 legacy inline provider；如需继续收口，请改绑团队 provider config。"
              : "LLM Agent 新节点默认优先绑定团队 provider config，而不是继续手填 inline provider / API Key。"}
        </small>
      </label>

      {selectedProviderConfig ? (
        <div className="binding-help">
          <strong>当前引用的团队供应商</strong>
          <span>
            {selectedProviderConfig.label} · {selectedProviderConfig.provider_label} · <code>{selectedProviderConfig.credential_ref}</code>
          </span>
          <span>
            runtime 会优先从该 provider config 解析 provider/baseUrl/credential，并以 <code>{selectedProviderConfig.default_model}</code> 作为默认模型。
            {selectedProviderProtocolLabel ? ` 当前协议面：${selectedProviderProtocolLabel}。` : ""}
          </span>
        </div>
      ) : null}

      {shouldShowProviderRegistryLoading ? (
        <div className="binding-help" data-component="llm-agent-provider-registry-loading">
          <strong>正在读取团队 provider registry</strong>
          <span>等 registry 返回后，LLM Agent 会优先默认绑定团队 provider config。</span>
        </div>
      ) : null}

      {shouldShowProviderSetupCallout ? (
        <div className="binding-help" data-component="llm-agent-provider-registry-setup">
          <strong>
            {modelProviderRegistryStatus === "error"
              ? "暂时无法读取团队 provider registry"
              : "当前还没有可用的团队 provider config"}
          </strong>
          <span>
            先到团队设置创建 OpenAI / Claude 供应商配置，再回来继续填写 <code>providerConfigRef + modelId</code>。
          </span>
          <span>
            <Link className="inline-link" href="/workspace/settings/providers">
              前往团队模型供应商设置
            </Link>
          </span>
        </div>
      ) : null}

      {!selectedProviderConfig && hasLegacyInlineModel ? (
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
            {providerPresets.map((preset) => (
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
      ) : null}

      <label className="binding-field">
        <span className="binding-label">Model ID</span>
        <input
          className="trace-text-input"
          value={typeof model.modelId === "string" ? model.modelId : ""}
          onChange={(event) => updateModel("modelId", event.target.value.trim() || undefined)}
          disabled={shouldShowProviderRegistryLoading || shouldShowProviderSetupCallout}
          placeholder={
            shouldShowProviderSetupCallout
              ? "先在团队设置创建 provider config"
              : providerPreset?.modelPlaceholder ?? "例如 gpt-4.1 / claude-sonnet"
          }
        />
      </label>

      {!selectedProviderConfig && hasLegacyInlineModel ? (
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
      ) : null}

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

      {!selectedProviderConfig && hasLegacyInlineModel ? (
        <>
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
        </>
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
