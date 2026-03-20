import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessInboxEntryCard } from "@/components/sensitive-access-inbox-entry-card";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import type { CallbackWaitingLifecycleSummary } from "@/lib/get-run-views";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    prefetch: async () => undefined
  })
}));

function buildEntry(): SensitiveAccessInboxEntry {
  return {
    ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T11:00:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
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
    notifications: [],
    runSnapshot: null,
    runFollowUp: null,
    callbackWaitingContext: null,
    executionContext: {
      runId: "run-1",
      focusReason: "blocked_execution",
      focusExplanation: {
        primary_signal: "当前 focus 节点仍需要 operator 审批。",
        follow_up: "优先处理 inbox 当前票据。"
      },
      focusMatchesEntry: true,
      entryNodeRunId: "node-run-1",
      skillTrace: null,
      focusNode: {
        node_run_id: "node-run-1",
        node_id: "tool-node",
        node_name: "Tool Node",
        node_type: "tool",
        waiting_reason: "waiting approval",
        scheduled_resume_delay_seconds: null,
        scheduled_resume_due_at: null,
        callback_tickets: [],
        sensitive_access_entries: [],
        execution_fallback_count: 0,
        execution_blocked_count: 0,
        execution_unavailable_count: 0,
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        artifact_refs: [],
        artifacts: [],
        tool_calls: [
          {
            id: "tool-call-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_id: "native.search",
            tool_name: "Native Search",
            phase: "execute",
            status: "waiting",
            request_summary: "query remote knowledge base",
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
            effective_execution_class: "sandbox",
            execution_executor_ref: "tool:compat-adapter:dify-default",
            execution_sandbox_backend_id: "sandbox-default",
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: "container",
            execution_blocking_reason: null,
            execution_fallback_reason: null,
            response_summary: "waiting for operator approval",
            response_content_type: "application/json",
            response_meta: {},
            raw_ref: null,
            latency_ms: 0,
            retry_count: 0,
            error_message: null,
            created_at: "2026-03-20T10:00:00Z",
            finished_at: null
          }
        ]
      }
    }
  };
}

function buildCallbackLifecycle(
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

describe("SensitiveAccessInboxEntryCard", () => {
  it("surfaces canonical execution runtime facts on the inbox focus card", () => {
    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry: buildEntry() }));

    expect(html).toContain("当前 focus 节点仍需要 operator 审批");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).toContain("/runs/run-1");
  });

  it("falls back to canonical scope when the ticket run_id is missing", () => {
    const entry = buildEntry();
    entry.ticket.run_id = null;
    entry.request!.run_id = null;
    entry.executionContext!.runId = "1234567890-current-run";
    entry.executionContext!.focusNode.tool_calls[0]!.run_id = "1234567890-current-run";

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain("href=\"/runs/1234567890-current-run\"");
    expect(html).toContain("run 12345678");
  });

  it("keeps inline approval actions at run-level when only callback waiting exposes a display node scope", () => {
    const entry = buildEntry();
    entry.ticket.run_id = null;
    entry.request!.run_id = null;
    entry.ticket.node_run_id = null;
    entry.request!.node_run_id = null;
    entry.executionContext = {
      ...entry.executionContext!,
      runId: "run-current-scope",
      focusMatchesEntry: false,
      entryNodeRunId: null,
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-focus-display"
      }
    };
    entry.callbackWaitingContext = {
      runId: "run-current-scope",
      displayNodeRunId: "node-focus-display",
      actionNodeRunId: null,
      callbackTickets: [],
      sensitiveAccessEntries: []
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain('href="/runs/run-current-scope"');
    expect(html).toContain('name="nodeRunId" value=""');
    expect(html).not.toContain('name="nodeRunId" value="node-focus-display"');
  });

  it("routes callback summary inline actions through the entry action node instead of the display focus node", () => {
    const entry = buildEntry();
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-run-display",
        node_id: "display-node",
        node_name: "Display Node"
      }
    };
    entry.ticket.node_run_id = "node-run-entry";
    entry.request!.node_run_id = "node-run-entry";
    entry.callbackWaitingContext = {
      runId: "run-1",
      displayNodeRunId: "node-run-display",
      actionNodeRunId: "node-run-entry",
      callbackTickets: [],
      sensitiveAccessEntries: [
        {
          request: entry.request!,
          resource: entry.resource!,
          approval_ticket: {
            ...entry.ticket,
            node_run_id: null
          },
          notifications: []
        }
      ]
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain('name="nodeRunId" value="node-run-entry"');
    expect(html).not.toContain('name="nodeRunId" value="node-run-display"');
  });

  it("keeps only the bottom approval block when callback waiting still waits on approval", () => {
    const entry = buildEntry();
    entry.callbackWaitingContext = {
      runId: "run-1",
      displayNodeRunId: "node-run-display",
      actionNodeRunId: "node-run-entry",
      callbackTickets: [],
      sensitiveAccessEntries: [
        {
          request: entry.request!,
          resource: entry.resource!,
          approval_ticket: entry.ticket,
          notifications: []
        }
      ]
    };
    entry.ticket.node_run_id = "node-run-entry";
    entry.request!.node_run_id = "node-run-entry";
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-run-display"
      }
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));
    const operatorActionBlockCount = (html.match(/Operator actions/g) ?? []).length;

    expect(operatorActionBlockCount).toBe(1);
    expect(html).not.toContain("Callback actions");
  });

  it("keeps callback actions when callback resume is the real next operator step", () => {
    const entry = buildEntry();
    entry.callbackWaitingContext = {
      runId: "run-1",
      displayNodeRunId: "node-run-display",
      actionNodeRunId: "node-run-entry",
      lifecycle: buildCallbackLifecycle({
        late_callback_count: 1
      }),
      callbackTickets: [],
      sensitiveAccessEntries: []
    };
    entry.ticket.node_run_id = "node-run-entry";
    entry.request!.node_run_id = "node-run-entry";
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-run-display"
      }
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain("Callback actions");
  });
});
