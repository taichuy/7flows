import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: () => createElement("div", { "data-testid": "sensitive-access-inline-actions" })
}));

function buildTimelineEntry(
  overrides: Partial<SensitiveAccessTimelineEntry> = {}
): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "workflow",
      requester_id: "requester-1",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "读取敏感配置",
      decision: "require_approval",
      decision_label: "require approval",
      reason_code: "sensitive_access_requires_approval",
      reason_label: "需要审批",
      policy_summary: "L3 资源默认要求人工审批。",
      created_at: "2026-03-19T00:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Search Tool",
      description: "high-risk tool",
      sensitivity_level: "L3",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-19T00:00:00Z",
      updated_at: "2026-03-19T00:00:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T00:00:00Z",
      created_at: "2026-03-19T00:00:00Z"
    },
    notifications: [
      {
        id: "notification-1",
        approval_ticket_id: "ticket-1",
        channel: "email",
        target: "owner@example.com",
        status: "failed",
        delivered_at: null,
        error: "smtp timeout",
        created_at: "2026-03-19T00:05:00Z"
      }
    ],
    outcome_explanation: {
      primary_signal: "敏感访问请求仍在等待审批，对应 waiting 链路会继续保持 blocked。",
      follow_up: "最近 1 条通知投递失败，请优先重试通知或更换目标。 审批完成后再继续回看 run / inbox slice。"
    },
    ...overrides
  };
}

describe("SensitiveAccessTimelineEntryList", () => {
  it("为待审批或通知失败的 entry 渲染共享 callback waiting 摘要", () => {
    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [buildTimelineEntry()],
        emptyCopy: "empty",
        defaultRunId: "run-1"
      })
    );

    expect(markup).toContain("approval pending");
    expect(markup).toContain("notify failed 1");
    expect(markup).toContain(
      "Sensitive access: Search Tool · require approval · 需要审批 · L3 资源默认要求人工审批。"
    );
    expect(markup).toContain("Notification: latest notify email failed · owner@example.com · smtp timeout");
    expect(markup).toContain("open inbox slice");
  });

  it("优先渲染后端提供的 operator follow-up 快照，而不是重复展开旧摘要", () => {
    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          buildTimelineEntry({
            run_snapshot: {
              status: "waiting",
              workflowId: "workflow-1",
              currentNodeId: "tool_wait",
              waitingReason: "callback pending",
              executionFocusNodeId: "tool_wait",
              executionFocusNodeRunId: "node-run-1",
              executionFocusNodeName: "Tool Wait",
              executionFocusExplanation: {
                primary_signal: "等待原因：callback pending",
                follow_up: "继续检查 callback ticket。"
              },
              callbackWaitingExplanation: {
                primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
                follow_up: "优先确认外部系统是否已经回调。"
              },
              executionFocusArtifactCount: 1,
              executionFocusArtifactRefCount: 1,
              executionFocusToolCallCount: 1,
              executionFocusRawRefCount: 1,
              executionFocusArtifactRefs: ["artifact://focus-1"],
              executionFocusArtifacts: [
                {
                  artifact_kind: "tool_result",
                  content_type: "application/json",
                  summary: "等待节点已保留最近一次 tool 输出摘要。",
                  uri: "artifact://focus-1"
                }
              ],
              executionFocusToolCalls: [
                {
                  id: "tool-call-1",
                  tool_id: "search",
                  tool_name: "Search Tool",
                  phase: "waiting_callback",
                  status: "waiting",
                  response_summary: "最近一次 tool 调用仍在等待 callback。",
                  raw_ref: "raw://tool-call-1"
                }
              ],
              executionFocusSkillTrace: {
                reference_count: 1,
                phase_counts: { planning: 1 },
                source_counts: { skill_doc: 1 },
                loads: [
                  {
                    phase: "planning",
                    references: [
                      {
                        skill_id: "skill-1",
                        skill_name: "Callback Policy",
                        reference_id: "ref-1",
                        reference_name: "Waiting Callback",
                        load_source: "skill_doc",
                        retrieval_mcp_params: {}
                      }
                    ]
                  }
                ]
              }
            },
            run_follow_up: {
              affected_run_count: 1,
              sampled_run_count: 1,
              waiting_run_count: 1,
              running_run_count: 0,
              succeeded_run_count: 0,
              failed_run_count: 0,
              unknown_run_count: 0,
              sampled_runs: [],
              explanation: {
                primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
                follow_up: "run run-1：当前 run 状态：waiting。"
              }
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: "run-1"
      })
    );

    expect(markup).toContain("Operator follow-up");
    expect(markup).toContain("Waiting node focus evidence");
    expect(markup).toContain("tool calls 1");
    expect(markup).toContain("Injected references");
    expect(markup).not.toContain("Sensitive access:");
  });

  it("在 entry 自身没有 run_snapshot 时回退到 sampled run snapshot", () => {
    const baseEntry = buildTimelineEntry();
    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          buildTimelineEntry({
            request: {
              ...baseEntry.request,
              run_id: null,
              node_run_id: null
            },
            approval_ticket: {
              ...baseEntry.approval_ticket!,
              run_id: null,
              node_run_id: null
            },
            run_snapshot: null,
            run_follow_up: {
              affected_run_count: 1,
              sampled_run_count: 1,
              waiting_run_count: 1,
              running_run_count: 0,
              succeeded_run_count: 0,
              failed_run_count: 0,
              unknown_run_count: 0,
              sampled_runs: [
                {
                  run_id: "run-sampled-1",
                  snapshot: {
                    status: "waiting",
                    workflowId: "workflow-1",
                    currentNodeId: "tool_wait",
                    waitingReason: "callback pending",
                    executionFocusNodeId: "tool_wait",
                    executionFocusNodeRunId: "node-run-sampled-1",
                    executionFocusNodeName: "Tool Wait",
                    callbackWaitingExplanation: {
                      primary_signal: "当前 sampled run 仍在等待 callback。",
                      follow_up: "优先确认外部系统是否已经回调。"
                    },
                    callbackWaitingLifecycle: {
                      wait_cycle_count: 1,
                      issued_ticket_count: 1,
                      expired_ticket_count: 0,
                      consumed_ticket_count: 0,
                      canceled_ticket_count: 0,
                      late_callback_count: 0,
                      resume_schedule_count: 1,
                      max_expired_ticket_count: 0,
                      terminated: false,
                      last_ticket_status: "pending",
                      last_ticket_reason: "waiting_callback",
                      last_ticket_updated_at: "2026-03-19T00:05:00Z",
                      last_resume_delay_seconds: 60,
                      last_resume_reason: "waiting_callback",
                      last_resume_source: "runtime_retry",
                      last_resume_backoff_attempt: 1
                    },
                    scheduledResumeDelaySeconds: 60,
                    scheduledResumeReason: "waiting_callback",
                    scheduledResumeSource: "runtime_retry",
                    scheduledWaitingStatus: "waiting",
                    scheduledResumeScheduledAt: "2026-03-19T00:05:00Z",
                    scheduledResumeDueAt: "2026-03-19T00:06:00Z",
                    scheduledResumeRequeuedAt: "2026-03-19T00:06:15Z",
                    scheduledResumeRequeueSource: "waiting_resume_monitor",
                    executionFocusArtifactCount: 1,
                    executionFocusArtifactRefCount: 1,
                    executionFocusToolCallCount: 1,
                    executionFocusRawRefCount: 1,
                    executionFocusArtifactRefs: ["artifact://focus-sampled-1"],
                    executionFocusArtifacts: [
                      {
                        artifact_kind: "tool_result",
                        content_type: "application/json",
                        summary: "sampled run 保留了最近一次 tool 输出摘要。",
                        uri: "artifact://focus-sampled-1"
                      }
                    ],
                    executionFocusToolCalls: [
                      {
                        id: "tool-call-sampled-1",
                        tool_id: "search",
                        tool_name: "Search Tool",
                        phase: "waiting_callback",
                        status: "waiting",
                        response_summary: "sampled run 的 tool 调用仍在等待 callback。",
                        raw_ref: "raw://tool-call-sampled-1"
                      }
                    ]
                  }
                }
              ],
              explanation: {
                primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
                follow_up: "run run-sampled-1：当前 run 状态：waiting。"
              }
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: null
      })
    );

    expect(markup).toContain("open run run-samp");
    expect(markup).toContain("当前 sampled run 仍在等待 callback。");
    expect(markup).toContain("scheduled resume requeued");
    expect(markup).toContain("requeued by waiting_resume_monitor");
    expect(markup).toContain("tool calls 1");
    expect(markup).not.toContain("Sensitive access:");
  });

  it("不会为已经完成且无需 follow-up 的 entry 重复渲染 callback waiting 摘要", () => {
    const baseEntry = buildTimelineEntry();
    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          buildTimelineEntry({
            request: {
              ...baseEntry.request,
              decision: "allow",
              decision_label: "allow",
              reason_code: "sensitive_access_allowed",
              reason_label: "允许",
              policy_summary: "允许当前读取。",
              decided_at: "2026-03-19T00:10:00Z"
            },
            approval_ticket: {
              ...baseEntry.approval_ticket!,
              status: "approved",
              waiting_status: "resumed",
              approved_by: "operator-1",
              decided_at: "2026-03-19T00:10:00Z"
            },
            notifications: [
              {
                id: "notification-2",
                approval_ticket_id: "ticket-1",
                channel: "email",
                target: "owner@example.com",
                status: "delivered",
                delivered_at: "2026-03-19T00:08:00Z",
                error: null,
                created_at: "2026-03-19T00:05:00Z"
              }
            ],
            outcome_explanation: {
              primary_signal: "审批已通过，对应 waiting blocker 已交回 runtime。",
              follow_up: "继续观察 run 是否真正恢复。"
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: "run-1"
      })
    );

    expect(markup).not.toContain("approval pending");
    expect(markup).not.toContain("notify failed 1");
    expect(markup).not.toContain("Sensitive access:");
    expect(markup).not.toContain("Notification:");
  });
});
