import React from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type {
  PublishedEndpointApiKeyItem,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";

type WorkflowPublishLocalAgentHandoffProps = {
  workflowId: string;
  binding: WorkflowPublishedEndpointItem;
  apiKeys: PublishedEndpointApiKeyItem[];
};

type LocalAgentHandoffSurface = {
  key: string;
  agentLabel: string;
  title: string;
  protocolLabel: string;
  description: string;
  baseUrl: string;
  endpointPath: string;
  authLabel: string;
  modelOrEndpointLabel: string;
  modelOrEndpointValue: string;
  keyPreview: string;
  badges: string[];
  snippet: string;
};

const ANTHROPIC_VERSION = "2023-06-01";

function buildPublishedApiKeyPreview(apiKeys: PublishedEndpointApiKeyItem[]) {
  const activeKey = apiKeys.find((item) => item.status === "active") ?? apiKeys[0] ?? null;
  if (!activeKey) {
    return "<published-api-key>";
  }
  return `${activeKey.key_prefix}…`;
}

function buildOpenAiCompatibleSurfaces(
  binding: WorkflowPublishedEndpointItem,
  keyPreview: string
): LocalAgentHandoffSurface[] {
  const baseUrl = `${getApiBaseUrl()}/v1`;
  const endpointPath = "/chat/completions";

  return [
    {
      key: `${binding.id}-codex`,
      agentLabel: "Codex",
      title: "Codex / OpenAI-compatible",
      protocolLabel: "OpenAI Chat Completions",
      description:
        "把 Codex 的 OpenAI-compatible provider 指到当前 published gateway，model 使用 binding alias。",
      baseUrl,
      endpointPath,
      authLabel: "Authorization Bearer 或 x-api-key",
      modelOrEndpointLabel: "model",
      modelOrEndpointValue: binding.endpoint_alias,
      keyPreview,
      badges: [binding.protocol, binding.auth_mode, binding.streaming ? "stream" : "sync"],
      snippet: [
        `base_url: ${baseUrl}`,
        `api_key: ${keyPreview}`,
        `model: ${binding.endpoint_alias}`,
        `chat_path: ${endpointPath}`,
        `auth_header: Authorization: Bearer ${keyPreview}`
      ].join("\n")
    },
    {
      key: `${binding.id}-openclaw`,
      agentLabel: "OpenClaw",
      title: "OpenClaw / OpenAI gateway",
      protocolLabel: "OpenAI-compatible handoff",
      description:
        "OpenClaw 或其他支持 OpenAI-compatible 的本地 agent，可以直接复用同一组 base URL / API key / model。",
      baseUrl,
      endpointPath,
      authLabel: "x-api-key 或 Authorization Bearer",
      modelOrEndpointLabel: "model",
      modelOrEndpointValue: binding.endpoint_alias,
      keyPreview,
      badges: [binding.endpoint_alias, "local-agent", binding.lifecycle_status],
      snippet: [
        `provider: openai-compatible`,
        `base_url: ${baseUrl}`,
        `api_key: ${keyPreview}`,
        `model: ${binding.endpoint_alias}`,
        `request_path: ${endpointPath}`
      ].join("\n")
    }
  ];
}

function buildAnthropicSurfaces(
  binding: WorkflowPublishedEndpointItem,
  keyPreview: string
): LocalAgentHandoffSurface[] {
  const baseUrl = `${getApiBaseUrl()}/v1`;
  const endpointPath = "/messages";

  return [
    {
      key: `${binding.id}-claude-code`,
      agentLabel: "Claude Code",
      title: "Claude Code / Anthropic gateway",
      protocolLabel: "Anthropic Messages",
      description:
        "把 Claude Code 的 Anthropic provider 指到 7Flows gateway，model 使用 published binding alias。",
      baseUrl,
      endpointPath,
      authLabel: `x-api-key + anthropic-version ${ANTHROPIC_VERSION}`,
      modelOrEndpointLabel: "model",
      modelOrEndpointValue: binding.endpoint_alias,
      keyPreview,
      badges: [binding.protocol, binding.auth_mode, binding.lifecycle_status],
      snippet: [
        `base_url: ${baseUrl}`,
        `api_key: ${keyPreview}`,
        `model: ${binding.endpoint_alias}`,
        `messages_path: ${endpointPath}`,
        `anthropic-version: ${ANTHROPIC_VERSION}`
      ].join("\n")
    }
  ];
}

function buildNativeSurfaces(
  workflowId: string,
  binding: WorkflowPublishedEndpointItem,
  keyPreview: string
): LocalAgentHandoffSurface[] {
  const baseUrl = getApiBaseUrl();
  const encodedAlias = encodeURIComponent(binding.endpoint_alias);
  const endpointPath = `/v1/published-aliases/${encodedAlias}/run`;

  return [
    {
      key: `${binding.id}-native-openclaw`,
      agentLabel: "OpenClaw",
      title: "OpenClaw / Native run bridge",
      protocolLabel: "7Flows native published run",
      description:
        "当本地 agent 需要直接消费 7Flows 原生 run payload 时，优先复用 alias run 路径，而不是再造新的 publish backend。",
      baseUrl,
      endpointPath,
      authLabel: "x-api-key 或 Authorization Bearer",
      modelOrEndpointLabel: "endpoint alias",
      modelOrEndpointValue: binding.endpoint_alias,
      keyPreview,
      badges: [workflowId, binding.endpoint_id, binding.lifecycle_status],
      snippet: [
        `endpoint: ${baseUrl}${endpointPath}`,
        `api_key: ${keyPreview}`,
        `auth_header: x-api-key: ${keyPreview}`,
        `input_payload: { \"message\": \"hello\" }`,
        `route_path: ${binding.route_path}`
      ].join("\n")
    }
  ];
}

function buildLocalAgentHandoffSurfaces(
  workflowId: string,
  binding: WorkflowPublishedEndpointItem,
  apiKeys: PublishedEndpointApiKeyItem[]
) {
  const keyPreview = buildPublishedApiKeyPreview(apiKeys);

  switch (binding.protocol) {
    case "openai":
      return buildOpenAiCompatibleSurfaces(binding, keyPreview);
    case "anthropic":
      return buildAnthropicSurfaces(binding, keyPreview);
    default:
      return buildNativeSurfaces(workflowId, binding, keyPreview);
  }
}

export function WorkflowPublishLocalAgentHandoff({
  workflowId,
  binding,
  apiKeys
}: WorkflowPublishLocalAgentHandoffProps) {
  if (binding.auth_mode !== "api_key") {
    return (
      <div
        className="entry-card compact-card"
        data-component="workflow-publish-local-agent-handoff"
      >
        <p className="entry-card-title">Local agent handoff</p>
        <p className="empty-state compact">
          当前 binding 使用 <code>{binding.auth_mode}</code>，不会接受外部 published API key。
          如需直接交给 Claude Code、Codex 或 OpenClaw，请先把 auth mode 切到
          <code>api_key</code>。
        </p>
      </div>
    );
  }

  const surfaces = buildLocalAgentHandoffSurfaces(workflowId, binding, apiKeys);

  return (
    <div
      className="entry-card compact-card"
      data-component="workflow-publish-local-agent-handoff"
    >
      <p className="entry-card-title">Local agent handoff</p>
      <p className="section-copy entry-copy">
        当前 publish binding 继续复用既有 published gateway，不新开本地 agent 协议；把下列
        <code>base URL / API key / model 或 endpoint</code> 贴到本地 agent provider 配置即可。
      </p>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Protocol</span>
          <strong>{binding.protocol}</strong>
        </article>
        <article className="summary-card">
          <span>Auth mode</span>
          <strong>{binding.auth_mode}</strong>
        </article>
        <article className="summary-card">
          <span>Published key</span>
          <strong>{apiKeys.length > 0 ? `${apiKeys.length} active` : "create below"}</strong>
        </article>
      </div>

      <div className="publish-key-list">
        {surfaces.map((surface) => (
          <article className="payload-card compact-card" key={surface.key}>
            <div className="payload-card-header">
              <div>
                <span className="status-meta">{surface.protocolLabel}</span>
                <strong>{surface.title}</strong>
              </div>
              <span className="event-chip">{surface.agentLabel}</span>
            </div>

            <p className="section-copy entry-copy">{surface.description}</p>

            <dl className="compact-meta-list publish-key-meta">
              <div>
                <dt>Base URL</dt>
                <dd>
                  <code>{surface.baseUrl}</code>
                </dd>
              </div>
              <div>
                <dt>Endpoint</dt>
                <dd>
                  <code>{surface.endpointPath}</code>
                </dd>
              </div>
              <div>
                <dt>Auth</dt>
                <dd>{surface.authLabel}</dd>
              </div>
              <div>
                <dt>{surface.modelOrEndpointLabel}</dt>
                <dd>
                  <code>{surface.modelOrEndpointValue}</code>
                </dd>
              </div>
            </dl>

            <div className="tool-badge-row">
              {surface.badges.map((badge) => (
                <span className="event-chip" key={`${surface.key}-${badge}`}>
                  {badge}
                </span>
              ))}
            </div>

            <pre className="editor-json-area">{surface.snippet}</pre>
            <p className="binding-meta">
              当前展示的是 published API key 占位；若你已经创建 key，可直接把 <code>
                {surface.keyPreview}
              </code>{" "}
              替换成真实 secret，并保留同一条 base URL / model(alias) 映射。
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
