import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ExecutionNodeCallbackTicketList,
  ExecutionNodeToolCallList
} from "@/components/run-diagnostics-execution/execution-node-card-sections";
import type { RunCallbackTicketItem, ToolCallItem } from "@/lib/get-run-views";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("ExecutionNodeCallbackTicketList", () => {
  it("reuses the shared operator inbox CTA surface for callback tickets", () => {
    const callbackTickets: RunCallbackTicketItem[] = [
      {
        ticket: "ticket-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        tool_call_id: "tool-call-1",
        tool_id: "callback.tool",
        tool_call_index: 0,
        waiting_status: "waiting_callback",
        status: "pending",
        reason: "awaiting callback",
        callback_payload: {
          trace_id: "trace-1"
        },
        created_at: "2026-03-22T01:00:00Z",
        expires_at: "2026-03-22T02:00:00Z",
        consumed_at: null,
        canceled_at: null,
        expired_at: null
      }
    ];

    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCallbackTicketList, {
        callbackTickets
      })
    );

    expect(html).toContain("open inbox slice");
    expect(html).toContain("href=\"/sensitive-access?run_id=run-1&amp;node_run_id=node-run-1\"");
  });
});

describe("ExecutionNodeToolCallList", () => {
  it("surfaces compat adapter request summaries before raw JSON", () => {
    const toolCalls: ToolCallItem[] = [
      {
        id: "tool-call-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        tool_id: "compat:dify:plugin/search",
        tool_name: "Compat Search",
        phase: "execute",
        status: "waiting",
        request_summary: "search knowledge base",
        execution_trace: {
          adapter_request_trace_id: "trace-node-compat",
          adapter_request_execution: {
            class: "sandbox",
            source: "runtime_policy",
            timeoutMs: 3000,
          },
          adapter_request_execution_contract: {
            kind: "tool_execution",
            toolId: "compat:dify:plugin/search",
          }
        },
        requested_execution_class: "sandbox",
        requested_execution_source: "runtime_policy",
        requested_execution_profile: null,
        requested_execution_timeout_ms: 3000,
        requested_execution_network_policy: null,
        requested_execution_filesystem_policy: null,
        requested_execution_dependency_mode: null,
        requested_execution_builtin_package_set: null,
        requested_execution_dependency_ref: null,
        requested_execution_backend_extensions: null,
        effective_execution_class: "sandbox",
        execution_executor_ref: "tool:compat-adapter:dify-default",
        execution_sandbox_backend_id: "sandbox-default",
        execution_sandbox_backend_executor_ref: null,
        execution_sandbox_runner_kind: "container",
        adapter_request_trace_id: "trace-node-compat",
        adapter_request_execution: {
          class: "sandbox",
          source: "runtime_policy",
          timeoutMs: 3000,
        },
        adapter_request_execution_class: "sandbox",
        adapter_request_execution_source: "runtime_policy",
        adapter_request_execution_contract: {
          kind: "tool_execution",
          toolId: "compat:dify:plugin/search",
        },
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        response_summary: "waiting for callback payload",
        response_content_type: "json",
        response_meta: {},
        raw_ref: "artifact://tool-call-1/raw",
        latency_ms: 120,
        retry_count: 0,
        error_message: null,
        created_at: "2026-03-22T01:00:00Z",
        finished_at: null
      }
    ];

    const html = renderToStaticMarkup(
      createElement(ExecutionNodeToolCallList, {
        toolCalls
      })
    );

    expect(html).toContain("Compat request traceId：trace-node-compat");
    expect(html).toContain("Compat request execution：class sandbox · source runtime_policy · timeout 3000ms");
    expect(html).toContain("Compat request contract：tool_execution · tool compat:dify:plugin/search");
  });
});
