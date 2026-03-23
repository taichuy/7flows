import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

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

describe("WorkflowValidationRemediationCard", () => {
  it("drops shared sandbox links when the current page already matches the follow-up", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "tool-execution-class",
      category: "tool_execution",
      message: "Tool 节点请求 sandbox execution，但当前 capability 还没有准备好。",
      target: {
        scope: "node",
        nodeId: "tool-1",
        section: "runtime",
        fieldPath: "runtimePolicy.execution.class",
        label: "Tool 节点"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowValidationRemediationCard, {
        item,
        sandboxReadiness: buildSandboxReadiness(),
        currentHref: "/workflows?execution=sandbox"
      })
    );

    expect(html).toContain("Tool 节点 · Execution class");
    expect(html).toContain("Tool 节点请求 sandbox execution，但当前 capability 还没有准备好。");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).not.toContain("Open workflow library</a>");
  });
});
