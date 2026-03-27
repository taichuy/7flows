import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";

const callbackSummaryProps: Array<Record<string, unknown>> = [];

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement(
      "div",
      { "data-testid": "callback-waiting-summary-card" },
      String(props.inboxHref ?? "no-inbox")
    );
  }
}));

beforeEach(() => {
  callbackSummaryProps.length = 0;
});

describe("WorkflowPublishInvocationCallbackSection", () => {
  it("forwards current publish detail href into the shared callback summary", () => {
    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
        invocation: {
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: {
          node_id: "callback_node",
          node_name: "Callback node",
          node_run_id: "node-run-callback-1",
          node_type: "tool",
          skill_reference_load_count: 0,
          skill_reference_loads: [],
          artifacts: [],
          artifact_refs: [],
          tool_calls: []
        } as never
      })
    );

    expect(
      callbackSummaryProps.some(
        (props) => props.currentHref === "/workflows/workflow-1?publish_invocation=invocation-1"
      )
    ).toBe(true);
    expect(callbackSummaryProps[0]?.focusEvidenceDrilldownLink).toMatchObject({
      label: "jump to focused trace slice",
      href: "/runs/run-callback-1?node_run_id=node-run-callback-1#run-diagnostics-execution-timeline"
    });
  });

  it("uses shared drilldown surface copy", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        invocation: {
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: {
          primary_signal: "当前 callback waiting 仍卡在回调阶段。",
          follow_up: "优先观察 callback ticket 是否恢复。"
        },
        executionFocusNode: null
      })
    );

    expect(html).toContain("Callback waiting drilldown");
    expect(html).toContain("approval blockers and resume scheduling stay together here");
    expect(html).toContain("open inbox slice");
    expect(html).toContain("Resume blockers");
    expect(html).toContain("Latest callback events");
    expect(html).toContain("当前 callback waiting 仍卡在回调阶段。");
  });

  it("uses shared callback ticket copy", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        invocation: {
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [
          {
            ticket: "ticket-1",
            status: "pending",
            callback_payload: {
              ok: true
            }
          }
        ] as never,
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: null
      })
    );

    expect(html).toContain("Callback ticket");
    expect(html).toContain("open ticket inbox slice");
    expect(html).toContain("callback payload preview");
  });

  it("forwards sampled workflow governance handoff into the shared callback summary", () => {
    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
        invocation: {
          workflow_id: "workflow-1",
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_follow_up: {
            explanation: {
              primary_signal: "已命中 sampled run。",
              follow_up: "继续观察 callback waiting。"
            },
            recommended_action: null,
            sampled_runs: [
              {
                run_id: "run-callback-1",
                snapshot: {
                  workflow_id: "workflow-1",
                  callback_waiting_explanation: {
                    primary_signal: "当前 waiting 节点仍在等待 callback。",
                    follow_up: "优先回到 workflow 编辑器处理缺口。"
                  }
                },
                tool_governance: {
                  referenced_tool_ids: ["native.catalog-gap"],
                  missing_tool_ids: ["native.catalog-gap"],
                  governed_tool_count: 0,
                  strong_isolation_tool_count: 0
                },
                legacy_auth_governance: {
                  generated_at: "2026-03-20T12:00:00Z",
                  auth_mode_contract: {
                    supported_auth_modes: ["api_key", "internal"],
                    retired_legacy_auth_modes: ["token"],
                    summary: "supported api_key / internal, legacy token",
                    follow_up: "replace token bindings"
                  },
                  workflow_count: 1,
                  binding_count: 2,
                  summary: {
                    draft_candidate_count: 1,
                    published_blocker_count: 1,
                    offline_inventory_count: 0
                  },
                  checklist: [],
                  workflows: [
                    {
                      workflow_id: "workflow-1",
                      workflow_name: "Workflow 1",
                      binding_count: 2,
                      draft_candidate_count: 1,
                      published_blocker_count: 1,
                      offline_inventory_count: 0,
                      tool_governance: {
                        referenced_tool_ids: ["native.catalog-gap"],
                        missing_tool_ids: ["native.catalog-gap"],
                        governed_tool_count: 0,
                        strong_isolation_tool_count: 0
                      }
                    }
                  ],
                  buckets: {
                    draft_candidates: [],
                    published_blockers: [],
                    offline_inventory: []
                  }
                }
              }
            ]
          },
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: null
      })
    );

    expect(callbackSummaryProps[0]).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapHref: "/workflows/workflow-1?definition_issue=missing_tool",
      workflowGovernanceHref: "/workflows/workflow-1?definition_issue=legacy_publish_auth"
    });
    expect(String(callbackSummaryProps[0]?.workflowCatalogGapDetail ?? "")).toContain(
      "当前 sampled run 对应的 workflow 版本仍有 catalog gap"
    );
    expect(
      (callbackSummaryProps[0]?.legacyAuthHandoff as { bindingChipLabel?: string } | undefined)
        ?.bindingChipLabel
    ).toBe("2 legacy bindings");
  });

  it("falls back to invocation workflow and shared legacy auth when sampled run metadata is partial", () => {
    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        currentHref: "/workflows/workflow-fallback?publish_invocation=invocation-1",
        invocation: {
          workflow_id: "workflow-fallback",
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_follow_up: {
            explanation: {
              primary_signal: "sampled run 缺少 workflow 元信息。",
              follow_up: "仍要把作者带回同一个 workflow detail。"
            },
            recommended_action: null,
            sampled_runs: [
              {
                run_id: "run-callback-1",
                snapshot: {
                  callback_waiting_explanation: {
                    primary_signal: "当前 waiting 节点仍在等待 callback。",
                    follow_up: "先处理 workflow governance 再回来。"
                  }
                },
                tool_governance: {
                  referenced_tool_ids: ["native.catalog-gap"],
                  missing_tool_ids: ["native.catalog-gap"],
                  governed_tool_count: 0,
                  strong_isolation_tool_count: 0
                },
                legacy_auth_governance: null
              }
            ]
          },
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: null,
        legacyAuthGovernance: {
          generated_at: "2026-03-20T12:00:00Z",
          auth_mode_contract: {
            supported_auth_modes: ["api_key", "internal"],
            retired_legacy_auth_modes: ["token"],
            summary: "supported api_key / internal, legacy token",
            follow_up: "replace token bindings"
          },
          workflow_count: 1,
          binding_count: 1,
          summary: {
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 0
          },
          checklist: [],
          workflows: [
            {
              workflow_id: "workflow-fallback",
              workflow_name: "Workflow Fallback",
              binding_count: 1,
              draft_candidate_count: 0,
              published_blocker_count: 1,
              offline_inventory_count: 0,
              tool_governance: {
                referenced_tool_ids: [],
                missing_tool_ids: [],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              }
            }
          ],
          buckets: {
            draft_candidates: [],
            published_blockers: [],
            offline_inventory: []
          }
        } as never
      })
    );

    expect(callbackSummaryProps[0]).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapHref:
        "/workflows/workflow-fallback?definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-fallback?definition_issue=legacy_publish_auth",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
  });

  it("keeps workspace starter scope on sampled workflow governance links", () => {
    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
        invocation: {
          workflow_id: "workflow-1",
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_follow_up: {
            explanation: {
              primary_signal: "已命中 sampled run。",
              follow_up: "继续观察 callback waiting。"
            },
            recommended_action: null,
            sampled_runs: [
              {
                run_id: "run-callback-1",
                snapshot: {
                  workflow_id: "workflow-1",
                  callback_waiting_explanation: {
                    primary_signal: "当前 waiting 节点仍在等待 callback。",
                    follow_up: "优先回到 workflow 编辑器处理缺口。"
                  }
                },
                tool_governance: {
                  referenced_tool_ids: ["native.catalog-gap"],
                  missing_tool_ids: ["native.catalog-gap"],
                  governed_tool_count: 0,
                  strong_isolation_tool_count: 0
                },
                legacy_auth_governance: {
                  generated_at: "2026-03-20T12:00:00Z",
                  auth_mode_contract: {
                    supported_auth_modes: ["api_key", "internal"],
                    retired_legacy_auth_modes: ["token"],
                    summary: "supported api_key / internal, legacy token",
                    follow_up: "replace token bindings"
                  },
                  workflow_count: 1,
                  binding_count: 2,
                  summary: {
                    draft_candidate_count: 1,
                    published_blocker_count: 1,
                    offline_inventory_count: 0
                  },
                  checklist: [],
                  workflows: [
                    {
                      workflow_id: "workflow-1",
                      workflow_name: "Workflow 1",
                      binding_count: 2,
                      draft_candidate_count: 1,
                      published_blocker_count: 1,
                      offline_inventory_count: 0,
                      tool_governance: {
                        referenced_tool_ids: ["native.catalog-gap"],
                        missing_tool_ids: ["native.catalog-gap"],
                        governed_tool_count: 0,
                        strong_isolation_tool_count: 0
                      }
                    }
                  ],
                  buckets: {
                    draft_candidates: [],
                    published_blockers: [],
                    offline_inventory: []
                  }
                }
              }
            ]
          },
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: null,
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: "drift",
          selectedTemplateId: "starter-1"
        }
      })
    );

    expect(callbackSummaryProps[0]).toMatchObject({
      workflowCatalogGapHref:
        "/workflows/workflow-1?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-1?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=legacy_publish_auth"
    });
  });
});
