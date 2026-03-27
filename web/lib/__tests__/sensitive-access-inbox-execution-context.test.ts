import { describe, expect, it } from "vitest";

import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

import { buildSensitiveAccessInboxEntryExecutionContext } from "../sensitive-access-inbox-execution-context";

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
      created_at: "2026-03-18T10:00:00Z"
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
    callbackWaitingExplanation: null,
    callbackWaitingLifecycle: null,
    scheduledResumeDelaySeconds: null,
    scheduledResumeReason: null,
    scheduledResumeSource: null,
    scheduledWaitingStatus: null,
    scheduledResumeScheduledAt: null,
    scheduledResumeDueAt: null,
    scheduledResumeRequeuedAt: null,
    scheduledResumeRequeueSource: null,
    executionFocusArtifactCount: 1,
    executionFocusArtifactRefCount: 1,
    executionFocusToolCallCount: 1,
    executionFocusRawRefCount: 1,
    executionFocusArtifactRefs: ["artifact://focus-1"],
    executionFocusArtifacts: [
      {
        artifact_kind: "tool_result",
        content_type: "application/json",
        summary: "focus artifact",
        uri: "artifact://focus-1"
      }
    ],
    executionFocusToolCalls: [
      {
        id: "tool-call-1",
        tool_id: "native.search",
        tool_name: "Native Search",
        phase: "tool",
        status: "waiting",
        requested_execution_class: "inline",
        requested_execution_source: "workflow_default",
        requested_execution_profile: null,
        requested_execution_timeout_ms: null,
        requested_execution_network_policy: null,
        requested_execution_filesystem_policy: null,
        requested_execution_dependency_mode: null,
        requested_execution_builtin_package_set: null,
        requested_execution_dependency_ref: null,
        requested_execution_backend_extensions: null,
        effective_execution_class: "inline",
        execution_executor_ref: null,
        execution_sandbox_backend_id: null,
        execution_sandbox_backend_executor_ref: null,
        execution_sandbox_runner_kind: null,
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        response_summary: "callback request still waiting",
        response_content_type: "application/json",
        raw_ref: "artifact://raw-1"
      }
    ],
    executionFocusSkillTrace: {
      reference_count: 2,
      phase_counts: { planning: 2 },
      source_counts: { explicit_request: 2 },
      loads: [
        {
          phase: "planning",
          references: [
            {
              skill_id: "skill.search",
              skill_name: "Search",
              reference_id: "ref-1",
              reference_name: "Search policy",
              load_source: "explicit_request",
              fetch_reason: "tool requested search guidance",
              fetch_request_index: 1,
              fetch_request_total: 1,
              retrieval_http_path: "/skills/search/references/ref-1",
              retrieval_mcp_method: null,
              retrieval_mcp_params: {}
            }
          ]
        }
      ]
    },
    ...overrides
  };
}

describe("sensitive access inbox execution context", () => {
  it("为 inbox 条目复用 run snapshot 上的 canonical execution focus", () => {
    const context = buildSensitiveAccessInboxEntryExecutionContext(
      createInboxEntry(),
      createRunSnapshot()
    );

    expect(context).not.toBeNull();
    expect(context?.runId).toBe("run-1");
    expect(context?.focusReason).toBe("blocking_node_run");
    expect(context?.focusExplanation?.primary_signal).toContain("Waiting for callback approval");
    expect(context?.focusNode.node_run_id).toBe("node-run-1");
    expect(context?.focusNode.tool_calls).toHaveLength(1);
    expect(context?.focusNode.artifacts).toHaveLength(1);
    expect(context?.focusMatchesEntry).toBe(true);
    expect(context?.skillTrace?.reference_count).toBe(2);
  });

  it("当 canonical blocker 已切换时保留 entry node run 与 focus node run 的差异", () => {
    const context = buildSensitiveAccessInboxEntryExecutionContext(
      createInboxEntry(),
      createRunSnapshot({
        executionFocusReason: "blocked_execution",
        executionFocusNodeId: "sandbox_tool",
        executionFocusNodeRunId: "node-run-2",
        executionFocusNodeName: "Sandbox Tool"
      })
    );

    expect(context).not.toBeNull();
    expect(context?.focusMatchesEntry).toBe(false);
    expect(context?.entryNodeRunId).toBe("node-run-1");
    expect(context?.focusNode.node_run_id).toBe("node-run-2");
  });

  it("当 run_id 缺失时可回退到 run follow-up 样本上的 runId", () => {
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

    const context = buildSensitiveAccessInboxEntryExecutionContext(
      entry,
      createRunSnapshot()
    );

    expect(context?.runId).toBe("run-from-follow-up");
  });

  it("把 execution blocking / fallback 事实提升到 inbox focus node 上", () => {
    const context = buildSensitiveAccessInboxEntryExecutionContext(
      createInboxEntry(),
      createRunSnapshot({
        executionFocusToolCalls: [
          {
            id: "tool-call-blocked",
            tool_id: "sandbox.code",
            tool_name: "Sandbox Code",
            phase: "tool",
            status: "failed",
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
            execution_executor_ref: null,
            execution_sandbox_backend_id: null,
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: null,
            execution_blocking_reason: "No compatible sandbox backend is available.",
            execution_fallback_reason: null,
            response_summary: null,
            response_content_type: null,
            raw_ref: null
          },
          {
            id: "tool-call-fallback",
            tool_id: "sandbox.code",
            tool_name: "Sandbox Code",
            phase: "tool",
            status: "succeeded",
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
            effective_execution_class: "inline",
            execution_executor_ref: null,
            execution_sandbox_backend_id: null,
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: null,
            execution_blocking_reason: null,
            execution_fallback_reason: "Downgraded to host execution.",
            response_summary: null,
            response_content_type: null,
            raw_ref: null
          }
        ]
      })
    );

    expect(context?.focusNode.execution_blocked_count).toBe(1);
    expect(context?.focusNode.execution_blocking_reason).toBe(
      "No compatible sandbox backend is available."
    );
    expect(context?.focusNode.execution_fallback_count).toBe(1);
    expect(context?.focusNode.execution_fallback_reason).toBe("Downgraded to host execution.");
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

    const context = buildSensitiveAccessInboxEntryExecutionContext(
      entry,
      createRunSnapshot(),
      "run-current"
    );

    expect(context?.runId).toBe("run-current");
  });
});
