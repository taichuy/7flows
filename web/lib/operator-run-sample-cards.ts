import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import type { LegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";
import type { SkillReferenceLoadItem } from "@/lib/get-run-views";
import {
  buildExecutionFocusExplainableNode,
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineFocusArtifactPreview
} from "@/lib/operator-inline-action-feedback";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import {
  listExecutionFocusRuntimeFactBadges,
  type ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";

export type OperatorRunSampleCard = {
  runId: string;
  shortRunId: string;
  hasCallbackWaitingSummary: boolean;
  summary: string | null;
  runStatus: string | null;
  currentNodeId: string | null;
  focusNodeId: string | null;
  focusNodeLabel: string | null;
  focusNodeRunId: string | null;
  waitingReason: string | null;
  workflowCatalogGapHref: string | null;
  workflowGovernanceHref: string | null;
  workflowCatalogGapSummary: string | null;
  workflowCatalogGapDetail: string | null;
  legacyAuthHandoff: LegacyPublishAuthWorkflowHandoff | null;
  executionFactBadges: string[];
  callbackWaitingExplanation: NonNullable<RunSnapshotWithId["snapshot"]>["callbackWaitingExplanation"] | null;
  callbackWaitingLifecycle: NonNullable<RunSnapshotWithId["snapshot"]>["callbackWaitingLifecycle"] | null;
  callbackWaitingFocusNodeEvidence: ReturnType<typeof buildExecutionFocusExplainableNode>;
  callbackTickets: NonNullable<RunSnapshotWithId["callbackTickets"]>;
  sensitiveAccessEntries: NonNullable<RunSnapshotWithId["sensitiveAccessEntries"]>;
  inboxHref: string | null;
  scheduledResumeDelaySeconds: number | null;
  scheduledResumeSource: string | null;
  scheduledWaitingStatus: string | null;
  scheduledResumeScheduledAt: string | null;
  scheduledResumeDueAt: string | null;
  scheduledResumeRequeuedAt: string | null;
  scheduledResumeRequeueSource: string | null;
  artifactCount: number;
  artifactRefCount: number;
  toolCallCount: number;
  rawRefCount: number;
  skillReferenceCount: number;
  skillReferencePhaseSummary: string | null;
  skillReferenceSourceSummary: string | null;
  focusArtifactSummary: string | null;
  focusToolCallSummaries: ExecutionFocusToolCallSummary[];
  focusArtifacts: OperatorInlineFocusArtifactPreview[];
  focusSkillReferenceLoads: SkillReferenceLoadItem[];
  sandboxReadinessNode: ReturnType<typeof buildSandboxReadinessNodeFromRunSnapshot>;
};

type BuildOperatorRunSampleCardsOptions = {
  resolveWorkflowDetailHref?: ((workflowId: string) => string | null) | null;
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function buildOperatorRunSampleInboxHref(sample: RunSnapshotWithId) {
  const sensitiveAccessEntries = sample.sensitiveAccessEntries ?? [];
  const latestApprovalEntry = sensitiveAccessEntries.find((entry) => entry.approval_ticket) ?? null;
  if (latestApprovalEntry) {
    return buildSensitiveAccessTimelineInboxHref(latestApprovalEntry, sample.runId);
  }

  const callbackTickets = sample.callbackTickets ?? [];
  const firstCallbackTicket = callbackTickets[0] ?? null;
  if (!firstCallbackTicket) {
    return null;
  }

  return buildCallbackTicketInboxHref(firstCallbackTicket, {
    runId: sample.runId,
    nodeRunId: firstCallbackTicket.node_run_id ?? sample.snapshot?.executionFocusNodeRunId ?? null
  });
}

export function buildOperatorRunSampleCards(
  sampledRuns: RunSnapshotWithId[],
  { resolveWorkflowDetailHref = null }: BuildOperatorRunSampleCardsOptions = {}
): OperatorRunSampleCard[] {
  return sampledRuns
    .map((sample) => {
      const snapshot = sample.snapshot ?? null;
      const workflowId = normalizeText(snapshot?.workflowId);
      const callbackTickets = sample.callbackTickets ?? [];
      const sensitiveAccessEntries = sample.sensitiveAccessEntries ?? [];
      const workflowCatalogGapDetail = buildWorkflowCatalogGapDetail({
        toolGovernance: sample.toolGovernance,
        subjectLabel: "sampled run",
        returnDetail:
          "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照 compact snapshot 与 callback 事实。"
      });
      const workflowGovernanceHandoff = buildWorkflowGovernanceHandoff({
        workflowId,
        workflowDetailHref: workflowId ? resolveWorkflowDetailHref?.(workflowId) ?? null : null,
        toolGovernance: sample.toolGovernance,
        legacyAuthGovernance: sample.legacyAuthGovernance,
        workflowCatalogGapDetail
      });
      const model = buildOperatorInlineActionFeedbackModel({ runSnapshot: snapshot });
      const focusNodeEvidence = buildExecutionFocusExplainableNode(snapshot);
      const callbackWaitingExplanation = snapshot?.callbackWaitingExplanation ?? null;
      const callbackWaitingLifecycle = snapshot?.callbackWaitingLifecycle ?? null;
      const scheduledResumeDelaySeconds =
        typeof snapshot?.scheduledResumeDelaySeconds === "number"
          ? snapshot.scheduledResumeDelaySeconds
          : null;
      const scheduledResumeSource = normalizeText(snapshot?.scheduledResumeSource);
      const scheduledWaitingStatus = normalizeText(snapshot?.scheduledWaitingStatus);
      const scheduledResumeScheduledAt = normalizeText(snapshot?.scheduledResumeScheduledAt);
      const scheduledResumeDueAt = normalizeText(snapshot?.scheduledResumeDueAt);
      const scheduledResumeRequeuedAt = normalizeText(snapshot?.scheduledResumeRequeuedAt);
      const scheduledResumeRequeueSource = normalizeText(snapshot?.scheduledResumeRequeueSource);
      const sandboxReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(snapshot);

      return {
        runId: sample.runId,
        shortRunId: sample.runId.slice(0, 8),
        hasCallbackWaitingSummary: hasCallbackWaitingSummaryFacts({
          callbackWaitingExplanation,
          callbackWaitingLifecycle,
          waitingReason: model.waitingReason,
          scheduledResumeDelaySeconds,
          scheduledResumeSource,
          scheduledWaitingStatus,
          scheduledResumeScheduledAt,
          scheduledResumeDueAt,
          scheduledResumeRequeuedAt,
          scheduledResumeRequeueSource
        }),
        summary: model.runSnapshotSummary ?? model.headline,
        runStatus: model.runStatus,
        currentNodeId: model.currentNodeId,
        focusNodeId: normalizeText(snapshot?.executionFocusNodeId),
        focusNodeLabel: model.focusNodeLabel,
        focusNodeRunId: normalizeText(snapshot?.executionFocusNodeRunId),
        waitingReason: model.waitingReason,
        workflowCatalogGapHref: workflowGovernanceHandoff.workflowCatalogGapHref,
        workflowGovernanceHref: workflowGovernanceHandoff.workflowGovernanceHref,
        workflowCatalogGapSummary: workflowGovernanceHandoff.workflowCatalogGapSummary,
        workflowCatalogGapDetail: workflowGovernanceHandoff.workflowCatalogGapDetail,
        legacyAuthHandoff: workflowGovernanceHandoff.legacyAuthHandoff,
        executionFactBadges: listExecutionFocusRuntimeFactBadges(focusNodeEvidence),
        callbackWaitingExplanation,
        callbackWaitingLifecycle,
        callbackWaitingFocusNodeEvidence: focusNodeEvidence,
        callbackTickets,
        sensitiveAccessEntries,
        inboxHref: buildOperatorRunSampleInboxHref(sample),
        scheduledResumeDelaySeconds,
        scheduledResumeSource,
        scheduledWaitingStatus,
        scheduledResumeScheduledAt,
        scheduledResumeDueAt,
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource,
        artifactCount: model.artifactCount,
        artifactRefCount: model.artifactRefCount,
        toolCallCount: model.toolCallCount,
        rawRefCount: model.rawRefCount,
        skillReferenceCount: model.skillReferenceCount,
        skillReferencePhaseSummary: model.skillReferencePhaseSummary,
        skillReferenceSourceSummary: model.skillReferenceSourceSummary,
        focusArtifactSummary: model.focusArtifactSummary,
        focusToolCallSummaries: model.focusToolCallSummaries,
        focusArtifacts: model.focusArtifacts,
        focusSkillReferenceLoads: model.focusSkillReferenceLoads,
        sandboxReadinessNode
      };
    })
    .filter(
      (item) =>
        Boolean(
          item.summary ||
            item.runStatus ||
            item.currentNodeId ||
            item.focusNodeLabel ||
            item.waitingReason ||
            item.executionFactBadges.length > 0 ||
            item.artifactCount > 0 ||
            item.artifactRefCount > 0 ||
            item.toolCallCount > 0 ||
            item.rawRefCount > 0 ||
            item.skillReferenceCount > 0 ||
            item.workflowCatalogGapSummary ||
            item.legacyAuthHandoff ||
            item.hasCallbackWaitingSummary ||
            item.focusSkillReferenceLoads.length > 0
        )
    );
}
