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
  buildPublishedInvocationDetailSurfaceCopy,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationRecommendedNextStep,
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationInboxHref,
  formatPublishedInvocationRequestKeysSummary,
  formatPublishedInvocationSampleReasonLabel,
  listPublishedInvocationCacheDrilldownRows,
  listPublishedInvocationCanonicalFollowUpChips,
  listPublishedInvocationDetailRunRows,
  listPublishedInvocationRunFollowUpEvidenceChips,
  listPublishedInvocationRunFollowUpSampleMetaRows,
  listPublishedInvocationRunFollowUpSampleViews,
  normalizePublishedInvocationRunSnapshot
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

type WorkflowPublishInvocationDetailPanelProps = {
  detail: PublishedEndpointInvocationDetailResponse;
  clearHref: string;
  tools: PluginToolRegistryItem[];
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}
export function WorkflowPublishInvocationDetailPanel({
  detail,
  clearHref,
  tools,
  callbackWaitingAutomation,
  sandboxReadiness
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
  const approvalInboxHref = buildPublishedInvocationInboxHref({
    invocation,
    callbackTickets,
    sensitiveAccessEntries
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
  const executionFocusFollowUp =
    detail.execution_focus_explanation?.follow_up ??
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
  const recommendedNextStep = buildPublishedInvocationRecommendedNextStep({
    runId,
    canonicalFollowUp,
    callbackWaitingFollowUp: callbackWaitingExplanation?.follow_up ?? null,
    executionFocusFollowUp,
    blockingInboxHref,
    approvalInboxHref
  });
  const runDrilldownRows = listPublishedInvocationDetailRunRows({
    runId: run?.id ?? invocation.run_id ?? null,
    runStatus,
    currentNodeId,
    waitingReason,
    waitingNodeRunId: waitingLifecycle?.node_run_id ?? null,
    startedAt: run?.started_at,
    finishedAt: run?.finished_at ?? invocation.finished_at
  });
  const cacheDrilldownRows = listPublishedInvocationCacheDrilldownRows({ cache });
  const canonicalFollowUpChips = runFollowUp
    ? listPublishedInvocationCanonicalFollowUpChips({
        affectedRunCount: runFollowUp.affected_run_count,
        sampledRunCount: runFollowUp.sampled_run_count,
        statusSummary: runFollowUpStatusSummary
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
            {run?.id ? (
              <Link className="inline-link" href={`/runs/${encodeURIComponent(run.id)}`}>
                {detailSurfaceCopy.openRunLabel}
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
          <pre className="trace-preview">{formatJsonPreview(invocation.request_preview)}</pre>
        </div>
        <div>
          <strong>{detailSurfaceCopy.responsePreviewTitle}</strong>
          <pre className="trace-preview">{formatJsonPreview(invocation.response_preview)}</pre>
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
                const sampleExecutionFactBadges = listExecutionFocusRuntimeFactBadges(
                  sampleFocusNodeEvidence
                );
                const sampleReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(
                  sample.run_snapshot
                );
                const sampleReasonLabel =
                  formatPublishedInvocationSampleReasonLabel(sample.explanation_source);
                const sampleEvidenceChips = listPublishedInvocationRunFollowUpEvidenceChips(sample);
                const sampleMetaRows = listPublishedInvocationRunFollowUpSampleMetaRows(sample);

                return (
                  <div className="payload-card compact-card" key={sample.run_id}>
                    <div className="payload-card-header">
                      <Link className="inline-link" href={`/runs/${encodeURIComponent(sample.run_id)}`}>
                        {sample.run_id}
                      </Link>
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
                        callbackWaitingExplanation={
                          sample.run_snapshot.callbackWaitingExplanation ?? null
                        }
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

      {recommendedNextStep ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{detailSurfaceCopy.recommendedNextStepTitle}</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
            {recommendedNextStep.href && recommendedNextStep.href_label ? (
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            ) : null}
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
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
            <span className="event-chip">node run {executionFocusNode.node_run_id}</span>
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
        invocation={invocation}
        callbackTickets={callbackTickets}
        sensitiveAccessEntries={sensitiveAccessEntries}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={callbackWaitingExplanation}
        executionFocusNode={executionFocusNode}
      />

      {skillTrace ? (
        <div>
          <strong>{detailSurfaceCopy.skillTraceTitle}</strong>
          <p className="section-copy entry-copy">{detailSurfaceCopy.skillTraceDescription}</p>
          <div className="tool-badge-row">
            <span className="event-chip">refs {skillTrace.reference_count}</span>
            {formatMetricSummary(skillTrace.phase_counts) ? (
              <span className="event-chip">phases {formatMetricSummary(skillTrace.phase_counts)}</span>
            ) : null}
            {formatMetricSummary(skillTrace.source_counts) ? (
              <span className="event-chip">sources {formatMetricSummary(skillTrace.source_counts)}</span>
            ) : null}
          </div>
          <div className="publish-cache-list">
            {skillTrace.nodes.map((node) => (
              <div className="payload-card compact-card" key={node.node_run_id}>
                <div className="payload-card-header">
                  <span className="status-meta">{node.node_name ?? node.node_id ?? node.node_run_id}</span>
                  <span className="event-chip">refs {node.reference_count}</span>
                </div>
                <p className="section-copy entry-copy">
                  node run {node.node_run_id}
                  {node.node_id ? ` · node ${node.node_id}` : ""}
                </p>
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
                  missing catalog entry {toolId}
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
            defaultRunId={runId}
            entries={blockingSensitiveAccessEntries}
            emptyCopy={detailSurfaceCopy.blockingApprovalTimelineEmptyState}
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
          defaultRunId={runId}
          entries={sensitiveAccessEntries}
          emptyCopy={detailSurfaceCopy.approvalTimelineEmptyState}
        />
      </div>
    </article>
  );
}
