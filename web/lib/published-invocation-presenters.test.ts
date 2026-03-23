import { describe, expect, it } from "vitest";

import { buildOperatorFollowUpSurfaceCopy } from "./operator-follow-up-presenters";
import { buildRunDetailExecutionFocusSurfaceCopy } from "./workbench-entry-surfaces";

import {
  buildPublishedInvocationActivityBlockedDetailSurfaceCopy,
  buildPublishedInvocationApiKeyUsageCardSurface,
  buildPublishedInvocationActivityDetailsSurfaceCopy,
  buildPublishedInvocationActivityInsightsSurface,
  buildPublishedInvocationActivityPrimaryFollowUpSurface,
  buildPublishedInvocationActivitySummaryCardSurfaces,
  buildPublishedInvocationActivityInsightsSurfaceCopy,
  buildPublishedInvocationIssueSignalsSurface,
  buildPublishedInvocationActivityTrafficMixSurface,
  buildWorkflowPublishPrimaryFollowUpToneSurface,
  buildWorkflowPublishPrimaryFollowUpSurface,
  buildWorkflowPublishSummaryCardSurfaces,
  buildPublishedCacheInventorySurfaceCopy,
  buildPublishedInvocationCallbackDrilldownSurfaceCopy,
  buildPublishedInvocationCallbackBlockerSurface,
  buildPublishedInvocationCallbackTicketSurface,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationDetailSurfaceCopy,
  buildPublishedInvocationEntryInboxLinkSurface,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationFailureMessageDiagnosis,
  buildPublishedInvocationFailureReasonCardSurface,
  buildPublishedInvocationFailureReasonInsight,
  buildPublishedInvocationRateLimitWindowInsight,
  buildPublishedInvocationSelectedNextStepSurface,
  buildPublishedInvocationSkillTraceSurface,
  buildPublishedInvocationTrafficTimelineBucketSurface,
  buildPublishedInvocationRecommendedNextStep,
  buildPublishedInvocationTrafficTimelineSurfaceCopy,
  buildPublishedInvocationUnavailableDetailSurfaceCopy,
  buildPublishedInvocationWaitingOverview,
  buildPublishedInvocationWaitingCardSurface,
  formatPublishedInvocationApiKeyUsageMix,
  formatPublishedInvocationMetricCounts,
  formatPublishedInvocationOptionalRunStatus,
  formatPublishedInvocationCacheSurfaceMix,
  formatPublishedInvocationFailureReasonLastSeen,
  formatPublishedInvocationMissingToolCatalogEntry,
  formatPublishedInvocationNodeRunLabel,
  formatPublishedInvocationPayloadPreview,
  formatPublishedInvocationRequestKeysSummary,
  formatPublishedInvocationRunStatusMix,
  formatPublishedInvocationSampleReasonLabel,
  formatPublishedInvocationWaitingRuntimeFallback,
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  hasPublishedInvocationBlockingSensitiveAccessSummary,
  listPublishedInvocationActivitySummaryRows,
  listPublishedInvocationActivityWaitingRows,
  listPublishedInvocationApiKeyCountLabels,
  listPublishedInvocationCacheDrilldownRows,
  listPublishedInvocationCanonicalFollowUpChips,
  listPublishedInvocationDetailRunRows,
  listPublishedInvocationEntryMetaRows,
  listPublishedInvocationEntryWaitingRows,
  listPublishedInvocationFacetCountLabels,
  listPublishedInvocationIssueSignalChips,
  listPublishedInvocationRateLimitRows,
  listPublishedInvocationRunFollowUpEvidenceChips,
  listPublishedInvocationRunFollowUpSampleMetaRows,
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
      detailTitle: "Invocation detail",
      closeDetailLabel: "关闭详情",
      openRunLabel: "打开 run",
      runDrilldownTitle: "Run drilldown",
      runLabel: "Run",
      runStatusLabel: "Status",
      currentNodeLabel: "Current node",
      waitingReasonLabel: "Waiting reason",
      waitingNodeRunLabel: "Waiting node run",
      canonicalFollowUpTitle: "Canonical follow-up",
      cacheStatusLabel: "Status",
      cacheKeyLabel: "Cache key",
      sampledRunFocusEvidenceTitle: "Sampled run focus evidence",
      sampledRunReasonCallbackWaitingLabel: "callback waiting",
      sampledRunStatusLabel: "Status",
      sampledRunSkillTraceTitle: "Focused skill trace",
      recommendedNextStepTitle: "Recommended next step",
      liveSandboxReadinessTitle: "Live sandbox readiness",
      injectedReferencesTitle: "Injected references",
      toolGovernanceSummaryTitle: "Execution and sensitivity",
      blockingApprovalTimelineTitle: "Blocking approval timeline",
      canonicalFollowUpDescription: expect.stringContaining("operator follow-up"),
      blockingApprovalTimelineDescription: expect.stringContaining("node-run-blocked"),
      blockingApprovalTimelineInboxLabel: "open blocker inbox slice",
      blockingApprovalTimelineEmptyState: "当前阻塞节点没有关联 sensitive access timeline。",
      approvalTimelineTitle: "Approval timeline",
      approvalTimelineDescription: expect.stringContaining("published-surface debugging"),
      approvalTimelineInboxLabel: "open approval inbox slice",
      approvalTimelineEmptyState: "当前这次 invocation 没有关联 sensitive access timeline。",
      skillTraceDescription: expect.stringContaining("node-run-focus"),
      unavailableValueLabel: "n/a",
      notStartedValueLabel: "not-started"
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
      latestEventsTitle: "Latest callback events",
      ticketTitle: "Callback ticket",
      ticketInboxLinkLabel: "open ticket inbox slice",
      payloadPreviewTitle: "callback payload preview",
      emptyState: "当前这次 invocation 没有关联 callback ticket。"
    });
  });

  it("为 callback blocker 与 ticket 提供共享 surface", () => {
    const callbackInvocation = {
      id: "invocation-callback-1",
      run_id: "run-callback-1",
      run_status: "waiting_callback",
      run_current_node_id: "tool_wait",
      run_waiting_reason: "waiting_callback",
      run_waiting_lifecycle: {
        node_run_id: "node-run-callback-1",
        node_status: "waiting_callback",
        waiting_reason: "waiting_callback",
        scheduled_resume_delay_seconds: 30,
        scheduled_resume_source: "runtime",
        scheduled_waiting_status: "waiting_callback",
        scheduled_resume_scheduled_at: "2026-03-21T00:00:00Z",
        scheduled_resume_due_at: "2026-03-21T00:00:30Z",
        scheduled_resume_requeued_at: null,
        scheduled_resume_requeue_source: null,
        callback_ticket_count: 1,
        callback_ticket_status_counts: { pending: 1 },
        callback_waiting_lifecycle: {
          wait_cycle_count: 1,
          expired_ticket_count: 0,
          late_callback_count: 0,
          last_resume_delay_seconds: 30,
          last_resume_backoff_attempt: 0,
          max_expired_ticket_count: 0,
          last_ticket_status: "pending",
          terminated: false
        }
      }
    } as never;
    const callbackTickets = [
      {
        ticket: "ticket-1",
        status: "pending",
        node_run_id: "node-run-callback-1",
        created_at: "2026-03-21T00:00:00Z",
        updated_at: "2026-03-21T00:01:00Z",
        tool_id: "tool.wait",
        callback_payload: { ok: true }
      }
    ] as never;

    const blockerSurface = buildPublishedInvocationCallbackBlockerSurface({
      invocation: callbackInvocation,
      callbackTickets,
      sensitiveAccessEntries: [],
      callbackWaitingAutomation: null,
      callbackWaitingExplanation: {
        primary_signal: "callback pending",
        follow_up: "inspect callback"
      }
    });
    expect(blockerSurface.title).toBe("Resume blockers");
    expect(blockerSurface.headline).toBe("callback pending");
    expect(blockerSurface.displayHeadline).toBe("callback pending");
    expect(blockerSurface.latestEventsTitle).toBe("Latest callback events");
    expect(blockerSurface.chips).toContain("tickets 1");
    expect(blockerSurface.blockerRows.length).toBeGreaterThan(0);
    expect(blockerSurface.eventRows.length).toBeGreaterThan(0);

    const ticketSurface = buildPublishedInvocationCallbackTicketSurface({
      invocation: callbackInvocation,
      ticket: callbackTickets[0]
    });
    expect(ticketSurface.title).toBe("Callback ticket");
    expect(ticketSurface.inboxHref).toContain("node-run-callback-1");
    expect(ticketSurface.inboxLinkLabel).toBe("open ticket inbox slice");
    expect(ticketSurface.detailRows.length).toBeGreaterThan(0);
    expect(ticketSurface.payloadPreviewTitle).toBe("callback payload preview");
    expect(ticketSurface.payloadPreview).toContain('"ok": true');
  });

  it("为 traffic timeline 提供统一标题、说明与空态", () => {
    expect(
      buildPublishedInvocationTrafficTimelineSurfaceCopy({
        timelineGranularity: "hour",
        timeWindowLabel: "最近 24 小时"
      })
    ).toEqual({
      title: "Traffic timeline",
      description:
        "按小时聚合最近调用，补足 publish activity 的趋势视图，方便判断流量抬升、拒绝峰值和缓存命中变化。当前时间窗：最近 24 小时。",
      emptyState:
        "当前还没有足够的 invocation timeline 数据，后续命中 published endpoint 后这里会显示趋势桶。",
      totalCountLabel: "total",
      succeededCountLabel: "success",
      failedCountLabel: "failed",
      rejectedCountLabel: "rejected",
      apiKeyLabelPrefix: "key"
    });
  });

  it("为 publish entry / detail 提供统一 surface copy", () => {
    expect(buildPublishedInvocationEntrySurfaceCopy()).toEqual({
      waitingOverviewTitle: "Waiting overview",
      canonicalFollowUpTitle: "Canonical follow-up",
      canonicalFollowUpFallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。",
      apiKeyLabel: "API key",
      requestKeysLabel: "Request keys",
      runLabel: "Run",
      runStatusLabel: "Run status",
      currentNodeLabel: "Current node",
      waitingReasonLabel: "Waiting reason",
      callbackTicketsLabel: "Callback tickets",
      scheduledResumeLabel: "Scheduled resume",
      waitingNodeRunLabel: "Node run",
      waitingNodeStatusLabel: "Node status",
      waitingCallbackTicketsLabel: "Callback tickets",
      waitingCallbackLifecycleLabel: "Callback lifecycle",
      canonicalFollowUpAffectedRunsLabel: "Affected runs",
      canonicalFollowUpSampledRunsLabel: "Sampled runs",
      canonicalFollowUpStatusSummaryLabel: "Status summary",
      canonicalFollowUpSampleFocusLabel: "Sample focus",
      canonicalFollowUpAffectedRunsChipPrefix: "affected",
      canonicalFollowUpSampledRunsChipPrefix: "sampled",
      canonicalFollowUpStatusChipPrefix: "status",
      liveSandboxReadinessTitle: "Live sandbox readiness",
      sampledRunFocusEvidenceTitle: "Sampled run focus evidence",
      sampledRunSkillTraceTitle: "Focused skill trace",
      sampledRunSkillTraceDescription: expect.stringContaining("compact snapshot"),
      recommendedNextStepTitle: "Recommended next step",
      callbackLifecycleFallback: "tracked in detail panel",
      succeededDescription: expect.stringContaining("publish 调用链"),
      detailActionLabel: "打开 invocation detail",
      detailActionActiveLabel: "查看当前详情",
      errorMessagePrefix: "error",
      detailPanelDescription: expect.stringContaining("callback lifecycle / cache"),
      unavailableValueLabel: "n/a",
      notStartedValueLabel: "not-started",
      emptyCountValueLabel: "0"
    });
  });

  it("复用共享 operator follow-up surface labels，避免 publish 入口 copy 再次分叉", () => {
    const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
    const detailSurfaceCopy = buildPublishedInvocationDetailSurfaceCopy();
    const entrySurfaceCopy = buildPublishedInvocationEntrySurfaceCopy();
    const callbackDrilldownSurfaceCopy = buildPublishedInvocationCallbackDrilldownSurfaceCopy();

    expect(detailSurfaceCopy.sampledRunSkillTraceTitle).toBe(
      operatorSurfaceCopy.focusedSkillTraceTitle
    );
    expect(detailSurfaceCopy.recommendedNextStepTitle).toBe(
      operatorSurfaceCopy.recommendedNextStepTitle
    );
    expect(detailSurfaceCopy.injectedReferencesTitle).toBe(
      operatorSurfaceCopy.injectedReferencesTitle
    );
    expect(entrySurfaceCopy.sampledRunSkillTraceTitle).toBe(
      operatorSurfaceCopy.focusedSkillTraceTitle
    );
    expect(entrySurfaceCopy.recommendedNextStepTitle).toBe(
      operatorSurfaceCopy.recommendedNextStepTitle
    );
    expect(callbackDrilldownSurfaceCopy.inboxLinkLabel).toBe(
      operatorSurfaceCopy.openInboxSliceLabel
    );
  });

  it("为 publish activity details 提供共享卡片 surface", () => {
    expect(
      buildPublishedInvocationApiKeyUsageCardSurface({
        item: {
          api_key_id: "key-1",
          name: null,
          key_prefix: null,
          status: null,
          invocation_count: 3,
          succeeded_count: 1,
          failed_count: 1,
          rejected_count: 1,
          last_invoked_at: "2026-03-21T00:16:00Z",
          last_status: null
        } as never
      })
    ).toEqual({
      title: "key-1",
      chipLabel: "no-prefix",
      rows: [
        { key: "calls", label: "Calls", value: "3", href: null },
        { key: "status-mix", label: "Status mix", value: "ok 1 / failed 1 / rejected 1", href: null },
        { key: "status", label: "Status", value: "n/a", href: null },
        { key: "last-used", label: "Last used", value: expect.any(String), href: null }
      ],
      selectedNextStepSurface: null
    });

    const selectedApiKeyNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "先处理审批票据。",
        href: "/sensitive-access/inbox?run_id=run-1",
        href_label: "open blocker inbox slice"
      }
    });

    expect(
      buildPublishedInvocationApiKeyUsageCardSurface({
        item: {
          api_key_id: "key-1",
          name: "Primary Key",
          key_prefix: "sk-live",
          status: "active",
          invocation_count: 3,
          succeeded_count: 1,
          failed_count: 1,
          rejected_count: 1,
          last_invoked_at: "2026-03-21T00:16:00Z",
          last_status: "failed"
        } as never,
        selectedInvocation: {
          api_key_id: "key-1",
          reason_code: "api_key_invalid",
          error_message: "Caller API key is invalid."
        } as never,
        selectedInvocationNextStepSurface: selectedApiKeyNextStepSurface
      }).selectedNextStepSurface
    ).toEqual(selectedApiKeyNextStepSurface);

    expect(
      buildPublishedInvocationApiKeyUsageCardSurface({
        item: {
          api_key_id: "key-1",
          name: "Primary Key",
          key_prefix: "sk-live",
          status: "active",
          invocation_count: 3,
          succeeded_count: 1,
          failed_count: 1,
          rejected_count: 1,
          last_invoked_at: "2026-03-21T00:16:00Z",
          last_status: "failed"
        } as never,
        selectedInvocation: {
          api_key_id: "key-1",
          reason_code: "runtime_failed",
          error_message: "Sandbox backend offline during invocation."
        } as never,
        selectedInvocationNextStepSurface: selectedApiKeyNextStepSurface
      }).selectedNextStepSurface
    ).toBeNull();

    expect(
      buildPublishedInvocationFailureReasonCardSurface({
        item: {
          message: "sandbox backend offline during invocation",
          count: 2,
          last_invoked_at: "2026-03-21T00:15:00Z"
        },
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
    ).toMatchObject({
      title: "Failure reason",
      countLabel: "count 2",
      message: "sandbox backend offline during invocation",
      diagnosis: {
        headline: "当前 live sandbox readiness 仍在报警。",
        detail: expect.stringContaining("blocked")
      },
      lastSeenLabel: expect.any(String)
    });

    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "先处理审批票据。",
        href: "/sensitive-access/inbox?run_id=run-1",
        href_label: "open blocker inbox slice"
      }
    });

    expect(selectedNextStepSurface).toEqual({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "approval blocker",
      detail: "先处理审批票据。",
      href: "/sensitive-access/inbox?run_id=run-1",
      hrefLabel: "open blocker inbox slice"
    });

    expect(
      buildPublishedInvocationFailureReasonCardSurface({
        item: {
          message: "sandbox backend offline during invocation",
          count: 2,
          last_invoked_at: "2026-03-21T00:15:00Z"
        },
        reasonCounts: [{ value: "runtime_failed", count: 2 }],
        selectedInvocationErrorMessage: "  Sandbox backend offline during invocation  ",
        selectedInvocationNextStepSurface: selectedNextStepSurface
      })
    ).toMatchObject({
      diagnosis: {
        headline: "当前打开的 invocation-1 已对齐这条 failure reason。",
        detail:
          "下面直接复用 selected invocation 的 canonical next step，避免继续只靠 failure message 推断动作。"
      },
      selectedNextStepSurface
    });

    expect(
      buildPublishedInvocationFailureReasonCardSurface({
        item: {
          message: "sandbox backend offline during invocation",
          count: 2,
          last_invoked_at: "2026-03-21T00:15:00Z"
        },
        reasonCounts: [{ value: "runtime_failed", count: 2 }],
        selectedInvocationErrorMessage: "different failure message",
        selectedInvocationNextStepSurface: selectedNextStepSurface
      }).selectedNextStepSurface
    ).toBeNull();
  });

  it("为 sampled run 来源提供统一 surface label", () => {
    expect(formatPublishedInvocationSampleReasonLabel("callback_waiting")).toBe("callback waiting");
    expect(formatPublishedInvocationSampleReasonLabel("execution_focus")).toBe("execution focus");
    expect(formatPublishedInvocationSampleReasonLabel(null)).toBe("run snapshot");

    const detailSurfaceCopy = {
      ...buildPublishedInvocationDetailSurfaceCopy(),
      sampledRunReasonCallbackWaitingLabel: "callback queue",
      sampledRunReasonExecutionFocusLabel: "focus trace",
      sampledRunReasonFallbackLabel: "snapshot source"
    };

    expect(formatPublishedInvocationSampleReasonLabel("callback_waiting", detailSurfaceCopy)).toBe(
      "callback queue"
    );
    expect(formatPublishedInvocationSampleReasonLabel("execution_focus", detailSurfaceCopy)).toBe(
      "focus trace"
    );
    expect(formatPublishedInvocationSampleReasonLabel(null, detailSurfaceCopy)).toBe(
      "snapshot source"
    );
  });

  it("统一 publish entry 的 inbox CTA 语义", () => {
    expect(
      buildPublishedInvocationEntryInboxLinkSurface({
        blockingInboxHref: "/sensitive-access/inbox?run_id=run-1&node_run_id=node-run-1",
        waitingInboxHref: "/sensitive-access/inbox?run_id=run-1"
      })
    ).toEqual({
      href: "/sensitive-access/inbox?run_id=run-1&node_run_id=node-run-1",
      label: "open blocker inbox slice"
    });

    expect(
      buildPublishedInvocationEntryInboxLinkSurface({
        blockingInboxHref: null,
        waitingInboxHref: "/sensitive-access/inbox?run_id=run-1"
      })
    ).toEqual({
      href: "/sensitive-access/inbox?run_id=run-1",
      label: "open waiting inbox"
    });

    expect(
      buildPublishedInvocationEntryInboxLinkSurface({
        blockingInboxHref: null,
        waitingInboxHref: null
      })
    ).toBeNull();
  });

  it("为 publish entry/detail 统一拼装 meta rows 与 follow-up chips", () => {
    const entrySurfaceCopy = {
      ...buildPublishedInvocationEntrySurfaceCopy(),
      apiKeyLabel: "Caller key",
      requestKeysLabel: "Input keys",
      runLabel: "Run link",
      currentNodeLabel: "Focus node",
      callbackTicketsLabel: "Resume tickets",
      scheduledResumeLabel: "Resume ETA",
      canonicalFollowUpAffectedRunsChipPrefix: "affected-runs",
      canonicalFollowUpSampledRunsChipPrefix: "sampled-runs",
      canonicalFollowUpStatusChipPrefix: "status-mix"
    };
    const detailSurfaceCopy = {
      ...buildPublishedInvocationDetailSurfaceCopy(),
      runLabel: "Run link",
      currentNodeLabel: "Focus node",
      cacheKeyLabel: "Cache fingerprint",
      cacheEntryLabel: "Inventory entry",
      sampledRunStatusLabel: "Sample status",
      sampledRunCurrentNodeLabel: "Sample node",
      sampledRunWaitingReasonLabel: "Sample wait"
    };

    expect(
      listPublishedInvocationEntryMetaRows({
        invocation: {
          api_key_name: null,
          api_key_prefix: "sk-test",
          request_preview: { keys: ["query"] },
          run_id: "  run-1  ",
          run_waiting_lifecycle: {
            callback_ticket_count: 2,
            callback_ticket_status_counts: { pending: 1, approved: 1 }
          }
        } as never,
        runStatus: "waiting_callback",
        currentNodeId: "tool_wait",
        waitingReason: "callback pending",
        scheduledResumeLabel: "45s later",
        surfaceCopy: entrySurfaceCopy
      })
    ).toEqual([
      { key: "api-key", label: "Caller key", value: "sk-test", href: null },
      { key: "request-keys", label: "Input keys", value: "query", href: null },
      { key: "run", label: "Run link", value: "run-1", href: "/runs/run-1" },
      { key: "run-status", label: "Run status", value: "Waiting callback", href: null },
      { key: "current-node", label: "Focus node", value: "tool_wait", href: null },
      { key: "waiting-reason", label: "Waiting reason", value: "callback pending", href: null },
      {
        key: "callback-tickets",
        label: "Resume tickets",
        value: "2 · pending 1 · approved 1",
        href: null
      },
      { key: "scheduled-resume", label: "Resume ETA", value: "45s later", href: null }
    ]);

    expect(
      listPublishedInvocationDetailRunRows({
        runId: "  run-1  ",
        runStatus: "waiting",
        currentNodeId: "tool_wait",
        waitingReason: "callback pending",
        waitingNodeRunId: "node-run-1",
        startedAt: "2026-03-20T10:00:00Z",
        finishedAt: null,
        surfaceCopy: detailSurfaceCopy
      })
    ).toEqual(
      expect.arrayContaining([
        { key: "run", label: "Run link", value: "run-1", href: "/runs/run-1" },
        { key: "status", label: "Status", value: "waiting", href: null },
        { key: "current-node", label: "Focus node", value: "tool_wait", href: null },
        { key: "waiting-reason", label: "Waiting reason", value: "callback pending", href: null },
        { key: "waiting-node-run", label: "Waiting node run", value: "node-run-1", href: null }
      ])
    );

    expect(
      listPublishedInvocationEntryMetaRows({
        invocation: {
          api_key_name: null,
          api_key_prefix: "sk-test",
          request_preview: { keys: [] },
          run_id: "   ",
          run_waiting_lifecycle: null
        } as never,
        runStatus: null,
        currentNodeId: null,
        waitingReason: null,
        scheduledResumeLabel: entrySurfaceCopy.unavailableValueLabel,
        surfaceCopy: entrySurfaceCopy
      })[2]
    ).toEqual({
      key: "run",
      label: "Run link",
      value: entrySurfaceCopy.notStartedValueLabel,
      href: null
    });

    expect(
      listPublishedInvocationDetailRunRows({
        runId: "   ",
        runStatus: null,
        currentNodeId: null,
        waitingReason: null,
        waitingNodeRunId: null,
        startedAt: null,
        finishedAt: null,
        surfaceCopy: detailSurfaceCopy
      })[0]
    ).toEqual({
      key: "run",
      label: "Run link",
      value: detailSurfaceCopy.notStartedValueLabel,
      href: null
    });

    expect(
      listPublishedInvocationCacheDrilldownRows({
        cache: {
          cache_status: "miss",
          cache_key: "cache-key-1",
          cache_entry_id: "entry-1",
          inventory_entry: {
            hit_count: 3,
            last_hit_at: "2026-03-20T10:01:00Z",
            expires_at: null
          }
        },
        surfaceCopy: detailSurfaceCopy
      } as never)
    ).toEqual(
      expect.arrayContaining([
        { key: "status", label: "Status", value: "miss", href: null },
        { key: "cache-key", label: "Cache fingerprint", value: "cache-key-1", href: null },
        { key: "entry", label: "Inventory entry", value: "entry-1", href: null },
        { key: "entry-hits", label: "Entry hits", value: "3", href: null }
      ])
    );

    expect(
      listPublishedInvocationCanonicalFollowUpChips({
        affectedRunCount: 2,
        sampledRunCount: 1,
        statusSummary: "waiting 1 · failed 1",
        surfaceCopy: entrySurfaceCopy
      })
    ).toEqual([
      "affected-runs 2",
      "sampled-runs 1",
      "status-mix waiting 1 · failed 1"
    ]);

    expect(formatPublishedInvocationMetricCounts({ pending: 1, approved: 1, failed: 0 })).toBe(
      "pending 1 · approved 1"
    );
    expect(formatPublishedInvocationRequestKeysSummary(["query", "messages"])).toBe(
      "request keys: query, messages"
    );
  });

  it("为 publish entry waiting overview 统一拼装 meta rows", () => {
    const entrySurfaceCopy = {
      ...buildPublishedInvocationEntrySurfaceCopy(),
      waitingNodeRunLabel: "Blocking node",
      waitingNodeStatusLabel: "Blocking state",
      waitingCallbackTicketsLabel: "Resume tickets",
      waitingCallbackLifecycleLabel: "Lifecycle lane"
    };

    expect(
      listPublishedInvocationEntryWaitingRows({
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback",
        callbackTicketCount: 2,
        callbackTicketStatusCounts: { pending: 1, approved: 1 },
        callbackLifecycleLabel: "pending -> delivered",
        callbackLifecycleFallback: "tracked in detail panel",
        surfaceCopy: entrySurfaceCopy
      })
    ).toEqual([
      { key: "node-run", label: "Blocking node", value: "node-run-1", href: null },
      { key: "node-status", label: "Blocking state", value: "waiting_callback", href: null },
      {
        key: "callback-tickets",
        label: "Resume tickets",
        value: "2 · pending 1 · approved 1",
        href: null
      },
      {
        key: "callback-lifecycle",
        label: "Lifecycle lane",
        value: "pending -> delivered",
        href: null
      }
    ]);
  });

  it("为 sampled run 统一拼装 evidence badges 与 sample meta rows", () => {
    const detailSurfaceCopy = {
      ...buildPublishedInvocationDetailSurfaceCopy(),
      sampledRunStatusLabel: "Sample status",
      sampledRunCurrentNodeLabel: "Sample node",
      sampledRunWaitingReasonLabel: "Sample wait"
    };

    const sample = listPublishedInvocationRunFollowUpSampleViews({
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      explanation: null,
      sampled_runs: [
        {
          run_id: "run-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            execution_focus_artifact_count: 2,
            execution_focus_artifact_ref_count: 1,
            execution_focus_tool_call_count: 3,
            execution_focus_raw_ref_count: 1,
            execution_focus_skill_trace: {
              reference_count: 4,
              loads: []
            },
            execution_focus_skill_reference_phase_summary: "plan×2",
            execution_focus_skill_reference_source_summary: "catalog×1"
          }
        }
      ]
    } as never)[0];

    expect(listPublishedInvocationRunFollowUpEvidenceChips(sample)).toEqual([
      "artifacts 2",
      "artifact refs 1",
      "tool calls 3",
      "raw refs 1",
      "skill refs 4"
    ]);
    expect(listPublishedInvocationRunFollowUpSampleMetaRows(sample, detailSurfaceCopy)).toEqual([
      { key: "status", label: "Sample status", value: "waiting", href: null },
      { key: "current-node", label: "Sample node", value: "tool_wait", href: null },
      { key: "waiting-reason", label: "Sample wait", value: "callback pending", href: null }
    ]);
  });

  it("为 publish activity insights 提供统一辅助文案", () => {
    expect(
      buildPublishedInvocationActivityInsightsSurfaceCopy({
        rateLimitWindowStartedAt: "2026-03-21T00:00:00Z"
      })
    ).toMatchObject({
      totalCallsLabel: "Total calls",
      succeededCallsLabel: "Succeeded",
      failedCallsLabel: "Failed",
      rejectedCallsLabel: "Rejected",
      lastRunStatusLabel: "Last run status",
      lastRunStatusEmptyLabel: "n/a",
      waitingNowLabel: "Waiting now",
      trafficMixTitle: "Traffic mix",
      trafficWorkflowLabel: "Workflow",
      trafficAliasLabel: "Alias",
      trafficPathLabel: "Path",
      trafficCacheSurfaceLabel: "Cache surface",
      trafficRunStatesLabel: "Run states",
      trafficRunStatesEmptyLabel: "n/a",
      waitingFollowUpTitle: "Waiting follow-up",
      activeWaitingLabel: "Active waiting",
      callbackWaitsLabel: "Callback waits",
      approvalInputWaitsLabel: "Approval/input waits",
      genericWaitsLabel: "Generic waits",
      syncWaitingRejectedLabel: "Sync waiting rejected",
      latestRunStatusLabel: "Latest run status",
      latestRunStatusEmptyLabel: "n/a",
      rateLimitWindowTitle: "Rate limit window",
      rateLimitPolicyLabel: "Policy",
      rateLimitUsedLabel: "Used",
      rateLimitRemainingLabel: "Remaining",
      rateLimitPressureLabel: "Pressure",
      rateLimitRejectedLabel: "Rejected",
      rateLimitWindowDescription: expect.stringContaining("当前窗口从"),
      rateLimitDisabledEmptyState: "当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。",
      issueSignalsTitle: "Issue signals",
      issueSignalsDescription:
        "将 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。"
    });
    expect(
      buildPublishedInvocationActivityInsightsSurfaceCopy({
        rateLimitWindowStartedAt: "2026-03-21T00:00:00Z"
      }).rateLimitWindowDescription
    ).toContain("`rejected` 仅作为治理信号，不占配额");

    expect(buildPublishedInvocationActivityInsightsSurfaceCopy().rateLimitWindowDescription).toContain(
      "当前窗口按当前筛选时间窗统计成功和失败调用"
    );
  });

  it("为 publish activity issue signals 与 detail skill trace 提供共享视图模型", () => {
    expect(
      listPublishedInvocationIssueSignalChips([
        { value: "runtime_failed", count: 2 },
        { value: "rate_limit_exceeded", count: 1 }
      ])
    ).toEqual(["Runtime failed 2", "Rate limit exceeded 1"]);

    expect(formatPublishedInvocationNodeRunLabel("node-run-1")).toBe("node run node-run-1");
    expect(formatPublishedInvocationMissingToolCatalogEntry("tool-missing")).toBe(
      "missing catalog entry tool-missing"
    );
    expect(
      buildPublishedInvocationIssueSignalsSurface({
        reasonCounts: [
          { value: "runtime_failed", count: 2 },
          { value: "rate_limit_exceeded", count: 1 }
        ],
        failureReasons: [
          {
            message: "sandbox backend offline",
            count: 2,
            last_invoked_at: "2026-03-21T00:00:00Z"
          }
        ],
        sandboxReadiness: null
      })
    ).toMatchObject({
      title: "Issue signals",
      description: "将 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。",
      chips: ["Runtime failed 2", "Rate limit exceeded 1"],
      selectedNextStepSurface: null
    });

    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "先处理 blocker inbox，再观察 waiting 节点是否恢复。",
        href: "/sensitive-access/inbox?run_id=run-selected-1",
        href_label: "open blocker inbox slice"
      }
    });

    const bridgedIssueSignalsSurface = buildPublishedInvocationIssueSignalsSurface({
      reasonCounts: [
        { value: "runtime_failed", count: 2 },
        { value: "rate_limit_exceeded", count: 1 }
      ],
      failureReasons: [
        {
          message: "sandbox backend offline",
          count: 2,
          last_invoked_at: "2026-03-21T00:00:00Z"
        }
      ],
      selectedInvocationErrorMessage: " Sandbox backend offline ",
      selectedInvocationNextStepSurface: selectedNextStepSurface,
      sandboxReadiness: null
    });

    expect(bridgedIssueSignalsSurface?.selectedNextStepSurface).toEqual(selectedNextStepSurface);
    expect(bridgedIssueSignalsSurface?.insight).toContain("invocation-1");
    expect(bridgedIssueSignalsSurface?.followUpHref).toBeUndefined();

    const bridgedFromSecondaryFailureReason = buildPublishedInvocationIssueSignalsSurface({
      reasonCounts: [
        { value: "runtime_failed", count: 2 },
        { value: "rate_limit_exceeded", count: 1 }
      ],
      failureReasons: [
        {
          message: "quota hit before runtime failed",
          count: 1,
          last_invoked_at: "2026-03-21T00:20:00Z"
        },
        {
          message: "sandbox backend offline",
          count: 2,
          last_invoked_at: "2026-03-21T00:00:00Z"
        }
      ],
      selectedInvocationErrorMessage: " Sandbox backend offline ",
      selectedInvocationNextStepSurface: selectedNextStepSurface,
      sandboxReadiness: null
    });

    expect(bridgedFromSecondaryFailureReason?.selectedNextStepSurface).toEqual(selectedNextStepSurface);
    expect(bridgedFromSecondaryFailureReason?.insight).toContain("聚合 failure reason");
    expect(bridgedFromSecondaryFailureReason?.followUpHref).toBeUndefined();

    expect(
      buildPublishedInvocationSkillTraceSurface({
        scope: "execution_focus_node",
        reference_count: 2,
        phase_counts: {
          plan: 1,
          execute: 1
        },
        source_counts: {
          explicit: 2
        },
        nodes: [
          {
            node_run_id: "node-run-1",
            node_id: "node-1",
            node_name: "Skill node",
            reference_count: 2,
            loads: []
          }
        ]
      })
    ).toEqual({
      summaryChips: ["refs 2", "phases plan 1 · execute 1", "sources explicit 2"],
      nodes: [
        {
          key: "node-run-1",
          title: "Skill node",
          countChip: "refs 2",
          summary: "node run node-run-1 · node node-1",
          loads: []
        }
      ]
    });
  });

  it("在 sync waiting issue signals 里复用 approval/notification backlog CTA", () => {
    expect(
      buildPublishedInvocationIssueSignalsSurface({
        summary: {
          approval_ticket_count: 0,
          pending_approval_count: 0,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 1
        },
        reasonCounts: [{ value: "sync_waiting_unsupported", count: 1 }],
        runStatusCounts: [{ value: "waiting_input", count: 1 }],
        failureReasons: [
          {
            message: "approval pending cannot stay on sync publish surface",
            count: 1,
            last_invoked_at: "2026-03-21T00:00:00Z"
          }
        ]
      })
    ).toMatchObject({
      chips: ["Sync waiting not supported 1"],
      insight: expect.stringContaining("1 failed notification"),
      followUpHref: "/sensitive-access?notification_status=failed",
      followUpHrefLabel: "open approval inbox slice"
    });
  });

  it("为 publish activity insights 统一拼装 summary / waiting / rate-limit rows", () => {
    const surfaceCopy = buildPublishedInvocationActivityInsightsSurfaceCopy();
    const waitingOverview = {
      activeWaitingCount: 3,
      callbackWaitingCount: 1,
      waitingInputCount: 1,
      generalWaitingCount: 1,
      syncWaitingRejectedCount: 2,
      lastRunStatusLabel: "waiting_callback",
      headline: "headline",
      detail: "detail",
      chips: ["chip"]
    };

    expect(
      listPublishedInvocationActivitySummaryRows({
        summary: {
          total_count: 10,
          succeeded_count: 6,
          failed_count: 2,
          rejected_count: 2,
          cache_hit_count: 4,
          cache_miss_count: 5,
          cache_bypass_count: 1,
          last_run_status: "waiting_callback"
        },
        waitingOverview,
        surfaceCopy
      })
    ).toEqual([
      { key: "total-calls", label: "Total calls", value: "10", href: null },
      { key: "succeeded-calls", label: "Succeeded", value: "6", href: null },
      { key: "failed-calls", label: "Failed", value: "2", href: null },
      { key: "rejected-calls", label: "Rejected", value: "2", href: null },
      { key: "last-run-status", label: "Last run status", value: "Waiting callback", href: null },
      { key: "waiting-now", label: "Waiting now", value: "3", href: null }
    ]);

    expect(
      listPublishedInvocationActivityWaitingRows({
        waitingOverview,
        surfaceCopy
      })
    ).toEqual([
      { key: "active-waiting", label: "Active waiting", value: "3", href: null },
      { key: "callback-waits", label: "Callback waits", value: "1", href: null },
      { key: "approval-input-waits", label: "Approval/input waits", value: "1", href: null },
      { key: "generic-waits", label: "Generic waits", value: "1", href: null },
      { key: "sync-waiting-rejected", label: "Sync waiting rejected", value: "2", href: null },
      {
        key: "latest-run-status",
        label: "Latest run status",
        value: "waiting_callback",
        href: null
      }
    ]);

    expect(
      listPublishedInvocationRateLimitRows({
        rateLimitPolicy: { requests: 20, windowSeconds: 60 },
        windowUsed: 12,
        remainingQuota: 8,
        pressureLabel: "60%",
        windowRejected: 3,
        surfaceCopy
      })
    ).toEqual([
      { key: "rate-limit-policy", label: "Policy", value: "20 / 60s", href: null },
      { key: "rate-limit-used", label: "Used", value: "12", href: null },
      { key: "rate-limit-remaining", label: "Remaining", value: "8", href: null },
      { key: "rate-limit-pressure", label: "Pressure", value: "60%", href: null },
      { key: "rate-limit-rejected", label: "Rejected", value: "3", href: null }
    ]);
  });

  it("为 publish activity summary focus 提供 shared follow-up contract", () => {
    const surfaceCopy = buildPublishedInvocationActivityInsightsSurfaceCopy();
    const waitingOverview = {
      activeWaitingCount: 0,
      callbackWaitingCount: 0,
      waitingInputCount: 0,
      generalWaitingCount: 0,
      syncWaitingRejectedCount: 0,
      lastRunStatusLabel: "failed",
      headline: "Current publish traffic does not show active waiting pressure.",
      detail: "The current audit slice has no waiting runs or synchronous waiting rejections to triage.",
      chips: []
    };
    const trafficMixSurface = buildPublishedInvocationActivityTrafficMixSurface({
      requestSourceCounts: [
        { value: "workflow", count: 3 },
        { value: "alias", count: 1 }
      ],
      requestSurfaceCounts: [
        { value: "openai.responses", count: 3 },
        { value: "native.workflow", count: 1 }
      ],
      cacheStatusCounts: [{ value: "hit", count: 2 }],
      runStatusCounts: [{ value: "failed", count: 1 }],
      runStatesEmptyLabel: "n/a"
    });

    const rateLimitPrimaryFollowUp = buildPublishedInvocationActivityPrimaryFollowUpSurface({
      waitingOverview,
      issueSignalsSurface: null,
      trafficMixSurface,
      rateLimitWindowInsight:
        "当前最近 24 小时切片里已用掉 90% 配额，只剩 1 次；继续放量前先观察是否开始转成 rate_limit_exceeded。",
      rateLimitPressure: { percentage: 90, label: "90%" },
      rateLimitWindowRejectedCount: 0
    });

    expect(rateLimitPrimaryFollowUp).toEqual({
      tone: "attention",
      headline: "Rate limit pressure is the main aggregate to watch in this publish slice.",
      detail:
        "当前最近 24 小时切片里已用掉 90% 配额，只剩 1 次；继续放量前先观察是否开始转成 rate_limit_exceeded。",
      href: null,
      hrefLabel: null
    });

    expect(
      buildPublishedInvocationActivitySummaryCardSurfaces({
        summary: {
          total_count: 4,
          succeeded_count: 1,
          failed_count: 2,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "failed"
        },
        waitingOverview,
        primaryFollowUp: rateLimitPrimaryFollowUp,
        surfaceCopy
      }).at(-1)
    ).toEqual({
      key: "summary-focus",
      label: "Summary focus",
      value: "attention",
      detail:
        "Rate limit pressure is the main aggregate to watch in this publish slice. 当前最近 24 小时切片里已用掉 90% 配额，只剩 1 次；继续放量前先观察是否开始转成 rate_limit_exceeded。",
      href: null,
      hrefLabel: null
    });
  });

  it("让 publish summary focus 卡片保留 attention headline 与 detail", () => {
    const summaryFocusCard = buildWorkflowPublishSummaryCardSurfaces({
      bindings: [
        {
          lifecycle_status: "published",
          activity: {
            rejected_count: 2
          },
          cache_inventory: {
            enabled: false,
            active_entry_count: 0
          }
        }
      ] as Parameters<typeof buildWorkflowPublishSummaryCardSurfaces>[0]["bindings"],
      primaryFollowUp: {
        tone: "attention",
        headline: "Sensitive access approvals remain the primary publish backlog.",
        detail:
          "2 pending approval tickets still need operator action before binding-level failures become the main diagnosis.",
        href: "/sensitive-access?status=pending",
        hrefLabel: "Open approval inbox slice"
      }
    }).at(-1);

    expect(summaryFocusCard).toEqual({
      key: "summary-focus",
      label: "Summary focus",
      value: "attention",
      detail:
        "Sensitive access approvals remain the primary publish backlog. 2 pending approval tickets still need operator action before binding-level failures become the main diagnosis.",
      href: "/sensitive-access?status=pending",
      hrefLabel: "Open approval inbox slice"
    });
  });

  it("把 publish summary follow-up tone 统一投影成 badge surface", () => {
    expect(buildWorkflowPublishPrimaryFollowUpToneSurface("healthy")).toEqual({
      toneClassName: "healthy",
      label: "clear"
    });
    expect(buildWorkflowPublishPrimaryFollowUpToneSurface("attention")).toEqual({
      toneClassName: "pending",
      label: "attention"
    });
  });

  it("在没有 live published endpoint 时把 lifecycle action 提升为 publish summary follow-up", () => {
    expect(
      buildWorkflowPublishPrimaryFollowUpSurface([
        {
          lifecycle_status: "draft",
          activity: {
            total_count: 0,
            succeeded_count: 0,
            failed_count: 0,
            rejected_count: 0,
            cache_hit_count: 0,
            cache_miss_count: 0,
            cache_bypass_count: 0
          }
        },
        {
          lifecycle_status: "offline",
          activity: {
            total_count: 0,
            succeeded_count: 0,
            failed_count: 0,
            rejected_count: 0,
            cache_hit_count: 0,
            cache_miss_count: 0,
            cache_bypass_count: 0
          }
        }
      ])
    ).toEqual({
      tone: "attention",
      headline: "No live published endpoint is active in this publish slice.",
      detail:
        "1 draft binding still needs an initial publish action. 1 offline binding needs to be re-enabled before this workflow exposes a live endpoint again. Continue from the binding cards below to publish or re-enable an endpoint before treating this summary as operationally clear.",
      href: null,
      hrefLabel: null
    });
  });

  it("在 workflow 尚未配置 publish bindings 时不再把 publish summary 说成 clear", () => {
    expect(buildWorkflowPublishPrimaryFollowUpSurface([])).toEqual({
      tone: "attention",
      headline: "No publish bindings are configured for this workflow yet.",
      detail:
        "Add a publish binding before expecting live endpoint traffic, lifecycle actions or invocation backlog in this summary.",
      href: null,
      hrefLabel: null
    });
  });

  it("让 publish summary focus 在没有 bindings 时自动保持 attention", () => {
    expect(
      buildWorkflowPublishSummaryCardSurfaces({
        bindings: []
      }).at(-1)
    ).toEqual({
      key: "summary-focus",
      label: "Summary focus",
      value: "attention",
      detail:
        "No publish bindings are configured for this workflow yet. Add a publish binding before expecting live endpoint traffic, lifecycle actions or invocation backlog in this summary.",
      href: null,
      hrefLabel: null
    });
  });

  it("为 publish activity traffic mix 提供共享 cache/run-state 摘要", () => {
    expect(
      formatPublishedInvocationCacheSurfaceMix([
        { value: "hit", count: 2 },
        { value: "miss", count: 1 },
        { value: "bypass", count: 0 }
      ])
    ).toBe("Cache hit 2 / Cache miss 1 / Cache bypass 0");

    expect(
      formatPublishedInvocationRunStatusMix(
        [
          { value: "failed", count: 2 },
          { value: "waiting_callback", count: 1 }
        ],
        "n/a"
      )
    ).toBe("Run failed 2 / Waiting callback 1");

    expect(formatPublishedInvocationRunStatusMix([], "n/a")).toBe("n/a");
  });

  it("为 publish activity traffic mix 提供共享 view model", () => {
    expect(
      buildPublishedInvocationActivityTrafficMixSurface({
        requestSourceCounts: [
          { value: "workflow", count: 3 },
          { value: "alias", count: 1 },
          { value: "path", count: 2 }
        ],
        requestSurfaceCounts: [
          { value: "openai.responses", count: 2 },
          { value: "native.workflow", count: 1 }
        ],
        cacheStatusCounts: [
          { value: "hit", count: 2 },
          { value: "miss", count: 1 }
        ],
        runStatusCounts: [
          { value: "failed", count: 2 },
          { value: "waiting_callback", count: 1 }
        ],
        runStatesEmptyLabel: "n/a"
      })
    ).toEqual({
      workflowCount: 3,
      aliasCount: 1,
      pathCount: 2,
      cacheSurfaceSummary: "Cache hit 2 / Cache miss 1 / Cache bypass 0",
      runStatesSummary: "Run failed 2 / Waiting callback 1",
      requestSurfaceLabels: ["OpenAI responses 2", "Native workflow route 1"]
    });
  });

  it("把 publish activity 聚合卡片收口成统一 insights surface", () => {
    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "先处理 blocker inbox，再观察 waiting 节点是否恢复。",
        href: "/sensitive-access/inbox?run_id=run-selected-1",
        href_label: "open blocker inbox slice"
      }
    });

    const surface = buildPublishedInvocationActivityInsightsSurface({
      invocationAudit: {
        filters: {},
        summary: {
          total_count: 4,
          succeeded_count: 1,
          failed_count: 2,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_invoked_at: "2026-03-21T00:15:00Z",
          last_status: "failed",
          last_cache_status: "miss",
          last_run_id: "run-1",
          last_run_status: "failed",
          last_reason_code: "runtime_failed"
        },
        facets: {
          status_counts: [],
          request_source_counts: [
            { value: "workflow", count: 3 },
            { value: "alias", count: 1 },
            { value: "path", count: 2 }
          ],
          request_surface_counts: [
            { value: "openai.responses", count: 2 },
            { value: "native.workflow", count: 1 }
          ],
          cache_status_counts: [
            { value: "hit", count: 2 },
            { value: "miss", count: 1 }
          ],
          run_status_counts: [{ value: "waiting_callback", count: 1 }],
          reason_counts: [{ value: "runtime_failed", count: 2 }],
          api_key_usage: [],
          recent_failure_reasons: [
            {
              message: "sandbox backend offline",
              count: 2,
              last_invoked_at: "2026-03-21T00:15:00Z"
            }
          ],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitWindowAudit: {
        filters: {
          created_from: "2026-03-21T00:00:00Z"
        },
        summary: {
          total_count: 3,
          succeeded_count: 1,
          failed_count: 2,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0
        },
        facets: {
          status_counts: [],
          request_source_counts: [],
          request_surface_counts: [],
          cache_status_counts: [],
          run_status_counts: [],
          reason_counts: [],
          api_key_usage: [],
          recent_failure_reasons: [],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitPolicy: {
        requests: 4,
        windowSeconds: 60
      },
      callbackWaitingAutomation: null,
      sandboxReadiness: null,
      timeWindowLabel: "最近 24 小时",
      selectedInvocationErrorMessage: " sandbox backend offline ",
      selectedInvocationNextStepSurface: selectedNextStepSurface
    });

    expect(surface.summaryCards.at(-1)).toMatchObject({
      key: "summary-focus",
      label: "Summary focus",
      value: "attention"
    });
    expect(surface.summaryCards.at(-1)?.detail).toContain("waiting on callback tickets or external tool responses");
    expect(surface.trafficMixCard).toEqual({
      title: "Traffic mix",
      rows: [
        { key: "traffic-workflow", label: "Workflow", value: "3", href: null },
        { key: "traffic-alias", label: "Alias", value: "1", href: null },
        { key: "traffic-path", label: "Path", value: "2", href: null },
        {
          key: "traffic-cache-surface",
          label: "Cache surface",
          value: "Cache hit 2 / Cache miss 1 / Cache bypass 0",
          href: null
        },
        {
          key: "traffic-run-states",
          label: "Run states",
          value: "Waiting callback 1",
          href: null
        }
      ],
      requestSurfaceLabels: ["OpenAI responses 2", "Native workflow route 1"]
    });
    expect(surface.waitingFollowUpCard.title).toBe("Waiting follow-up");
    expect(surface.waitingFollowUpCard.rows).toContainEqual({
      key: "callback-waits",
      label: "Callback waits",
      value: "1",
      href: null
    });
    expect(surface.rateLimitWindowCard).toMatchObject({
      title: "Rate limit window",
      enabled: true,
      description: expect.stringContaining("当前窗口从"),
      insight: "当前窗口已经出现 1 次限流拒绝；如果失败面板同时看到 runtime failed，先把 quota hit 与执行链路异常拆开排查。",
      emptyState: null
    });
    expect(surface.rateLimitWindowCard.rows).toContainEqual({
      key: "rate-limit-policy",
      label: "Policy",
      value: "4 / 60s",
      href: null
    });
    expect(surface.issueSignalsSurface?.selectedNextStepSurface).toEqual(selectedNextStepSurface);
  });

  it("在 rate limit aggregate 已对齐当前 invocation 时复用页面级 canonical CTA", () => {
    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "优先处理 blocker inbox，再确认限流恢复后是否需要重放。",
        href: "/sensitive-access?run_id=run-selected-1&node_run_id=node-run-1",
        href_label: "open blocker inbox slice"
      }
    });

    const surface = buildPublishedInvocationActivityInsightsSurface({
      invocationAudit: {
        filters: {},
        summary: {
          total_count: 4,
          succeeded_count: 1,
          failed_count: 0,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_invoked_at: "2026-03-21T00:15:00Z",
          last_status: "rejected",
          last_cache_status: "miss",
          last_run_id: null,
          last_run_status: null,
          last_reason_code: "rate_limit_exceeded"
        },
        facets: {
          status_counts: [],
          request_source_counts: [{ value: "workflow", count: 4 }],
          request_surface_counts: [{ value: "openai.responses", count: 4 }],
          cache_status_counts: [],
          run_status_counts: [],
          reason_counts: [{ value: "rate_limit_exceeded", count: 1 }],
          api_key_usage: [],
          recent_failure_reasons: [],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitWindowAudit: {
        filters: {
          created_from: "2026-03-21T00:00:00Z"
        },
        summary: {
          total_count: 4,
          succeeded_count: 1,
          failed_count: 0,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0
        },
        facets: {
          status_counts: [],
          request_source_counts: [],
          request_surface_counts: [],
          cache_status_counts: [],
          run_status_counts: [],
          reason_counts: [],
          api_key_usage: [],
          recent_failure_reasons: [],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitPolicy: {
        requests: 4,
        windowSeconds: 60
      },
      callbackWaitingAutomation: null,
      sandboxReadiness: null,
      selectedInvocation: {
        id: "invocation-1",
        workflow_id: "workflow-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "alias-1",
        route_path: "/published/test",
        protocol: "openai",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "openai.responses",
        status: "rejected",
        cache_status: "miss",
        api_key_id: "key-1",
        request_preview: { key_count: 1, keys: ["query"] },
        response_preview: null,
        created_at: "2026-03-21T00:10:00Z",
        finished_at: "2026-03-21T00:10:01Z",
        duration_ms: 1000,
        reason_code: "rate_limit_exceeded",
        error_message: "Quota hit before runtime starts."
      },
      selectedInvocationNextStepSurface: selectedNextStepSurface
    });

    expect(surface.rateLimitWindowCard.selectedNextStepSurface).toEqual(selectedNextStepSurface);
    expect(surface.summaryCards.at(-1)).toMatchObject({
      href: "/sensitive-access?run_id=run-selected-1&node_run_id=node-run-1",
      hrefLabel: "open blocker inbox slice"
    });
    expect(surface.summaryCards.at(-1)?.detail).toContain("selected invocation next step");
  });

  it("在 waiting aggregate 已对齐当前 invocation 时复用页面级 canonical CTA", () => {
    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。",
        href: "/sensitive-access?run_id=run-selected-1&waiting_status=waiting",
        href_label: "open blocker inbox slice"
      }
    });

    const surface = buildPublishedInvocationActivityInsightsSurface({
      invocationAudit: {
        filters: {},
        summary: {
          total_count: 2,
          succeeded_count: 0,
          failed_count: 1,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_invoked_at: "2026-03-21T00:15:00Z",
          last_status: "failed",
          last_cache_status: "miss",
          last_run_id: "run-selected-1",
          last_run_status: "waiting_callback",
          last_reason_code: null
        },
        facets: {
          status_counts: [],
          request_source_counts: [],
          request_surface_counts: [],
          cache_status_counts: [],
          run_status_counts: [{ value: "waiting_callback", count: 2 }],
          reason_counts: [],
          api_key_usage: [],
          recent_failure_reasons: [],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitWindowAudit: null,
      rateLimitPolicy: null,
      callbackWaitingAutomation: null,
      selectedInvocation: {
        id: "invocation-1",
        workflow_id: "workflow-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "alias-1",
        route_path: "/published/test",
        protocol: "openai",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "native.workflow",
        status: "failed",
        cache_status: "miss",
        run_id: "run-selected-1",
        run_status: "waiting",
        run_current_node_id: "tool_wait",
        run_waiting_reason: "callback pending",
        run_waiting_lifecycle: null,
        run_follow_up: {
          affected_run_count: 1,
          sampled_run_count: 1,
          waiting_run_count: 1,
          running_run_count: 0,
          succeeded_run_count: 0,
          failed_run_count: 0,
          unknown_run_count: 0,
          explanation: null,
          sampled_runs: []
        },
        callback_waiting_explanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。",
          follow_up: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。"
        },
        reason_code: "runtime_failed",
        error_message: "sandbox backend offline during invocation",
        request_preview: { key_count: 1, keys: ["query"] },
        response_preview: { ok: false },
        created_at: "2026-03-21T00:10:00Z",
        finished_at: "2026-03-21T00:10:01Z",
        duration_ms: 1000
      },
      selectedInvocationNextStepSurface: selectedNextStepSurface
    });

    expect(surface.waitingFollowUpCard.selectedNextStepSurface).toEqual(selectedNextStepSurface);
    expect(surface.waitingFollowUpCard.followUpHref).toBeNull();
    expect(surface.waitingFollowUpCard.followUpHrefLabel).toBeNull();
    expect(surface.summaryCards.at(-1)).toMatchObject({
      key: "summary-focus",
      href: "/sensitive-access?run_id=run-selected-1&waiting_status=waiting",
      hrefLabel: "open blocker inbox slice"
    });
    expect(surface.summaryCards.at(-1)?.detail).toContain("selected invocation next step");
  });

  it("does not duplicate the waiting CTA when the selected invocation resolves to the same shared callback recovery action", () => {
    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "callback recovery",
        detail: "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。",
        href: "/runs?focus=callback-waiting",
        href_label: "Open run library"
      }
    });

    const surface = buildPublishedInvocationActivityInsightsSurface({
      invocationAudit: {
        filters: {},
        summary: {
          total_count: 2,
          succeeded_count: 0,
          failed_count: 1,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_invoked_at: "2026-03-21T00:15:00Z",
          last_status: "failed",
          last_cache_status: "miss",
          last_run_id: "run-selected-1",
          last_run_status: "waiting_callback",
          last_reason_code: null
        },
        facets: {
          status_counts: [],
          request_source_counts: [],
          request_surface_counts: [],
          cache_status_counts: [],
          run_status_counts: [{ value: "waiting_callback", count: 2 }],
          reason_counts: [],
          api_key_usage: [],
          recent_failure_reasons: [],
          timeline_granularity: "hour",
          timeline: []
        },
        items: []
      },
      rateLimitWindowAudit: null,
      rateLimitPolicy: null,
      callbackWaitingAutomation: {
        status: "partial",
        scheduler_required: true,
        detail: "callback automation degraded",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "waiting resume monitor degraded",
        affected_run_count: 3,
        affected_workflow_count: 2,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "open_run_library",
          label: "Open run library",
          href: "/runs?focus=callback-waiting",
          entry_key: "runLibrary"
        },
        steps: []
      },
      selectedInvocation: {
        id: "invocation-1",
        workflow_id: "workflow-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "alias-1",
        route_path: "/published/test",
        protocol: "openai",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "native.workflow",
        status: "failed",
        cache_status: "miss",
        run_id: "run-selected-1",
        run_status: "waiting",
        run_current_node_id: "tool_wait",
        run_waiting_reason: "callback pending",
        run_waiting_lifecycle: null,
        run_follow_up: {
          affected_run_count: 1,
          sampled_run_count: 1,
          waiting_run_count: 1,
          running_run_count: 0,
          succeeded_run_count: 0,
          failed_run_count: 0,
          unknown_run_count: 0,
          explanation: null,
          sampled_runs: []
        },
        callback_waiting_explanation: {
          primary_signal: "当前 waiting 节点仍在等待 callback。",
          follow_up: "优先回到 run library 核对 waiting callback runs 与自动 resume 状态。"
        },
        reason_code: "runtime_failed",
        error_message: "sandbox backend offline during invocation",
        request_preview: { key_count: 1, keys: ["query"] },
        response_preview: { ok: false },
        created_at: "2026-03-21T00:10:00Z",
        finished_at: "2026-03-21T00:10:01Z",
        duration_ms: 1000
      },
      selectedInvocationNextStepSurface: selectedNextStepSurface
    });

    expect(surface.waitingFollowUpCard.selectedNextStepSurface).toBeNull();
    expect(surface.waitingFollowUpCard.followUpHref).toBe("/runs?focus=callback-waiting");
    expect(surface.waitingFollowUpCard.followUpHrefLabel).toBe("Open run library");
  });

  it("为 traffic timeline bucket 提供共享 facet rows", () => {
    expect(
      buildPublishedInvocationTrafficTimelineBucketSurface({
        bucket: {
          bucket_start: "2026-03-20T00:00:00Z",
          bucket_end: "2026-03-20T01:00:00Z",
          total_count: 4,
          succeeded_count: 2,
          failed_count: 1,
          rejected_count: 1,
          request_surface_counts: [
            { value: "openai.responses", count: 2 },
            { value: "native.workflow", count: 1 }
          ],
          cache_status_counts: [{ value: "hit", count: 2 }],
          run_status_counts: [{ value: "waiting_callback", count: 1 }],
          reason_counts: [{ value: "runtime_failed", count: 1 }],
          api_key_counts: [
            {
              api_key_id: "key-1",
              key_prefix: "sk-primary",
              name: "Primary key",
              count: 2
            }
          ]
        },
        apiKeyLabelPrefix: "key"
      })
    ).toMatchObject({
      timeWindowLabel: expect.stringContaining("2026"),
      surfaceLabels: ["OpenAI responses 2", "Native workflow route 1"],
      cacheLabels: ["Cache hit 2"],
      runStatusLabels: ["Waiting callback 1"],
      reasonLabels: ["Runtime failed 1"],
      apiKeyLabels: ["key Primary key 2"]
    });
  });

  it("为 publish activity / timeline 提供共享状态与 facet 标签拼装", () => {
    expect(formatPublishedInvocationOptionalRunStatus("failed", "n/a")).toBe("Run failed");
    expect(formatPublishedInvocationOptionalRunStatus(null, "n/a")).toBe("n/a");

    expect(
      listPublishedInvocationFacetCountLabels(
        [
          { value: "native.workflow", count: 3 },
          { value: "native.alias", count: 1 },
          { value: "native.path", count: 1 }
        ],
        (value) => value,
        2
      )
    ).toEqual(["native.workflow 3", "native.alias 1"]);

    expect(
      listPublishedInvocationApiKeyCountLabels(
        [
          {
            api_key_id: "key-1",
            key_prefix: "sk-primary",
            name: "Primary key",
            count: 2
          },
          {
            api_key_id: "key-2",
            key_prefix: null,
            name: null,
            count: 1
          }
        ],
        {
          limit: 2,
          prefix: "key"
        }
      )
    ).toEqual(["key Primary key 2", "key key-2 1"]);
  });

  it("为 publish activity details 提供统一标题与空态 copy", () => {
    expect(buildPublishedInvocationActivityDetailsSurfaceCopy()).toEqual({
      selectedInvocationNextStepTitle: "Selected invocation next step",
      invocationAuditEmptyState:
        "当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。",
      apiKeyUsageMissingPrefixLabel: "no-prefix",
      apiKeyUsageInvocationCountLabel: "Calls",
      apiKeyUsageStatusMixLabel: "Status mix",
      apiKeyUsageStatusLabel: "Status",
      apiKeyUsageStatusEmptyLabel: "n/a",
      apiKeyUsageLastUsedLabel: "Last used",
      failureReasonTitle: "Failure reason",
      failureReasonCountLabelPrefix: "count",
      blockedDetailSurfaceLabel: "Invocation detail",
      blockedDetailGuardedActionLabel: "详情查看",
      unavailableDetail: {
        title: "Invocation detail unavailable",
        summary: "当前未能拉取该 invocation 的详情 payload。",
        detail: "审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。"
      }
    });
  });

  it("统一格式化 API key usage 的状态分布摘要", () => {
    expect(
      formatPublishedInvocationApiKeyUsageMix({
        succeeded_count: 2,
        failed_count: 1,
        rejected_count: 3
      })
    ).toBe("ok 2 / failed 1 / rejected 3");
  });

  it("为 publish activity blocked detail 复用共享敏感访问 copy", () => {
    expect(
      buildPublishedInvocationActivityBlockedDetailSurfaceCopy({
        detail: "Invocation detail is guarded by sensitive access control.",
        resource: {
          id: "resource-1",
          label: "Invocation detail",
          description: "Protected invocation detail payload",
          sensitivity_level: "L3",
          source: "workspace_resource",
          metadata: {}
        },
        access_request: {
          id: "request-1",
          run_id: "run-1",
          node_run_id: "node-run-1",
          requester_type: "human",
          requester_id: "ops-reviewer",
          resource_id: "resource-1",
          action_type: "read",
          purpose_text: "review invocation detail",
          decision: "require_approval",
          decision_label: null,
          reason_code: "approval_required_high_sensitive_access",
          reason_label: null,
          policy_summary: "high-sensitivity access requires approval"
        },
        approval_ticket: {
          id: "ticket-1",
          access_request_id: "request-1",
          run_id: "run-1",
          node_run_id: "node-run-1",
          status: "pending",
          waiting_status: "waiting",
          approved_by: null
        },
        notifications: [],
        run_snapshot: null,
        run_follow_up: null,
        outcome_explanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: null
        }
      })
    ).toMatchObject({
      title: "Invocation detail waiting on approval",
      summary: expect.stringContaining("详情查看不会绕过审批、通知与 run follow-up 事实链")
    });
  });

  it("格式化 failure reason 最近出现时间", () => {
    expect(formatPublishedInvocationFailureReasonLastSeen("2026-03-21T00:15:00Z")).toContain(
      "最近一次出现在"
    );
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
    const selectedNextStepSurface = buildPublishedInvocationSelectedNextStepSurface({
      invocationId: "invocation-1",
      nextStep: {
        label: "approval blocker",
        detail: "先处理 blocker inbox，再观察 waiting 节点是否恢复。",
        href: "/sensitive-access/inbox?run_id=run-selected-1",
        href_label: "open blocker inbox slice"
      }
    });

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
      buildPublishedInvocationFailureReasonInsight({
        failureReasons: [
          {
            message: "sandbox backend offline during invocation",
            count: 2,
            last_invoked_at: null
          }
        ],
        selectedInvocationErrorMessage: "sandbox backend offline during invocation",
        selectedInvocationNextStepSurface: selectedNextStepSurface
      })
    ).toContain("当前打开的 invocation-1 已对齐聚合 failure reason");
    expect(
      buildPublishedInvocationFailureReasonInsight({
        failureReasons: [
          {
            message: "quota hit before runtime failed",
            count: 1,
            last_invoked_at: null
          },
          {
            message: "sandbox backend offline during invocation",
            count: 2,
            last_invoked_at: null
          }
        ],
        selectedInvocationErrorMessage: "sandbox backend offline during invocation",
        selectedInvocationNextStepSurface: selectedNextStepSurface
      })
    ).toContain("当前打开的 invocation-1 已对齐聚合 failure reason");
    expect(
      buildPublishedInvocationFailureReasonInsight({
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
        }
      })
    ).toContain("优先回到 workflow library 处理强隔离 execution class 与隔离需求");

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
        }
      })
    ).toEqual({
      headline: "当前 live sandbox readiness 仍在报警。",
      detail: expect.stringContaining("优先回到 workflow library 处理强隔离 execution class 与隔离需求"),
      href: "/workflows?execution=sandbox",
      hrefLabel: "Open workflow library"
    });

    expect(
      buildPublishedInvocationFailureMessageDiagnosis({
        message: "callback resume scheduler is degraded",
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        }
      })
    ).toEqual({
      headline: "这条 failure 更像 callback waiting / recovery 链路问题。",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。 这说明这条 failure 不能只按历史 message 处理。",
      href: "/runs?focus=callback-waiting",
      hrefLabel: "Open run library"
    });
  });

  it("在 waiting overview 里复用 shared callback recovery contract", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 4,
          succeeded_count: 1,
          failed_count: 2,
          rejected_count: 1,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "waiting_callback"
        },
        runStatusCounts: [{ value: "waiting_callback", count: 2 }],
        reasonCounts: [],
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        }
      })
    ).toMatchObject({
      callbackWaitingCount: 2,
      detail: expect.stringContaining(
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。"
      ),
      followUpHref: "/runs?focus=callback-waiting",
      followUpHrefLabel: "Open run library"
    });
  });

  it("在纯 approval/input wait 的 waiting overview 里恢复 approval inbox CTA", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 2,
          succeeded_count: 0,
          failed_count: 0,
          rejected_count: 0,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "waiting_input",
          approval_ticket_count: 2,
          pending_approval_count: 2,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0
        },
        runStatusCounts: [{ value: "waiting_input", count: 2 }],
        reasonCounts: []
      })
    ).toMatchObject({
      waitingInputCount: 2,
      detail: expect.stringContaining(
        "2 approval tickets are still pending in sensitive access inbox"
      ),
      followUpHref: "/sensitive-access?status=pending",
      followUpHrefLabel: "open approval inbox slice"
    });
  });

  it("在 approval/input wait 的 waiting overview 里优先复用 failed notification backlog CTA", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 2,
          succeeded_count: 0,
          failed_count: 0,
          rejected_count: 0,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "waiting_input",
          approval_ticket_count: 1,
          pending_approval_count: 0,
          approved_approval_count: 0,
          rejected_approval_count: 1,
          expired_approval_count: 0,
          pending_notification_count: 1,
          delivered_notification_count: 0,
          failed_notification_count: 2
        },
        runStatusCounts: [{ value: "waiting_input", count: 1 }],
        reasonCounts: []
      })
    ).toMatchObject({
      waitingInputCount: 1,
      detail: expect.stringContaining(
        "2 failed notifications still need delivery retry in sensitive access inbox"
      ),
      followUpHref: "/sensitive-access?notification_status=failed",
      followUpHrefLabel: "open approval inbox slice"
    });
  });

  it("在 approval/input wait 的 waiting overview 里回退到 pending notification backlog CTA", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 2,
          succeeded_count: 0,
          failed_count: 0,
          rejected_count: 0,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "waiting_input",
          approval_ticket_count: 0,
          pending_approval_count: 0,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 2,
          delivered_notification_count: 0,
          failed_notification_count: 0
        },
        runStatusCounts: [{ value: "waiting_input", count: 1 }],
        reasonCounts: []
      })
    ).toMatchObject({
      waitingInputCount: 1,
      detail: expect.stringContaining(
        "2 pending notifications are still waiting for delivery confirmation in sensitive access inbox"
      ),
      followUpHref: "/sensitive-access?notification_status=pending",
      followUpHrefLabel: "open approval inbox slice"
    });
  });

  it("在 sync waiting rejected 的 waiting overview 里回退到 rejected approval backlog CTA", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 1,
          succeeded_count: 0,
          failed_count: 1,
          rejected_count: 0,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "failed",
          approval_ticket_count: 1,
          pending_approval_count: 0,
          approved_approval_count: 0,
          rejected_approval_count: 1,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0
        },
        runStatusCounts: [],
        reasonCounts: [{ value: "sync_waiting_unsupported", count: 1 }]
      })
    ).toMatchObject({
      syncWaitingRejectedCount: 1,
      detail: expect.stringContaining(
        "1 rejected approval ticket still need operator review in sensitive access inbox before retrying publish"
      ),
      followUpHref: "/sensitive-access?status=rejected",
      followUpHrefLabel: "open approval inbox slice"
    });
  });

  it("在 sync waiting rejected 的 waiting overview 里回退到 expired approval backlog CTA", () => {
    expect(
      buildPublishedInvocationWaitingOverview({
        summary: {
          total_count: 1,
          succeeded_count: 0,
          failed_count: 1,
          rejected_count: 0,
          cache_hit_count: 0,
          cache_miss_count: 0,
          cache_bypass_count: 0,
          last_run_status: "failed",
          approval_ticket_count: 1,
          pending_approval_count: 0,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 1,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0
        },
        runStatusCounts: [],
        reasonCounts: [{ value: "sync_waiting_unsupported", count: 1 }]
      })
    ).toMatchObject({
      syncWaitingRejectedCount: 1,
      detail: expect.stringContaining(
        "1 expired approval ticket still need renewal in sensitive access inbox before retrying publish"
      ),
      followUpHref: "/sensitive-access?status=expired",
      followUpHrefLabel: "open approval inbox slice"
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

  it("shared callback waiting summary 与��层 primary signal 重���时回退到 generic headline", () => {
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
        callbackWaitingActive: true,
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

  it("没有稳定 CTA 或导航目标时，不再把 canonical follow-up 单独投影成 next-step 卡片", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: null,
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: "先继续回看 invocation 的 callback / execution 事实链。",
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingActive: false,
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: null,
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toBeNull();
  });

  it("优先复用后端 canonical approval action，而不是回退到本地 run CTA", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-approval-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: "先处理审批票据，再回来确认 execution 是否恢复。",
          has_shared_callback_waiting_summary: false
        },
        canonicalRecommendedAction: {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: "/sensitive-access?run_id=run-focus-approval-1&node_run_id=node-run-1",
          label: "open approval inbox slice"
        },
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: null,
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "approval blocker",
      detail: "先处理审批票据，再回来确认 execution 是否恢复。",
      href: "/sensitive-access?run_id=run-focus-approval-1&node_run_id=node-run-1",
      href_label: "open approval inbox slice"
    });
  });

  it("当 shared canonical approval action 指回当前 publish detail 时回退到本地 blocker inbox", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-approval-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: "先处理审批票据，再回来确认 execution 是否恢复。",
          has_shared_callback_waiting_summary: false
        },
        canonicalRecommendedAction: {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: "/workflows/workflow-1?publish_invocation=invocation-1",
          label: "Open current publish detail"
        },
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
        callbackWaitingActive: true,
        callbackWaitingFollowUp: "先处理审批票据，再观察 waiting 节点是否恢复。",
        blockingInboxHref: "/sensitive-access?run_id=run-focus-approval-1&node_run_id=node-run-1",
        approvalInboxHref: "/sensitive-access?run_id=run-focus-approval-1"
      })
    ).toEqual({
      label: "approval blocker",
      detail: "先处理审批票据，再观察 waiting 节点是否恢复。",
      href: "/sensitive-access?run_id=run-focus-approval-1&node_run_id=node-run-1",
      href_label: "open blocker inbox slice"
    });
  });

  it("在缺少 callback waiting follow-up 时回退到 shared callback recovery contract", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-callback-fallback-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingActive: true,
        callbackWaitingFollowUp: null,
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        executionFocusFollowUp: null,
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "callback recovery",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。",
      href: "/runs?focus=callback-waiting",
      href_label: "Open run library"
    });
  });

  it("缺少 invocation 级 canonical callback action 时，即使带本地 callback follow-up 也优先 shared callback recovery contract", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-callback-fallback-2",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: "run run-callback-fallback-2：继续观察 callback waiting。",
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingActive: true,
        callbackWaitingFollowUp: "先处理审批票据，再观察 waiting 节点是否恢复。",
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        executionFocusFollowUp: null,
        blockingInboxHref: "/sensitive-access/inbox?runId=run-callback-fallback-2&nodeRunId=node-run-1",
        approvalInboxHref: "/sensitive-access/inbox?runId=run-callback-fallback-2"
      })
    ).toEqual({
      label: "callback recovery",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。",
      href: "/runs?focus=callback-waiting",
      href_label: "Open run library"
    });
  });

  it("优先复用 invocation 级 canonical callback action，而不是回退到 shared callback recovery", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-callback-approval-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: "先处理审批票据，再回来确认 callback waiting 是否恢复。",
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingActive: true,
        callbackWaitingFollowUp: null,
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        canonicalRecommendedAction: {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: "/sensitive-access?run_id=run-callback-approval-1&node_run_id=node-run-1",
          label: "open approval inbox slice"
        },
        executionFocusFollowUp: "打开 run 看 execution focus。",
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "approval blocker",
      detail: "先处理审批票据，再回来确认 callback waiting 是否恢复。",
      href: "/sensitive-access?run_id=run-callback-approval-1&node_run_id=node-run-1",
      href_label: "open approval inbox slice"
    });
  });

  it("没有 live callback context 时忽略顶层 callback follow-up，回退到 execution focus", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-only-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingActive: false,
        callbackWaitingFollowUp: "先观察 callback 是否恢复。",
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        executionFocusFollowUp: "优先打开 run 继续检查 focus node。",
        blockingInboxHref: "/sensitive-access/inbox?runId=run-focus-only-1&nodeRunId=node-run-1",
        approvalInboxHref: "/sensitive-access/inbox?runId=run-focus-only-1"
      })
    ).toEqual({
      label: "execution focus",
      detail: "优先打开 run 继续检查 focus node。",
      href: "/runs/run-focus-only-1",
      href_label: "open run"
    });
  });

  it("execution focus 没有显式 follow-up 时复用共享 fallback 详情", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-fallback-1",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: null,
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "execution focus",
      detail: buildRunDetailExecutionFocusSurfaceCopy().recommendedNextStepFallbackDetail,
      href: "/runs/run-focus-fallback-1",
      href_label: "open run"
    });
  });

  it("在缺少 execution focus follow-up 时优先复用 shared sandbox readiness contract", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-fallback-2",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: null,
        sandboxReadiness: {
          enabled_backend_count: 0,
          execution_classes: [
            {
              execution_class: "sandbox_code",
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
              reason: "execution class blocked"
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
          offline_backend_count: 0,
          degraded_backend_count: 0,
          healthy_backend_count: 0,
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            label: "Open workflow library",
            href: "/workflows?execution=sandbox",
            entry_key: "workflowLibrary"
          }
        },
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "sandbox readiness",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library"
    });
  });

  it("命中强隔离阻断时即使 execution focus 有本地 follow-up 也优先 shared sandbox readiness CTA", () => {
    expect(
      buildPublishedInvocationRecommendedNextStep({
        runId: "run-focus-fallback-3",
        canonicalFollowUp: {
          headline: "当前 invocation 已接入 canonical follow-up 事实链。",
          follow_up: null,
          has_shared_callback_waiting_summary: false
        },
        callbackWaitingFollowUp: null,
        executionFocusFollowUp: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。",
        executionSnapshot: {
          status: "failed",
          executionFocusReason: "blocked_execution",
          executionFocusNodeType: "tool",
          executionFocusExplanation: {
            primary_signal: "当前 focus 节点因强隔离 backend 不可用而阻断。",
            follow_up: "先恢复兼容 backend，再重新调度该节点。"
          },
          executionFocusToolCalls: [
            {
              id: "tool-call-1",
              tool_id: "sandbox.tool",
              tool_name: "Sandbox Tool",
              status: "failed",
              requested_execution_class: "sandbox",
              effective_execution_class: "inline",
              execution_blocking_reason: "No compatible sandbox backend is available."
            }
          ]
        } as never,
        sandboxReadiness: {
          enabled_backend_count: 0,
          execution_classes: [
            {
              execution_class: "sandbox_code",
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
              reason: "execution class blocked"
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
          offline_backend_count: 0,
          degraded_backend_count: 0,
          healthy_backend_count: 0,
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            label: "Open workflow library",
            href: "/workflows?execution=sandbox",
            entry_key: "workflowLibrary"
          }
        },
        blockingInboxHref: null,
        approvalInboxHref: null
      })
    ).toEqual({
      label: "sandbox readiness",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library"
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
        primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批��",
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

  it("构造 waiting surface 时统一复用 waiting card presenter", () => {
    const waitingLifecycle = {
      node_run_id: "node-run-1",
      node_status: "waiting_callback",
      callback_ticket_count: 1,
      callback_ticket_status_counts: { pending: 1 },
      callback_waiting_lifecycle: {
        wait_cycle_count: 1,
        expired_ticket_count: 0,
        late_callback_count: 0,
        terminated: false
      },
      scheduled_resume_delay_seconds: 30,
      scheduled_resume_source: "callback_monitor",
      scheduled_waiting_status: "waiting_callback",
      sensitive_access_summary: {
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0
      }
    } as never;

    const surface = buildPublishedInvocationWaitingCardSurface({
      waitingLifecycle,
      waitingExplanation: {
        primary_signal: "callback still pending",
        follow_up: "open inbox to review tickets"
      },
      callbackLifecycleFallback: "tracked in detail panel"
    });

    expect(surface).toMatchObject({
      headline: "callback still pending",
      followUp: "open inbox to review tickets"
    });
    expect(surface?.waitingRows).toEqual(
      expect.arrayContaining([
        { key: "node-run", label: "Node run", value: "node-run-1", href: null }
      ])
    );
  });

  it("统一 payload preview helper", () => {
    expect(formatPublishedInvocationPayloadPreview({ foo: "bar" })).toBe('{\n  "foo": "bar"\n}');
    expect(formatPublishedInvocationPayloadPreview(undefined)).toBe("null");
  });
});
