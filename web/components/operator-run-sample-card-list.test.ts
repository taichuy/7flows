import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OperatorRunSampleCardList } from "@/components/operator-run-sample-card-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { OperatorRunSampleCard } from "@/lib/operator-run-sample-cards";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
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
    supports_filesystem_policy: false
  };
}

function buildSampleApprovalEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool",
      requester_id: "callback.wait",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "Inspect callback blocker",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "Approval is required.",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Callback gate",
      description: "Protected callback endpoint",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T10:00:00Z",
      updated_at: "2026-03-20T10:00:00Z"
    },
    approval_ticket: {
      id: "approval-ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
      follow_up: "优先处理审批票据，再观察 callback waiting 是否恢复。"
    }
  };
}

function buildSampleCard(
  overrides: Partial<OperatorRunSampleCard> = {}
): OperatorRunSampleCard {
  return {
    runId: "run-1",
    shortRunId: "run-1",
    hasCallbackWaitingSummary: true,
    summary: "当前 sampled run 仍在等待 callback。",
    runStatus: "waiting",
    currentNodeId: "callback_node",
    focusNodeId: "callback_node",
    focusNodeLabel: "Callback node",
    focusNodeRunId: "node-run-1",
    waitingReason: "callback pending",
    executionFactBadges: [
      "effective sandbox",
      "executor tool:compat-adapter:dify-default",
      "backend sandbox-default",
      "runner tool"
    ],
    callbackWaitingExplanation: {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "先看当前 tool 实际落在哪个 runner。"
    },
    callbackWaitingLifecycle: null,
    callbackTickets: [],
    callbackWaitingFocusNodeEvidence: {
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
          execution_sandbox_runner_kind: "tool",
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
    },
    scheduledResumeDelaySeconds: null,
    scheduledResumeSource: null,
    scheduledWaitingStatus: null,
    scheduledResumeScheduledAt: null,
    scheduledResumeDueAt: null,
    scheduledResumeRequeuedAt: null,
    scheduledResumeRequeueSource: null,
    sensitiveAccessEntries: [],
    inboxHref: null,
    artifactCount: 0,
    artifactRefCount: 0,
    toolCallCount: 1,
    rawRefCount: 0,
    skillReferenceCount: 0,
    skillReferencePhaseSummary: null,
    skillReferenceSourceSummary: null,
    focusArtifactSummary: null,
    focusToolCallSummaries: [],
    focusArtifacts: [],
    focusSkillReferenceLoads: [],
    sandboxReadinessNode: null,
    ...overrides
  };
}

describe("OperatorRunSampleCardList", () => {
  it("moves callback waiting execution fact badges into the shared summary card", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorRunSampleCardList, {
        cards: [buildSampleCard()],
        skillTraceDescription: "skill trace"
      })
    );

    expect(html).toContain("Waiting node focus evidence");
    expect(html).not.toContain("当前 sampled run 仍在等待 callback。");
    expect(html).toContain("effective sandbox");
    expect(html.indexOf("effective sandbox")).toBeLessThan(html.indexOf("Waiting node focus evidence"));
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner tool");
  });

  it("keeps non-callback execution fact badges in the card header", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorRunSampleCardList, {
        cards: [
          buildSampleCard({
            hasCallbackWaitingSummary: false,
            callbackWaitingExplanation: null,
            callbackWaitingFocusNodeEvidence: null
          })
        ],
        skillTraceDescription: "skill trace"
      })
    );

    expect(html).not.toContain("Waiting node focus evidence");
    expect(html).toContain("effective sandbox");
    expect(html.indexOf("effective sandbox")).toBeGreaterThan(html.indexOf("Run run-1"));
  });

  it("reuses sample callback context to build waiting inbox deep links", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorRunSampleCardList, {
        cards: [
          buildSampleCard({
            callbackTickets: [
              {
                ticket: "callback-ticket-1",
                run_id: "run-1",
                node_run_id: "node-run-1",
                tool_call_id: "tool-call-1",
                tool_id: "callback.wait",
                tool_call_index: 0,
                waiting_status: "waiting",
                status: "pending",
                reason: "callback pending",
                callback_payload: null,
                created_at: "2026-03-20T10:00:00Z",
                expires_at: null,
                consumed_at: null,
                canceled_at: null,
                expired_at: null
              }
            ],
            sensitiveAccessEntries: [buildSampleApprovalEntry()],
            inboxHref:
              "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-1&node_run_id=node-run-1&access_request_id=request-1&approval_ticket_id=approval-ticket-1"
          })
        ],
        skillTraceDescription: "skill trace"
      })
    );

    expect(html).toContain("Open approval inbox");
    expect(html).toContain("approval_ticket_id=approval-ticket-1");
    expect(html).toContain("Approvals: 1 approval still pending");
  });

  it("surfaces live sandbox readiness for blocked sampled runs", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorRunSampleCardList, {
        cards: [
          buildSampleCard({
            hasCallbackWaitingSummary: false,
            callbackWaitingExplanation: null,
            callbackWaitingFocusNodeEvidence: null,
            sandboxReadinessNode: {
              node_type: "tool",
              execution_class: "sandbox",
              requested_execution_class: "sandbox",
              effective_execution_class: "sandbox",
              execution_blocking_reason: "No compatible sandbox backend is available.",
              execution_sandbox_backend_id: null,
              execution_blocked_count: 1,
              execution_unavailable_count: 0
            }
          })
        ],
        sandboxReadiness: buildSandboxReadiness(),
        skillTraceDescription: "skill trace"
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
  });
});
