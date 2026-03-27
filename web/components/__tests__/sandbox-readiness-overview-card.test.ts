import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
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
    degraded_backend_count: 0,
    offline_backend_count: 1,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["inline"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: true,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      },
      {
        execution_class: "microvm",
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
        reason: "No healthy microvm backend is currently ready."
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["inline"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: true,
    supports_network_policy: true,
    supports_filesystem_policy: true,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "workflow_library",
      entry_key: "workflowLibrary",
      href: "/workflows?risk=sandbox",
      label: "Open workflow library"
    },
    ...overrides
  };
}

describe("SandboxReadinessOverviewCard", () => {
  it("renders the shared sandbox recommended next step when readiness exposes a follow-up", () => {
    const html = renderToStaticMarkup(
      createElement(SandboxReadinessOverviewCard, {
        readiness: buildReadiness(),
        title: "Live sandbox readiness",
        intro: "Show sandbox status before entering the editor."
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain(
      "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。"
    );
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?risk=sandbox');
  });

  it("skips the recommended next step block when shared follow-up is absent", () => {
    const html = renderToStaticMarkup(
      createElement(SandboxReadinessOverviewCard, {
        readiness: buildReadiness({
          affected_run_count: 0,
          affected_workflow_count: 0,
          primary_blocker_kind: null,
          recommended_action: null
        })
      })
    );

    expect(html).not.toContain("Recommended next step");
  });

  it("drops the sandbox follow-up link when the current page already matches it", () => {
    const html = renderToStaticMarkup(
      createElement(SandboxReadinessOverviewCard, {
        readiness: buildReadiness(),
        currentHref: "/workflows?risk=sandbox",
        title: "Live sandbox readiness"
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain(
      "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。"
    );
    expect(html).not.toContain("Open workflow library</a>");
  });
});
