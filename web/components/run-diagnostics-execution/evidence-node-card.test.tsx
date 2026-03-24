import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceNodeCard } from "@/components/run-diagnostics-execution/evidence-node-card";

describe("EvidenceNodeCard", () => {
  it("adds focused trace, source_ref and artifact drilldowns with shared trace filters", () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceNodeCard, {
        node: {
          node_run_id: "node-run-1",
          node_id: "node-1",
          node_name: "Agent Review",
          node_type: "llm_agent",
          status: "succeeded",
          phase: "emit_output",
          summary: "Assistant extracted the decision basis.",
          key_points: [],
          evidence: [
            {
              title: "Key fact",
              detail: "The callback supplied the missing identifier.",
              source_ref: "artifact://tool-call-raw"
            },
            {
              title: "Evidence pack",
              detail: "Assistant evidence pack saved.",
              source_ref: "artifact://evidence-pack-1"
            }
          ],
          conflicts: [],
          unknowns: [],
          recommended_focus: [],
          confidence: 0.72,
          artifact_refs: ["artifact://tool-call-raw", "artifact://evidence-pack-1"],
          decision_output: { decision: "continue" },
          tool_calls: [
            {
              id: "tool-call-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              tool_id: "native.search",
              tool_name: "Native Search",
              phase: "tool_execute",
              status: "succeeded",
              request_summary: "Search request",
              execution_trace: null,
              requested_execution_class: null,
              requested_execution_source: null,
              requested_execution_profile: null,
              requested_execution_timeout_ms: null,
              requested_execution_network_policy: null,
              requested_execution_filesystem_policy: null,
              requested_execution_dependency_mode: null,
              requested_execution_builtin_package_set: null,
              requested_execution_dependency_ref: null,
              requested_execution_backend_extensions: null,
              effective_execution_class: null,
              execution_executor_ref: null,
              execution_sandbox_backend_id: null,
              execution_sandbox_backend_executor_ref: null,
              execution_sandbox_runner_kind: null,
              adapter_request_trace_id: null,
              adapter_request_execution: null,
              adapter_request_execution_class: null,
              adapter_request_execution_source: null,
              adapter_request_execution_contract: null,
              execution_blocking_reason: null,
              execution_fallback_reason: null,
              response_summary: "Structured callback payload",
              response_content_type: "json",
              response_meta: {},
              raw_ref: "artifact://tool-call-raw",
              latency_ms: 980,
              retry_count: 0,
              error_message: null,
              created_at: "2026-03-11T11:01:00Z",
              finished_at: "2026-03-11T11:01:01Z"
            }
          ],
          assistant_calls: [],
          supporting_artifacts: [
            {
              id: "artifact-tool-result",
              run_id: "run-1",
              node_run_id: "node-run-1",
              artifact_kind: "tool_result",
              content_type: "json",
              summary: "Structured callback payload",
              uri: "artifact://tool-call-raw",
              metadata_payload: {},
              created_at: "2026-03-11T11:01:00Z"
            },
            {
              id: "artifact-evidence-pack",
              run_id: "run-1",
              node_run_id: "node-run-1",
              artifact_kind: "evidence_pack",
              content_type: "json",
              summary: "Assistant evidence pack",
              uri: "artifact://evidence-pack-1",
              metadata_payload: {},
              created_at: "2026-03-11T11:02:00Z"
            }
          ]
        },
        runId: "run-1",
        runDetailHref: "/runs/run-1?needs_follow_up=true"
      })
    );

    expect(html).toContain(
      'href="/runs/run-1?needs_follow_up=true&amp;node_run_id=node-run-1#run-diagnostics-execution-timeline"'
    );
    expect(html).toContain("jump to focused trace slice");
    expect(html).toContain(
      'href="/runs/run-1?needs_follow_up=true&amp;event_type=tool.completed&amp;node_run_id=node-run-1&amp;payload_key=raw_ref#run-diagnostics-execution-timeline"'
    );
    expect(html).toContain(
      'href="/runs/run-1?needs_follow_up=true&amp;event_type=assistant.completed&amp;node_run_id=node-run-1&amp;payload_key=evidence_ref#run-diagnostics-execution-timeline"'
    );
  });
});
