import { describe, expect, it } from "vitest";

import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

import { resolveSensitiveAccessInboxEntryScope } from "./sensitive-access-inbox-entry-scope";

function buildEntry(overrides?: Partial<SensitiveAccessInboxEntry>): SensitiveAccessInboxEntry {
  return {
    ticket: {
      id: "ticket-1",
      access_request_id: "req-1",
      run_id: "run-1",
      node_run_id: "node-1",
      status: "pending",
      waiting_status: "waiting",
      created_at: "2026-03-18T00:00:00Z"
    },
    request: {
      id: "req-1",
      run_id: "run-1",
      node_run_id: "node-1",
      requester_type: "workflow",
      requester_id: "workflow.demo",
      resource_id: "res-1",
      action_type: "read",
      created_at: "2026-03-18T00:00:00Z"
    },
    resource: null,
    notifications: [],
    callbackWaitingContext: null,
    ...overrides
  };
}

describe("resolveSensitiveAccessInboxEntryScope", () => {
  it("优先返回票据或请求上已有的 run/node scope", () => {
    const entry = buildEntry();

    expect(resolveSensitiveAccessInboxEntryScope(entry)).toEqual({
      runId: "run-1",
      nodeRunId: "node-1"
    });
  });

  it("在票据和请求缺少 node_run_id 时回退到 callback waiting 上下文", () => {
    const entry = buildEntry({
      ticket: {
        id: "ticket-1",
        access_request_id: "req-1",
        run_id: "run-1",
        node_run_id: null,
        status: "pending",
        waiting_status: "waiting",
        created_at: "2026-03-18T00:00:00Z"
      },
      request: {
        id: "req-1",
        run_id: "run-1",
        node_run_id: null,
        requester_type: "workflow",
        requester_id: "workflow.demo",
        resource_id: "res-1",
        action_type: "read",
        created_at: "2026-03-18T00:00:00Z"
      },
      callbackWaitingContext: {
        runId: "run-1",
        nodeRunId: "node-callback",
        callbackTickets: [],
        sensitiveAccessEntries: []
      }
    });

    expect(resolveSensitiveAccessInboxEntryScope(entry)).toEqual({
      runId: "run-1",
      nodeRunId: "node-callback"
    });
  });
});
