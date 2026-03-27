import { describe, expect, it } from "vitest";

import {
  buildArtifactTraceDrilldownLinkSurface,
  buildEvidenceSourceTraceDrilldownLinkSurface,
  buildToolCallTraceDrilldownLinkSurface,
  parseTraceDrilldownContextFromHref,
  stripTraceQueryFromHref
} from "@/lib/evidence-trace-drilldown";

describe("evidence trace drilldown", () => {
  it("strips trace filters but keeps workspace scope from focused trace href", () => {
    expect(
      stripTraceQueryFromHref(
        "/runs/run-1?track=workspace&needs_follow_up=true&node_run_id=node-run-1&event_type=tool.completed&payload_key=raw_ref#run-diagnostics-execution-timeline"
      )
    ).toBe("/runs/run-1?track=workspace&needs_follow_up=true");
  });

  it("parses run and node context from focused trace href", () => {
    expect(
      parseTraceDrilldownContextFromHref(
        "/runs/run%20alpha%2Fbeta?needs_follow_up=true&node_run_id=node-run-1#run-diagnostics-execution-timeline"
      )
    ).toEqual({
      runId: "run alpha/beta",
      runHref: "/runs/run%20alpha%2Fbeta?needs_follow_up=true",
      nodeRunId: "node-run-1"
    });
  });

  it("builds raw_ref trace slices for completed tool outputs", () => {
    expect(
      buildToolCallTraceDrilldownLinkSurface(
        {
          runId: "run-1",
          runHref: "/runs/run-1?needs_follow_up=true",
          nodeRunId: "node-run-1"
        },
        {
          status: "succeeded",
          rawRef: "artifact://tool-call-raw"
        }
      )
    ).toEqual({
      href: "/runs/run-1?needs_follow_up=true&event_type=tool.completed&node_run_id=node-run-1&payload_key=raw_ref#run-diagnostics-execution-timeline",
      label: "open raw_ref trace"
    });
  });

  it("builds evidence_ref trace slices for evidence pack artifacts", () => {
    expect(
      buildArtifactTraceDrilldownLinkSurface(
        {
          runId: "run-1",
          runHref: "/runs/run-1?needs_follow_up=true",
          nodeRunId: "node-run-1"
        },
        {
          artifactKind: "evidence_pack",
          uri: "artifact://evidence-pack-1"
        }
      )
    ).toEqual({
      href: "/runs/run-1?needs_follow_up=true&event_type=assistant.completed&node_run_id=node-run-1&payload_key=evidence_ref#run-diagnostics-execution-timeline",
      label: "open evidence_ref trace"
    });
  });

  it("reuses raw_ref trace slices when evidence source_ref points at tool output", () => {
    expect(
      buildEvidenceSourceTraceDrilldownLinkSurface(
        {
          runId: "run-1",
          runHref: "/runs/run-1?needs_follow_up=true",
          nodeRunId: "node-run-1"
        },
        "artifact://tool-call-raw",
        [
          {
            artifactKind: "tool_result",
            uri: "artifact://tool-call-raw"
          }
        ],
        [
          {
            status: "succeeded",
            rawRef: "artifact://tool-call-raw"
          }
        ]
      )
    ).toEqual({
      href: "/runs/run-1?needs_follow_up=true&event_type=tool.completed&node_run_id=node-run-1&payload_key=raw_ref#run-diagnostics-execution-timeline",
      label: "open raw_ref trace"
    });
  });
});
