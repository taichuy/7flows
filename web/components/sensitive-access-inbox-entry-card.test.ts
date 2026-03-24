import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessInboxEntryCard } from "@/components/sensitive-access-inbox-entry-card";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { CallbackWaitingLifecycleSummary } from "@/lib/get-run-views";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { buildSensitiveAccessInboxEntryExecutionSurfaceCopy } from "@/lib/workbench-entry-surfaces";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sensitive-access",
  useRouter: () => ({
    refresh: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    prefetch: async () => undefined
  }),
  useSearchParams: () => new URLSearchParams("status=pending")
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason:
          "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
      }
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "open_workflow_library",
      label: "Open workflow library",
      href: "/workflows?execution=sandbox",
      entry_key: "workflowLibrary"
    }
  };
}

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
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  it("surfaces canonical execution runtime facts on the inbox focus card", () => {
    const surfaceCopy = buildSensitiveAccessInboxEntryExecutionSurfaceCopy({
      focusMatchesEntry: true,
      entryNodeRunId: "node-run-1",
      focusNodeName: "Tool Node",
      focusInboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
      runId: "run-1"
    });
    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry: buildEntry() }));

    expect(html).toContain("当前 focus 节点仍需要 operator 审批");
    expect(html).toContain(surfaceCopy.focusDescription);
    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("current approval ticket");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).toContain("/runs/run-1");
  });

  it("routes the inbox next step to the canonical focus node slice when blocker drifted", () => {
    const entry = buildEntry();
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-run-focus",
        node_name: "Focus Node"
      }
    };
    const surfaceCopy = buildSensitiveAccessInboxEntryExecutionSurfaceCopy({
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNodeName: "Focus Node",
      focusInboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-focus",
      runId: "run-1"
    });

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain(surfaceCopy.focusDescription);
    expect(html).toContain(surfaceCopy.recommendedNextStepLabel);
    expect(html).toContain(surfaceCopy.recommendedNextStepHrefLabel!);
    expect(html).toContain("node_run_id=node-run-focus");
  });

  it("renders credential governance summary when the inbox entry is backed by a credential", () => {
    const entry = buildEntry();
    entry.resource = {
      ...entry.resource!,
      label: "Credential · Search Key",
      source: "credential",
      credential_governance: {
        credential_id: "cred-1",
        credential_name: "Search Key",
        credential_type: "api_key",
        credential_status: "active",
        sensitivity_level: "L3",
        sensitive_resource_id: "resource-1",
        sensitive_resource_label: "Credential · Search Key",
        credential_ref: "credential://cred-1",
        summary: "本次命中的凭据是 Search Key（api_key）；当前治理级别 L3，状态 生效中。"
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessInboxEntryCard, { entry })
    );

    expect(html).toContain("Credential governance");
    expect(html).toContain("credential Search Key");
    expect(html).toContain("本次命中的凭据是 Search Key（api_key）；当前治理级别 L3，状态 生效中。");
    expect(html).toContain("credential://cred-1");
  });

  it("prefers sampled approval inbox ids when the canonical focus CTA only has a broad node slice", () => {
    const entry = buildEntry();
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNode: {
        ...entry.executionContext!.focusNode,
        node_run_id: "node-run-focus",
        node_name: "Focus Node"
      }
    };
    entry.runFollowUp = {
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      recommendedAction: null,
      sampledRuns: [
        {
          runId: "run-1",
          snapshot: {
            status: "waiting",
            currentNodeId: "focus-node",
            waitingReason: "approval pending",
            executionFocusNodeId: "focus-node",
            executionFocusNodeRunId: "node-run-focus",
            executionFocusNodeName: "Focus Node"
          },
          callbackTickets: [],
          sensitiveAccessEntries: [
            {
              request: {
                ...entry.request!,
                id: "request-focus-1",
                node_run_id: "node-run-focus"
              },
              resource: entry.resource!,
              approval_ticket: {
                ...entry.ticket,
                id: "ticket-focus-1",
                access_request_id: "request-focus-1",
                node_run_id: "node-run-focus"
              },
              notifications: []
            }
          ]
        }
      ]
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain("open approval inbox slice");
    expect(html.match(/approval_ticket_id=ticket-focus-1/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("falls back to canonical scope when the ticket run_id is missing", () => {
    const entry = buildEntry();
    entry.ticket.run_id = null;
    entry.request!.run_id = null;
    entry.executionContext!.runId = "1234567890-current-run";
    entry.executionContext!.focusNode.tool_calls[0]!.run_id = "1234567890-current-run";

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain("href=\"/runs/1234567890-current-run\"");
    expect(html).toContain("open run 12345678");
  });

  it("adds execution timeline drilldown to compact focus evidence", () => {
    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry: buildEntry() }));

    expect(html).toContain(
      'href="/runs/run-1?node_run_id=node-run-1#run-diagnostics-execution-timeline"'
    );
    expect(html).toContain("jump to focused trace slice");
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

  it("removes a self-referential execution CTA when the current inbox slice already matches the focus node", () => {
    const entry = buildEntry();
    entry.executionContext = {
      ...entry.executionContext!,
      focusMatchesEntry: false
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessInboxEntryCard, {
        entry,
        currentHref: "/sensitive-access?node_run_id=node-run-1&run_id=run-1"
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("focus node");
    expect(html).toContain("优先处理 inbox 当前票据");
    expect(html).not.toContain("slice to focus node");
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

  it("defers execution focus recommendation and evidence into the shared callback summary", () => {
    const entry = buildEntry();
    entry.callbackWaitingContext = {
      runId: "run-1",
      displayNodeRunId: "node-run-1",
      actionNodeRunId: "node-run-1",
      callbackTickets: [],
      sensitiveAccessEntries: [],
      callbackWaitingExplanation: {
        primary_signal: "当前 waiting 节点仍在等待 callback。",
        follow_up: "优先观察定时恢复是否已重新排队。"
      },
      lifecycle: buildCallbackLifecycle({
        resume_schedule_count: 1,
        last_resume_delay_seconds: 45,
        last_resume_source: "callback_ticket_monitor"
      }),
      waitingReason: "callback pending",
      scheduledResumeDelaySeconds: 45,
      scheduledResumeSource: "callback_ticket_monitor",
      scheduledWaitingStatus: "waiting_callback",
      scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
      scheduledResumeDueAt: "2026-03-20T10:00:45Z",
      scheduledResumeRequeuedAt: "2026-03-20T10:01:30Z",
      scheduledResumeRequeueSource: "waiting_resume_monitor"
    };

    const html = renderToStaticMarkup(createElement(SensitiveAccessInboxEntryCard, { entry }));

    expect(html).toContain("当前 waiting 节点仍在等待 callback。");
    expect(html).toContain("优先观察定时恢复是否已重新排队。");
    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).not.toContain("当前 focus 节点仍需要 operator 审批。");
    expect(html).not.toContain("优先处理 inbox 当前票据。");
    expect(html).toContain("Waiting node focus evidence");
    expect(html.indexOf("Callback waiting follow-up")).toBeLessThan(
      html.indexOf("Waiting node focus evidence")
    );
    expect(html.indexOf("Callback waiting follow-up")).toBeLessThan(
      html.indexOf("effective sandbox")
    );
  });

  it("surfaces live sandbox readiness for blocked execution focus entries", () => {
    const entry = buildEntry();
    entry.runSnapshot = {
      status: "failed",
      currentNodeId: "tool-node",
      executionFocusNodeId: "tool-node",
      executionFocusNodeRunId: "node-run-1",
      executionFocusNodeName: "Tool Node",
      executionFocusNodeType: "tool",
      executionFocusToolCalls: [
        {
          id: "tool-call-1",
          tool_id: "native.search",
          tool_name: "Native Search",
          phase: "tool",
          status: "failed",
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
          execution_executor_ref: null,
          execution_sandbox_backend_id: null,
          execution_sandbox_backend_executor_ref: null,
          execution_sandbox_runner_kind: null,
          execution_blocking_reason: "No compatible sandbox backend is available.",
          execution_fallback_reason: null,
          response_summary: null,
          response_content_type: null,
          raw_ref: null
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessInboxEntryCard, {
        entry,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
  });

  it("prefers the live sandbox readiness CTA when the inbox focus is blocked on strong isolation", () => {
    const entry = buildEntry();
    entry.executionContext = {
      ...entry.executionContext!,
      focusExplanation: {
        primary_signal: "当前 focus 节点因强隔离 backend 不可用而阻断。",
        follow_up: "先恢复兼容 backend，再重新调度该节点。"
      },
      focusNode: {
        ...entry.executionContext!.focusNode,
        execution_blocking_reason: "No compatible sandbox backend is available.",
        tool_calls: [
          {
            ...entry.executionContext!.focusNode.tool_calls[0]!,
            status: "failed",
            execution_blocking_reason: "No compatible sandbox backend is available.",
            effective_execution_class: "inline"
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessInboxEntryCard, {
        entry,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).toContain("优先回到 workflow library 处理强隔离 execution class 与隔离需求。");
    expect(html).toContain("Open workflow library");
    expect(html).toContain("先恢复兼容 backend，再重新调度该节点。");
  });
});
