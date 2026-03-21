import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SandboxCodeNodeConfigForm } from "@/components/workflow-node-config-form/sandbox-code-node-config-form";
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
        supported_languages: ["python", "javascript"],
        supported_profiles: ["python-safe"],
        supported_dependency_modes: ["builtin", "dependency_ref"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      }
    ],
    supported_languages: ["python", "javascript"],
    supported_profiles: ["python-safe"],
    supported_dependency_modes: ["builtin", "dependency_ref"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: true
  };
}

describe("SandboxCodeNodeConfigForm", () => {
  it("renders structured sandbox authoring fields and readiness-aware language options", () => {
    const html = renderToStaticMarkup(
      createElement(SandboxCodeNodeConfigForm, {
        node: {
          id: "sandbox-node",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Sandbox",
            nodeType: "sandbox_code",
            config: {
              language: "python",
              code: "result = {'ok': True}",
              dependencyMode: "builtin",
              builtinPackageSet: "py-data-basic"
            }
          }
        },
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Sandbox code");
    expect(html).toContain("Language");
    expect(html).toContain("javascript");
    expect(html).toContain("Code");
    expect(html).toContain("Dependency mode");
    expect(html).toContain("Builtin package set");
    expect(html).toContain("host-controlled MVP 路径");
  });

  it("shows field-level remediation for focused config issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "sandbox-code-empty",
      category: "tool_execution",
      message: "Sandbox code 节点需要非空 code。",
      target: {
        scope: "node",
        nodeId: "sandbox-node",
        section: "config",
        fieldPath: "config.code",
        label: "Node · Sandbox"
      }
    };

    const html = renderToStaticMarkup(
      createElement(SandboxCodeNodeConfigForm, {
        node: {
          id: "sandbox-node",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Sandbox",
            nodeType: "sandbox_code",
            config: {
              language: "python",
              code: ""
            }
          }
        },
        highlightedFieldPath: "config.code",
        focusedValidationItem,
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Sandbox · Sandbox code");
    expect(html).toContain("补一段非空代码");
  });
});

