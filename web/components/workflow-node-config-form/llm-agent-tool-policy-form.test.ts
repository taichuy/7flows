import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmAgentToolPolicyForm } from "@/components/workflow-node-config-form/llm-agent-tool-policy-form";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason:
          "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
      }
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false
  };
}

function buildTool(): PluginToolRegistryItem {
  return {
    id: "tool-1",
    name: "Sandboxed tool",
    description: "Tool requiring strong isolation",
    ecosystem: "openai",
    source: "catalog",
    callable: true,
    supported_execution_classes: ["sandbox"],
    default_execution_class: "sandbox",
    sensitivity_level: "L3",
    input_schema: { type: "object", properties: {} },
    output_schema: { type: "object", properties: {} }
  };
}

describe("LlmAgentToolPolicyForm", () => {
  it("shows sandbox readiness near tool execution override", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentToolPolicyForm, {
        config: {},
        tools: [buildTool()],
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Tool policy");
    expect(html).toContain("live sandbox readiness");
    expect(html).toContain("当前 sandbox readiness：");
    expect(html).toContain("fail-closed");
  });
});
