import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsOverviewSections } from "@/components/run-diagnostics-panel/overview-sections";
import type { RunDetail } from "@/lib/get-run-detail";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

const executionFocusCardProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-detail-execution-focus-card", () => ({
  RunDetailExecutionFocusCard: (props: Record<string, unknown>) => {
    executionFocusCardProps.push(props);
    return createElement("div", { "data-testid": "execution-focus-card" });
  }
}));

function buildRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    status: "failed",
    input_payload: {},
    output_payload: null,
    created_at: "2026-03-21T00:00:00Z",
    started_at: "2026-03-21T00:00:05Z",
    finished_at: "2026-03-21T00:00:10Z",
    event_count: 2,
    event_type_counts: {
      run_started: 1,
      node_failed: 1
    },
    first_event_at: "2026-03-21T00:00:05Z",
    last_event_at: "2026-03-21T00:00:10Z",
    node_runs: [],
    events: [],
    ...overrides
  };
}

describe("RunDiagnosticsOverviewSections", () => {
  it("surfaces workflow catalog-gap handoff alongside run facts", () => {
    executionFocusCardProps.length = 0;

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsOverviewSections, {
        run: buildRunDetail({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }),
        eventTypes: {
          run_started: 1,
          node_failed: 1
        },
        activeFilters: [],
        activeTraceQuery: {
          limit: 200,
          order: "asc"
        },
        workflowDetailHref: "/workflows/workflow-1?definition_issue=missing_tool"
      })
    );

    expect(html).toContain("Workflow governance");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前这条 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 run 的 execution focus、node timeline 与 trace。"
    );
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(executionFocusCardProps[0]?.workflowDetailHref).toBe(
      "/workflows/workflow-1?definition_issue=missing_tool"
    );
  });

  it("surfaces legacy publish auth handoff on the diagnostics overview", () => {
    executionFocusCardProps.length = 0;

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsOverviewSections, {
        run: buildRunDetail({
          legacy_auth_governance:
            buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
              binding: {
                workflow_id: "workflow-1",
                workflow_name: "Workflow 1"
              }
            })
        }),
        eventTypes: {
          run_started: 1,
          node_failed: 1
        },
        activeFilters: [],
        activeTraceQuery: {
          limit: 200,
          order: "asc"
        },
        workflowDetailHref: "/workflows/workflow-1?starter=starter-openclaw"
      })
    );

    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("1 legacy bindings");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      "当前 workflow 仍有 0 条 draft cleanup、1 条 published blocker、0 条 offline inventory。"
    );
    expect(html).toContain('/workflows/workflow-1?starter=starter-openclaw');
    expect(executionFocusCardProps[0]?.workflowDetailHref).toBe(
      "/workflows/workflow-1?starter=starter-openclaw"
    );
  });
});
