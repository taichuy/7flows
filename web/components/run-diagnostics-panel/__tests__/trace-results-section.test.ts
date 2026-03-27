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

  it("keeps workspace scope on the trace reset CTA", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsTraceResultsSection, {
        runId: "run-1",
        runDetailHref:
          "/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true",
        trace: null,
        traceError: "boom",
        activeTraceQuery: {
          limit: 100,
          order: "desc"
        },
        traceHref:
          "/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true&limit=100&order=desc"
      })
    );

    expect(html).toContain(
      'href="/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;needs_follow_up=true"'
    );
  });
});
