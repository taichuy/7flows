import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

let mockPathname = "/runs/run-1";
let mockSearchParams = "";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearchParams)
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
            },
            legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture()
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
    expect(markup).toContain("Workflow handoff");
    expect(markup).toContain("Publish auth contract");
    expect(markup).toContain("Legacy Auth workflow");
    expect(markup).not.toContain("敏感访问请求仍在等待审批，对应 waiting 链路会继续保持 blocked。");
    expect(markup).not.toContain(
      "最近 1 条通知投递失败，请优先重试通知或更换目标。 审批完成后再继续回看 run / inbox slice。"
    );
    expect(markup).not.toContain("Sensitive access:");
  });

  it("在只有 canonical run snapshot 时仍保留不重复的 outcome follow-up", () => {
    const baseEntry = buildTimelineEntry();
    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          buildTimelineEntry({
            outcome_explanation: {
              primary_signal: "旧的审批摘要不应继续盖过 canonical snapshot。",
              follow_up: "补充 follow-up：如无自动恢复，可联系值班 operator 检查 waiting inbox。"
            },
            run_snapshot: {
              status: "waiting",
              workflowId: "workflow-1",
              currentNodeId: "tool_wait",
              waitingReason: "approval pending",
              executionFocusNodeId: "tool_wait",
              executionFocusNodeRunId: "node-run-1",
              executionFocusNodeName: "Tool Wait"
            },
            run_follow_up: null,
            notifications: []
          })
        ],
        emptyCopy: "empty",
        defaultRunId: baseEntry.request.run_id
      })
    );

    expect(markup).toContain("Operator follow-up");
    expect(markup).toContain("补充 follow-up：如无自动恢复，可联系值班 operator 检查 waiting inbox。");
    expect(markup).not.toContain("旧的审批摘要不应继续盖过 canonical snapshot。");
  });

  it("优先复用 run follow-up 的稳定 recommended_action，而不是退回 inbox CTA", () => {
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
              policy_summary: "当前访问已通过审批。",
              decided_at: "2026-03-19T00:10:00Z"
            },
            approval_ticket: {
              ...baseEntry.approval_ticket!,
              status: "approved",
              waiting_status: "resumed",
              approved_by: "operator-1",
              decided_at: "2026-03-19T00:10:00Z"
            },
            notifications: [],
            outcome_explanation: {
              primary_signal: "审批票据仍在等待处理。",
              follow_up: "先处理审批票据，再重试导出。"
            },
            run_snapshot: null,
            run_follow_up: {
              affected_run_count: 1,
              sampled_run_count: 0,
              waiting_run_count: 1,
              running_run_count: 0,
              succeeded_run_count: 0,
              failed_run_count: 0,
              unknown_run_count: 0,
              recommended_action: {
                kind: "open_workflow_library",
                entry_key: "workflowLibrary",
                href: "/workflows?execution=sandbox",
                label: "Open workflow library"
              },
              sampled_runs: [],
              explanation: {
                primary_signal: "当前审批阻断同时命中了强隔离治理。",
                follow_up: "先回到 workflow library 处理强隔离配置。"
              }
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: "run-1"
      })
    );

    expect(markup).toContain("Open workflow library");
    expect(markup).toContain('/workflows?execution=sandbox');
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
    expect(markup).not.toContain("敏感访问请求仍在等待审批，对应 waiting 链路会继续保持 blocked。");
    expect(markup).not.toContain("Sensitive access:");
  });

  it("在有 defaultRunId 时仍优先使用 sampled run 生成 run 与 inbox 链接", () => {
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
            notifications: [],
            outcome_explanation: null,
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
                  run_id: "run-sampled-preferred",
                  snapshot: {
                    status: "waiting",
                    workflowId: "workflow-1",
                    currentNodeId: "tool_wait",
                    waitingReason: "approval pending",
                    executionFocusNodeId: "tool_wait",
                    executionFocusNodeRunId: "node-run-sampled-preferred",
                    executionFocusNodeName: "Tool Wait"
                  }
                }
              ],
              explanation: null
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: "run-context-should-not-win"
      })
    );

    expect(markup).toContain('/runs/run-sampled-preferred');
    expect(markup).toContain('run_id=run-sampled-preferred');
    expect(markup).not.toContain('run-context-should-not-win');
  });

  it("keeps workspace starter scope on approval blocker run drilldown links", () => {
    mockSearchParams =
      "track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true";

    const markup = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          buildTimelineEntry({
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
                  run_id: "run-sampled-scope",
                  snapshot: {
                    status: "waiting",
                    workflowId: "workflow-1",
                    currentNodeId: "tool_wait",
                    waitingReason: "approval pending",
                    executionFocusNodeId: "tool_wait",
                    executionFocusNodeRunId: "node-run-sampled-scope",
                    executionFocusNodeName: "Tool Wait"
                  }
                }
              ],
              explanation: {
                primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
                follow_up: "优先留在当前 workspace starter scope。"
              }
            }
          })
        ],
        emptyCopy: "empty",
        defaultRunId: "run-1"
      })
    );

    expect(markup).toContain(
      "/runs/run-1?needs_follow_up=true&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(markup).toContain(
      "/runs/run-sampled-scope?needs_follow_up=true&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );

    mockSearchParams = "";
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
