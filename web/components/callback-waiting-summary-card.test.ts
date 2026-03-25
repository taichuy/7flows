import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { buildCallbackWaitingSummarySurfaceCopy } from "@/lib/callback-waiting-presenters";
import type { CallbackWaitingLifecycleSummary } from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";

const callbackInlineActionProps: Array<Record<string, unknown>> = [];
const sensitiveAccessInlineActionProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-inline-actions", () => ({
  CallbackWaitingInlineActions: (props: Record<string, unknown>) => {
    callbackInlineActionProps.push(props);
    return createElement(
      "div",
      {
        "data-testid": "callback-waiting-inline-actions",
        "data-title": String(props.title ?? "")
      },
      props.title ? String(props.title) : null
    );
  }
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: (props: Record<string, unknown>) => {
    sensitiveAccessInlineActionProps.push(props);
    return createElement("div", { "data-testid": "sensitive-access-inline-actions" });
  }
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

function buildPrimaryGovernedResource(): NonNullable<SensitiveAccessEntry["resource"]> {
  return {
    id: "resource-openai-prod",
    label: "OpenAI Production Key",
    description: "Production credential",
    sensitivity_level: "L3",
    source: "credential",
    metadata: {},
    credential_governance: {
      credential_id: "cred-openai-prod",
      credential_name: "OpenAI Production Key",
      credential_type: "api_key",
      credential_status: "active",
      sensitivity_level: "L3",
      sensitive_resource_id: "resource-openai-prod",
      sensitive_resource_label: "OpenAI Production Key",
      credential_ref: "credential://cred-openai-prod",
      summary: "本次命中的凭据是 OpenAI Production Key（api_key）；当前治理级别 L3，状态 生效中。"
    },
    created_at: "2026-03-20T09:50:00Z",
    updated_at: "2026-03-20T09:50:00Z"
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

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "configured",
    scheduler_required: true,
    detail: "callback automation degraded",
    scheduler_health_status: "unhealthy",
    scheduler_health_detail: "scheduler is currently backlogged.",
    affected_run_count: 2,
    affected_workflow_count: 1,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "callback_waiting",
      entry_key: "runLibrary",
      href: "/runs?status=waiting",
      label: "Open run library"
    },
    steps: []
  };
}

describe("CallbackWaitingSummaryCard", () => {
  beforeEach(() => {
    callbackInlineActionProps.length = 0;
    sensitiveAccessInlineActionProps.length = 0;
  });

  const canonicalRecommendedAction = {
    kind: "approval blocker",
    entry_key: "operatorInbox",
    href: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
    label: "Open approval inbox"
  };

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

  it("surfaces observe-first guidance while keeping optional overrides for requeued resumes", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        runId: "run-1",
        inboxHref: "/sensitive-access?run_id=run-1&waiting_status=waiting_callback",
        scheduledResumeDelaySeconds: 45,
        scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
        scheduledResumeDueAt: "2026-03-20T10:00:45Z",
        scheduledResumeRequeuedAt: "2026-03-20T10:01:30Z",
        scheduledResumeRequeueSource: "waiting_resume_monitor"
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("Watch the requeued resume");
    expect(html).toContain("manual override optional");
    expect(html).toContain("watch the worker consume that attempt before forcing another resume");
    expect(html).toContain("Optional callback override");
    expect(html).toContain("Open waiting inbox");
    expect(html).toContain("data-title=\"Optional callback override\"");
    expect(html).toContain("data-testid=\"callback-waiting-inline-actions\"");
  });

  it("keeps callback follow-up as explanation when no stable next-step target exists", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        callbackWaitingExplanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。",
          follow_up: "先继续观察 callback ticket 是否真正被消费。"
        },
        showInlineActions: false
      })
    );

    expect(html).toContain("先继续观察 callback ticket 是否真正被消费。");
    expect(html).not.toContain("Recommended next step");
  });

  it("prefers the canonical operator recommended next step when requested", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        lifecycle: buildLifecycle({ late_callback_count: 1 }),
        inboxHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        sensitiveAccessSummary: {
          request_count: 1,
          approval_ticket_count: 1,
          pending_approval_count: 1,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0,
          primary_resource: buildPrimaryGovernedResource()
        },
        recommendedAction: canonicalRecommendedAction,
        operatorFollowUp: "Open the approval inbox first, then retry the callback path.",
        preferCanonicalRecommendedNextStep: true,
        runId: "run-1"
      })
    );

    expect(html).toContain("approval blocker");
    expect(html).toContain("Open the approval inbox first, then retry the callback path.");
    expect(html).toContain("Open approval inbox");
    expect(html).toContain(
      'href="/sensitive-access?run_id=run-1&amp;approval_ticket_id=ticket-1"'
    );
    expect(html).toContain(
      "Primary governed resource: OpenAI Production Key · L3 治理 · 生效中."
    );
  });

  it("surfaces the primary governed resource on the local callback inbox CTA", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        lifecycle: buildLifecycle(),
        inboxHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        sensitiveAccessSummary: {
          request_count: 1,
          approval_ticket_count: 1,
          pending_approval_count: 1,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0,
          primary_resource: buildPrimaryGovernedResource()
        },
        runId: "run-1"
      })
    );

    expect(html).toContain("Open inbox slice first");
    expect(html).toContain("Open approval inbox");
    expect(html).toContain(
      "Primary governed resource: OpenAI Production Key · L3 治理 · 生效中."
    );
  });

  it("strips canonical callback self-links when the summary already sits on the exact inbox slice", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        currentHref: "/sensitive-access?approval_ticket_id=ticket-1&run_id=run-1",
        lifecycle: buildLifecycle({ late_callback_count: 1 }),
        inboxHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        recommendedAction: canonicalRecommendedAction,
        operatorFollowUp: "Open the approval inbox first, then retry the callback path.",
        preferCanonicalRecommendedNextStep: true,
        runId: "run-1"
      })
    );

    expect(html).toContain("approval blocker");
    expect(html).toContain("Open the approval inbox first, then retry the callback path.");
    expect(html).not.toContain("Open approval inbox</a>");
  });

  it("falls back to the shared callback timeline review copy for canonical follow-up", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        callbackWaitingExplanation: {
          primary_signal: "当前 callback waiting 仍需继续观察。"
        },
        preferCanonicalRecommendedNextStep: true,
        recommendedAction: {
          kind: "callback waiting"
        },
        showInlineActions: false
      })
    );

    expect(html).toContain(
      buildCallbackWaitingSummarySurfaceCopy().reviewTimelineFallbackDetail
    );
  });

  it("passes shared callback waiting context into inline actions feedback", () => {
    const callbackTickets = [
      {
        ticket: "callback-ticket-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        status: "pending",
        waiting_status: "waiting",
        tool_call_index: 0,
        created_at: "2026-03-20T10:00:00Z"
      }
    ];
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const workflowSummaryProps = {
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail:
        "当前 callback summary 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy。",
      workflowGovernanceHref: "/workflows/workflow-1?definition_issue=missing_tool",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker",
        detail: "先替换 live published blockers。",
        workflowSummary: {
          workflow_id: "workflow-1",
          workflow_name: "Workflow 1",
          binding_count: 1,
          draft_candidate_count: 0,
          published_blocker_count: 1,
          offline_inventory_count: 0,
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }
      }
    };

    const html = renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        runId: "run-1",
        nodeRunId: "node-run-1",
        callbackTickets,
        callbackWaitingAutomation,
        inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
        recommendedAction: canonicalRecommendedAction,
        operatorFollowUp: "Open approval inbox first.",
        preferCanonicalRecommendedNextStep: true,
        showSensitiveAccessInlineActions: false,
        ...workflowSummaryProps
      })
    );

    expect(html).toContain("Workflow governance");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain("Legacy publish auth handoff");
    expect(callbackInlineActionProps).toHaveLength(1);
    expect(callbackInlineActionProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
      callbackTickets,
      callbackWaitingAutomation,
      showSensitiveAccessInlineActions: false,
      recommendedAction: canonicalRecommendedAction,
      operatorFollowUp: "Open approval inbox first.",
      preferCanonicalRecommendedNextStep: true,
      ...workflowSummaryProps
    });
  });

  it("passes shared callback waiting context into nested sensitive-access actions", () => {
    const callbackTickets = [
      {
        ticket: "callback-ticket-1",
        run_id: "run-1",
        node_run_id: "node-run-action",
        status: "pending",
        waiting_status: "waiting",
        tool_call_index: 0,
        created_at: "2026-03-20T10:00:00Z"
      }
    ];
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const workflowSummaryProps = {
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail:
        "当前 callback summary 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy。",
      workflowGovernanceHref: "/workflows/workflow-1?definition_issue=missing_tool",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker",
        detail: "先替换 live published blockers。",
        workflowSummary: {
          workflow_id: "workflow-1",
          workflow_name: "Workflow 1",
          binding_count: 1,
          draft_candidate_count: 0,
          published_blocker_count: 1,
          offline_inventory_count: 0,
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }
      }
    };

    renderToStaticMarkup(
      createElement(CallbackWaitingSummaryCard, {
        runId: "run-1",
        nodeRunId: "node-run-action",
        callbackTickets,
        callbackWaitingAutomation,
        inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-action",
        recommendedAction: canonicalRecommendedAction,
        operatorFollowUp: "Open approval inbox first.",
        preferCanonicalRecommendedNextStep: true,
        sensitiveAccessEntries: [buildSensitiveAccessEntry()],
        ...workflowSummaryProps
      })
    );

    expect(sensitiveAccessInlineActionProps).toHaveLength(1);
    expect(sensitiveAccessInlineActionProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-action",
      callbackTickets,
      callbackWaitingAutomation,
      showSensitiveAccessInlineActions: false,
      recommendedAction: canonicalRecommendedAction,
      operatorFollowUp: "Open approval inbox first.",
      preferCanonicalRecommendedNextStep: true,
      ...workflowSummaryProps
    });
  });
});
