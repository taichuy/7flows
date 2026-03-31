import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceModelProviderSettings } from "@/components/workspace-model-provider-settings";

Object.assign(globalThis, { React });

vi.mock("@/lib/model-provider-registry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/model-provider-registry")>(
    "@/lib/model-provider-registry"
  );
  return {
    ...actual,
    createWorkspaceModelProviderConfig: vi.fn(),
    updateWorkspaceModelProviderConfig: vi.fn(),
    deactivateWorkspaceModelProviderConfig: vi.fn()
  };
});

describe("WorkspaceModelProviderSettings", () => {
  it("renders the registry list and form split", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceModelProviderSettings, {
        workspaceName: "7Flows Workspace",
        initialCatalog: [
          {
            id: "openai",
            label: "OpenAI",
            description: "OpenAI",
            help_url: "https://platform.openai.com/account/api-keys",
            supported_model_types: ["llm"],
            configuration_methods: ["predefined-model", "customizable-model"],
            credential_type: "openai_api_key",
            compatible_credential_types: ["openai_api_key", "api_key"],
            default_base_url: "https://api.openai.com/v1",
            default_protocol: "chat_completions",
            default_models: ["gpt-4.1"],
            credential_fields: [
              {
                variable: "api_protocol",
                label: "API Protocol",
                type: "select",
                required: false,
                placeholder: "",
                help: "Use Chat Completions for most OpenAI models.",
                default: "chat_completions",
                options: [
                  {
                    value: "chat_completions",
                    label: "Chat Completions"
                  },
                  {
                    value: "responses",
                    label: "Responses API"
                  }
                ]
              }
            ]
          }
        ],
        initialCredentials: [
          {
            id: "cred-openai-1",
            name: "OpenAI Prod Key",
            credential_type: "openai_api_key",
            description: "",
            status: "active",
            sensitivity_level: "L2",
            sensitive_resource_id: null,
            last_used_at: null,
            revoked_at: null,
            created_at: "2026-03-31T12:00:00Z",
            updated_at: "2026-03-31T12:00:00Z"
          }
        ],
        initialProviderConfigs: [
          {
            id: "provider-openai-1",
            workspace_id: "default",
            provider_id: "openai",
            provider_label: "OpenAI",
            label: "OpenAI Production",
            description: "主团队供应商",
            credential_id: "cred-openai-1",
            credential_ref: "credential://cred-openai-1",
            credential_name: "OpenAI Prod Key",
            credential_type: "openai_api_key",
            base_url: "https://api.openai.com/v1",
            default_model: "gpt-4.1",
            protocol: "responses",
            status: "active",
            supported_model_types: ["llm"],
            created_at: "2026-03-31T12:00:00Z",
            updated_at: "2026-03-31T12:00:00Z",
            disabled_at: null
          }
        ]
      })
    );

    expect(html).toContain('data-component="workspace-model-provider-settings"');
    expect(html).toContain('data-component="workspace-model-provider-registry-list"');
    expect(html).toContain('data-component="workspace-model-provider-form"');
    expect(html).toContain('data-component="workspace-model-provider-catalog-card"');
    expect(html).toContain('data-component="workspace-model-provider-preflight"');
    expect(html).toContain("OpenAI Production");
    expect(html).toContain("credential://cred-openai-1");
    expect(html).toContain("查看 OpenAI 帮助文档");
    expect(html).toContain("Chat Completions");
    expect(html).toContain("当前配置已满足本地 preflight");
    expect(html).toContain("创建供应商");
  });
});
