import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsTraceFiltersSection } from "@/components/run-diagnostics-panel/trace-filters-section";
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
});
