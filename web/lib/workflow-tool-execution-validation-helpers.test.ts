import { describe, expect, it } from "vitest";

import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "./get-plugin-registry";
import type {
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "./get-system-overview";
import {
  buildDefaultExecutionCapabilityIssue,
  buildExecutionCapabilityIssue
} from "./workflow-tool-execution-validation-helpers";

function createCompatTool(): PluginToolRegistryItem {
  return {
    id: "compat:dify:plugin:demo/search",
    name: "Demo Search",
    ecosystem: "compat:dify",
    description: "demo",
    input_schema: {},
    output_schema: null,
    source: "plugin",
    plugin_meta: null,
    callable: true,
    supported_execution_classes: ["subprocess", "sandbox", "microvm"],
    default_execution_class: "subprocess",
    sensitivity_level: "L1"
  };
}

function createNativeTool(
  overrides?: Partial<PluginToolRegistryItem>
): PluginToolRegistryItem {
  return {
    id: "native.risk-search",
    name: "Risk Search",
    ecosystem: "native",
    description: "native demo",
    input_schema: {},
    output_schema: null,
    source: "builtin",
    plugin_meta: null,
    callable: true,
    supported_execution_classes: ["inline", "sandbox", "microvm"],
    default_execution_class: "inline",
    sensitivity_level: "L1",
    ...overrides
  };
}

function createAdapter(): PluginAdapterRegistryItem {
  return {
    id: "dify-default",
    ecosystem: "compat:dify",
    endpoint: "http://adapter.local",
    enabled: true,
    healthcheck_path: "/healthz",
    workspace_ids: [],
    plugin_kinds: ["tool"],
    supported_execution_classes: ["subprocess", "sandbox", "microvm"],
    status: "up",
    detail: null
  };
}

function createSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 2,
    healthy_backend_count: 2,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["python-safe"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      },
      {
        execution_class: "microvm",
        available: true,
        backend_ids: ["microvm-default"],
        supported_languages: ["python"],
        supported_profiles: [],
        supported_dependency_modes: ["dependency_ref"],
        supports_tool_execution: true,
        supports_builtin_package_sets: false,
        supports_backend_extensions: true,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["python-safe"],
    supported_dependency_modes: ["builtin", "dependency_ref"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: true,
    supports_network_policy: true,
    supports_filesystem_policy: true
  };
}

function createSandboxBackends(
  overrides?: Array<
    Omit<Partial<SandboxBackendCheck>, "capability"> & {
      capability?: Partial<SandboxBackendCheck["capability"]>;
    }
  >
): SandboxBackendCheck[] {
  const defaults: SandboxBackendCheck[] = [
    {
      id: "sandbox-default",
      kind: "process",
      endpoint: "http://sandbox.local",
      enabled: true,
      status: "healthy",
      capability: {
        supported_execution_classes: ["sandbox", "microvm"],
        supported_languages: ["python"],
        supported_profiles: ["python-safe"],
        supported_dependency_modes: ["builtin", "dependency_ref"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: true,
        supports_network_policy: true,
        supports_filesystem_policy: true
      },
      detail: null
    }
  ];

  return (overrides ?? defaults).map((override, index) => ({
    ...defaults[index]!,
    ...override,
    capability: {
      ...defaults[index]!.capability,
      ...(override?.capability ?? {})
    }
  }));
}

describe("workflow tool execution validation helpers", () => {
  it("按 execution class 校验 dependencyMode 能力，而不是只看全局聚合", () => {
    const issue = buildExecutionCapabilityIssue({
      context: "节点 toolPolicy.execution",
      nodeId: "node-1",
      nodeName: "Node 1",
      toolId: "compat:dify:plugin:demo/search",
      tool: createCompatTool(),
      ecosystem: "compat:dify",
      adapterId: "dify-default",
      requestedExecutionClass: "microvm",
      executionPayload: {
        class: "microvm",
        dependencyMode: "builtin"
      },
      adapters: [createAdapter()],
      sandboxReadiness: createSandboxReadiness(),
      path: "nodes[0].config.toolPolicy.execution",
      field: "execution"
    });

    expect(issue?.message).toContain("dependencyMode = builtin");
  });

  it("按 execution class 校验 networkPolicy 能力，而不是只看全局布尔值", () => {
    const issue = buildExecutionCapabilityIssue({
      context: "节点 toolPolicy.execution",
      nodeId: "node-1",
      nodeName: "Node 1",
      toolId: "compat:dify:plugin:demo/search",
      tool: createCompatTool(),
      ecosystem: "compat:dify",
      adapterId: "dify-default",
      requestedExecutionClass: "microvm",
      executionPayload: {
        class: "microvm",
        networkPolicy: "egress-deny"
      },
      adapters: [createAdapter()],
      sandboxReadiness: createSandboxReadiness(),
      path: "nodes[0].config.toolPolicy.execution",
      field: "execution"
    });

    expect(issue?.message).toContain("networkPolicy = egress-deny");
  });

  it("在 backend 未声明 tool execution capability 时阻断强隔离工具", () => {
    const issue = buildExecutionCapabilityIssue({
      context: "节点 toolPolicy.execution",
      nodeId: "node-1",
      nodeName: "Node 1",
      toolId: "compat:dify:plugin:demo/search",
      tool: createCompatTool(),
      ecosystem: "compat:dify",
      adapterId: "dify-default",
      requestedExecutionClass: "sandbox",
      executionPayload: {
        class: "sandbox"
      },
      adapters: [createAdapter()],
      sandboxReadiness: createSandboxReadiness(),
      sandboxBackends: createSandboxBackends([
        {
          capability: {
            supports_tool_execution: false
          }
        }
      ]),
      path: "nodes[0].config.toolPolicy.execution",
      field: "execution"
    });

    expect(issue?.message).toContain("sandbox-backed tool execution");
  });

  it("即使 backend 已声明 tool execution capability，原生工具强隔离仍保持 fail-closed", () => {
    const issue = buildExecutionCapabilityIssue({
      context: "节点 tool.runtimePolicy.execution",
      nodeId: "node-native-1",
      nodeName: "Native Tool",
      toolId: "native.risk-search",
      tool: createNativeTool(),
      ecosystem: "native",
      adapterId: null,
      requestedExecutionClass: "sandbox",
      executionPayload: {
        class: "sandbox"
      },
      adapters: [],
      sandboxReadiness: createSandboxReadiness(),
      sandboxBackends: createSandboxBackends(),
      path: "nodes[0].runtimePolicy.execution",
      field: "execution"
    });

    expect(issue?.message).toContain("sandbox-backed tool runner");
    expect(issue?.message).toContain("原生工具 native.risk-search");
    expect(issue?.message).toContain("fail-closed");
  });

  it("原生工具的默认强隔离执行级别不会被 editor 误判为 ready", () => {
    const issue = buildDefaultExecutionCapabilityIssue({
      context: "节点 toolPolicy.allowedToolIds",
      nodeId: "node-native-default",
      nodeName: "Native Default Tool",
      toolId: "native.risk-search",
      tool: createNativeTool({ default_execution_class: "microvm" }),
      ecosystem: "native",
      adapterId: null,
      adapters: [],
      sandboxReadiness: createSandboxReadiness(),
      sandboxBackends: createSandboxBackends(),
      path: "nodes[0].config.toolPolicy.allowedToolIds",
      field: "allowedToolIds"
    });

    expect(issue?.message).toContain("默认执行级别 microvm");
    expect(issue?.message).toContain("native tool 也接入同一条强隔离执行主链");
  });
});
