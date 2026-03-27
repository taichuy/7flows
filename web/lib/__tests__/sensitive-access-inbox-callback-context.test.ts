import { describe, expect, it } from "vitest";

import type { SensitiveAccessInboxEntry } from "../get-sensitive-access";
import { buildSensitiveAccessInboxEntryCallbackContext } from "../sensitive-access-inbox-callback-context";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "../workflow-publish-legacy-auth-test-fixtures";

function createInboxEntry(
  overrides: Partial<SensitiveAccessInboxEntry> = {}
): SensitiveAccessInboxEntry {
  return {
    ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-18T10:05:00Z",
      created_at: "2026-03-18T10:00:00Z"
    },
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "Need approval before external callback resumes the run.",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "sensitive_callback",
      reason_label: "Sensitive callback",
      policy_summary: "Wait for operator approval before resuming.",
      created_at: "2026-03-18T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Callback capability",
      description: "External callback channel",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-18T09:00:00Z",
      updated_at: "2026-03-18T09:00:00Z"
    },
    notifications: [],
    runSnapshot: null,
    runFollowUp: null,
    ...overrides
  };
}

function createRunSnapshot(
  overrides: NonNullable<SensitiveAccessInboxEntry["runSnapshot"]> = {}
): NonNullable<SensitiveAccessInboxEntry["runSnapshot"]> {
  return {
    workflowId: "wf-1",
    status: "waiting",
    currentNodeId: "tool_wait",
    waitingReason: "Waiting for callback approval",
    executionFocusReason: "blocking_node_run",
    executionFocusNodeId: "tool_wait",
    executionFocusNodeRunId: "node-run-1",
    executionFocusNodeName: "Tool Wait",
    executionFocusNodeType: "tool",
    executionFocusExplanation: {
      primary_signal: "等待原因：Waiting for callback approval",
      follow_up: "下一步：优先处理这条 sensitive access 审批票据，再观察 waiting 节点是否恢复。"
    },
    callbackWaitingExplanation: {
      primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
      follow_up: "下一步：先在当前 operator 入口完成审批或拒绝，再观察 waiting 节点是否自动恢复。"
    },
    callbackWaitingLifecycle: {
      wait_cycle_count: 1,
      issued_ticket_count: 1,
      expired_ticket_count: 0,
      consumed_ticket_count: 0,
      canceled_ticket_count: 0,
      late_callback_count: 0,
      resume_schedule_count: 1,
      max_expired_ticket_count: 2,
      terminated: false,
      termination_reason: null,
      terminated_at: null,
      last_ticket_status: "pending",
      last_ticket_reason: "callback pending",
      last_ticket_updated_at: "2026-03-18T10:00:00Z",
      last_late_callback_status: null,
      last_late_callback_reason: null,
      last_late_callback_at: null,
      last_resume_delay_seconds: 5,
      last_resume_reason: "callback pending",
      last_resume_source: "callback_ticket_monitor",
      last_resume_backoff_attempt: 1
    },
    scheduledResumeDelaySeconds: 5,
    scheduledResumeReason: "callback pending",
    scheduledResumeSource: "callback_ticket_monitor",
    scheduledWaitingStatus: "waiting_callback",
    scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
    scheduledResumeDueAt: "2026-03-18T10:05:00Z",
    scheduledResumeRequeuedAt: null,
    scheduledResumeRequeueSource: null,
    executionFocusArtifactCount: 0,
    executionFocusArtifactRefCount: 0,
    executionFocusToolCallCount: 0,
    executionFocusRawRefCount: 0,
    executionFocusArtifactRefs: [],
    executionFocusArtifacts: [],
    executionFocusToolCalls: [],
    executionFocusSkillTrace: null,
    ...overrides
  };
}

describe("sensitive access inbox callback context", () => {
  it("为 inbox 条目复用 compact snapshot 上的 callback waiting 上下文", () => {
    const context = buildSensitiveAccessInboxEntryCallbackContext(
      createInboxEntry(),
      createRunSnapshot()
    );

    expect(context).not.toBeNull();
    expect(context?.runId).toBe("run-1");
    expect(context?.displayNodeRunId).toBe("node-run-1");
    expect(context?.actionNodeRunId).toBe("node-run-1");
    expect(context?.waitingReason).toBe("Waiting for callback approval");
    expect(context?.callbackTickets).toEqual([]);
    expect(context?.scheduledResumeSource).toBe("callback_ticket_monitor");
    expect(context?.scheduledResumeScheduledAt).toBe("2026-03-18T10:00:00Z");
    expect(context?.scheduledResumeDueAt).toBe("2026-03-18T10:05:00Z");
    expect(context?.callbackWaitingExplanation?.primary_signal).toBe(
      "当前 callback waiting 仍卡在 1 条待处理审批。"
    );
    expect(context?.sensitiveAccessEntries).toHaveLength(1);
    expect(context?.sensitiveAccessEntries[0]?.approval_ticket?.id).toBe("ticket-1");
  });

  it("在缺少 node_run_id 时回退到 snapshot focus node run id", () => {
    const entry = createInboxEntry({
      ticket: {
        ...createInboxEntry().ticket,
        node_run_id: null
      },
      request: {
        ...createInboxEntry().request!,
        node_run_id: null
      }
    });

    const context = buildSensitiveAccessInboxEntryCallbackContext(
      entry,
      createRunSnapshot()
    );

    expect(context?.displayNodeRunId).toBe("node-run-1");
    expect(context?.actionNodeRunId).toBeNull();
  });

  it("当 run_id 缺失时会回退到 run follow-up 样本", () => {
    const entry = createInboxEntry({
      ticket: {
        ...createInboxEntry().ticket,
        run_id: null
      },
      request: {
        ...createInboxEntry().request!,
        run_id: null
      },
      runFollowUp: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        sampledRuns: [{ runId: "run-from-follow-up", snapshot: createRunSnapshot() }]
      }
    });

    const context = buildSensitiveAccessInboxEntryCallbackContext(
      entry,
      createRunSnapshot()
    );

    expect(context?.runId).toBe("run-from-follow-up");
  });

  it("优先复用上层已解析的 canonical runId，而不是直接取首个 sampled run", () => {
    const entry = createInboxEntry({
      ticket: {
        ...createInboxEntry().ticket,
        run_id: null
      },
      request: {
        ...createInboxEntry().request!,
        run_id: null
      },
      runFollowUp: {
        affectedRunCount: 2,
        sampledRunCount: 2,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 1,
        unknownRunCount: 0,
        sampledRuns: [
          { runId: "run-stale", snapshot: createRunSnapshot() },
          { runId: "run-current", snapshot: createRunSnapshot() }
        ]
      }
    });

    const context = buildSensitiveAccessInboxEntryCallbackContext(
      entry,
      createRunSnapshot(),
      "run-current"
    );

    expect(context?.runId).toBe("run-current");
  });

  it("把 callback 展示节点与 entry 动作节点分开保留", () => {
    const context = buildSensitiveAccessInboxEntryCallbackContext(
      createInboxEntry(),
      createRunSnapshot({
        executionFocusNodeId: "node-focus",
        executionFocusNodeRunId: "node-run-focus",
        executionFocusNodeName: "Focus Node"
      })
    );

    expect(context).not.toBeNull();
    expect(context?.displayNodeRunId).toBe("node-run-focus");
    expect(context?.actionNodeRunId).toBe("node-run-1");
  });

  it("把 sampled run 的 workflow governance handoff 并入 callback summary context", () => {
    const context = buildSensitiveAccessInboxEntryCallbackContext(
      createInboxEntry({
        legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          binding: {
            workflow_id: "wf-1",
            workflow_name: "Callback workflow"
          }
        }),
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: createRunSnapshot(),
              toolGovernance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              },
              legacyAuthGovernance:
                buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                  binding: {
                    workflow_id: "wf-1",
                    workflow_name: "Callback workflow"
                  }
                })
            }
          ]
        }
      }),
      createRunSnapshot()
    );

    expect(context).not.toBeNull();
    expect(context?.workflowCatalogGapSummary).toBe("catalog gap · native.catalog-gap");
    expect(context?.workflowCatalogGapDetail).toContain("当前 callback summary 对应的 workflow 版本仍有 catalog gap");
    expect(context?.workflowCatalogGapHref).toBe("/workflows/wf-1?definition_issue=missing_tool");
    expect(context?.workflowGovernanceHref).toBe(
      "/workflows/wf-1?definition_issue=legacy_publish_auth"
    );
    expect(context?.legacyAuthHandoff).toMatchObject({
      bindingChipLabel: "1 legacy bindings",
      statusChipLabel: "publish auth blocker"
    });
  });
});
