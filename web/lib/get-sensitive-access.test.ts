import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSensitiveAccessInboxSnapshot } from "./get-sensitive-access";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

describe("getSensitiveAccessInboxSnapshot", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the inbox snapshot from the canonical inbox api", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            ticket: {
              id: "ticket-1",
              access_request_id: "request-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              approved_by: null,
              decided_at: null,
              expires_at: "2026-03-19T10:05:00Z",
              created_at: "2026-03-19T10:00:00Z"
            },
            request: {
              id: "request-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              requester_type: "ai",
              requester_id: "assistant-inbox",
              resource_id: "resource-1",
              action_type: "read",
              purpose_text: "Inspect the inbox contract.",
              decision: "require_approval",
              decision_label: "Require approval",
              reason_code: "sensitive_callback",
              reason_label: "Sensitive callback",
              policy_summary: "Wait for operator approval before resuming.",
              created_at: "2026-03-19T10:00:00Z",
              decided_at: null
            },
            resource: {
              id: "resource-1",
              label: "Inbox approval secret",
              description: null,
              sensitivity_level: "L3",
              source: "published_secret",
              metadata: {},
              created_at: "2026-03-19T09:00:00Z",
              updated_at: "2026-03-19T09:00:00Z"
            },
            notifications: [
              {
                id: "notification-1",
                approval_ticket_id: "ticket-1",
                channel: "in_app",
                target: "sensitive-access-inbox",
                status: "pending",
                delivered_at: null,
                error: null,
                created_at: "2026-03-19T10:00:00Z"
              }
            ]
          }
        ],
        channels: [
          {
            channel: "in_app",
            delivery_mode: "inline",
            target_kind: "in_app",
            configured: true,
            health_status: "ready",
            summary: "Inline inbox write-through",
            target_hint: "???? inbox",
            target_example: "sensitive-access-inbox",
            health_reason: "ready",
            config_facts: [],
            dispatch_summary: {
              pending_count: 1,
              delivered_count: 0,
              failed_count: 0,
              latest_dispatch_at: null,
              latest_delivered_at: null,
              latest_failure_at: null,
              latest_failure_error: null,
              latest_failure_target: null
            }
          }
        ],
        resources: [
          {
            id: "resource-1",
            label: "Inbox approval secret",
            description: null,
            sensitivity_level: "L3",
            source: "published_secret",
            metadata: {},
            created_at: "2026-03-19T09:00:00Z",
            updated_at: "2026-03-19T09:00:00Z"
          }
        ],
        requests: [
          {
            id: "request-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            requester_type: "ai",
            requester_id: "assistant-inbox",
            resource_id: "resource-1",
            action_type: "read",
            purpose_text: "Inspect the inbox contract.",
            decision: "require_approval",
            decision_label: "Require approval",
            reason_code: "sensitive_callback",
            reason_label: "Sensitive callback",
            policy_summary: "Wait for operator approval before resuming.",
            created_at: "2026-03-19T10:00:00Z",
            decided_at: null
          }
        ],
        notifications: [
          {
            id: "notification-1",
            approval_ticket_id: "ticket-1",
            channel: "in_app",
            target: "sensitive-access-inbox",
            status: "pending",
            delivered_at: null,
            error: null,
            created_at: "2026-03-19T10:00:00Z"
          }
        ],
        execution_views: [],
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          approved_ticket_count: 0,
          rejected_ticket_count: 0,
          expired_ticket_count: 0,
          waiting_ticket_count: 1,
          resumed_ticket_count: 0,
          failed_ticket_count: 0,
          pending_notification_count: 1,
          delivered_notification_count: 0,
          failed_notification_count: 0
        }
      })
    } as Response);

    const snapshot = await getSensitiveAccessInboxSnapshot({
      ticketStatus: "pending",
      runId: "run-1"
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toBe(
      "http://api.test/api/sensitive-access/inbox?status=pending&run_id=run-1"
    );
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.ticket.id).toBe("ticket-1");
    expect(snapshot.entries[0]?.request?.id).toBe("request-1");
    expect(snapshot.entries[0]?.resource?.id).toBe("resource-1");
    expect(snapshot.entries[0]?.notifications).toHaveLength(1);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.summary.ticket_count).toBe(1);
    expect(snapshot.summary.pending_notification_count).toBe(1);
  });
});
