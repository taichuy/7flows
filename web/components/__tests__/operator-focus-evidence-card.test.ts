import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";

describe("OperatorFocusEvidenceCard", () => {
  it("separates execution trace from the primary tool summary", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorFocusEvidenceCard, {
        artifacts: [],
        toolCallSummaries: [
          {
            id: "tool-call-1",
            title: "Sandbox Search · blocked",
            detail: "执行阻断：sandbox backend unavailable",
            badges: ["phase execute", "requested sandbox", "blocked"],
            rawRef: "artifact://tool-call-raw",
            traceSummary:
              "执行链：source runtime_policy · timeout 3000ms · network isolated · filesystem ephemeral。"
          }
        ]
      })
    );

    expect(html).toContain("执行阻断：sandbox backend unavailable");
    expect(html).toContain(
      "执行链：source runtime_policy · timeout 3000ms · network isolated · filesystem ephemeral。"
    );
    expect(html.match(/执行链：/g)).toHaveLength(1);
    expect(html).toContain("raw_ref artifact://tool-call-raw");
  });

  it("renders a shared execution timeline drilldown when provided", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorFocusEvidenceCard, {
        artifactSummary: "callback payload 已落到 artifact。",
        artifacts: [],
        drilldownLink: {
          href: "/runs/run-1#run-diagnostics-execution-timeline",
          label: "jump to execution timeline"
        },
        toolCallSummaries: []
      })
    );

    expect(html).toContain('href="/runs/run-1#run-diagnostics-execution-timeline"');
    expect(html).toContain("jump to execution timeline");
  });

  it("adds raw_ref and evidence_ref trace drilldowns when focused trace context is available", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorFocusEvidenceCard, {
        artifacts: [
          {
            key: "artifact://evidence-pack-1",
            artifactKind: "evidence_pack",
            contentType: "application/json",
            summary: "Assistant evidence pack",
            uri: "artifact://evidence-pack-1"
          }
        ],
        drilldownLink: {
          href: "/runs/run-1?needs_follow_up=true&node_run_id=node-run-1#run-diagnostics-execution-timeline",
          label: "jump to focused trace slice"
        },
        toolCallSummaries: [
          {
            id: "tool-call-1",
            title: "Sandbox Search · succeeded",
            detail: "搜索结果已写入 artifact。",
            badges: ["phase execute"],
            rawRef: "artifact://tool-call-raw"
          }
        ]
      })
    );

    expect(html).toContain(
      'href="/runs/run-1?needs_follow_up=true&amp;event_type=tool.completed&amp;node_run_id=node-run-1&amp;payload_key=raw_ref#run-diagnostics-execution-timeline"'
    );
    expect(html).toContain("open raw_ref trace");
    expect(html).toContain(
      'href="/runs/run-1?needs_follow_up=true&amp;event_type=assistant.completed&amp;node_run_id=node-run-1&amp;payload_key=evidence_ref#run-diagnostics-execution-timeline"'
    );
    expect(html).toContain("open evidence_ref trace");
  });
});
