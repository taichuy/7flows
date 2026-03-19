import { describe, expect, it } from "vitest";

import {
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  listPublishedInvocationRunFollowUpSampleSummaries,
  listPublishedInvocationRunFollowUpSampleViews,
  listPublishedInvocationSensitiveAccessChips,
  listPublishedInvocationSensitiveAccessRows,
  resolvePublishedInvocationCallbackWaitingExplanation,
  resolvePublishedInvocationExecutionFocusExplanation
} from "./published-invocation-presenters";

describe("published invocation presenters", () => {
  it("把 approval 与 notification blocker 聚合成 chips", () => {
    expect(
      listPublishedInvocationSensitiveAccessChips({
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 1
      })
    ).toEqual(["1 approval pending", "1 notification retry"]);
  });

  it("输出活动列表需要的 blocker rows", () => {
    expect(
      listPublishedInvocationSensitiveAccessRows({
        request_count: 2,
        approval_ticket_count: 2,
        pending_approval_count: 1,
        approved_approval_count: 1,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 1,
        failed_notification_count: 1
      })
    ).toEqual([
      {
        label: "Sensitive access",
        value: "2 requests · 2 approval tickets"
      },
      {
        label: "Approval blockers",
        value: "1 pending · 1 approved"
      },
      {
        label: "Notification delivery",
        value: "1 delivered · 1 failed"
      }
    ]);
  });

  it("优先使用后端下发的 waiting primary signal", () => {
    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: {
          primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
          follow_up: "先处理审批，再观察 waiting 节点是否恢复。"
        },
        fallbackHeadline: "fallback headline",
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("当前 callback waiting 仍卡在 1 条待处理审批。");
    expect(
      formatPublishedInvocationWaitingFollowUp({
        primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
        follow_up: "  先处理审批，再观察 waiting 节点是否恢复。  "
      })
    ).toBe("先处理审批，再观察 waiting 节点是否恢复。");
  });

  it("在没有后端解释时回退到既有 waiting headline", () => {
    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: null,
        fallbackHeadline: "callback lifecycle fallback",
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("callback lifecycle fallback");

    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: null,
        fallbackHeadline: null,
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("node run node-run-1 is still waiting_callback.");
    expect(formatPublishedInvocationWaitingFollowUp(null)).toBeNull();
  });

  it("把 callback waiting explanation 带进 publish follow-up 的样本摘要", () => {
    expect(
      listPublishedInvocationRunFollowUpSampleSummaries({
        affected_run_count: 1,
        sampled_run_count: 1,
        waiting_run_count: 1,
        running_run_count: 0,
        succeeded_run_count: 0,
        failed_run_count: 0,
        unknown_run_count: 0,
        sampled_runs: [
          {
            run_id: "run-12345678",
            snapshot: {
              status: "waiting",
              current_node_id: "mock_tool",
              waiting_reason: "Waiting for callback",
              execution_focus_node_id: "mock_tool",
              execution_focus_explanation: {
                primary_signal: "等待原因：Waiting for callback",
                follow_up: "下一步：优先沿 waiting / callback 事实链排查。"
              },
              callback_waiting_explanation: {
                primary_signal: "当前仍有 1 条 callback ticket 等待外部回调。",
                follow_up: "下一步：先等待外部 callback 到达，再观察自动 resume。"
              },
              execution_focus_node_name: "Mock callback tool",
              execution_focus_artifact_count: 1,
              execution_focus_artifact_ref_count: 1,
              execution_focus_tool_call_count: 1,
              execution_focus_raw_ref_count: 1,
              execution_focus_tool_calls: [
                {
                  tool_name: "callback.fetch",
                  status: "waiting",
                  effective_execution_class: "sandbox",
                  execution_sandbox_backend_id: "backend-wait",
                  raw_ref: "artifact://callback-raw",
                  response_summary: "回调原始结果已写入 artifact。"
                }
              ]
            }
          }
        ],
        explanation: null
      })
    ).toEqual([
      "run run-1234：当前 run 状态：waiting。 当前节点：mock_tool。 重点信号：当前仍有 1 条 callback ticket 等待外部回调。 后续动作：下一步：先等待外部 callback 到达，再观察自动 resume。 Mock callback tool 已关联 1 个 artifact、1 条 artifact ref、1 条 tool call。 其中 1 条 tool call 已落到 raw_ref，可直接回看原始输出。 样本 tool： callback.fetch 状态 waiting。 effective sandbox。 backend backend-wait。 raw_ref artifact://callback-raw。 回调原始结果已写入 artifact。"
    ]);
  });
  it("优先读取活动列表顶层共享解释，并兼容 sampled run snapshot 回退", () => {
    expect(
      resolvePublishedInvocationExecutionFocusExplanation({
        id: "invocation-1",
        workflow_id: "wf-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "alias-1",
        route_path: "/published/test",
        protocol: "openai",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "native.workflow",
        status: "succeeded",
        cache_status: "bypass",
        request_preview: {},
        created_at: "2026-03-19T00:00:00Z",
        execution_focus_explanation: {
          primary_signal: "顶层 execution focus",
          follow_up: "  顶层后续动作  "
        },
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
              run_id: "run-1",
              snapshot: {
                execution_focus_explanation: {
                  primary_signal: "sample snapshot focus",
                  follow_up: "sample snapshot follow-up"
                },
                callback_waiting_explanation: {
                  primary_signal: "sample snapshot callback",
                  follow_up: "sample snapshot callback follow-up"
                }
              }
            }
          ],
          explanation: null
        }
      })
    ).toEqual({
      primary_signal: "顶层 execution focus",
      follow_up: "顶层后续动作"
    });

    expect(
      resolvePublishedInvocationCallbackWaitingExplanation({
        id: "invocation-2",
        workflow_id: "wf-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "alias-1",
        route_path: "/published/test",
        protocol: "openai",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "native.workflow",
        status: "succeeded",
        cache_status: "bypass",
        request_preview: {},
        created_at: "2026-03-19T00:00:00Z",
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
              run_id: "run-2",
              snapshot: {
                callback_waiting_explanation: {
                  primary_signal: "sample snapshot callback",
                  follow_up: " sample snapshot callback follow-up "
                }
              }
            }
          ],
          explanation: null
        }
      })
    ).toEqual({
      primary_signal: "sample snapshot callback",
      follow_up: "sample snapshot callback follow-up"
    });
  });

  it("把 canonical follow-up 的 sampled runs 转成 publish 侧可直接展示的样本视图", () => {
    expect(
      listPublishedInvocationRunFollowUpSampleViews({
        affected_run_count: 2,
        sampled_run_count: 2,
        waiting_run_count: 1,
        running_run_count: 1,
        succeeded_run_count: 0,
        failed_run_count: 0,
        unknown_run_count: 0,
        sampled_runs: [
          {
            run_id: "run-1",
            snapshot: {
              status: "waiting",
              current_node_id: "tool_wait",
              waiting_reason: "callback pending",
              execution_focus_node_name: "Tool wait",
              execution_focus_artifact_count: 2,
              execution_focus_artifact_ref_count: 1,
              execution_focus_tool_call_count: 1,
              execution_focus_raw_ref_count: 1,
              callback_waiting_explanation: {
                primary_signal: " sample callback blocker ",
                follow_up: " follow callback chain "
              },
              execution_focus_explanation: {
                primary_signal: "focus fallback",
                follow_up: "focus follow-up"
              },
              execution_focus_tool_calls: [
                {
                  tool_name: "callback.wait",
                  status: "waiting",
                  raw_ref: "artifact://wait-raw"
                }
              ],
              execution_focus_skill_trace: {
                reference_count: 2,
                phase_counts: {
                  plan: 1,
                  execute: 1
                },
                source_counts: {
                  catalog: 2
                },
                loads: [
                  {
                    phase: "plan",
                    references: [
                      {
                        skill_id: "skill.callback",
                        skill_name: "Callback guide",
                        reference_id: "ref.callback.guide",
                        reference_name: "Callback handling guide",
                        load_source: "catalog",
                        retrieval_mcp_params: {}
                      }
                    ]
                  }
                ]
              },
              execution_focus_artifacts: [
                {
                  summary: "callback payload snapshot",
                  uri: "artifact://wait-artifact"
                }
              ]
            }
          },
          {
            run_id: "run-2",
            snapshot: {
              status: "running",
              current_node_id: "agent_plan",
              execution_focus_explanation: {
                primary_signal: " execution focus signal ",
                follow_up: " execution focus follow-up "
              }
            }
          }
        ],
        explanation: null
      })
    ).toEqual([
      {
        run_id: "run-1",
        status: "waiting",
        current_node_id: "tool_wait",
        waiting_reason: "callback pending",
        explanation_source: "callback_waiting",
        explanation: {
          primary_signal: "sample callback blocker",
          follow_up: "follow callback chain"
        },
        snapshot_summary:
          "当前 run 状态：waiting。 当前节点：tool_wait。 重点信号：sample callback blocker 后续动作：follow callback chain Tool wait 已关联 2 个 artifact、1 条 artifact ref、1 条 tool call。 其中 1 条 tool call 已落到 raw_ref，可直接回看原始输出。 样本 tool： callback.wait 状态 waiting。 raw_ref artifact://wait-raw。",
        execution_focus_artifact_count: 2,
        execution_focus_artifact_ref_count: 1,
        execution_focus_tool_call_count: 1,
        execution_focus_raw_ref_count: 1,
        skill_reference_count: 2,
        skill_reference_phase_summary: "plan 1, execute 1",
        skill_reference_source_summary: "catalog 2",
        focus_artifact_summary:
          "聚焦节点已沉淀 1 个 artifact（artifact 1）。 至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。",
        focus_tool_call_summaries: [
          {
            id: "focus-tool-call-0",
            title: "callback.wait · waiting",
            detail: "原始结果已落到 artifact://wait-raw。",
            badges: ["phase n/a", "raw payload"],
            rawRef: "artifact://wait-raw"
          }
        ],
        focus_artifacts: [
          {
            key: "artifact://wait-artifact",
            artifactKind: "artifact",
            contentType: null,
            summary: "callback payload snapshot",
            uri: "artifact://wait-artifact"
          }
        ],
        focus_skill_reference_loads: [
          {
            phase: "plan",
            references: [
              {
                skill_id: "skill.callback",
                skill_name: "Callback guide",
                reference_id: "ref.callback.guide",
                reference_name: "Callback handling guide",
                load_source: "catalog",
                retrieval_mcp_params: {}
              }
            ]
          }
        ]
      },
      {
        run_id: "run-2",
        status: "running",
        current_node_id: "agent_plan",
        waiting_reason: null,
        explanation_source: "execution_focus",
        explanation: {
          primary_signal: "execution focus signal",
          follow_up: "execution focus follow-up"
        },
        snapshot_summary:
          "当前 run 状态：running。 当前节点：agent_plan。 重点信号：execution focus signal 后续动作：execution focus follow-up",
        execution_focus_artifact_count: 0,
        execution_focus_artifact_ref_count: 0,
        execution_focus_tool_call_count: 0,
        execution_focus_raw_ref_count: 0,
        skill_reference_count: 0,
        skill_reference_phase_summary: null,
        skill_reference_source_summary: null,
        focus_artifact_summary: null,
        focus_tool_call_summaries: [],
        focus_artifacts: [],
        focus_skill_reference_loads: []
      }
    ]);
  });
});
