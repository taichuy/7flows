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
});
