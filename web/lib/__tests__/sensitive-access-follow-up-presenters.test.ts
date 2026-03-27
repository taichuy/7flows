import { describe, expect, it } from "vitest";

import { resolveSensitiveAccessPrimaryBacklog } from "../sensitive-access-follow-up-presenters";

describe("resolveSensitiveAccessPrimaryBacklog", () => {
  it("prioritizes pending approval before other operator backlog slices", () => {
    expect(
      resolveSensitiveAccessPrimaryBacklog({
        pendingApprovalCount: 2,
        waitingResumeCount: 1,
        failedNotificationCount: 3,
        pendingNotificationCount: 4,
        rejectedApprovalCount: 1,
        expiredApprovalCount: 1
      })
    ).toEqual({
      kind: "pending_approval",
      count: 2,
      countLabel: "pending approval ticket",
      href: "/sensitive-access?status=pending"
    });
  });

  it("maps waiting resume backlog to the waiting inbox slice", () => {
    expect(
      resolveSensitiveAccessPrimaryBacklog({
        pendingApprovalCount: 0,
        waitingResumeCount: 2,
        failedNotificationCount: 1,
        pendingNotificationCount: 1
      })
    ).toEqual({
      kind: "waiting_resume",
      count: 2,
      countLabel: "waiting resume",
      href: "/sensitive-access?waiting_status=waiting"
    });
  });

  it("falls back to rejected approval follow-up when no live backlog remains", () => {
    expect(
      resolveSensitiveAccessPrimaryBacklog({
        pendingApprovalCount: 0,
        waitingResumeCount: 0,
        failedNotificationCount: 0,
        pendingNotificationCount: 0,
        rejectedApprovalCount: 1,
        expiredApprovalCount: 1
      })
    ).toEqual({
      kind: "rejected_approval",
      count: 1,
      countLabel: "rejected approval ticket",
      href: "/sensitive-access?status=rejected"
    });
  });

  it("returns null when summary no longer has any operator backlog", () => {
    expect(
      resolveSensitiveAccessPrimaryBacklog({
        pendingApprovalCount: 0,
        waitingResumeCount: 0,
        failedNotificationCount: 0,
        pendingNotificationCount: 0,
        rejectedApprovalCount: 0,
        expiredApprovalCount: 0
      })
    ).toBeNull();
  });
});
