import { describe, expect, it } from "vitest";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildWorkflowValidationRemediation,
  pickWorkflowValidationRemediationItem
} from "@/lib/workflow-validation-remediation";
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
    supports_filesystem_policy: false
  };
}

describe("workflow validation remediation", () => {
  it("为 tool 节点 runtimePolicy.execution 的 dependency hints 生成可读标题与建议", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "tool-runtime-builtin-package-set",
      category: "tool_execution",
      message: "当前 sandbox readiness 还不支持 builtinPackageSet = py-data-basic 的 capability hints。",
      target: {
        scope: "node",
        nodeId: "tool-node",
        section: "runtime",
        fieldPath: "runtimePolicy.execution.builtinPackageSet",
        label: "Node · Search tool"
      }
    };

    const remediation = buildWorkflowValidationRemediation(item, buildSandboxReadiness());

    expect(remediation.title).toBe("Node · Search tool · Builtin package set");
    expect(remediation.suggestion).toContain("当前 backend 已暴露的 capability");
    expect(remediation.followUp).toContain("fail-closed");
  });

  it("为 LLM Agent toolPolicy.execution 的 dependencyRef 生成专门标签", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "agent-tool-policy-dependency-ref",
      category: "tool_execution",
      message:
        "当前 sandbox readiness 还没有暴露 dependencyRef = bundle:finance-safe-v1 所需的 dependency_ref capability。",
      target: {
        scope: "node",
        nodeId: "agent-node",
        section: "config",
        fieldPath: "config.toolPolicy.execution.dependencyRef",
        label: "Node · Planner"
      }
    };

    const remediation = buildWorkflowValidationRemediation(item, buildSandboxReadiness());

    expect(remediation.title).toBe("Node · Planner · Tool dependency ref");
    expect(remediation.suggestion).toContain("toolPolicy execution override");
  });

  it("优先把首个 remediation 落到 execution capability 字段级问题", () => {
    const picked = pickWorkflowValidationRemediationItem([
      {
        key: "tool-binding-tool-id",
        category: "tool_reference",
        message: "tool binding 指向了当前 catalog 中不存在的 tool id。",
        target: {
          scope: "node",
          nodeId: "tool-node",
          section: "config",
          fieldPath: "config.tool.toolId",
          label: "Node · Search tool"
        }
      },
      {
        key: "tool-runtime-backend-extensions",
        category: "tool_execution",
        message: "当前 sandbox readiness 还不支持 backendExtensions payload。",
        target: {
          scope: "node",
          nodeId: "tool-node",
          section: "runtime",
          fieldPath: "runtimePolicy.execution.backendExtensions",
          label: "Node · Search tool"
        }
      }
    ]);

    expect(picked?.key).toBe("tool-runtime-backend-extensions");
  });
});
