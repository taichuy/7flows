import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { ExecutionNodeCard } from "@/components/run-diagnostics-execution/execution-node-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import { hasExecutionNodeCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import { buildExecutionFocusExplainableNode } from "@/lib/operator-inline-action-feedback";
import {
  buildOperatorRecommendedNextStep,
  buildOperatorRunDetailLinkSurface
} from "@/lib/operator-follow-up-presenters";
import {
  buildPublishedInvocationDetailSurfaceCopy,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationSkillTraceSurface,
  buildPublishedInvocationRecommendedNextStep,
  resolvePublishedInvocationRecommendedNextStepInboxHrefs,
  buildPublishedInvocationRunFollowUpSampleApprovalInboxHref,
  buildPublishedInvocationRunFollowUpSampleInboxHref,
  buildPublishedInvocationSelectedNextStepSurface,
  formatPublishedInvocationPayloadPreview,
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationInboxHref,
  formatPublishedInvocationMissingToolCatalogEntry,
  formatPublishedInvocationNodeRunLabel,
  formatPublishedInvocationRequestKeysSummary,
  formatPublishedInvocationSampleReasonLabel,
  listPublishedInvocationCacheDrilldownRows,
  listPublishedInvocationCanonicalFollowUpChips,
  listPublishedInvocationDetailRunRows,
  listPublishedInvocationRunFollowUpEvidenceChips,
  listPublishedInvocationRunFollowUpSampleMetaRows,
  listPublishedInvocationRunFollowUpSampleViews,
  normalizePublishedInvocationRunSnapshot,
  type PublishedInvocationSelectedNextStepSurface
} from "@/lib/published-invocation-presenters";
import {
  buildExecutionFocusSectionSurfaceCopy,
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  formatExecutionFocusReasonLabel,
  formatMetricSummary,
  listExecutionFocusRuntimeFactBadges
} from "@/lib/run-execution-focus-presenters";
import { formatDurationMs, formatTimestamp } from "@/lib/runtime-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";
import {
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import {
  buildRunDetailHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

type WorkflowPublishInvocationDetailPanelProps = {
  detail: PublishedEndpointInvocationDetailResponse;
  clearHref: string;
  currentHref?: string | null;
  tools: PluginToolRegistryItem[];
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  selectedNextStepSurface?: PublishedInvocationSelectedNextStepSurface | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
};
export function WorkflowPublishInvocationDetailPanel({
  detail,
  clearHref,
  currentHref = null,
  tools,
  callbackWaitingAutomation,
  sandboxReadiness,
  selectedNextStepSurface = null,
  workspaceStarterGovernanceQueryScope = null
}: WorkflowPublishInvocationDetailPanelProps) {
  const entrySurfaceCopy = buildPublishedInvocationEntrySurfaceCopy();
  const {
    invocation,
    run,
    run_follow_up: runFollowUp,
    callback_tickets: callbackTickets,
    blocking_node_run_id: blockingNodeRunId,
    execution_focus_reason: executionFocusReason,
    execution_focus_node: executionFocusNode,
    callback_waiting_explanation: callbackWaitingExplanation,
    skill_trace: skillTrace,
    blocking_sensitive_access_entries: blockingSensitiveAccessEntries,
    sensitive_access_entries: sensitiveAccessEntries,
    cache
  } = detail;
  const waitingLifecycle = invocation.run_waiting_lifecycle;
  const legacyAuthSnapshot = detail.legacy_auth_governance ?? null;
  const runSnapshot = normalizePublishedInvocationRunSnapshot(
    detail.run_snapshot ?? invocation.run_snapshot ?? null
  );
  const runId = run?.id ?? invocation.run_id ?? null;
  const runStatus = runSnapshot?.status ?? run?.status ?? invocation.run_status ?? null;
  const currentNodeId =
    runSnapshot?.currentNodeId ?? run?.current_node_id ?? invocation.run_current_node_id ?? null;
  const waitingReason = runSnapshot?.waitingReason ?? invocation.run_waiting_reason ?? null;
  const blockingInboxHref = buildBlockingPublishedInvocationInboxHref({
    runId,
    blockingNodeRunId,
    blockingSensitiveAccessEntries
  });
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  const involvedToolIds = Array.from(
    new Set(callbackTickets.map((ticket) => ticket.tool_id).filter((toolId): toolId is string => Boolean(toolId)))
  );
  const involvedTools = involvedToolIds
    .map((toolId) => toolsById.get(toolId) ?? null)
    .filter((tool): tool is PluginToolRegistryItem => tool !== null);
  const unresolvedToolIds = involvedToolIds.filter((toolId) => !toolsById.has(toolId));
  const executionFocusPrimarySignal =
    detail.execution_focus_explanation?.primary_signal ??
    (executionFocusNode ? formatExecutionFocusPrimarySignal(executionFocusNode) : null);
  const explicitExecutionFocusFollowUp = detail.execution_focus_explanation?.follow_up ?? null;
  const executionFocusFollowUp =
    explicitExecutionFocusFollowUp ??
    (executionFocusNode ? formatExecutionFocusFollowUp(executionFocusNode) : null);
  const executionFocusHasCallbackWaitingSummary =
    hasExecutionNodeCallbackWaitingSummaryFacts(executionFocusNode);
  const executionFocusSurfaceCopy = buildExecutionFocusSectionSurfaceCopy("publish_detail");
  const runFollowUpStatusSummary = runFollowUp
    ? formatMetricSummary({
        waiting: runFollowUp.waiting_run_count,
        running: runFollowUp.running_run_count,
        succeeded: runFollowUp.succeeded_run_count,
        failed: runFollowUp.failed_run_count,
        unknown: runFollowUp.unknown_run_count
      })
    : null;
  const runFollowUpSamples = listPublishedInvocationRunFollowUpSampleViews(runFollowUp);
  const recommendedNextStepSample =
    runFollowUpSamples.find((sample) => sample.run_id === runId) ?? runFollowUpSamples[0] ?? null;
  const approvalInboxHref = buildPublishedInvocationInboxHref({
    invocation,
    callbackTickets,
    sensitiveAccessEntries
  });
  const recommendedNextStepSampleInboxHref = buildPublishedInvocationRunFollowUpSampleInboxHref(
    recommendedNextStepSample
  );
  const recommendedNextStepSampleApprovalInboxHref =
    buildPublishedInvocationRunFollowUpSampleApprovalInboxHref(recommendedNextStepSample);
  const {
    waitingInboxHref: recommendedNextStepWaitingInboxHref,
    blockingInboxHref: recommendedNextStepBlockingInboxHref
  } = resolvePublishedInvocationRecommendedNextStepInboxHrefs({
    canonicalRecommendedAction: runFollowUp?.recommended_action ?? null,
    waitingInboxHref: approvalInboxHref,
    blockingInboxHref,
    sampledWaitingInboxHref: recommendedNextStepSampleInboxHref,
    sampledBlockingInboxHref: recommendedNextStepSampleApprovalInboxHref
  });
  const sharedCallbackWaitingExplanations = runFollowUpSamples
    .filter((sample) => sample.has_callback_waiting_summary)
    .map((sample) => sample.run_snapshot.callbackWaitingExplanation);
  const canonicalFollowUp = buildPublishedInvocationCanonicalFollowUpCopy({
    explanation: runFollowUp?.explanation ?? null,
    sharedCallbackWaitingExplanations,
    fallbackHeadline: entrySurfaceCopy.canonicalFollowUpFallbackHeadline
  });
  const detailSurfaceCopy = buildPublishedInvocationDetailSurfaceCopy({
    blockingNodeRunId,
    focusSkillTraceNodeRunId:
      skillTrace?.scope === "execution_focus_node" ? skillTrace.nodes[0]?.node_run_id ?? null : null
  });
  const runDrilldownLink = buildOperatorRunDetailLinkSurface({
    runId: run?.id,
    hrefLabel: detailSurfaceCopy.openRunLabel
  });
  const scopedRunDrilldownHref =
    run?.id && workspaceStarterGovernanceQueryScope
      ? buildRunDetailHrefFromWorkspaceStarterViewState(
          run.id,
          workspaceStarterGovernanceQueryScope
        )
      : null;
  const skillTraceSurface = skillTrace ? buildPublishedInvocationSkillTraceSurface(skillTrace) : null;
  const legacyAuthWorkflowSummary =
    legacyAuthSnapshot?.workflows.find((item) => item.workflow_id === invocation.workflow_id) ??
    legacyAuthSnapshot?.workflows[0] ??
    null;
  const workflowDetailLink = workspaceStarterGovernanceQueryScope
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: invocation.workflow_id,
        viewState: workspaceStarterGovernanceQueryScope,
        variant: "editor"
      })
    : buildAuthorFacingWorkflowDetailLinkSurface({
        workflowId: invocation.workflow_id,
        variant: "editor"
      });
  const recommendedNextStep = buildPublishedInvocationRecommendedNextStep({
    runId,
    canonicalFollowUp,
    canonicalRecommendedAction: runFollowUp?.recommended_action ?? null,
    currentHref,
    callbackWaitingActive: Boolean(waitingLifecycle),
    callbackWaitingFollowUp: callbackWaitingExplanation?.follow_up ?? null,
    callbackWaitingAutomation,
    executionFocusFollowUp: explicitExecutionFocusFollowUp,
    executionSnapshot: recommendedNextStepSample?.run_snapshot ?? runSnapshot,
    sandboxReadiness,
    blockingInboxHref: recommendedNextStepBlockingInboxHref,
    approvalInboxHref: recommendedNextStepWaitingInboxHref
  });
  const resolvedNextStepSurface =
    selectedNextStepSurface ??
    (recommendedNextStep
      ? buildPublishedInvocationSelectedNextStepSurface({
          invocationId: invocation.id,
          nextStep: recommendedNextStep,
          title: detailSurfaceCopy.recommendedNextStepTitle
        })
      : null);
  const runDrilldownRows = listPublishedInvocationDetailRunRows({
    runId: run?.id ?? invocation.run_id ?? null,
    runStatus,
    currentNodeId,
    waitingReason,
    waitingNodeRunId: waitingLifecycle?.node_run_id ?? null,
    startedAt: run?.started_at,
    finishedAt: run?.finished_at ?? invocation.finished_at,
    surfaceCopy: detailSurfaceCopy
  });
  const cacheDrilldownRows = listPublishedInvocationCacheDrilldownRows({
    cache,
    surfaceCopy: detailSurfaceCopy
  });
  const canonicalFollowUpChips = runFollowUp
    ? listPublishedInvocationCanonicalFollowUpChips({
        affectedRunCount: runFollowUp.affected_run_count,
        sampledRunCount: runFollowUp.sampled_run_count,
        statusSummary: runFollowUpStatusSummary,
        surfaceCopy: entrySurfaceCopy
      })
    : [];

  return (
    <article className="entry-card compact-card publish-invocation-detail-panel">
      <div className="payload-card-header">
        <div>
          <p className="entry-card-title">{detailSurfaceCopy.detailTitle}</p>
          <p className="binding-meta">
            {invocation.id} · {formatTimestamp(invocation.created_at)} · {formatDurationMs(invocation.duration_ms)}
          </p>
        </div>
        <Link className="inline-link secondary" href={clearHref}>
          {detailSurfaceCopy.closeDetailLabel}
        </Link>
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{detailSurfaceCopy.runDrilldownTitle}</span>
            {runDrilldownLink ? (
              <Link className="inline-link" href={scopedRunDrilldownHref ?? runDrilldownLink.href}>
                {runDrilldownLink.label}
              </Link>
            ) : null}
          </div>
          <dl className="compact-meta-list">
            {runDrilldownRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  {row.href ? (
                    <Link className="inline-link" href={row.href}>
                      {row.value}
                    </Link>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{detailSurfaceCopy.cacheDrilldownTitle}</span>
          </div>
          <dl className="compact-meta-list">
            {cacheDrilldownRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="publish-meta-grid">
        <div>
          <strong>{detailSurfaceCopy.requestPreviewTitle}</strong>
          <p className="section-copy entry-copy">
            {formatPublishedInvocationRequestKeysSummary(invocation.request_preview.keys ?? [])}
          </p>
          <pre className="trace-preview">
            {formatPublishedInvocationPayloadPreview(invocation.request_preview)}
          </pre>
        </div>
        <div>
          <strong>{detailSurfaceCopy.responsePreviewTitle}</strong>
          <pre className="trace-preview">
            {formatPublishedInvocationPayloadPreview(invocation.response_preview)}
          </pre>
        </div>
      </div>

      {runFollowUp ? (
        <div>
          <strong>{detailSurfaceCopy.canonicalFollowUpTitle}</strong>
          <p className="section-copy entry-copy">{detailSurfaceCopy.canonicalFollowUpDescription}</p>
          <div className="tool-badge-row">
            {canonicalFollowUpChips.map((chip) => (
              <span className="event-chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
          <p className="section-copy entry-copy">{canonicalFollowUp.headline}</p>
          {canonicalFollowUp.follow_up ? (
            <p className="binding-meta">{canonicalFollowUp.follow_up}</p>
          ) : null}
          {runFollowUpSamples.length ? (
            <div className="publish-meta-grid">
              {runFollowUpSamples.map((sample) => {
                const samplePrimarySignal = sample.explanation?.primary_signal?.trim() || null;
                const sampleFollowUp = sample.explanation?.follow_up?.trim() || null;
                  const sampleFocusNodeEvidence = buildExecutionFocusExplainableNode(
                    sample.run_snapshot
                  );
                  const sampleInboxHref = buildPublishedInvocationRunFollowUpSampleInboxHref(
                    sample
                  );
                  const sampleExecutionFactBadges = listExecutionFocusRuntimeFactBadges(
                    sampleFocusNodeEvidence
                  );
                const sampleReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(
                  sample.run_snapshot
                );
                const sampleSandboxCandidate =
                  !sample.has_callback_waiting_summary &&
                  sampleReadinessNode &&
                  shouldPreferSharedSandboxReadinessFollowUp({
                    blockedExecution: sample.run_snapshot.executionFocusReason === "blocked_execution",
                    hasExecutionBlockingReason: Boolean(
                      sampleReadinessNode.execution_blocking_reason
                    ),
                    signals: [
                      samplePrimarySignal,
                      sampleFollowUp,
                      sample.snapshot_summary,
                      sample.run_snapshot.executionFocusNodeType,
                      sampleReadinessNode.execution_blocking_reason
                    ]
                  })
                    ? buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness")
                    : null;
                const sampleRecommendedNextStep = sampleSandboxCandidate
                  ? buildOperatorRecommendedNextStep({
                      execution: sampleSandboxCandidate,
                      operatorFollowUp: sampleFollowUp ?? sample.snapshot_summary,
                      operatorLabel: "sampled run",
                      currentHref
                    })
                  : null;
                const sampleReasonLabel =
                  formatPublishedInvocationSampleReasonLabel(
                    sample.explanation_source,
                    detailSurfaceCopy
                  );
                const sampleEvidenceChips = listPublishedInvocationRunFollowUpEvidenceChips(sample);
                const sampleMetaRows = listPublishedInvocationRunFollowUpSampleMetaRows(
                  sample,
                  detailSurfaceCopy
                );

                return (
                  <div className="payload-card compact-card" key={sample.run_id}>
                    <div className="payload-card-header">
                      {(() => {
                        const sampleRunLink = buildOperatorRunDetailLinkSurface({
                          runId: sample.run_id,
                          hrefLabel: sample.run_id
                        });

                        const scopedSampleRunHref = workspaceStarterGovernanceQueryScope
                          ? buildRunDetailHrefFromWorkspaceStarterViewState(
                              sample.run_id,
                              workspaceStarterGovernanceQueryScope
                            )
                          : null;

                        return sampleRunLink ? (
                          <Link className="inline-link" href={scopedSampleRunHref ?? sampleRunLink.href}>
                            {sampleRunLink.label}
                          </Link>
                        ) : null;
                      })()}
                      <span className="status-meta">{sampleReasonLabel}</span>
                    </div>
                    {samplePrimarySignal && !sample.has_callback_waiting_summary ? (
                      <p className="section-copy entry-copy">{samplePrimarySignal}</p>
                    ) : null}
                    {sampleFollowUp && !sample.has_callback_waiting_summary ? (
                      <p className="binding-meta">{sampleFollowUp}</p>
                    ) : null}
                    {!samplePrimarySignal && !sample.has_callback_waiting_summary ? (
                      <p className="section-copy entry-copy">{detailSurfaceCopy.sampledRunFallback}</p>
                    ) : null}
                    {sample.snapshot_summary && !sample.has_callback_waiting_summary ? (
                      <p className="binding-meta">{sample.snapshot_summary}</p>
                    ) : null}
                    {sampleReadinessNode ? (
                      <SandboxExecutionReadinessCard
                        node={sampleReadinessNode}
                        readiness={sandboxReadiness}
                        title={detailSurfaceCopy.liveSandboxReadinessTitle}
                      />
                    ) : null}
                    {sampleRecommendedNextStep ? (
                      <div className="entry-card compact-card">
                        <div className="payload-card-header">
                          <span className="status-meta">
                            {detailSurfaceCopy.recommendedNextStepTitle}
                          </span>
                          <span className="event-chip">{sampleRecommendedNextStep.label}</span>
                          {sampleRecommendedNextStep.href && sampleRecommendedNextStep.href_label ? (
                            <Link
                              className="event-chip inbox-filter-link"
                              href={sampleRecommendedNextStep.href}
                            >
                              {sampleRecommendedNextStep.href_label}
                            </Link>
                          ) : null}
                        </div>
                        <p className="section-copy entry-copy">
                          {sampleRecommendedNextStep.detail}
                        </p>
                      </div>
                    ) : null}
                    {sample.execution_focus_artifact_count > 0 ||
                    sample.execution_focus_artifact_ref_count > 0 ||
                    sample.execution_focus_tool_call_count > 0 ||
                    sample.execution_focus_raw_ref_count > 0 ||
                    sample.skill_reference_count > 0 ||
                    sampleExecutionFactBadges.length > 0 ? (
                      <div className="tool-badge-row">
                        {sampleEvidenceChips.map((chip) => (
                          <span className="event-chip" key={`${sample.run_id}-${chip}`}>
                            {chip}
                          </span>
                        ))}
                        {!sample.has_callback_waiting_summary
                          ? sampleExecutionFactBadges.map((badge) => (
                              <span className="event-chip" key={`${sample.run_id}-${badge}`}>
                                {badge}
                              </span>
                            ))
                          : null}
                      </div>
                    ) : null}
                    {sample.has_callback_waiting_summary ? (
                      <CallbackWaitingSummaryCard
                        currentHref={currentHref}
                        callbackWaitingExplanation={
                          sample.run_snapshot.callbackWaitingExplanation ?? null
                        }
                        callbackTickets={sample.callback_tickets}
                        callbackWaitingAutomation={callbackWaitingAutomation}
                        lifecycle={sample.run_snapshot.callbackWaitingLifecycle ?? null}
                        focusNodeEvidence={sampleFocusNodeEvidence}
                        focusSkillReferenceCount={
                          sample.run_snapshot.executionFocusSkillTrace?.reference_count ?? 0
                        }
                        focusSkillReferenceLoads={
                          sample.run_snapshot.executionFocusSkillTrace?.loads ?? []
                        }
                        focusSkillReferenceNodeId={sample.run_snapshot.executionFocusNodeId ?? null}
                        focusSkillReferenceNodeName={
                          sample.run_snapshot.executionFocusNodeName ?? null
                        }
                        nodeRunId={sample.run_snapshot.executionFocusNodeRunId ?? null}
                        operatorFollowUp={runFollowUp?.explanation?.follow_up ?? null}
                        recommendedAction={runFollowUp?.recommended_action ?? null}
                        preferCanonicalRecommendedNextStep
                        runId={sample.run_id}
                        showFocusExecutionFacts
                        scheduledResumeDelaySeconds={
                          sample.run_snapshot.scheduledResumeDelaySeconds ?? null
                        }
                        scheduledResumeDueAt={sample.run_snapshot.scheduledResumeDueAt ?? null}
                        scheduledResumeRequeuedAt={
                          sample.run_snapshot.scheduledResumeRequeuedAt ?? null
                        }
                        scheduledResumeRequeueSource={
                          sample.run_snapshot.scheduledResumeRequeueSource ?? null
                        }
                        scheduledResumeScheduledAt={
                          sample.run_snapshot.scheduledResumeScheduledAt ?? null
                        }
                        scheduledResumeSource={sample.run_snapshot.scheduledResumeSource ?? null}
                        scheduledWaitingStatus={sample.run_snapshot.scheduledWaitingStatus ?? null}
                        inboxHref={sampleInboxHref}
                        sensitiveAccessEntries={sample.sensitive_access_entries}
                        showInlineActions={false}
                        waitingReason={sample.run_snapshot.waitingReason ?? null}
                      />
                    ) : null}
                    {!sample.has_callback_waiting_summary &&
                    (sample.focus_artifact_summary ||
                      sample.focus_tool_call_summaries.length > 0 ||
                      sample.focus_artifacts.length > 0) ? (
                      <OperatorFocusEvidenceCard
                        title={detailSurfaceCopy.sampledRunFocusEvidenceTitle}
                        artifactCount={sample.execution_focus_artifact_count}
                        artifactRefCount={sample.execution_focus_artifact_ref_count}
                        artifactSummary={sample.focus_artifact_summary}
                        artifacts={sample.focus_artifacts}
                        toolCallCount={sample.execution_focus_tool_call_count}
                        toolCallSummaries={sample.focus_tool_call_summaries}
                      />
                    ) : null}
                    {!sample.has_callback_waiting_summary ? (
                      <SkillReferenceLoadList
                        skillReferenceLoads={sample.focus_skill_reference_loads}
                        title={detailSurfaceCopy.sampledRunSkillTraceTitle}
                        description={detailSurfaceCopy.sampledRunSkillTraceDescription}
                      />
                    ) : null}
                    <dl className="compact-meta-list">
                      {sampleMetaRows.map((row) => (
                        <div key={`${sample.run_id}-${row.key}`}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {legacyAuthSnapshot && legacyAuthSnapshot.binding_count > 0 ? (
        <div>
          <div className="section-heading compact-heading">
            <div>
              <span className="binding-label">{detailSurfaceCopy.legacyAuthGovernanceTitle}</span>
            </div>
            <div className="tool-badge-row">
              <span className="event-chip">{legacyAuthSnapshot.binding_count} legacy bindings</span>
              <span className="event-chip">shared workflow artifact</span>
            </div>
          </div>
          <p className="section-copy entry-copy">
            {detailSurfaceCopy.legacyAuthGovernanceDescription}
          </p>

          <div className="summary-strip compact-strip">
            <article className="summary-card">
              <span>Draft cleanup</span>
              <strong>{legacyAuthSnapshot.summary.draft_candidate_count}</strong>
            </article>
            <article className="summary-card">
              <span>Published blockers</span>
              <strong>{legacyAuthSnapshot.summary.published_blocker_count}</strong>
            </article>
            <article className="summary-card">
              <span>Offline inventory</span>
              <strong>{legacyAuthSnapshot.summary.offline_inventory_count}</strong>
            </article>
          </div>

          {legacyAuthSnapshot.checklist.length > 0 ? (
            <div className="publish-key-list">
              {legacyAuthSnapshot.checklist.map((item) => (
                <article className="payload-card compact-card" key={item.key}>
                  <div className="payload-card-header">
                    <span className="status-meta">{item.tone_label}</span>
                    <span className="event-chip">{item.count} items</span>
                  </div>
                  <p className="binding-meta">{item.title}</p>
                  <p className="section-copy entry-copy">{item.detail}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="binding-actions">
            <div>
              <p className="entry-card-title">
                {detailSurfaceCopy.legacyAuthGovernanceWorkflowFollowUpTitle}
              </p>
              <p className="section-copy entry-copy">
                {legacyAuthWorkflowSummary
                  ? `当前 workflow 仍有 ${legacyAuthWorkflowSummary.draft_candidate_count} 条 draft cleanup、${legacyAuthWorkflowSummary.published_blocker_count} 条 published blocker、${legacyAuthWorkflowSummary.offline_inventory_count} 条 offline inventory；回到 detail 后可继续沿同一份 handoff 收口。`
                  : detailSurfaceCopy.legacyAuthGovernanceWorkflowFollowUpFallback}
              </p>
            </div>
            <Link className="activity-link" href={workflowDetailLink.href}>
              {workflowDetailLink.label}
            </Link>
          </div>
        </div>
      ) : null}

      {resolvedNextStepSurface ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{resolvedNextStepSurface.title}</span>
            <span className="event-chip">{resolvedNextStepSurface.label}</span>
            {resolvedNextStepSurface.href && resolvedNextStepSurface.hrefLabel ? (
              <Link className="event-chip inbox-filter-link" href={resolvedNextStepSurface.href}>
                {resolvedNextStepSurface.hrefLabel}
              </Link>
            ) : null}
          </div>
          <p className="section-copy entry-copy">{resolvedNextStepSurface.detail}</p>
        </div>
      ) : null}

      {runId && executionFocusNode ? (
        <div>
          <strong>{detailSurfaceCopy.executionFocusTitle}</strong>
          <p className="section-copy entry-copy">{executionFocusSurfaceCopy.sectionDescription}</p>
          {executionFocusPrimarySignal && !executionFocusHasCallbackWaitingSummary ? (
            <p className="section-copy entry-copy">{executionFocusPrimarySignal}</p>
          ) : null}
          {executionFocusFollowUp && !executionFocusHasCallbackWaitingSummary ? (
            <p className="binding-meta">{executionFocusFollowUp}</p>
          ) : null}
          <div className="tool-badge-row">
            <span className="event-chip">
              {formatExecutionFocusReasonLabel(executionFocusReason)}
            </span>
            <span className="event-chip">
              {formatPublishedInvocationNodeRunLabel(executionFocusNode.node_run_id)}
            </span>
          </div>
          <SandboxExecutionReadinessCard
            node={executionFocusNode}
            readiness={sandboxReadiness}
            title={detailSurfaceCopy.liveSandboxReadinessTitle}
          />
          <ExecutionNodeCard
            node={executionFocusNode}
            runId={runId}
            callbackWaitingAutomation={callbackWaitingAutomation}
            skillTrace={skillTrace}
          />
        </div>
      ) : null}

      <WorkflowPublishInvocationCallbackSection
        currentHref={currentHref}
        invocation={invocation}
        callbackTickets={callbackTickets}
        sensitiveAccessEntries={sensitiveAccessEntries}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={callbackWaitingExplanation}
        executionFocusNode={executionFocusNode}
      />

      {skillTrace && skillTraceSurface ? (
        <div>
          <strong>{detailSurfaceCopy.skillTraceTitle}</strong>
          <p className="section-copy entry-copy">{detailSurfaceCopy.skillTraceDescription}</p>
          <div className="tool-badge-row">
            {skillTraceSurface.summaryChips.map((chip) => (
              <span className="event-chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
          <div className="publish-cache-list">
            {skillTraceSurface.nodes.map((node) => (
              <div className="payload-card compact-card" key={node.key}>
                <div className="payload-card-header">
                  <span className="status-meta">{node.title}</span>
                  <span className="event-chip">{node.countChip}</span>
                </div>
                <p className="section-copy entry-copy">{node.summary}</p>
                <SkillReferenceLoadList
                  skillReferenceLoads={node.loads}
                  title={detailSurfaceCopy.injectedReferencesTitle}
                  description={detailSurfaceCopy.injectedReferencesDescription}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {involvedTools.length > 0 || unresolvedToolIds.length > 0 ? (
        <div>
          <strong>{detailSurfaceCopy.toolGovernanceTitle}</strong>
          <p className="section-copy entry-copy">{detailSurfaceCopy.toolGovernanceDescription}</p>
          {unresolvedToolIds.length ? (
            <div className="tool-badge-row">
              {unresolvedToolIds.map((toolId) => (
                <span className="event-chip" key={`missing-tool-${toolId}`}>
                  {formatPublishedInvocationMissingToolCatalogEntry(toolId)}
                </span>
              ))}
            </div>
          ) : null}
          {involvedTools.length ? (
            <div className="publish-cache-list">
              {involvedTools.map((tool) => (
                <ToolGovernanceSummary
                  key={`tool-governance-${tool.id}`}
                  tool={tool}
                  title={detailSurfaceCopy.toolGovernanceSummaryTitle}
                  subtitle={tool.name}
                  trailingChip={tool.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {blockingSensitiveAccessEntries.length > 0 &&
      blockingSensitiveAccessEntries.length < sensitiveAccessEntries.length ? (
        <div>
          <strong>{detailSurfaceCopy.blockingApprovalTimelineTitle}</strong>
          <p className="section-copy entry-copy">{detailSurfaceCopy.blockingApprovalTimelineDescription}</p>
          {blockingInboxHref ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={blockingInboxHref}>
                {detailSurfaceCopy.blockingApprovalTimelineInboxLabel}
              </Link>
            </div>
          ) : null}
          <SensitiveAccessTimelineEntryList
            callbackTickets={callbackTickets}
            callbackWaitingAutomation={callbackWaitingAutomation}
            defaultRunId={runId}
            entries={blockingSensitiveAccessEntries}
            emptyCopy={detailSurfaceCopy.blockingApprovalTimelineEmptyState}
            sandboxReadiness={sandboxReadiness}
          />
        </div>
      ) : null}

      <div>
        <strong>{detailSurfaceCopy.approvalTimelineTitle}</strong>
        <p className="section-copy entry-copy">{detailSurfaceCopy.approvalTimelineDescription}</p>
        {approvalInboxHref ? (
          <div className="tool-badge-row">
            <Link className="event-chip inbox-filter-link" href={approvalInboxHref}>
              {detailSurfaceCopy.approvalTimelineInboxLabel}
            </Link>
          </div>
        ) : null}
        <SensitiveAccessTimelineEntryList
          callbackTickets={callbackTickets}
          callbackWaitingAutomation={callbackWaitingAutomation}
          defaultRunId={runId}
          entries={sensitiveAccessEntries}
          emptyCopy={detailSurfaceCopy.approvalTimelineEmptyState}
          sandboxReadiness={sandboxReadiness}
        />
      </div>
    </article>
  );
}
