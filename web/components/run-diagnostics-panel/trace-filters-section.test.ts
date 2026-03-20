import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsTraceFiltersSection } from "@/components/run-diagnostics-panel/trace-filters-section";

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

describe("RunDiagnosticsTraceFiltersSection", () => {
  it("uses shared trace export blocker copy instead of local summary overrides", () => {
    renderToStaticMarkup(
      createElement(RunDiagnosticsTraceFiltersSection, {
        runId: "run-1",
        activeTraceQuery: {
          limit: 50,
          order: "desc"
        },
        eventTypeOptions: ["node.started"],
        nodeRunOptions: ["node-run-1"],
        activeFilters: []
      })
    );

    expect(exportActionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        requesterId: "run-diagnostics-trace-export",
        query: {
          limit: 50,
          order: "desc"
        }
      })
    );
    const props = exportActionSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props).not.toHaveProperty("blockedSummary");
  });
});
