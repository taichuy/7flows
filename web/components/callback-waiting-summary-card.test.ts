import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import type { CallbackWaitingLifecycleSummary } from "@/lib/get-run-views";

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
type SensitiveAccessEntry = NonNullable<
  ComponentProps<typeof CallbackWaitingSummaryCard>["sensitiveAccessEntries"]
>[number];

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

function buildSensitiveAccessEntry(): SensitiveAccessEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-action",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "query remote search",
      decision: "require_approval",
      decision_label: null,
      reason_code: "policy_requires_approval",
      reason_label: null,
      policy_summary: "高敏能力调用需要人工审批。",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Remote search capability",
      description: "External search adapter",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T09:50:00Z",
      updated_at: "2026-03-20T09:50:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-action",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T11:00:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: []
  };
}

function buildLifecycle(
  overrides: Partial<CallbackWaitingLifecycleSummary> = {}
): CallbackWaitingLifecycleSummary {
  return {
    wait_cycle_count: 1,
    issued_ticket_count: 0,
    expired_ticket_count: 0,
    consumed_ticket_count: 0,
    canceled_ticket_count: 0,
    late_callback_count: 0,
    resume_schedule_count: 0,
    max_expired_ticket_count: 0,
    terminated: false,
    last_resume_backoff_attempt: 0,
    ...overrides
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

  it("suppresses callback actions when approval handling should happen first", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        actionNodeRunId: "node-run-action",
        nodeRunId: "node-run-display",
        runId: "run-1",
        sensitiveAccessEntries: [buildSensitiveAccessEntry()],
        showSensitiveAccessInlineActions: false
      })
    );

    expect(html).not.toContain("data-testid=\"callback-waiting-inline-actions\"");
    expect(html).not.toContain("data-testid=\"sensitive-access-inline-actions\"");
  });

  it("keeps callback actions when manual callback intervention is the next step", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        lifecycle: buildLifecycle({
          late_callback_count: 1
        }),
        runId: "run-1"
      })
    );

    expect(html).toContain("data-testid=\"callback-waiting-inline-actions\"");
  });
});
