import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-inline-actions", () => ({
  CallbackWaitingInlineActions: () => createElement("div", { "data-testid": "callback-waiting-inline-actions" })
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: () => createElement("div", { "data-testid": "sensitive-access-inline-actions" })
}));

type FocusNodeEvidence = NonNullable<ComponentProps<typeof CallbackWaitingSummaryCard>["focusNodeEvidence"]>;

function buildFocusNodeEvidence(): FocusNodeEvidence {
  return {
    artifact_refs: [],
    artifacts: [],
    tool_calls: [
      {
        id: "tool-call-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        tool_id: "callback.wait",
        tool_name: "Callback Wait",
        phase: "execute",
        status: "waiting",
        request_summary: "wait for callback",
        execution_trace: null,
        requested_execution_class: "sandbox",
        requested_execution_source: "runtime_policy",
        requested_execution_profile: null,
        requested_execution_timeout_ms: null,
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
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        response_summary: "callback payload persisted",
        response_content_type: "application/json",
        response_meta: {},
        raw_ref: null,
        latency_ms: 120,
        retry_count: 0,
        error_message: null,
        created_at: "2026-03-20T10:00:01Z",
        finished_at: null
      }
    ]
  };
}

describe("CallbackWaitingSummaryCard", () => {
  it("puts compact execution fact badges before the evidence card when enabled", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        callbackWaitingExplanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。",
          follow_up: "先看当前 tool 实际落在哪个 runner。"
        },
        focusNodeEvidence: buildFocusNodeEvidence(),
        showFocusExecutionFacts: true,
        showInlineActions: false
      })
    );

    expect(html).toContain("Waiting node focus evidence");
    expect(html).toContain("effective sandbox");
    expect(html.indexOf("effective sandbox")).toBeLessThan(html.indexOf("Waiting node focus evidence"));
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
  });

  it("keeps execution fact badges inside the evidence card when the switch is off", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        callbackWaitingExplanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。"
        },
        focusNodeEvidence: buildFocusNodeEvidence(),
        showInlineActions: false
      })
    );

    expect(html).toContain("Waiting node focus evidence");
    expect(html).toContain("effective sandbox");
    expect(html.indexOf("effective sandbox")).toBeGreaterThan(html.indexOf("Waiting node focus evidence"));
  });
});
