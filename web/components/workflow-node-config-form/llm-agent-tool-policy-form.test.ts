import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmAgentToolPolicyForm } from "@/components/workflow-node-config-form/llm-agent-tool-policy-form";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

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
    supports_filesystem_policy: false,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "workflow library",
      entry_key: "workflowLibrary",
      href: "/workflows?execution=sandbox",
      label: "Open workflow library"
    }
  };
}

function buildReadySandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-ready"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
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
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow library");
  });

  it("shows field-level remediation for focused tool policy issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "tool-policy-allowed-tools",
      category: "tool_execution",
      message: "allow list 中包含不兼容当前 execution override 的工具。",
      target: {
        scope: "node",
        nodeId: "node-1",
        section: "config",
        fieldPath: "config.toolPolicy.allowedToolIds",
        label: "Node · Agent"
      }
    };

    const html = renderToStaticMarkup(
      createElement(LlmAgentToolPolicyForm, {
        config: {},
        tools: [buildTool()],
        sandboxReadiness: buildSandboxReadiness(),
        highlightedFieldPath: "config.toolPolicy.allowedToolIds",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Agent · Allowed tools");
    expect(html).toContain("把 allow list 收口到与当前 execution override 兼容的工具");
    expect(html).toContain("Recommended next step");
  });

  it("shows strong-isolation dependency fields and backend extension mismatch insight", () => {
    const html = renderToStaticMarkup(
      createElement(LlmAgentToolPolicyForm, {
        config: {
          toolPolicy: {
            execution: {
              class: "sandbox",
              dependencyMode: "builtin",
              builtinPackageSet: "py-data-basic",
              backendExtensions: {
                mountPreset: "analytics"
              }
            }
          }
        },
        tools: [buildTool()],
        sandboxReadiness: buildReadySandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Dependency mode");
    expect(html).toContain("Builtin package set");
    expect(html).toContain("Backend extensions JSON");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("backendExtensions payload");
  });
});
