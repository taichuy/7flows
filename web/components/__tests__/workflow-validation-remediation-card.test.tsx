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
  it("reuses the shared catalog-gap handoff for focused remediation", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "tool-reference",
      category: "tool_reference",
      message: "Tool 节点 Search（search）引用了当前目录中不存在的工具 native.catalog-gap。",
      catalogGapToolIds: ["native.catalog-gap"],
      target: {
        scope: "node",
        nodeId: "search",
        section: "config",
        fieldPath: "config.tool.toolId",
        label: "Node · Search"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowValidationRemediationCard, {
        item,
        currentHref: "/workflows/workflow-1?pane=editor"
      })
    );

    expect(html).toContain("Node · Search · Tool id");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前这条字段级问题 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到当前 workflow 编辑器补齐 binding / LLM Agent tool policy，再继续处理这条校验。"
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?pane=editor&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
  });

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

  it("reuses the shared publish auth contract for legacy auth remediation", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "publish-auth-mode",
      category: "publish_draft",
      message: "Public Search 当前不能使用 authMode = token。",
      target: {
        scope: "publish",
        endpointIndex: 0,
        fieldPath: "authMode",
        label: "Publish · Public Search"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowValidationRemediationCard, {
        item,
        sandboxReadiness: buildSandboxReadiness(),
        currentHref: "/workflows/public-search"
      })
    );

    expect(html).toContain("Publish · Public Search · Auth mode");
    expect(html).toContain("Publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain("legacy token");
    expect(html).toContain("先把 workflow draft endpoint 切回 api_key/internal 并保存");
    expect(html).not.toContain("Live sandbox readiness");
  });
});
