import { describe, expect, it } from "vitest";

import {
  buildSensitiveAccessInboxScopeChips,
  buildSensitiveAccessInboxSliceChips,
  clearSensitiveAccessInboxScopeFilters,
  clearSensitiveAccessInboxSliceFilters,
  hasActiveInboxFilters,
  hasActiveInboxScopeFilters,
  hasActiveInboxSliceFilters,
  type SensitiveAccessInboxPageFilterState
} from "./sensitive-access-inbox-page-shared";

const BASE_FILTERS: SensitiveAccessInboxPageFilterState = {
  status: null,
  waitingStatus: null,
  requestDecision: null,
  requesterType: null,
  notificationStatus: null,
  notificationChannel: null,
  runId: null,
  nodeRunId: null,
  accessRequestId: null,
  approvalTicketId: null
};

describe("sensitive access inbox filter helpers", () => {
  it("separates current scope chips from manual slice chips", () => {
    const filters: SensitiveAccessInboxPageFilterState = {
      ...BASE_FILTERS,
      status: "pending",
      waitingStatus: "waiting",
      requestDecision: "require_approval",
      requesterType: "ai",
      notificationStatus: "failed",
      notificationChannel: "slack",
      runId: "run-123",
      nodeRunId: "node-456",
      accessRequestId: "req12345abcdef",
      approvalTicketId: "ticket99abcdef"
    };

    expect(hasActiveInboxScopeFilters(filters)).toBe(true);
    expect(hasActiveInboxSliceFilters(filters)).toBe(true);
    expect(hasActiveInboxFilters(filters)).toBe(true);
    expect(buildSensitiveAccessInboxScopeChips(filters)).toEqual([
      { key: "status", label: "ticket pending" },
      { key: "waitingStatus", label: "recovery waiting" },
      { key: "requestDecision", label: "decision require_approval" },
      { key: "requesterType", label: "requester ai" },
      { key: "notificationStatus", label: "notify failed" },
      { key: "notificationChannel", label: "channel slack" }
    ]);
    expect(buildSensitiveAccessInboxSliceChips(filters)).toEqual([
      { key: "runId", label: "run slice run-123" },
      { key: "nodeRunId", label: "node run node-456" },
      { key: "accessRequestId", label: "request req12345" },
      { key: "approvalTicketId", label: "ticket ticket99" }
    ]);
  });

  it("clear scope filters keeps the manual slice intact", () => {
    const filters: SensitiveAccessInboxPageFilterState = {
      ...BASE_FILTERS,
      status: "approved",
      waitingStatus: "resumed",
      requestDecision: "allow",
      requesterType: "workflow",
      notificationStatus: "pending",
      notificationChannel: "email",
      runId: "run-keep",
      approvalTicketId: "ticket-keep"
    };

    expect(clearSensitiveAccessInboxScopeFilters(filters)).toEqual({
      ...BASE_FILTERS,
      runId: "run-keep",
      approvalTicketId: "ticket-keep"
    });
  });

  it("clear detail slice keeps the current filter scope intact", () => {
    const filters: SensitiveAccessInboxPageFilterState = {
      ...BASE_FILTERS,
      status: "pending",
      waitingStatus: "failed",
      requestDecision: "deny",
      requesterType: "human",
      notificationStatus: "delivered",
      notificationChannel: "in_app",
      runId: "run-temp",
      nodeRunId: "node-temp",
      accessRequestId: "request-temp",
      approvalTicketId: "ticket-temp"
    };

    expect(clearSensitiveAccessInboxSliceFilters(filters)).toEqual({
      ...BASE_FILTERS,
      status: "pending",
      waitingStatus: "failed",
      requestDecision: "deny",
      requesterType: "human",
      notificationStatus: "delivered",
      notificationChannel: "in_app"
    });
  });

  it("treats an empty filter state as inactive", () => {
    expect(hasActiveInboxScopeFilters(BASE_FILTERS)).toBe(false);
    expect(hasActiveInboxSliceFilters(BASE_FILTERS)).toBe(false);
    expect(hasActiveInboxFilters(BASE_FILTERS)).toBe(false);
  });
});
