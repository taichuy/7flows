import { describe, expect, it } from "vitest";

import {
  buildPublishedCacheInventorySurfaceCopy,
  buildPublishedInvocationCallbackDrilldownSurfaceCopy,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationDetailSurfaceCopy,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationFailureMessageDiagnosis,
  buildPublishedInvocationFailureReasonInsight,
  buildPublishedInvocationRateLimitWindowInsight,
  buildPublishedInvocationRecommendedNextStep,
  buildPublishedInvocationUnavailableDetailSurfaceCopy,
  formatPublishedInvocationWaitingRuntimeFallback,
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  hasPublishedInvocationBlockingSensitiveAccessSummary,
  listPublishedInvocationRunFollowUpSampleSummaries,
  listPublishedInvocationRunFollowUpSampleViews,
  listPublishedInvocationSensitiveAccessChips,
  listPublishedInvocationSensitiveAccessRows,
  resolvePublishedInvocationRunFollowUpSampleView,
  resolvePublishedInvocationCallbackWaitingExplanation,
  resolvePublishedInvocationExecutionFocusExplanation
} from "./published-invocation-presenters";

describe("published invocation presenters", () => {
  it("集中生成 publish invocation detail helper copy", () => {
    expect(
      buildPublishedInvocationDetailSurfaceCopy({
        blockingNodeRunId: "node-run-blocked",
        focusSkillTraceNodeRunId: "node-run-focus"
      })
    ).toMatchObject({
      canonicalFollowUpDescription: expect.stringContaining("operator follow-up"),
      blockingApprovalTimelineDescription: expect.stringContaining("node-run-blocked"),
      approvalTimelineDescription: expect.stringContaining("published-surface debugging"),
      skillTraceDescription: expect.stringContaining("node-run-focus")
    });
  });

  it("为 cache inventory 提供统一 helper 与 empty copy", () => {
    expect(
      buildPublishedCacheInventorySurfaceCopy({
        enabled: false,
        state: "empty"
      })
    ).toEqual({
      description: "命中统计回答“被用了多少次”，inventory 回答“当前缓存里还留着什么”。",
      emptyState: "该 endpoint 没有启用 publish cache，当前不会保留 response cache entry。"
    });

    expect(
      buildPublishedCacheInventorySurfaceCopy({
        enabled: true,
        state: "unavailable"
      }).emptyState
    ).toBe("当前暂时无法拉取 cache inventory，活动 summary 仍可继续使用。");
  });

  it("为 callback waiting drilldown 提供统一 helper copy", () => {
    expect(buildPublishedInvocationCallbackDrilldownSurfaceCopy()).toEqual({
      title: "Callback waiting drilldown",
      description: expect.stringContaining("approval blockers and resume scheduling"),
      inboxLinkLabel: "open inbox slice",
      blockersTitle: "Resume blockers",
      blockersEmptyHeadline: "Callback waiting is not active.",
      latestEventsTitle: "Latest callback events"
    });
  });

  it("为 publish entry / detail 提供统一 surface copy", () => {
    expect(buildPublishedInvocationEntrySurfaceCopy()).toEqual({
      canonicalFollowUpFallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。",
      sampledRunSkillTraceDescription: expect.stringContaining("compact snapshot"),
      callbackLifecycleFallback: "tracked in detail panel",
      succeededDescription: expect.stringContaining("publish 调用链"),
      detailPanelDescription: expect.stringContaining("callback lifecycle / cache")
    });
  });

  it("为 publish activity rate limit window 提供统一 insight", () => {
    expect(
      buildPublishedInvocationRateLimitWindowInsight({
        pressure: { percentage: 90, label: "90%" },
        remainingQuota: 1,
        windowRejected: 0,
        failedCount: 0,
        timeWindowLabel: "最近 24 小时"
      })
    ).toBe(
      "当前最近 24 小时切片里已用掉 90% 配额，只剩 1 次；继续放量前先观察是否开始转成 rate_limit_exceeded。"
    );

    expect(
      buildPublishedInvocationRateLimitWindowInsight({
        pressure: { percentage: 40, label: "40%" },
        remainingQuota: 3,
        windowRejected: 1,
        failedCount: 2,
        timeWindowLabel: "全部时间"
      })
    ).toBe(
      "当前窗口已经出现 1 次限流拒绝；如果失败面板同时看到 runtime failed，先把 quota hit 与执行链路异常拆开排查。"
    );
  });

  it("为 waiting invocation 提供统一 durable runtime fallback copy", () => {
    expect(
      formatPublishedInvocationWaitingRuntimeFallback({
        currentNodeId: "tool_wait",
        waitingReason: "callback pending"
      })
    ).toBe(
      "该请求已成功接入 durable runtime，当前仍处于 waiting；可直接打开 run detail 继续追踪，当前节点 tool_wait，等待原因 callback pending。"
    );
  });

  it("为 publish failure diagnosis 提供共享 helper copy", () => {
    expect(
      buildPublishedInvocationFailureReasonInsight({
        reasonCounts: [{ value: "runtime_failed", count: 2 }],
        failureReasons: [{ message: "sandbox backend offline during invocation", count: 2, last_invoked_at: null }],
        sandboxReadiness: {
          enabled_backend_count: 0,
          healthy_backend_count: 0,
          degraded_backend_count: 0,
          offline_backend_count: 1,
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
              reason: "No sandbox backend is currently enabled."
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
        }
      })
    ).toContain("结合 live sandbox readiness");

    expect(
      buildPublishedInvocationFailureMessageDiagnosis({
        message: "sandbox backend offline during invocation",
        reasonCounts: [{ value: "runtime_failed", count: 2 }],
        sandboxReadiness: {
          enabled_backend_count: 0,
          healthy_backend_count: 0,
          degraded_backend_count: 0,
          offline_backend_count: 1,
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
              reason: "No sandbox backend is currently enabled."
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
        }
      })
    ).toEqual({
      headline: "当前 live sandbox readiness 仍在报警。",
      detail: expect.stringContaining("先确认强隔离 backend / capability 是否仍 blocked")
    });
  });

  it("为 invocation detail unavailable 提供共享 surface copy", () => {
    expect(buildPublishedInvocationUnavailableDetailSurfaceCopy()).toEqual({
      title: "Invocation detail unavailable",
      summary: "当前未能拉取该 invocation 的详情 payload。",
      detail: "审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。"
    });
  });

  it("shared callback waiting summary 存在时隐藏顶层 follow-up，但保留 invocation 级摘要", () => {
    expect(
      buildPublishedInvocationCanonicalFollowUpCopy({
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-callback-1：继续观察 callback waiting。"
        },
        sharedCallbackWaitingExplanations: [
          {
            primary_signal: "当前 waiting 节点仍在等待 callback。",
            follow_up: "优先观察定时恢复是否已重新排队。"
          }
        ],
        fallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。"
      })
    ).toEqual({
      headline: "本次影响 1 个 run；已回读 1 个样本。",
      follow_up: null,
      has_shared_callback_waiting_summary: true
    });
  });

  it("shared callback waiting summary 与顶层 primary signal 重复时回退到 generic headline", () => {
    expect(
      buildPublishedInvocationCanonicalFollowUpCopy({
        explanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。",
          follow_up: "run run-callback-1：继续观察 callback waiting。"
        },
        sharedCallbackWaitingExplanations: [
          {
            primary_signal: "当前 waiting 节点仍在等待 callback。",
            follow_up: "优先观察定时恢复是否已重新排队。"
          }
        ],
        fallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。"
      })
    ).toEqual({
      headline: "当前 invocation 已接入 canonical follow-up 事实链。",
      follow_up: null,
      has_shared_callback_waiting_summary: true
    });
  });

  it("callback waiting 优先把下一步指向 blocker inbox", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-callback-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: true
        },
        callbackWaitingFollowUp: "先处理审批票据，再观察 waiting 节点是否恢复。",
        executionFocusFollowUp: "打开 run 看 execution focus。",
        blockingInboxHref: "/sensitive-access/inbox?runId=run-callback-1&nodeRunId=node-run-1",
        approvalInboxHref: "/sensitive-access/inbox?runId=run-callback-1"
      })
    ).toEqual({
      label: "approval blocker",
      detail: "先处理审批票据，再观察 waiting 节点是否恢复。",
      href: "/sensitive-access/inbox?runId=run-callback-1&nodeRunId=node-run-1",
      href_label: "open blocker inbox slice"
    });
  });

  it("把待审批与通知异常视为 publish entry blocker", () => {
    expect(
      hasPublishedInvocationBlockingSensitiveAccessSummary({
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0
      })
    ).toBe(true);

    expect(
      hasPublishedInvocationBlockingSensitiveAccessSummary({
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 0,
        approved_approval_count: 1,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 1,
        failed_notification_count: 0
      })
    ).toBe(false);
  });

  it("没有 callback blocker 时把下一步回收到 execution focus run", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: "优先打开 run 继续检查 focus node。",
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "execution focus",
      detail: "优先打开 run 继续检查 focus node。",
      href: "/runs/run-focus-1",
      href_label: "open run"
    });
  });

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
        run_snapshot: {
          callback_waiting_explanation: {
            primary_signal: "top-level snapshot callback",
            follow_up: " snapshot callback follow-up "
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
      primary_signal: "top-level snapshot callback",
      follow_up: "snapshot callback follow-up"
    });

    expect(
      resolvePublishedInvocationExecutionFocusExplanation({
        id: "invocation-3",
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
        run_snapshot: {
          execution_focus_explanation: {
            primary_signal: " snapshot focus signal ",
            follow_up: " snapshot focus follow-up "
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
          sampled_runs: [
            {
              run_id: "run-3",
              snapshot: {
                execution_focus_explanation: {
                  primary_signal: "sample snapshot focus",
                  follow_up: "sample snapshot follow-up"
                }
              }
            }
          ],
          explanation: null
        }
      })
    ).toEqual({
      primary_signal: "snapshot focus signal",
      follow_up: "snapshot focus follow-up"
    });
  });

  it("在缺少 top-level snapshot 时按当前 run_id 选择 sampled snapshot", () => {
    const item: Parameters<typeof resolvePublishedInvocationExecutionFocusExplanation>[0] = {
      id: "invocation-4",
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
      run_id: "run-primary",
      request_preview: {},
      created_at: "2026-03-19T00:00:00Z",
      run_follow_up: {
        affected_run_count: 2,
        sampled_run_count: 2,
        waiting_run_count: 1,
        running_run_count: 0,
        succeeded_run_count: 1,
        failed_run_count: 0,
        unknown_run_count: 0,
        sampled_runs: [
          {
            run_id: "run-stale",
            snapshot: {
              execution_focus_explanation: {
                primary_signal: "stale focus",
                follow_up: "stale follow-up"
              },
              callback_waiting_explanation: {
                primary_signal: "stale callback",
                follow_up: "stale callback follow-up"
              }
            }
          },
          {
            run_id: "run-primary",
            snapshot: {
              execution_focus_explanation: {
                primary_signal: "primary focus",
                follow_up: "match run id"
              },
              callback_waiting_explanation: {
                primary_signal: "primary callback",
                follow_up: "match callback by run id"
              }
            }
          }
        ],
        explanation: null
      }
    };

    expect(resolvePublishedInvocationExecutionFocusExplanation(item)).toEqual({
      primary_signal: "primary focus",
      follow_up: "match run id"
    });
    expect(resolvePublishedInvocationCallbackWaitingExplanation(item)).toEqual({
      primary_signal: "primary callback",
      follow_up: "match callback by run id"
    });
    expect(resolvePublishedInvocationRunFollowUpSampleView(item)?.run_id).toBe("run-primary");
    expect(resolvePublishedInvocationRunFollowUpSampleView(item)?.explanation).toEqual({
      primary_signal: "primary callback",
      follow_up: "match callback by run id"
    });
  });

  it("把 canonical follow-up 的 sampled runs 转成 publish 侧可直接展示的样本视图", () => {
    const views = listPublishedInvocationRunFollowUpSampleViews({
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
            execution_focus_node_id: "tool_wait",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Tool wait",
            execution_focus_artifact_count: 2,
            execution_focus_artifact_ref_count: 1,
            execution_focus_tool_call_count: 1,
            execution_focus_raw_ref_count: 1,
            callback_waiting_explanation: {
              primary_signal: " sample callback blocker ",
              follow_up: " follow callback chain "
            },
            callback_waiting_lifecycle: {
              wait_cycle_count: 1,
              issued_ticket_count: 1,
              expired_ticket_count: 0,
              consumed_ticket_count: 0,
              canceled_ticket_count: 0,
              late_callback_count: 0,
              resume_schedule_count: 1,
              max_expired_ticket_count: 0,
              terminated: false,
              last_resume_delay_seconds: 45,
              last_resume_source: "callback_ticket_monitor",
              last_resume_backoff_attempt: 0
            },
            scheduled_resume_delay_seconds: 45,
            scheduled_resume_source: "callback_ticket_monitor",
            scheduled_waiting_status: "waiting_callback",
            scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
            scheduled_resume_due_at: "2026-03-20T10:00:45Z",
            scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
            scheduled_resume_requeue_source: "waiting_resume_monitor",
            execution_focus_explanation: {
              primary_signal: "focus fallback",
              follow_up: "focus follow-up"
            },
            execution_focus_tool_calls: [
              {
                tool_name: "callback.wait",
                status: "waiting",
                requested_execution_dependency_mode: "dependency_ref",
                requested_execution_dependency_ref: "bundle://callback/search-v1",
                requested_execution_backend_extensions: {
                  image: "python:3.12",
                  mount: "workspace"
                },
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
    });

    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
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
      has_callback_waiting_summary: true,
      execution_focus_artifact_count: 2,
      execution_focus_artifact_ref_count: 1,
      execution_focus_tool_call_count: 1,
      execution_focus_raw_ref_count: 1,
      skill_reference_count: 2,
      skill_reference_phase_summary: "plan 1, execute 1",
      skill_reference_source_summary: "catalog 2",
      focus_artifact_summary:
        "聚焦节点已沉淀 1 个 artifact（artifact 1）。 至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。",
      run_snapshot: {
        status: "waiting",
        currentNodeId: "tool_wait",
        waitingReason: "callback pending",
        executionFocusNodeId: "tool_wait",
        executionFocusNodeRunId: "node-run-tool-wait",
        executionFocusNodeName: "Tool wait",
        callbackWaitingExplanation: {
          primary_signal: "sample callback blocker",
          follow_up: "follow callback chain"
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
          last_resume_delay_seconds: 45,
          last_resume_source: "callback_ticket_monitor",
          last_resume_backoff_attempt: 0
        },
        scheduledResumeDelaySeconds: 45,
        scheduledResumeSource: "callback_ticket_monitor",
        scheduledWaitingStatus: "waiting_callback",
        scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
        scheduledResumeDueAt: "2026-03-20T10:00:45Z",
        scheduledResumeRequeuedAt: "2026-03-20T10:01:30Z",
        scheduledResumeRequeueSource: "waiting_resume_monitor"
      }
    });
    expect(views[0].focus_tool_call_summaries).toEqual([
      {
        id: "focus-tool-call-0",
        title: "callback.wait · waiting",
        detail: "原始结果已落到 artifact://wait-raw。",
        badges: ["phase n/a", "deps dependency_ref", "raw payload"],
        rawRef: "artifact://wait-raw",
        traceSummary:
          "执行链：deps dependency_ref · dependency ref bundle://callback/search-v1 · extensions image, mount。"
      }
    ]);
    expect(views[0].focus_artifacts).toEqual([
      {
        key: "artifact://wait-artifact",
        artifactKind: "artifact",
        contentType: null,
        summary: "callback payload snapshot",
        uri: "artifact://wait-artifact"
      }
    ]);
    expect(views[0].focus_skill_reference_loads).toEqual([
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
    ]);

    expect(views[1]).toMatchObject({
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
      has_callback_waiting_summary: false,
      execution_focus_artifact_count: 0,
      execution_focus_artifact_ref_count: 0,
      execution_focus_tool_call_count: 0,
      execution_focus_raw_ref_count: 0,
      skill_reference_count: 0,
      skill_reference_phase_summary: null,
      skill_reference_source_summary: null,
      focus_artifact_summary: null,
      run_snapshot: {
        status: "running",
        currentNodeId: "agent_plan",
        callbackWaitingExplanation: null,
        callbackWaitingLifecycle: null,
        scheduledResumeDelaySeconds: null,
        scheduledResumeDueAt: null,
        scheduledResumeRequeuedAt: null
      }
    });
    expect(views[1].focus_tool_call_summaries).toEqual([]);
    expect(views[1].focus_artifacts).toEqual([]);
    expect(views[1].focus_skill_reference_loads).toEqual([]);
  });
});
