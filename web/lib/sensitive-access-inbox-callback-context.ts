import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type { LegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import { buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff } from "@/lib/sensitive-access-inbox-workflow-governance";
import type {
  SensitiveAccessInboxEntry,
  SensitiveAccessTimelineEntry
} from "@/lib/get-sensitive-access";

export type SensitiveAccessInboxCallbackContext = {
  runId: string;
  displayNodeRunId: string;
  actionNodeRunId?: string | null;
  waitingReason?: string | null;
  lifecycle?: RunSnapshot["callbackWaitingLifecycle"];
  callbackWaitingExplanation?: RunSnapshot["callbackWaitingExplanation"];
  callbackTickets: [];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
  workflowCatalogGapSummary?: string | null;
  workflowCatalogGapDetail?: string | null;
  workflowGovernanceHref?: string | null;
  legacyAuthHandoff?: LegacyPublishAuthWorkflowHandoff | null;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasCallbackSignals(runSnapshot?: RunSnapshot | null) {
  return Boolean(
    runSnapshot?.waitingReason ||
      runSnapshot?.callbackWaitingLifecycle ||
      typeof runSnapshot?.scheduledResumeDelaySeconds === "number" ||
      runSnapshot?.scheduledResumeRequeuedAt
  );
}

function buildInlineSensitiveAccessEntries(
  entry: SensitiveAccessInboxEntry
): SensitiveAccessTimelineEntry[] {
  if (!entry.request || !entry.resource) {
    return [];
  }

  return [
    {
      request: entry.request,
      resource: entry.resource,
      approval_ticket: entry.ticket,
      notifications: entry.notifications
    }
  ];
}

export function buildSensitiveAccessInboxEntryCallbackContext(
  entry: SensitiveAccessInboxEntry,
  runSnapshot?: RunSnapshot | null,
  canonicalRunId?: string | null
): SensitiveAccessInboxCallbackContext | null {
  const runId =
    trimOrNull(canonicalRunId) ??
    trimOrNull(entry.ticket.run_id) ??
    trimOrNull(entry.request?.run_id) ??
    trimOrNull(entry.runFollowUp?.sampledRuns[0]?.runId);
  const actionNodeRunId =
    trimOrNull(entry.ticket.node_run_id) ?? trimOrNull(entry.request?.node_run_id);
  const displayNodeRunId =
    trimOrNull(runSnapshot?.executionFocusNodeRunId) ??
    actionNodeRunId;
  const inlineSensitiveAccessEntries = buildInlineSensitiveAccessEntries(entry);
  if (!runId || !displayNodeRunId || !hasCallbackSignals(runSnapshot)) {
    return null;
  }

  const workflowGovernanceHandoff =
    buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
      entry,
      runSnapshot,
      canonicalRunId,
      subjectLabel: "callback summary",
      returnDetail:
        "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续处理当前 sensitive access inbox slice 与 callback waiting。"
    });

  return {
    runId,
    displayNodeRunId,
    actionNodeRunId,
    waitingReason: runSnapshot?.waitingReason ?? null,
    lifecycle: runSnapshot?.callbackWaitingLifecycle ?? null,
    callbackWaitingExplanation: runSnapshot?.callbackWaitingExplanation ?? null,
    callbackTickets: [],
    sensitiveAccessEntries: inlineSensitiveAccessEntries,
    scheduledResumeDelaySeconds: runSnapshot?.scheduledResumeDelaySeconds ?? null,
    scheduledResumeSource: runSnapshot?.scheduledResumeSource ?? null,
    scheduledWaitingStatus: runSnapshot?.scheduledWaitingStatus ?? null,
    scheduledResumeScheduledAt: runSnapshot?.scheduledResumeScheduledAt ?? null,
    scheduledResumeDueAt: runSnapshot?.scheduledResumeDueAt ?? null,
    scheduledResumeRequeuedAt: runSnapshot?.scheduledResumeRequeuedAt ?? null,
    scheduledResumeRequeueSource: runSnapshot?.scheduledResumeRequeueSource ?? null,
    workflowCatalogGapSummary: workflowGovernanceHandoff.workflowCatalogGapSummary,
    workflowCatalogGapDetail: workflowGovernanceHandoff.workflowCatalogGapDetail,
    workflowGovernanceHref: workflowGovernanceHandoff.workflowGovernanceHref,
    legacyAuthHandoff: workflowGovernanceHandoff.legacyAuthHandoff
  };
}
