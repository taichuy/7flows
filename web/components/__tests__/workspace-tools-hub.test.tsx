import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceToolsHub } from "@/components/workspace-tools-hub";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type {
  NativeModelProviderCatalogItem,
  WorkspaceModelProviderConfigItem
} from "@/lib/model-provider-registry";

Object.assign(globalThis, { React });

const nodeCatalog: WorkflowNodeCatalogItem[] = [
  buildNode("llm_agent", "LLM Agent", "agent"),
  buildNode("reference", "Reference", "integration"),
  buildNode("tool", "Tool", "integration"),
  buildNode("mcp_query", "MCP Query", "integration"),
  buildNode("sandbox_code", "Sandbox Code", "logic")
];

const providerCatalog: NativeModelProviderCatalogItem[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI native provider plugin",
    supported_model_types: ["llm"],
    configuration_methods: ["predefined-model", "customizable-model"],
    credential_type: "openai_api_key",
    compatible_credential_types: ["openai_api_key", "api_key"],
    default_base_url: "https://api.openai.com/v1",
    default_protocol: "chat_completions",
    default_models: ["gpt-4.1", "gpt-4o"],
    credential_fields: []
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude native provider plugin",
    supported_model_types: ["llm"],
    configuration_methods: ["predefined-model"],
    credential_type: "anthropic_api_key",
    compatible_credential_types: ["anthropic_api_key", "api_key"],
    default_base_url: "https://api.anthropic.com",
    default_protocol: "messages",
    default_models: ["claude-3-7-sonnet-latest"],
    credential_fields: []
  }
];

const providerConfigs: WorkspaceModelProviderConfigItem[] = [
  {
    id: "provider-openai-1",
    workspace_id: "default",
    provider_id: "openai",
    provider_label: "OpenAI",
    label: "OpenAI Production",
    description: "主团队供应商",
    credential_id: "cred-openai-1",
    credential_ref: "credential://cred-openai-1",
    credential_name: "OpenAI Prod",
    credential_type: "openai_api_key",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4.1",
    protocol: "chat_completions",
    status: "active",
    supported_model_types: ["llm"],
    created_at: "2026-04-01T14:00:00Z",
    updated_at: "2026-04-01T14:00:00Z",
    disabled_at: null
  }
];

const nativeTools: PluginToolRegistryItem[] = [
  {
    id: "native.search",
    name: "Native Search",
    ecosystem: "native",
    description: "原生搜索工具",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string"
        }
      }
    },
    output_schema: null,
    source: "builtin",
    plugin_meta: null,
    callable: true,
    supported_execution_classes: ["inline"],
    default_execution_class: "inline",
    sensitivity_level: "L1"
  }
];

const pluginTools: PluginToolRegistryItem[] = [
  {
    id: "compat:dify:plugin:demo/search",
    name: "Dify Search",
    ecosystem: "compat:dify",
    description: "Dify plugin search",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string"
        }
      }
    },
    output_schema: null,
    source: "plugin:demo",
    plugin_meta: {
      dify_runtime: {
        provider: "dify-default",
        plugin_id: "demo-plugin",
        tool_name: "search"
      }
    },
    callable: true,
    supported_execution_classes: ["subprocess"],
    default_execution_class: "subprocess",
    sensitivity_level: "L2"
  }
];

const pluginAdapters: PluginAdapterRegistryItem[] = [
  {
    id: "dify-default",
    ecosystem: "compat:dify",
    endpoint: "http://127.0.0.1:9001",
    enabled: true,
    healthcheck_path: "/healthz",
    workspace_ids: ["default"],
    plugin_kinds: ["tool"],
    supported_execution_classes: ["subprocess"],
    status: "healthy",
    detail: null,
    mode: "translate"
  }
];

describe("WorkspaceToolsHub", () => {
  it("renders three layers and defaults to native tool registry filtering", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceToolsHub, {
        handoff: {
          returnHref: "/workflows/workflow-1/editor",
          workflowId: "workflow-1",
          workflowSurfaceLabel: "编排"
        },
        nodeCatalog,
        providerCatalog,
        providerConfigs,
        providerRegistryState: {
          kind: "ready",
          message: null
        },
        providerManageHref: "/workspace/settings/providers",
        nativeTools,
        pluginTools,
        pluginAdapters,
        pluginGovernanceHref: "/workspace-starters"
      })
    );

    expect(html).toContain('data-component="workspace-tools-hub"');
    expect(html).toContain('data-tool-source="native"');
    expect(html).toContain("内置节点目录");
    expect(html).toContain("模型供应商");
    expect(html).toContain("工具注册");
    expect(html).toContain("LLM Agent");
    expect(html).toContain("Reference");
    expect(html).toContain("Sandbox Code");
    expect(html).toContain("OpenAI Production · gpt-4.1");
    expect(html).toContain("Native Search");
    expect(html).toContain("回到当前编排");
    expect(html).not.toContain("Dify Search");
  });

  it("can render Dify plugin registry filtering with adapter health", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceToolsHub, {
        handoff: {
          returnHref: null,
          workflowId: null,
          workflowSurfaceLabel: null
        },
        nodeCatalog,
        providerCatalog,
        providerConfigs: [],
        providerRegistryState: {
          kind: "ready",
          message: null
        },
        providerManageHref: "/workspace/settings/providers",
        nativeTools,
        pluginTools,
        pluginAdapters,
        pluginGovernanceHref: "/workspace-starters",
        initialToolSource: "dify"
      })
    );

    expect(html).toContain('data-tool-source="dify"');
    expect(html).toContain("Dify Search");
    expect(html).toContain("dify-default");
    expect(html).toContain("mode translate");
    expect(html).toContain("compat runtime：dify-default / demo-plugin / search");
    expect(html).not.toContain("Native Search");
  });

  it("shows restricted provider access honestly while keeping provider facts visible", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceToolsHub, {
        handoff: {
          returnHref: null,
          workflowId: null,
          workflowSurfaceLabel: null
        },
        nodeCatalog,
        providerCatalog,
        providerConfigs: [],
        providerRegistryState: {
          kind: "restricted",
          message: "当前账号没有团队模型供应商配置权限。"
        },
        providerManageHref: null,
        nativeTools,
        pluginTools,
        pluginAdapters,
        pluginGovernanceHref: "/workspace-starters"
      })
    );

    expect(html).toContain("权限受限");
    expect(html).toContain("当前账号没有团队模型供应商配置权限。");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Anthropic");
    expect(html).toContain("仅团队管理员可管理");
  });
});

function buildNode(
  type: string,
  label: string,
  capabilityGroup: "entry" | "agent" | "integration" | "logic" | "output"
) {
  return {
    type,
    label,
    description: `${label} description`,
    ecosystem: "native",
    source: {
      kind: "node" as const,
      scope: "builtin" as const,
      status: "available" as const,
      governance: "repo" as const,
      ecosystem: "native",
      label: "7Flows Native",
      shortLabel: "Native",
      summary: "native"
    },
    capabilityGroup,
    businessTrack: "应用新建编排" as const,
    tags: [label],
    supportStatus: "available" as const,
    supportSummary: `${label} support summary`,
    bindingRequired: type === "tool",
    bindingSourceLanes: [],
    palette: {
      enabled: true,
      order: 1,
      defaultPosition: {
        x: 240,
        y: 120
      }
    },
    defaults: {
      name: label,
      config: {}
    }
  } satisfies WorkflowNodeCatalogItem;
}
