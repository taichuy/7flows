import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmAgentNodeConfigForm } from "@/components/workflow-node-config-form/llm-agent-node-config-form";
import type { CredentialItem } from "@/lib/get-credentials";
import type { WorkspaceModelProviderConfigItem } from "@/lib/model-provider-registry";

function buildCredential(overrides: Partial<CredentialItem> = {}): CredentialItem {
  return {
    id: "cred-openai-1",
    name: "OpenAI Prod",
    credential_type: "openai_api_key",
    description: "OpenAI runtime key",
    status: "active",
    sensitivity_level: "L2",
    sensitive_resource_id: "resource-1",
    last_used_at: "2026-03-30T12:00:00Z",
    revoked_at: null,
    created_at: "2026-03-30T10:00:00Z",
    updated_at: "2026-03-30T11:00:00Z",
    ...overrides
  };
}

const modelProviderConfigs: WorkspaceModelProviderConfigItem[] = [
  {
    id: "provider-openai-team",
    workspace_id: "default",
    provider_id: "openai",
    provider_label: "OpenAI",
    label: "OpenAI Team",
    description: "",
    credential_id: "cred-openai-1",
    credential_ref: "credential://cred-openai-1",
    credential_name: "OpenAI Prod",
    credential_type: "openai_api_key",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4.1",
    protocol: "chat_completions",
    status: "active",
    supported_model_types: ["llm"],
    created_at: "2026-03-31T14:00:00Z",
    updated_at: "2026-03-31T14:00:00Z",
    disabled_at: null
  }
];

describe("LlmAgentNodeConfigForm", () => {
  it("renders native provider presets, baseUrl input and lazy credential manager boundary", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentNodeConfigForm, {
        node: {
          id: "node-llm-1",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            nodeType: "llm_agent",
            config: {
              prompt: "Summarize this",
              model: {
                provider: "openai",
                modelId: "gpt-4.1",
                apiKey: "credential://cred-openai-1",
                baseUrl: "https://api.openai.com/v1"
              },
              assistant: {
                enabled: false
              }
            }
          }
        } as never,
        nodes: [],
        tools: [],
        credentials: [buildCredential(), buildCredential({ id: "cred-generic-1", credential_type: "api_key", name: "Generic proxy key" })],
        modelProviderConfigs,
        onChange: () => undefined
      })
    );

    expect(html).toContain("OpenAI");
    expect(html).toContain("Anthropic");
    expect(html).toContain("OpenAI-compatible");
    expect(html).toContain("Base URL");
    expect(html).toContain("Provider credential");
    expect(html).toContain("Provider 凭证快捷管理");
    expect(html).toContain("按需挂载");
    expect(html).toContain("workflow definition 会继续保存为");
    expect(html).toContain("credential://cred-openai-1");
  });

  it("keeps unknown provider values without pretending they are built-in presets", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentNodeConfigForm, {
        node: {
          id: "node-llm-custom",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            nodeType: "llm_agent",
            config: {
              model: {
                provider: "deepseek",
                modelId: "deepseek-chat"
              },
              assistant: {
                enabled: false
              }
            }
          }
        } as never,
        nodes: [],
        tools: [],
        credentials: [],
        modelProviderConfigs: [],
        onChange: () => undefined
      })
    );

    expect(html).toContain("保留现有 provider：deepseek");
    expect(html).toContain("当前 provider 不是内置厂商预设");
  });

  it("prefers workspace provider registry when providerConfigRef is present", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentNodeConfigForm, {
        node: {
          id: "node-llm-provider-ref",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            nodeType: "llm_agent",
            config: {
              model: {
                providerConfigRef: "provider-openai-team",
                modelId: "gpt-4.1-mini"
              },
              assistant: {
                enabled: false
              }
            }
          }
        } as never,
        nodes: [],
        tools: [],
        credentials: [buildCredential()],
        modelProviderConfigs,
        modelProviderRegistryStatus: "ready",
        onChange: () => undefined
      })
    );

    expect(html).toContain("Provider config ref");
    expect(html).toContain("providerConfigRef + modelId");
    expect(html).toContain("OpenAI Team · OpenAI");
    expect(html).toContain("runtime 会优先从该 provider config 解析 provider/baseUrl/credential");
  });

  it("defaults fresh nodes to the first active team provider instead of inline credentials", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentNodeConfigForm, {
        node: {
          id: "node-llm-fresh",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            nodeType: "llm_agent",
            config: {
              assistant: {
                enabled: false
              }
            }
          }
        } as never,
        nodes: [],
        tools: [],
        credentials: [buildCredential()],
        modelProviderConfigs,
        modelProviderRegistryStatus: "ready",
        onChange: () => undefined
      })
    );

    expect(html).toContain("团队 provider 已成为当前节点的主入口");
    expect(html).toContain("OpenAI Team · OpenAI");
    expect(html).not.toContain("API Key credential");
  });

  it("shows team provider setup guidance when registry is unavailable for fresh nodes", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentNodeConfigForm, {
        node: {
          id: "node-llm-no-registry",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Agent",
            nodeType: "llm_agent",
            config: {
              assistant: {
                enabled: false
              }
            }
          }
        } as never,
        nodes: [],
        tools: [],
        credentials: [],
        modelProviderConfigs: [],
        modelProviderRegistryStatus: "error",
        onChange: () => undefined
      })
    );

    expect(html).toContain("暂时无法读取团队 provider registry");
    expect(html).toContain("前往团队模型供应商设置");
    expect(html).toContain("/workspace/settings/providers");
    expect(html).not.toContain("API Key credential");
  });
});
