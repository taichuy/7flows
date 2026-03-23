import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsTraceFiltersSection } from "@/components/run-diagnostics-panel/trace-filters-section";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { buildRequiredOperatorRunDetailLinkSurface } from "@/lib/operator-follow-up-presenters";
import { buildRunDiagnosticsTraceSurfaceCopy } from "@/lib/run-diagnostics-presenters";

const { exportActionSpy } = vi.hoisted(() => ({
  exportActionSpy: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-trace-export-actions", () => ({
  RunTraceExportActions: (props: Record<string, unknown>) => {
    exportActionSpy(props);
    return createElement("div", { "data-testid": "run-trace-export-actions" });
  }
}));

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "configured",
    scheduler_required: true,
    detail: "callback automation degraded",
    scheduler_health_status: "unhealthy",
    scheduler_health_detail: "scheduler is currently backlogged.",
    affected_run_count: 2,
    affected_workflow_count: 1,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "callback_waiting",
      entry_key: "runLibrary",
      href: "/runs?status=waiting",
      label: "Open run library"
    },
    steps: []
  };
}

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
        reason: "No sandbox backend is currently enabled."
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

describe("RunDiagnosticsTraceFiltersSection", () => {
  it("uses shared trace export blocker copy instead of local summary overrides", () => {
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const sandboxReadiness = buildSandboxReadiness();

    renderToStaticMarkup(
      createElement(RunDiagnosticsTraceFiltersSection, {
        runId: "run-1",
        activeTraceQuery: {
          limit: 50,
          order: "desc"
        },
        eventTypeOptions: ["node.started"],
        nodeRunOptions: ["node-run-1"],
        activeFilters: [],
        callbackWaitingAutomation,
        sandboxReadiness
      })
    );

    expect(exportActionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackWaitingAutomation,
        runId: "run-1",
        requesterId: "run-diagnostics-trace-export",
        sandboxReadiness,
        query: {
          limit: 50,
          order: "desc"
        }
      })
    );
    const props = exportActionSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props).not.toHaveProperty("blockedSummary");
  });

  it("renders shared trace helper copy instead of local hardcoded text", () => {
    const surfaceCopy = buildRunDiagnosticsTraceSurfaceCopy({
      defaultLimit: 100
    });

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsTraceFiltersSection, {
        runId: "run-1",
        activeTraceQuery: {
          limit: 100,
          order: "desc"
        },
        eventTypeOptions: ["node.started"],
        nodeRunOptions: ["node-run-1"],
        activeFilters: []
      })
    );

    expect(html).toContain(surfaceCopy.sectionDescription);
    expect(html).toContain(surfaceCopy.applyFiltersLabel);
    expect(html).toContain(surfaceCopy.resetFiltersLabel);
    expect(html).toContain(surfaceCopy.defaultLimitHint);
    expect(html).toContain(surfaceCopy.utcTimeWindowHint);
    expect(html).toContain(surfaceCopy.cursorPaginationHint);
    expect(html).toContain(surfaceCopy.emptyState);
  });

  it("routes filter reset and form action through the shared run detail link surface", () => {
    const resetRunLink = buildRequiredOperatorRunDetailLinkSurface({
      runId: "run alpha/beta",
      hrefLabel: "重置过滤"
    });

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsTraceFiltersSection, {
        runId: "run alpha/beta",
        activeTraceQuery: {
          limit: 100,
          order: "asc"
        },
        eventTypeOptions: [],
        nodeRunOptions: [],
        activeFilters: []
      })
    );

    expect(html).toContain(`action="${resetRunLink.href}"`);
    expect(html).toContain(`href="${resetRunLink.href}"`);
    expect(html).toContain(resetRunLink.label);
  });

  it("keeps workspace scope on filter reset and form actions", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsTraceFiltersSection, {
        runId: "run-1",
        runDetailHref:
          "/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true",
        activeTraceQuery: {
          limit: 100,
          order: "asc"
        },
        eventTypeOptions: [],
        nodeRunOptions: [],
        activeFilters: []
      })
    );

    expect(html).toContain(
      'action="/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;needs_follow_up=true"'
    );
    expect(html).toContain(
      'href="/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;needs_follow_up=true"'
    );
  });
});
