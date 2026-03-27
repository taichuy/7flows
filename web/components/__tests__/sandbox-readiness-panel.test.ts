import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SandboxReadinessPanel } from "@/components/sandbox-readiness-panel";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildReadiness(
  overrides: Partial<SandboxReadinessCheck> = {}
): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 0,
    degraded_backend_count: 1,
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
        reason: "No compatible sandbox backend is currently ready."
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
    affected_run_count: 2,
    affected_workflow_count: 3,
    primary_blocker_kind: "backend_offline",
    recommended_action: {
      kind: "workflow_library",
      entry_key: "workflowLibrary",
      href: "/workflows?execution_class=sandbox",
      label: "Open workflow library"
    },
    ...overrides
  };
}

describe("SandboxReadinessPanel", () => {
  it("shows the shared sandbox recommended next step above the execution class list", () => {
    const html = renderToStaticMarkup(
      createElement(SandboxReadinessPanel, {
        readiness: buildReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain(
      "当前 live sandbox readiness 仍影响 2 个 run / 3 个 workflow；至少一个 sandbox backend 仍 offline，优先回到 workflow library 评估受影响的强隔离链路。"
    );
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution_class=sandbox');
  });
});
