import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";

export type SensitiveAccessPrimaryBacklogKind =
  | "pending_approval"
  | "waiting_resume"
  | "failed_notification"
  | "pending_notification"
  | "rejected_approval"
  | "expired_approval";

export type SensitiveAccessPrimaryBacklog = {
  kind: SensitiveAccessPrimaryBacklogKind;
  count: number;
  countLabel: string;
  href: string;
};

type ResolveSensitiveAccessPrimaryBacklogInput = {
  pendingApprovalCount?: number | null;
  waitingResumeCount?: number | null;
  failedNotificationCount?: number | null;
  pendingNotificationCount?: number | null;
  rejectedApprovalCount?: number | null;
  expiredApprovalCount?: number | null;
};

function normalizeCount(count?: number | null) {
  return Math.max(Number(count ?? 0), 0);
}

function entryHasNotificationStatus(
  entry: SensitiveAccessInboxEntry,
  status: "failed" | "pending"
) {
  return entry.notifications.some((notification) => notification.status === status);
}

export function resolveSensitiveAccessPrimaryBacklog({
  pendingApprovalCount,
  waitingResumeCount,
  failedNotificationCount,
  pendingNotificationCount,
  rejectedApprovalCount,
  expiredApprovalCount
}: ResolveSensitiveAccessPrimaryBacklogInput): SensitiveAccessPrimaryBacklog | null {
  const candidates: SensitiveAccessPrimaryBacklog[] = [
    {
      kind: "pending_approval",
      count: normalizeCount(pendingApprovalCount),
      countLabel: "pending approval ticket",
      href: buildSensitiveAccessInboxHref({ status: "pending" })
    },
    {
      kind: "waiting_resume",
      count: normalizeCount(waitingResumeCount),
      countLabel: "waiting resume",
      href: buildSensitiveAccessInboxHref({ waitingStatus: "waiting" })
    },
    {
      kind: "failed_notification",
      count: normalizeCount(failedNotificationCount),
      countLabel: "failed notification",
      href: buildSensitiveAccessInboxHref({ notificationStatus: "failed" })
    },
    {
      kind: "pending_notification",
      count: normalizeCount(pendingNotificationCount),
      countLabel: "pending notification",
      href: buildSensitiveAccessInboxHref({ notificationStatus: "pending" })
    },
    {
      kind: "rejected_approval",
      count: normalizeCount(rejectedApprovalCount),
      countLabel: "rejected approval ticket",
      href: buildSensitiveAccessInboxHref({ status: "rejected" })
    },
    {
      kind: "expired_approval",
      count: normalizeCount(expiredApprovalCount),
      countLabel: "expired approval ticket",
      href: buildSensitiveAccessInboxHref({ status: "expired" })
    }
  ];

  return candidates.find((candidate) => candidate.count > 0) ?? null;
}

export function findSensitiveAccessPrimaryBacklogEntry(
  entries: SensitiveAccessInboxEntry[],
  backlogKind: NonNullable<ReturnType<typeof resolveSensitiveAccessPrimaryBacklog>>["kind"]
) {
  switch (backlogKind) {
    case "pending_approval":
      return entries.find((entry) => entry.ticket.status === "pending") ?? null;
    case "waiting_resume":
      return entries.find((entry) => entry.ticket.waiting_status === "waiting") ?? null;
    case "failed_notification":
      return entries.find((entry) => entryHasNotificationStatus(entry, "failed")) ?? null;
    case "pending_notification":
      return entries.find((entry) => entryHasNotificationStatus(entry, "pending")) ?? null;
    case "rejected_approval":
      return entries.find((entry) => entry.ticket.status === "rejected") ?? null;
    case "expired_approval":
      return entries.find((entry) => entry.ticket.status === "expired") ?? null;
    default:
      return null;
  }
}
