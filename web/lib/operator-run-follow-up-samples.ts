import type { OperatorRunFollowUpSummary } from "@/app/actions/run-snapshot";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";

export type OperatorRunFollowUpSample = OperatorRunFollowUpSummary["sampledRuns"][number];

export type OperatorRunFollowUpSampleInboxContext = {
  kind: "approval blocker" | "callback waiting";
  href: string;
  hrefLabel: string | null;
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveOperatorRunFollowUpSample(
  runFollowUp?: OperatorRunFollowUpSummary | null,
  runId?: string | null
): OperatorRunFollowUpSample | null {
  const sampledRuns = runFollowUp?.sampledRuns ?? [];
  if (sampledRuns.length === 0) {
    return null;
  }

  const normalizedRunId = normalizeText(runId);
  if (!normalizedRunId) {
    return sampledRuns[0] ?? null;
  }

  return sampledRuns.find((sample) => normalizeText(sample.runId) === normalizedRunId) ?? sampledRuns[0] ?? null;
}

export function buildOperatorRunFollowUpSampleInboxContext({
  runFollowUp,
  runId
}: {
  runFollowUp?: OperatorRunFollowUpSummary | null;
  runId?: string | null;
}): OperatorRunFollowUpSampleInboxContext | null {
  const sample = resolveOperatorRunFollowUpSample(runFollowUp, runId);
  if (!sample) {
    return null;
  }

  const approvalEntry = sample.sensitiveAccessEntries?.find((entry) => entry.approval_ticket) ?? null;
  if (approvalEntry) {
    return {
      kind: "approval blocker",
      href: buildSensitiveAccessTimelineInboxHref(approvalEntry, sample.runId),
      hrefLabel: "open approval inbox slice"
    };
  }

  const callbackTicket = sample.callbackTickets?.[0] ?? null;
  if (!callbackTicket) {
    return null;
  }

  const href = buildCallbackTicketInboxHref(callbackTicket, {
    runId: sample.runId,
    nodeRunId: callbackTicket.node_run_id ?? sample.snapshot?.executionFocusNodeRunId ?? null
  });

  return href
    ? {
        kind: "callback waiting",
        href,
        hrefLabel: null
      }
    : null;
}
