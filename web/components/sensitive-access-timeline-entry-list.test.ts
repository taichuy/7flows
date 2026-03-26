import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

const inlineFeedbackProps: Array<Record<string, unknown>> = [];
const callbackSummaryProps: Array<Record<string, unknown>> = [];
const sensitiveAccessInlineActionProps: Array<Record<string, unknown>> = [];
const workflowGovernanceCardProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/inline-operator-action-feedback", () => ({
  InlineOperatorActionFeedback: (props: Record<string, unknown>) => {
    inlineFeedbackProps.push(props);
    const runSnapshot = (props.runSnapshot ?? null) as { currentNodeId?: string | null } | null;
    return createElement(
      "div",
      {
        "data-testid": "inline-operator-feedback",
        "data-run-id": String(props.runId ?? ""),
        "data-focus-node": String(runSnapshot?.currentNodeId ?? "")
      },
      `${String(props.runId ?? "")}:${String(runSnapshot?.currentNodeId ?? "")}`
    );
  }
}));

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement("div", {
      "data-testid": "callback-waiting-summary",
      "data-run-id": String(props.runId ?? "")
    });
  }
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: (props: Record<string, unknown>) => {
    sensitiveAccessInlineActionProps.push(props);
    return createElement("div", { "data-testid": "sensitive-access-inline-actions" });
  }
}));

vi.mock("@/components/workflow-governance-handoff-cards", () => ({
  WorkflowGovernanceHandoffCards: (props: Record<string, unknown>) => {
    workflowGovernanceCardProps.push(props);
    return createElement("div", {
      "data-testid": "workflow-governance-handoff",
      "data-workflow-href": String(props.workflowGovernanceHref ?? "")
    });
  }
}));

function buildEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-current",
      node_run_id: "node-run-current",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "fetch remote search results",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "High-risk remote search requires operator approval.",
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
      created_at: "2026-03-20T09:00:00Z",
      updated_at: "2026-03-20T09:00:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-current",
      node_run_id: "node-run-current",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前阻断来自敏感访问审批票据。",
      follow_up: "下一步：优先处理当前票据，再观察 waiting 节点是否恢复。"
    },
    run_snapshot: null,
    run_follow_up: {
      affected_run_count: 2,
      sampled_run_count: 2,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 1,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 2 个 run；已回读 2 个样本。",
        follow_up: "run run-current：当前 run 状态：waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-stale",
          snapshot: {
            status: "failed",
            currentNodeId: "stale-node",
            waitingReason: "stale blocker",
            executionFocusNodeId: "stale-node",
            executionFocusNodeRunId: "node-run-stale",
            executionFocusNodeName: "Stale Node",
            executionFocusNodeType: "tool"
          }
        },
        {
          run_id: "run-current",
          snapshot: {
            status: "waiting",
            currentNodeId: "current-node",
            waitingReason: "waiting approval",
            executionFocusNodeId: "current-node",
            executionFocusNodeRunId: "node-run-current",
            executionFocusNodeName: "Current Node",
            executionFocusNodeType: "tool"
          }
        }
      ]
    }
  };
}

describe("SensitiveAccessTimelineEntryList", () => {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  beforeEach(() => {
    inlineFeedbackProps.length = 0;
    callbackSummaryProps.length = 0;
    sensitiveAccessInlineActionProps.length = 0;
    workflowGovernanceCardProps.length = 0;
  });

  it("uses the matching sampled run snapshot instead of the first stale sample", () => {
    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [buildEntry()],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain("run-current:current-node");
    expect(html).not.toContain("run-current:stale-node");
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.runId).toBe("run-current");
    expect(
      (inlineFeedbackProps[0]?.runSnapshot as { currentNodeId?: string | null } | undefined)
        ?.currentNodeId
    ).toBe("current-node");
  });

  it("keeps the shared callback waiting summary when only structured follow-up explanation exists", () => {
    const entry = buildEntry();
    const runFollowUpExplanation = {
      primary_signal: "本次影响 1 个 run；operator follow-up 已刷新。",
      follow_up: "先看共享 callback waiting 建议，再决定是否人工 override。"
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            run_follow_up: {
              ...entry.run_follow_up!,
              explanation: runFollowUpExplanation,
              sampled_runs: []
            }
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain('data-testid="inline-operator-feedback"');
    expect(html).toContain('data-testid="callback-waiting-summary"');
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.title).toBe(operatorSurfaceCopy.operatorFollowUpTitle);
    expect(inlineFeedbackProps[0]?.outcomeExplanation ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.recommendedNextStep ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.runFollowUpExplanation).toEqual(runFollowUpExplanation);
    expect(callbackSummaryProps).toHaveLength(1);
    expect(
      (
        callbackSummaryProps[0]?.callbackWaitingExplanation as
          | { primary_signal?: string | null }
          | undefined
      )?.primary_signal
    ).toBe("当前阻断来自敏感访问审批票据。");
    expect(callbackSummaryProps[0]?.showInlineActions).toBe(false);
  });

  it("carries workflow governance handoff through shared callback summary surfaces", () => {
    const entry = buildEntry();

    renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            run_follow_up: {
              ...entry.run_follow_up!,
              explanation: {
                primary_signal: "本次影响 1 个 run；shared callback summary 还要带回 workflow governance。",
                follow_up: "先看共享 callback summary，再回到 workflow detail 补齐定义问题。"
              },
              sampled_runs: [
                {
                  run_id: "run-current",
                  snapshot: {
                    workflowId: "workflow-timeline",
                    status: "waiting",
                    currentNodeId: "current-node",
                    executionFocusNodeId: "current-node",
                    executionFocusNodeRunId: "node-run-current",
                    executionFocusNodeName: "Current Node"
                  },
                  callback_tickets: [],
                  sensitive_access_entries: [],
                  tool_governance: {
                    referenced_tool_ids: ["native.timeline-gap"],
                    missing_tool_ids: ["native.timeline-gap"],
                    governed_tool_count: 0,
                    strong_isolation_tool_count: 0
                  },
                  legacy_auth_governance:
                    buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                      binding: {
                        workflow_id: "workflow-timeline",
                        workflow_name: "Workflow Timeline"
                      }
                    })
                }
              ]
            }
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(inlineFeedbackProps).toHaveLength(1);
    expect(callbackSummaryProps).toHaveLength(1);
    expect(sensitiveAccessInlineActionProps).toHaveLength(1);
    expect(callbackSummaryProps[0]).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.timeline-gap",
      workflowGovernanceHref: "/workflows/workflow-timeline?definition_issue=missing_tool",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
    expect(String(callbackSummaryProps[0]?.workflowCatalogGapDetail ?? "")).toContain(
      "当前 timeline callback summary 对应的 workflow 版本仍有 catalog gap（native.timeline-gap）"
    );
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.timeline-gap",
      workflowGovernanceHref: "/workflows/workflow-timeline?definition_issue=missing_tool",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
    expect(sensitiveAccessInlineActionProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.timeline-gap",
      workflowGovernanceHref: "/workflows/workflow-timeline?definition_issue=missing_tool",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
  });

  it("renders credential governance summary when the timeline entry is backed by a credential", () => {
    const entry = buildEntry();
    entry.resource = {
      ...entry.resource,
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
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [entry],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain("Credential governance");
    expect(html).toContain("credential Search Key");
    expect(html).toContain("本次命中的凭据是 Search Key（api_key）；当前治理级别 L3，状态 生效中。");
    expect(html).toContain("credential://cred-1");
  });

  it("restores sampled approval inbox CTA for the shared callback summary when direct ticket scope is missing", () => {
    const entry = buildEntry();
    const sampledEntry = buildEntry();
    sampledEntry.request = {
      ...sampledEntry.request,
      id: "request-sampled-approval",
      run_id: "run-sampled-approval",
      node_run_id: "node-run-sampled-approval"
    };
    sampledEntry.approval_ticket = {
      ...sampledEntry.approval_ticket!,
      id: "ticket-sampled-approval",
      access_request_id: "request-sampled-approval",
      run_id: "run-sampled-approval",
      node_run_id: "node-run-sampled-approval"
    };

    renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            request: {
              ...entry.request,
              run_id: null,
              node_run_id: null
            },
            approval_ticket: {
              ...entry.approval_ticket!,
              run_id: null,
              node_run_id: null
            },
            run_follow_up: {
              ...entry.run_follow_up!,
              recommended_action: null,
              sampled_runs: [
                {
                  run_id: "run-sampled-approval",
                  snapshot: null,
                  callback_tickets: [],
                  sensitive_access_entries: [sampledEntry]
                }
              ]
            }
          }
        ],
        emptyCopy: "no entries",
        callbackTickets: []
      })
    );

    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]?.runId).toBe("run-sampled-approval");
    expect(callbackSummaryProps[0]?.nodeRunId).toBe("node-run-sampled-approval");
    expect(callbackSummaryProps[0]?.inboxHref).toBe(
      "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-sampled-approval&node_run_id=node-run-sampled-approval&access_request_id=request-sampled-approval&approval_ticket_id=ticket-sampled-approval"
    );
    expect(callbackSummaryProps[0]?.recommendedAction).toMatchObject({
      kind: "approval blocker",
      entry_key: "operatorInbox",
      href:
        "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-sampled-approval&node_run_id=node-run-sampled-approval&access_request_id=request-sampled-approval&approval_ticket_id=ticket-sampled-approval"
    });
  });

  it("restores sampled callback inbox CTA and tickets for the shared callback summary when local callback facts are missing", () => {
    const entry = buildEntry();

    renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            request: {
              ...entry.request,
              decision: "allow",
              decision_label: "allow",
              reason_code: "sensitive_access_allowed",
              reason_label: "允许",
              run_id: null,
              node_run_id: null
            },
            approval_ticket: {
              ...entry.approval_ticket!,
              status: "expired",
              waiting_status: "waiting",
              run_id: null,
              node_run_id: null
            },
            outcome_explanation: {
              primary_signal: "当前 waiting 链路仍依赖 sampled callback ticket。",
              follow_up: "先看 sampled callback inbox，再判断是否需要人工恢复。"
            },
            run_follow_up: {
              ...entry.run_follow_up!,
              recommended_action: null,
              explanation: {
                primary_signal: "本次影响 1 个 run；sampled callback ticket 仍在等待回调。",
                follow_up: "先看 sampled callback inbox，再判断是否需要人工恢复。"
              },
              sampled_runs: [
                {
                  run_id: "run-sampled-callback",
                  snapshot: null,
                  callback_tickets: [
                    {
                      ticket: "callback-ticket-1",
                      run_id: "run-sampled-callback",
                      node_run_id: "node-run-sampled-callback",
                      status: "pending",
                      waiting_status: "waiting",
                      tool_call_index: 0,
                      created_at: "2026-03-20T10:00:00Z"
                    }
                  ],
                  sensitive_access_entries: []
                }
              ]
            }
          }
        ],
        emptyCopy: "no entries",
        callbackTickets: []
      })
    );

    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]?.runId).toBe("run-sampled-callback");
    expect(callbackSummaryProps[0]?.nodeRunId).toBe("node-run-sampled-callback");
    expect(callbackSummaryProps[0]?.inboxHref).toBe(
      "/sensitive-access?run_id=run-sampled-callback&node_run_id=node-run-sampled-callback"
    );
    expect(callbackSummaryProps[0]?.callbackTickets).toEqual([
      {
        ticket: "callback-ticket-1",
        run_id: "run-sampled-callback",
        node_run_id: "node-run-sampled-callback",
        status: "pending",
        waiting_status: "waiting",
        tool_call_index: 0,
        created_at: "2026-03-20T10:00:00Z"
      }
    ]);
    expect(callbackSummaryProps[0]?.recommendedAction).toMatchObject({
      kind: "callback waiting",
      entry_key: "callbackInbox",
      href: "/sensitive-access?run_id=run-sampled-callback&node_run_id=node-run-sampled-callback"
    });
  });

  it("passes sensitive-access callback context into inline feedback when run snapshot already carries callback waiting facts", () => {
    const entry = buildEntry();
    const callbackTickets = [
      {
        ticket: "callback-ticket-1",
        run_id: "run-current",
        node_run_id: "node-run-current",
        status: "pending",
        waiting_status: "waiting",
        tool_call_index: 0,
        created_at: "2026-03-20T10:00:00Z"
      }
    ];
    const callbackWaitingAutomation = {
      status: "healthy",
      scheduler_required: true,
      detail: "callback waiting automation healthy",
      scheduler_health_status: "healthy",
      scheduler_health_detail: "scheduler ready",
      steps: []
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            run_snapshot: {
              status: "waiting",
              currentNodeId: "approval_gate",
              waitingReason: "approval pending",
              executionFocusNodeId: "approval_gate",
              executionFocusNodeRunId: "node-run-current",
              executionFocusNodeName: "Approval Gate",
              callbackWaitingExplanation: {
                primary_signal: "当前 run snapshot 已回接 callback waiting 审批阻断。",
                follow_up: "优先处理审批票据，再回来看 waiting 是否恢复。"
              }
            }
          }
        ],
        emptyCopy: "no entries",
        callbackTickets,
        callbackWaitingAutomation
      })
    );

    expect(html).toContain('data-testid="inline-operator-feedback"');
    expect(callbackSummaryProps).toHaveLength(0);
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.recommendedNextStep ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      inboxHref: expect.stringContaining("/sensitive-access?"),
      callbackTickets,
      callbackWaitingAutomation,
      recommendedAction: {
        kind: "approval blocker",
        href: expect.stringContaining("/sensitive-access?")
      },
      showSensitiveAccessInlineActions: false
    });
    expect(
      (
        (inlineFeedbackProps[0]?.callbackWaitingSummaryProps as {
          inboxHref?: string;
          sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
        })?.sensitiveAccessEntries ?? []
      )[0]?.request.id
    ).toBe("request-1");
    expect(
      (
        inlineFeedbackProps[0]?.callbackWaitingSummaryProps as {
          inboxHref?: string;
        }
      )?.inboxHref
    ).toContain("run_id=run-current");
    expect(sensitiveAccessInlineActionProps).toHaveLength(1);
    expect(sensitiveAccessInlineActionProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      callbackTickets,
      callbackWaitingAutomation,
      showSensitiveAccessInlineActions: false
    });
  });

  it("renders a standalone shared recommended next step when only operator follow-up remains", () => {
    const entry = buildEntry();
    entry.resource = {
      ...entry.resource,
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
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            request: {
              ...entry.request,
              decision: "allow",
              decision_label: "Allow",
              reason_code: "sensitive_access_allowed",
              reason_label: "Allowed",
              policy_summary: "允许当前读取。",
              decided_at: "2026-03-21T00:05:00Z"
            },
            approval_ticket: {
              ...entry.approval_ticket!,
              status: "approved",
              waiting_status: "resumed",
              approved_by: "operator-1",
              decided_at: "2026-03-21T00:05:00Z"
            },
            notifications: [],
            outcome_explanation: {
              primary_signal: "审批已通过，waiting blocker 已回交 runtime。",
              follow_up: "优先打开 run 查看恢复后的 focus 节点与最新执行证据。"
            },
            run_snapshot: null,
            run_follow_up: null
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("approval blocker");
    expect(html).toContain(operatorSurfaceCopy.openInboxSliceLabel);
    expect(html).toContain("优先打开 run 查看恢复后的 focus 节点与最新执行证据。");
    expect(html).toContain("Primary governed resource: Credential · Search Key · L3 治理 · 生效中.");
  });

  it("keeps workflow governance handoff on non-callback timeline fallback", () => {
    const entry = buildEntry();

    renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            request: {
              ...entry.request,
              decision: "allow",
              decision_label: "Allow",
              reason_code: "sensitive_access_allowed",
              reason_label: "Allowed",
              policy_summary: "允许当前读取。",
              decided_at: "2026-03-21T00:05:00Z"
            },
            approval_ticket: {
              ...entry.approval_ticket!,
              status: "approved",
              waiting_status: "resumed",
              approved_by: "operator-1",
              decided_at: "2026-03-21T00:05:00Z"
            },
            notifications: [],
            outcome_explanation: {
              primary_signal: "审批已通过，但 workflow 仍残留 publish auth backlog。",
              follow_up: "处理完当前票据后，继续回到 workflow detail 收口 legacy binding。"
            },
            run_snapshot: null,
            run_follow_up: null,
            legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
              binding: {
                workflow_id: "workflow-timeline",
                workflow_name: "Workflow Timeline"
              }
            })
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(callbackSummaryProps).toHaveLength(0);
    expect(inlineFeedbackProps).toHaveLength(0);
    expect(workflowGovernanceCardProps).toHaveLength(1);
    expect(workflowGovernanceCardProps[0]).toMatchObject({
      workflowCatalogGapSummary: null,
      workflowGovernanceHref: "/workflows/workflow-timeline",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      },
      cardClassName: "payload-card compact-card"
    });
  });
});
