import { describe, expect, it } from "vitest";

import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildBlockingPublishedInvocationInboxHref } from "@/lib/published-invocation-presenters";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";

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
    notifications: [],
    outcome_explanation: null,
    ...overrides
  };
}

describe("sensitive access run linking", () => {
  it("buildSensitiveAccessTimelineInboxHref falls back to sampled run_id", () => {
    const href = buildSensitiveAccessTimelineInboxHref(
      buildTimelineEntry({
        request: {
          ...buildTimelineEntry().request,
          run_id: null,
          node_run_id: null
        },
        approval_ticket: {
          ...buildTimelineEntry().approval_ticket!,
          run_id: null,
          node_run_id: null
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
              run_id: "run-sampled-1",
              snapshot: null
            }
          ],
          explanation: null
        }
      })
    );

    expect(href).toContain("run_id=run-sampled-1");
  });

  it("buildSensitiveAccessTimelineInboxHref prefers sampled run_id over default context", () => {
    const href = buildSensitiveAccessTimelineInboxHref(
      buildTimelineEntry({
        request: {
          ...buildTimelineEntry().request,
          run_id: null,
          node_run_id: null
        },
        approval_ticket: {
          ...buildTimelineEntry().approval_ticket!,
          run_id: null,
          node_run_id: null
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
              run_id: "run-sampled-ctx-1",
              snapshot: null
            }
          ],
          explanation: null
        }
      }),
      "run-context-1"
    );

    expect(href).toContain("run_id=run-sampled-ctx-1");
    expect(href).not.toContain("run_id=run-context-1");
  });

  it("buildBlockingPublishedInvocationInboxHref falls back to sampled run_id", () => {
    const href = buildBlockingPublishedInvocationInboxHref({
      runId: null,
      blockingNodeRunId: null,
      blockingSensitiveAccessEntries: [
        buildTimelineEntry({
          request: {
            ...buildTimelineEntry().request,
            run_id: null
          },
          approval_ticket: {
            ...buildTimelineEntry().approval_ticket!,
            run_id: null
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
                run_id: "run-sampled-2",
                snapshot: null
              }
            ],
            explanation: null
          }
        })
      ]
    });

    expect(href).toContain("run_id=run-sampled-2");
  });

  it("buildBlockingPublishedInvocationInboxHref prefers sampled run_id over invocation run_id", () => {
    const href = buildBlockingPublishedInvocationInboxHref({
      runId: "invocation-run-1",
      blockingNodeRunId: null,
      blockingSensitiveAccessEntries: [
        buildTimelineEntry({
          request: {
            ...buildTimelineEntry().request,
            run_id: null
          },
          approval_ticket: {
            ...buildTimelineEntry().approval_ticket!,
            run_id: null
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
                run_id: "run-sampled-ctx-2",
                snapshot: null
              }
            ],
            explanation: null
          }
        })
      ]
    });

    expect(href).toContain("run_id=run-sampled-ctx-2");
    expect(href).not.toContain("run_id=invocation-run-1");
  });
});
