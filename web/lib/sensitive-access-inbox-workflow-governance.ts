import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import { resolveOperatorRunFollowUpSample } from "@/lib/operator-run-follow-up-samples";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff,
  type WorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveSensitiveAccessInboxEntryRunId(
  entry: SensitiveAccessInboxEntry,
  canonicalRunId?: string | null
) {
  return (
    trimOrNull(canonicalRunId) ??
    trimOrNull(entry.ticket.run_id) ??
    trimOrNull(entry.request?.run_id) ??
    trimOrNull(entry.runFollowUp?.sampledRuns[0]?.runId)
  );
}

export function buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
  entry,
  runSnapshot = null,
  canonicalRunId = null,
  subjectLabel,
  returnDetail
}: {
  entry: SensitiveAccessInboxEntry;
  runSnapshot?: RunSnapshot | null;
  canonicalRunId?: string | null;
  subjectLabel: string;
  returnDetail: string;
}): WorkflowGovernanceHandoff {
  const runId = resolveSensitiveAccessInboxEntryRunId(entry, canonicalRunId);
  const workflowGovernanceSample = resolveOperatorRunFollowUpSample(entry.runFollowUp, runId);
  const toolGovernance = workflowGovernanceSample?.toolGovernance ?? null;

  return buildWorkflowGovernanceHandoff({
    workflowId:
      trimOrNull(runSnapshot?.workflowId) ??
      trimOrNull(workflowGovernanceSample?.snapshot?.workflowId) ??
      null,
    toolGovernance,
    legacyAuthGovernance:
      workflowGovernanceSample?.legacyAuthGovernance ?? entry.legacyAuthGovernance ?? null,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance,
      subjectLabel,
      returnDetail
    })
  });
}
