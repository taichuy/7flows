import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsTraceResultsSection } from "@/components/run-diagnostics-panel/trace-results-section";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("RunDiagnosticsTraceResultsSection", () => {
  it("routes the trace error reset CTA through the shared run detail link surface", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsTraceResultsSection, {
        runId: "run alpha/beta",
        trace: null,
        traceError: "boom",
        activeTraceQuery: {
          limit: 100,
          order: "desc"
        },
        traceHref: "/runs/run%20alpha%2Fbeta?limit=100&order=desc"
      })
    );

    expect(html).toContain('href="/runs/run%20alpha%2Fbeta"');
    expect(html).toContain("清除过滤并重试");
    expect(html).toContain('href="/runs/run%20alpha%2Fbeta?limit=100&amp;order=desc"');
  });
});
