import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import { resolveOperatorRunFollowUpSample } from "@/lib/operator-run-follow-up-samples";
import {
  buildWorkflowGovernanceDetailHrefFromCurrentHref,
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
  resolveWorkflowDetailHref = null,
  currentHref = null,
  subjectLabel,
  returnDetail
}: {
  entry: SensitiveAccessInboxEntry;
  runSnapshot?: RunSnapshot | null;
  canonicalRunId?: string | null;
  resolveWorkflowDetailHref?: ((workflowId: string) => string | null) | null;
  currentHref?: string | null;
  subjectLabel: string;
  returnDetail: string;
}): WorkflowGovernanceHandoff {
  const runId = resolveSensitiveAccessInboxEntryRunId(entry, canonicalRunId);
  const workflowGovernanceSample = resolveOperatorRunFollowUpSample(entry.runFollowUp, runId);
  const legacyAuthGovernance =
    workflowGovernanceSample?.legacyAuthGovernance ?? entry.legacyAuthGovernance ?? null;
  const workflowId =
    trimOrNull(runSnapshot?.workflowId) ??
    trimOrNull(workflowGovernanceSample?.snapshot?.workflowId) ??
    null;
  const toolGovernance =
    workflowGovernanceSample?.toolGovernance ??
    (workflowId
      ? legacyAuthGovernance?.workflows.find((workflow) => workflow.workflow_id === workflowId)
          ?.tool_governance ?? null
      : null) ??
    legacyAuthGovernance?.workflows[0]?.tool_governance ??
    null;

  return buildWorkflowGovernanceHandoff({
    workflowId,
    workflowDetailHref: workflowId
      ? resolveWorkflowDetailHref?.(workflowId) ??
        buildWorkflowGovernanceDetailHrefFromCurrentHref({
          workflowId,
          currentHref
        })
      : null,
    toolGovernance,
    legacyAuthGovernance,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance,
      subjectLabel,
      returnDetail
    })
  });
}
