import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowNodeRuntimePolicyExecutionSection } from "@/components/workflow-node-config-form/runtime-policy-execution-section";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: true,
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
    supports_filesystem_policy: true
  };
}

describe("WorkflowNodeRuntimePolicyExecutionSection", () => {
  it("shows live sandbox readiness when runtimePolicy.execution exceeds current capability", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowNodeRuntimePolicyExecutionSection, {
        nodeId: "node-1",
        nodeType: "sandbox_code",
        runtimePolicy: {
          execution: {
            class: "sandbox",
            profile: "browser-safe",
            networkPolicy: "restricted"
          }
        },
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("runtimePolicy.execution 仍有 capability 未对齐");
    expect(html).toContain("profile = browser-safe");
    expect(html).toContain("networkPolicy = restricted");
  });

  it("shows field-level remediation for focused runtime execution issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "runtime-execution",
      category: "node_execution",
      message: "节点请求强隔离 execution class，但当前 adapter 还没有兑现。",
      target: {
        scope: "node",
        nodeId: "node-1",
        section: "runtime",
        fieldPath: "runtimePolicy.execution.class",
        label: "Node · Sandbox code"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowNodeRuntimePolicyExecutionSection, {
        nodeId: "node-1",
        nodeType: "sandbox_code",
        runtimePolicy: {
          execution: {
            class: "sandbox"
          }
        },
        highlightedFieldPath: "runtimePolicy.execution.class",
        focusedValidationItem,
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Sandbox code · Execution class");
    expect(html).toContain("先把 execution override 调回当前实现支持范围");
  });
});
