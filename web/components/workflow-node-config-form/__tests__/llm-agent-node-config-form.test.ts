import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmAgentNodeConfigForm } from "@/components/workflow-node-config-form/llm-agent-node-config-form";
import type { CredentialItem } from "@/lib/get-credentials";

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
        onChange: () => undefined
      })
    );

    expect(html).toContain("保留现有 provider：deepseek");
    expect(html).toContain("当前 provider 不是内置厂商预设");
  });
});
