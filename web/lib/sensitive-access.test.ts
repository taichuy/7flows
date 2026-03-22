import { describe, expect, it } from "vitest";

import {
  parseSensitiveAccessBlockingResponse,
  parseSensitiveAccessGuardedResponse,
  resolveSensitiveAccessCanonicalRunSnapshot,
  type SensitiveAccessBlockingPayload
} from "@/lib/sensitive-access";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

type RawBlockingPayload = Omit<
  SensitiveAccessBlockingPayload,
  "run_snapshot" | "run_follow_up"
> & {
  run_snapshot: {
    status: string;
    workflow_id: string;
    current_node_id: string;
    waiting_reason: string;
    execution_focus_node_id: string;
    execution_focus_node_run_id: string;
    execution_focus_node_name: string;
  };
  run_follow_up: {
    explanation: {
      primary_signal: string;
      follow_up: string;
    };
    affected_run_count: number;
    sampled_run_count: number;
    waiting_run_count: number;
    running_run_count: number;
    succeeded_run_count: number;
    failed_run_count: number;
    unknown_run_count: number;
    sampled_runs: Array<{
      run_id: string;
      snapshot: {
        status: string;
        current_node_id: string;
        waiting_reason: string;
        execution_focus_node_id: string;
        execution_focus_node_run_id: string;
        execution_focus_node_name: string;
      };
      callback_tickets?: Array<{
        ticket: string;
        run_id: string;
        node_run_id: string;
        status: string;
        waiting_status: string;
        tool_call_index: number;
        created_at: string;
      }>;
      sensitive_access_entries?: SensitiveAccessTimelineEntry[];
    }>;
  };
};

function buildBlockingPayload(): RawBlockingPayload {
  return {
    detail: "Run trace export requires approval before the payload can be exported.",
    resource: {
      id: "resource-1",
      label: "Trace Export",
      description: "Sensitive trace export",
      sensitivity_level: "L2",
      source: "workspace_resource",
      metadata: {
        run_id: "run-1"
      }
    },
    access_request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "human",
      requester_id: "ops-debugger",
      resource_id: "resource-1",
      action_type: "export",
      decision: "require_approval"
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
    notifications: [
      {
        id: "notification-1",
        approval_ticket_id: "ticket-1",
        channel: "in_app",
        target: "sensitive-access-inbox",
        status: "pending"
      }
    ],
    outcome_explanation: {
      primary_signal: "当前阻断来自敏感访问审批票据。",
      follow_up: "下一步：优先处理审批票据，再观察 waiting 节点是否恢复。"
    },
    run_snapshot: {
      status: "waiting",
      workflow_id: "workflow-1",
      current_node_id: "mock_tool",
      waiting_reason: "waiting approval",
      execution_focus_node_id: "mock_tool",
      execution_focus_node_run_id: "node-run-1",
      execution_focus_node_name: "Mock Tool"
    },
    run_follow_up: {
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-1：当前 run 状态：waiting。"
      },
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
            status: "waiting",
            current_node_id: "mock_tool",
            waiting_reason: "waiting approval",
            execution_focus_node_id: "mock_tool",
            execution_focus_node_run_id: "node-run-1",
            execution_focus_node_name: "Mock Tool"
          },
          callback_tickets: [
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
          sensitive_access_entries: [
            {
              request: {
                id: "request-1",
                run_id: "run-1",
                node_run_id: "node-run-1",
                requester_type: "human",
                requester_id: "ops-debugger",
                resource_id: "resource-1",
                action_type: "export",
                purpose_text: "export trace",
                decision: "require_approval",
                decision_label: "Require approval",
                reason_code: "policy_requires_approval",
                reason_label: "Policy requires approval",
                policy_summary: "Sensitive trace export requires approval.",
                created_at: "2026-03-20T10:00:00Z",
                decided_at: null
              },
              resource: {
                id: "resource-1",
                label: "Trace Export",
                description: "Sensitive trace export",
                sensitivity_level: "L2",
                source: "workspace_resource",
                metadata: {},
                created_at: "2026-03-20T09:00:00Z",
                updated_at: "2026-03-20T09:00:00Z"
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
  };
}

describe("parseSensitiveAccessBlockingResponse", () => {
  it("keeps canonical follow-up payload fields when present", async () => {
    const response = new Response(
      JSON.stringify(buildBlockingPayload()),
      {
        status: 409,
        headers: {
          "content-type": "application/json"
        }
      }
    );

    const parsed = await parseSensitiveAccessBlockingResponse(response);

    expect(parsed?.payload.outcome_explanation?.primary_signal).toContain("敏感访问审批票据");
    expect(parsed?.payload.run_snapshot?.status).toBe("waiting");
    expect(parsed?.payload.run_snapshot?.currentNodeId).toBe("mock_tool");
    expect(parsed?.payload.run_follow_up?.explanation?.primary_signal).toContain("影响 1 个 run");
    expect(parsed?.payload.run_follow_up?.sampledRuns[0]?.runId).toBe("run-1");
    expect(parsed?.payload.run_follow_up?.sampledRuns[0]?.snapshot?.currentNodeId).toBe(
      "mock_tool"
    );
    expect(parsed?.payload.run_follow_up?.sampledRuns[0]?.callbackTickets).toHaveLength(1);
    expect(parsed?.payload.run_follow_up?.sampledRuns[0]?.sensitiveAccessEntries).toHaveLength(1);
  });

  it("parses denied 403 payloads through the guarded response helper", async () => {
    const response = new Response(JSON.stringify(buildBlockingPayload()), {
      status: 403,
      headers: {
        "content-type": "application/json"
      }
    });

    const parsed = await parseSensitiveAccessGuardedResponse<Record<string, unknown>>(response);

    expect(parsed?.kind).toBe("blocked");
    if (parsed?.kind !== "blocked") {
      throw new Error("expected blocked result");
    }
    expect(parsed.statusCode).toBe(403);
    expect(parsed.payload.outcome_explanation?.follow_up).toContain("优先处理审批票据");
    expect(parsed.payload.run_follow_up?.affectedRunCount).toBe(1);
    expect(parsed.payload.run_follow_up?.sampledRunCount).toBe(1);
  });
});

describe("resolveSensitiveAccessCanonicalRunSnapshot", () => {
  it("matches the current run before falling back to the first sampled snapshot", () => {
    const resolved = resolveSensitiveAccessCanonicalRunSnapshot({
      requestRunId: "run-current",
      runSnapshot: null,
      runFollowUp: {
        affectedRunCount: 2,
        sampledRunCount: 2,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 1,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 2 个 run；已回读 2 个样本。"
        },
        sampledRuns: [
          {
            runId: "run-stale",
            snapshot: {
              status: "failed",
              currentNodeId: "stale-node",
              waitingReason: "stale blocker"
            }
          },
          {
            runId: "run-current",
            snapshot: {
              status: "waiting",
              currentNodeId: "current-node",
              waitingReason: "waiting approval"
            }
          }
        ]
      }
    });

    expect(resolved.runId).toBe("run-current");
    expect(resolved.snapshot?.currentNodeId).toBe("current-node");
    expect(resolved.snapshot?.waitingReason).toBe("waiting approval");
  });
});
