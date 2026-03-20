import { describe, expect, it } from "vitest";

import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

import {
  resolveSensitiveAccessInboxEntryActionScope,
  resolveSensitiveAccessInboxEntryScope,
  resolveSensitiveAccessInboxEntryScopes
} from "./sensitive-access-inbox-entry-scope";

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
    executionContext: null,
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

  it("展示 scope 会跟随 execution focus，动作 scope 仍保留条目节点", () => {
    const entry = buildEntry({
      ticket: {
        id: "ticket-1",
        access_request_id: "req-1",
        run_id: null,
        node_run_id: null,
        status: "pending",
        waiting_status: "waiting",
        created_at: "2026-03-18T00:00:00Z"
      },
      request: {
        id: "req-1",
        run_id: null,
        node_run_id: null,
        requester_type: "workflow",
        requester_id: "workflow.demo",
        resource_id: "res-1",
        action_type: "read",
        created_at: "2026-03-18T00:00:00Z"
      },
      executionContext: {
        runId: "run-focus",
        focusReason: "blocked_execution",
        focusMatchesEntry: false,
        skillTrace: null,
        entryNodeRunId: "node-entry",
        focusNode: {
          node_run_id: "node-focus",
          node_id: "node-focus",
          node_name: "Focus Node",
          node_type: "tool",
          execution_fallback_count: 0,
          execution_blocked_count: 1,
          execution_unavailable_count: 0,
          execution_blocking_reason: "sandbox backend unavailable",
          execution_fallback_reason: null,
          waiting_reason: null,
          scheduled_resume_delay_seconds: null,
          scheduled_resume_due_at: null,
          callback_tickets: [],
          sensitive_access_entries: [],
          artifact_refs: [],
          artifacts: [],
          tool_calls: []
        }
      }
    });

    expect(resolveSensitiveAccessInboxEntryScope(entry)).toEqual({
      runId: "run-focus",
      nodeRunId: "node-focus"
    });
    expect(resolveSensitiveAccessInboxEntryActionScope(entry)).toEqual({
      runId: "run-focus",
      nodeRunId: "node-entry"
    });
  });

  it("展示 scope 可以复用 callback waiting 的当前节点，但动作 scope 会退回 run 级而不是借用展示节点", () => {
    const entry = buildEntry({
      ticket: {
        id: "ticket-1",
        access_request_id: "req-1",
        run_id: null,
        node_run_id: null,
        status: "pending",
        waiting_status: "waiting",
        created_at: "2026-03-18T00:00:00Z"
      },
      request: {
        id: "req-1",
        run_id: null,
        node_run_id: null,
        requester_type: "workflow",
        requester_id: "workflow.demo",
        resource_id: "res-1",
        action_type: "read",
        created_at: "2026-03-18T00:00:00Z"
      },
      callbackWaitingContext: {
        runId: "run-focus",
        nodeRunId: "node-focus",
        callbackTickets: [],
        sensitiveAccessEntries: []
      },
      executionContext: {
        runId: "run-focus",
        focusReason: "blocked_execution",
        focusMatchesEntry: false,
        skillTrace: null,
        entryNodeRunId: null,
        focusNode: {
          node_run_id: "node-focus",
          node_id: "node-focus",
          node_name: "Focus Node",
          node_type: "tool",
          execution_fallback_count: 0,
          execution_blocked_count: 1,
          execution_unavailable_count: 0,
          execution_blocking_reason: "sandbox backend unavailable",
          execution_fallback_reason: null,
          waiting_reason: null,
          scheduled_resume_delay_seconds: null,
          scheduled_resume_due_at: null,
          callback_tickets: [],
          sensitive_access_entries: [],
          artifact_refs: [],
          artifacts: [],
          tool_calls: []
        }
      }
    });

    expect(resolveSensitiveAccessInboxEntryScopes(entry)).toEqual({
      display: {
        runId: "run-focus",
        nodeRunId: "node-focus"
      },
      action: {
        runId: "run-focus",
        nodeRunId: null
      }
    });
    expect(resolveSensitiveAccessInboxEntryActionScope(entry)).toEqual({
      runId: "run-focus",
      nodeRunId: null
    });
  });
});
