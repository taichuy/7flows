import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import {
  buildOperatorInlineActionSampleInboxContext,
  buildOperatorInlineActionFeedbackModel,
  hasStructuredOperatorInlineActionResult
} from "@/lib/operator-inline-action-feedback";

describe("operator inline action feedback", () => {
  it("builds a structured model from canonical explanations and snapshot evidence", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      message: "审批已通过。",
      outcomeExplanation: {
        primary_signal: "审批已通过。",
        follow_up: "后端已把 waiting blocker 交回 runtime。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
        follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
      },
      blockerDeltaSummary: "阻塞变化：已解除 approval pending。",
      runSnapshot: {
        status: "running",
        currentNodeId: "review",
        executionFocusNodeName: "Review",
        executionFocusArtifactCount: 1,
        executionFocusArtifactRefCount: 2,
        executionFocusToolCallCount: 3,
        executionFocusRawRefCount: 1,
        executionFocusExplanation: {
          primary_signal: "runtime 已继续推进。",
          follow_up: "继续观察后续节点。"
        }
      }
    });

    expect(model.hasStructuredContent).toBe(true);
    expect(model.headline).toBe("审批已通过。");
    expect(model.outcomeFollowUp).toBe("后端已把 waiting blocker 交回 runtime。");
    expect(model.runFollowUpPrimarySignal).toContain("本次影响 1 个 run");
    expect(model.runFollowUpFollowUp).toContain("run run-1");
    expect(model.blockerDeltaSummary).toBe("阻塞变化：已解除 approval pending。");
    expect(model.runStatus).toBe("running");
    expect(model.currentNodeId).toBe("review");
    expect(model.focusNodeLabel).toBe("Review");
    expect(model.artifactCount).toBe(1);
    expect(model.artifactRefCount).toBe(2);
    expect(model.toolCallCount).toBe(3);
    expect(model.rawRefCount).toBe(1);
  });

  it("detects when only plain text exists without structured follow-up", () => {
    expect(
      hasStructuredOperatorInlineActionResult({
        outcomeExplanation: null,
        runFollowUpExplanation: null,
        blockerDeltaSummary: null,
        runSnapshot: null
      })
    ).toBe(false);
  });

  it("recovers an approval inbox CTA from the matched sampled run", () => {
    expect(
      buildOperatorInlineActionSampleInboxContext({
        runId: "run-2",
        runFollowUp: {
          affectedRunCount: 2,
          sampledRunCount: 2,
          waitingRunCount: 1,
          runningRunCount: 1,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: null,
              callbackTickets: [
                {
                  ticket: "callback-ticket-1",
                  run_id: "run-1",
                  node_run_id: "node-run-1",
                  status: "pending",
                  waiting_status: "waiting",
                  tool_call_index: 0,
                  created_at: "2026-03-20T10:00:00Z"
                }
              ],
              sensitiveAccessEntries: []
            },
            {
              runId: "run-2",
              snapshot: {
                executionFocusNodeRunId: "node-run-2"
              },
              callbackTickets: [],
              sensitiveAccessEntries: [
                {
                  request: {
                    id: "request-2",
                    run_id: "run-2",
                    node_run_id: "node-run-2",
                    requester_type: "tool",
                    requester_id: "native.search",
                    resource_id: "resource-2",
                    action_type: "invoke",
                    decision: "require_approval",
                    decision_label: "Require approval",
                    reason_code: "policy_requires_approval",
                    reason_label: "Policy requires approval",
                    policy_summary: "approval required",
                    created_at: "2026-03-20T10:00:00Z",
                    decided_at: null,
                    purpose_text: null
                  },
                  resource: {
                    id: "resource-2",
                    label: "Remote search",
                    description: "External search capability",
                    sensitivity_level: "L2",
                    source: "local_capability",
                    metadata: {},
                    created_at: "2026-03-20T09:00:00Z",
                    updated_at: "2026-03-20T09:00:00Z"
                  },
                  approval_ticket: {
                    id: "ticket-2",
                    access_request_id: "request-2",
                    run_id: "run-2",
                    node_run_id: "node-run-2",
                    status: "pending",
                    waiting_status: "waiting",
                    approved_by: null,
                    decided_at: null,
                    expires_at: "2026-03-20T10:30:00Z",
                    created_at: "2026-03-20T10:00:00Z"
                  },
                  notifications: [],
                  outcome_explanation: null,
                  run_snapshot: null,
                  run_follow_up: null
                }
              ]
            }
          ]
        }
      })
    ).toEqual({
      kind: "approval blocker",
      href:
        "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-2&node_run_id=node-run-2&access_request_id=request-2&approval_ticket_id=ticket-2",
      hrefLabel: "open approval inbox slice"
    });
  });

  it("把 compact run snapshot 的 tool execution evidence 转成可复用卡片模型", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      outcomeExplanation: {
        primary_signal: "审批已通过，对应 waiting 链路已交回 runtime 恢复。"
      },
      runSnapshot: {
        status: "waiting",
        currentNodeId: "sandbox_tool",
        executionFocusNodeName: "Sandbox Tool",
        executionFocusNodeRunId: "node-run-1",
        executionFocusArtifactCount: 1,
        executionFocusArtifactRefCount: 1,
        executionFocusToolCallCount: 1,
        executionFocusRawRefCount: 1,
        executionFocusArtifactRefs: ["artifact://focus-1"],
        executionFocusArtifacts: [
          {
            artifact_kind: "tool_result",
            content_type: "application/json",
            summary: "聚焦节点已产出结构化 tool result。",
            uri: "artifact://focus-1"
          }
        ],
        executionFocusToolCalls: [
          {
            id: "tool-call-1",
            tool_id: "sandbox.search",
            tool_name: "Sandbox Search",
            phase: "execute",
            status: "completed",
            requested_execution_class: "sandbox",
            requested_execution_source: "runtime_policy",
            requested_execution_profile: "risk-reviewed",
            requested_execution_timeout_ms: 3000,
            requested_execution_network_policy: "isolated",
            requested_execution_filesystem_policy: "ephemeral",
            effective_execution_class: "sandbox",
            execution_executor_ref: "tool:compat-adapter:dify-default",
            execution_sandbox_backend_id: "sandbox-default",
            execution_sandbox_backend_executor_ref: "sandbox-backend:sandbox-default",
            execution_sandbox_runner_kind: "tool",
            response_summary: "搜索结果已回写 artifact。",
            response_content_type: "application/json",
            raw_ref: "artifact://tool-call-raw"
          }
        ]
      }
    });

    expect(model.focusArtifactSummary).toBe(
      "聚焦节点已沉淀 1 个 artifact（tool_result 1）。 run artifact refs 1 条。 至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。"
    );
    expect(model.focusToolCallSummaries).toEqual([
      {
        id: "tool-call-1",
        title: "Sandbox Search · completed",
        detail: "搜索结果已回写 artifact。",
        badges: [
          "phase execute",
          "requested sandbox",
          "effective sandbox",
          "profile risk-reviewed",
          "backend sandbox-default",
          "runner tool",
          "content application/json",
          "raw payload"
        ],
        rawRef: "artifact://tool-call-raw",
        traceSummary:
          "执行链：source runtime_policy · timeout 3000ms · network isolated · filesystem ephemeral · executor tool:compat-adapter:dify-default · backend ref sandbox-backend:sandbox-default。"
      }
    ]);
    expect(model.focusArtifacts).toEqual([
      {
        key: "artifact://focus-1",
        artifactKind: "tool_result",
        contentType: "application/json",
        summary: "聚焦节点已产出结构化 tool result。",
        uri: "artifact://focus-1"
      }
    ]);
  });

  it("把 compact run snapshot 的 focused skill trace 转成可复用结果模型", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      runSnapshot: {
        status: "waiting",
        executionFocusNodeName: "Agent Review",
        executionFocusSkillTrace: {
          reference_count: 2,
          phase_counts: { main_plan: 2 },
          source_counts: { retrieval_query_match: 1, skill_binding: 1 },
          loads: [
            {
              phase: "main_plan",
              references: [
                {
                  skill_id: "skill-research-brief",
                  skill_name: "Research Brief",
                  reference_id: "ref-handoff",
                  reference_name: "Operator Handoff",
                  load_source: "skill_binding",
                  fetch_reason: null,
                  fetch_request_index: null,
                  fetch_request_total: null,
                  retrieval_http_path:
                    "/api/skills/skill-research-brief/references/ref-handoff?workspace_id=default",
                  retrieval_mcp_method: "skills.get_reference",
                  retrieval_mcp_params: {
                    skill_id: "skill-research-brief",
                    reference_id: "ref-handoff",
                    workspace_id: "default"
                  }
                },
                {
                  skill_id: "skill-research-brief",
                  skill_name: "Research Brief",
                  reference_id: "ref-budget",
                  reference_name: "Budget Control",
                  load_source: "retrieval_query_match",
                  fetch_reason: "Matched query terms: budget, guardrails",
                  fetch_request_index: null,
                  fetch_request_total: null,
                  retrieval_http_path:
                    "/api/skills/skill-research-brief/references/ref-budget?workspace_id=default",
                  retrieval_mcp_method: "skills.get_reference",
                  retrieval_mcp_params: {
                    skill_id: "skill-research-brief",
                    reference_id: "ref-budget",
                    workspace_id: "default"
                  }
                }
              ]
            }
          ]
        }
      }
    });

    expect(model.hasStructuredContent).toBe(true);
    expect(model.skillReferenceCount).toBe(2);
    expect(model.skillReferencePhaseSummary).toBe("main_plan 2");
    expect(model.skillReferenceSourceSummary).toBe(
      "retrieval_query_match 1, skill_binding 1"
    );
    expect(model.focusSkillReferenceLoads).toHaveLength(1);
    expect(model.focusSkillReferenceLoads[0]?.references).toHaveLength(2);
  });

  it("在 waiting callback 的 operator 结果里复用 callback waiting summary，且不重复渲染动作按钮", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        title: "恢复结果",
        message: "恢复已提交。",
        runId: "run-1",
        outcomeExplanation: {
          primary_signal: "恢复请求已写回 runtime。"
        },
        runSnapshot: {
          status: "waiting",
          waitingReason: "waiting callback approval",
          executionFocusNodeId: "agent_review",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Agent Review",
          executionFocusToolCalls: [
            {
              id: "tool-call-waiting-1",
              tool_id: "callback.wait",
              tool_name: "Callback Wait",
              phase: "execute",
              status: "waiting",
              effective_execution_class: "sandbox",
              execution_executor_ref: "tool:compat-adapter:dify-default",
              execution_sandbox_backend_id: "sandbox-default",
              execution_sandbox_runner_kind: "container"
            }
          ],
          callbackWaitingLifecycle: {
            wait_cycle_count: 1,
            issued_ticket_count: 1,
            expired_ticket_count: 0,
            consumed_ticket_count: 0,
            canceled_ticket_count: 0,
            late_callback_count: 0,
            resume_schedule_count: 1,
            max_expired_ticket_count: 3,
            terminated: false,
            termination_reason: null,
            terminated_at: null,
            last_ticket_status: "pending",
            last_ticket_reason: "callback pending",
            last_ticket_updated_at: "2026-03-20T10:00:00Z",
            last_late_callback_status: null,
            last_late_callback_reason: null,
            last_late_callback_at: null,
            last_resume_delay_seconds: 30,
            last_resume_reason: "callback pending",
            last_resume_source: "callback_ticket_monitor",
            last_resume_backoff_attempt: 1
          },
          scheduledResumeDelaySeconds: 30,
          scheduledResumeSource: "callback_ticket_monitor",
          scheduledWaitingStatus: "waiting_callback",
          scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
          scheduledResumeDueAt: "2026-03-20T10:00:30Z",
          scheduledResumeRequeuedAt: "2026-03-20T10:01:00Z",
          scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor",
          callbackWaitingExplanation: {
            primary_signal: "当前 run 仍在等待 callback approval。",
            follow_up: "优先检查 approval / notification blocker 是否已经解除。"
          }
        }
      })
    );

    expect(html).toContain("当前 run 仍在等待 callback approval");
    expect(html).toContain("优先检查 approval / notification blocker 是否已经解除");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("scheduler_waiting_resume_monitor");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).toContain("Waiting node focus evidence");
    expect(html.indexOf("effective sandbox")).toBeGreaterThan(
      html.indexOf("当前 run 仍在等待 callback approval")
    );
    expect(html).not.toContain("当前 run 状态：waiting。");
    expect(html).not.toContain("后续动作：优先检查 approval / notification blocker 是否已经解除。");
    expect(html).not.toContain("立即尝试恢复");
    expect(html).not.toContain("处理过期 ticket 并尝试恢复");
  });

  it("只有 callback lifecycle / scheduled resume 事实时也会渲染 callback waiting summary", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        title: "恢复结果",
        message: "恢复已提交。",
        runId: "run-2",
        runSnapshot: {
          status: "waiting",
          executionFocusNodeId: "agent_review",
          executionFocusNodeRunId: "node-run-2",
          executionFocusNodeName: "Agent Review",
          callbackWaitingLifecycle: {
            wait_cycle_count: 1,
            issued_ticket_count: 0,
            expired_ticket_count: 0,
            consumed_ticket_count: 0,
            canceled_ticket_count: 0,
            late_callback_count: 0,
            resume_schedule_count: 1,
            max_expired_ticket_count: 3,
            terminated: false,
            termination_reason: null,
            terminated_at: null,
            last_ticket_status: null,
            last_ticket_reason: null,
            last_ticket_updated_at: null,
            last_late_callback_status: null,
            last_late_callback_reason: null,
            last_late_callback_at: null,
            last_resume_delay_seconds: 45,
            last_resume_reason: "callback pending",
            last_resume_source: "waiting_resume_monitor",
            last_resume_backoff_attempt: 2
          },
          scheduledResumeDelaySeconds: 45,
          scheduledResumeSource: "waiting_resume_monitor",
          scheduledWaitingStatus: "waiting_callback",
          scheduledResumeScheduledAt: "2026-03-20T11:00:00Z",
          scheduledResumeDueAt: "2026-03-20T11:00:45Z",
          scheduledResumeRequeuedAt: "2026-03-20T11:01:30Z",
          scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
        }
      })
    );

    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("scheduler_waiting_resume_monitor");
    expect(html).toContain("Watch the requeued resume");
  });

  it("为非 callback summary 的 operator 结果渲染 shared recommended next step", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        title: "Cleanup 结果",
        message: "cleanup 已完成。",
        runId: "run-cleanup",
        outcomeExplanation: {
          primary_signal: "cleanup 已处理过期 ticket。",
          follow_up: "优先检查剩余 blocker 是否已经解除。"
        },
        runSnapshot: {
          status: "running",
          currentNodeId: "approval_gate",
          executionFocusNodeName: "Approval Gate"
        },
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
          follow_up: "run run-cleanup：当前 run 已回到 approval_gate，继续观察后续节点。"
        }
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("run detail");
    expect(html).toContain("open run");
    expect(html).toContain("run run-cleanup：当前 run 已回到 approval_gate，继续观察后续节点。");
  });

  it("在缺少 run follow-up 文案时回退到 canonical execution focus fallback", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        title: "Cleanup 结果",
        message: "cleanup 已完成。",
        runId: "run-cleanup",
        outcomeExplanation: {
          primary_signal: "cleanup 已处理过期 ticket。"
        },
        runSnapshot: null,
        runFollowUpExplanation: null
      })
    );

    expect(html).toContain(
      "当前 run 已回接 canonical execution focus；优先继续检查 focus node、runtime evidence 和 execution fallback / blocking 原因。"
    );
  });

  it("inline operator feedback 会展开额外 sampled run 的 compact follow-up 卡片", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        title: "Cleanup 结果",
        message: "cleanup 已完成。",
        runId: "run-cleanup",
        outcomeExplanation: {
          primary_signal: "cleanup 已处理过期 ticket。"
        },
        runSnapshot: {
          status: "running",
          currentNodeId: "approval_gate",
          executionFocusNodeName: "Approval Gate"
        },
        runFollowUpExplanation: {
          primary_signal: "本次影响 2 个 run；整体状态分布：running 1、waiting 1。已回读 2 个样本。",
          follow_up: "另一个样本 run 仍在等待 approval。"
        },
        runFollowUp: {
          affectedRunCount: 2,
          sampledRunCount: 2,
          waitingRunCount: 1,
          runningRunCount: 1,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-cleanup",
              snapshot: {
                status: "running",
                currentNodeId: "approval_gate"
              }
            },
            {
              runId: "run-related",
              snapshot: {
                status: "waiting",
                currentNodeId: "approval_gate",
                waitingReason: "waiting approval",
                executionFocusNodeId: "approval_gate",
                executionFocusNodeRunId: "node-run-related",
                executionFocusNodeName: "Approval Gate",
                callbackWaitingExplanation: {
                  primary_signal: "当前关联 run 仍在等待 approval。",
                  follow_up: "优先处理审批，再观察 scheduler 是否继续恢复。"
                },
                scheduledResumeDelaySeconds: 45,
                scheduledResumeSource: "waiting_resume_monitor",
                scheduledWaitingStatus: "waiting_callback",
                scheduledResumeScheduledAt: "2026-03-20T11:00:00Z",
                scheduledResumeDueAt: "2026-03-20T11:00:45Z",
                scheduledResumeRequeuedAt: "2026-03-20T11:01:30Z",
                scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
              }
            }
          ]
        }
      })
    );

    expect(html).toContain("affected runs 2");
    expect(html).toContain("still waiting 1");
    expect(html).toContain("/runs/run-related");
    expect(html).toContain("当前关联 run 仍在等待 approval");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("scheduler_waiting_resume_monitor");
  });
});
