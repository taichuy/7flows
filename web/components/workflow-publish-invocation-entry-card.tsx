import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import { buildExecutionFocusExplainableNode } from "@/lib/operator-inline-action-feedback";
import {
  formatCallbackLifecycleLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingHeadline,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips
} from "@/lib/callback-waiting-presenters";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationInboxHref,
  buildPublishedInvocationRecommendedNextStep,
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  hasPublishedInvocationBlockingSensitiveAccessSummary,
  listPublishedInvocationSensitiveAccessChips,
  listPublishedInvocationSensitiveAccessRows,
  normalizePublishedInvocationRunSnapshot,
  resolvePublishedInvocationRunFollowUpSampleView,
  resolvePublishedInvocationCallbackWaitingExplanation,
  resolvePublishedInvocationExecutionFocusExplanation
} from "@/lib/published-invocation-presenters";
import {
  formatMetricSummary,
  listExecutionFocusRuntimeFactBadges
} from "@/lib/run-execution-focus-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type PublishedInvocationItem = PublishedEndpointInvocationListResponse["items"][number];

type WorkflowPublishInvocationEntryCardProps = {
  item: PublishedInvocationItem;
  detailHref: string;
  detailActive: boolean;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

function formatMetricCounts(metrics: Record<string, number> | null | undefined): string {
  if (!metrics) {
    return "n/a";
  }

  const parts = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);

  return parts.length ? parts.join(" · ") : "0";
}

function hasInvocationDrilldown(item: PublishedInvocationItem): boolean {
  return Boolean(
    item.error_message ||
      item.response_preview ||
      item.request_preview ||
      item.run_waiting_lifecycle ||
      item.finished_at
  );
}

export function WorkflowPublishInvocationEntryCard({
  item,
  detailHref,
  detailActive,
  sandboxReadiness
}: WorkflowPublishInvocationEntryCardProps) {
  const waitingLifecycle = item.run_waiting_lifecycle;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle;
  const scheduledResumeLabel =
    formatScheduledResumeLabel({
      scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
      scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
      scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
      scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
      scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
    }) ?? "n/a";
  const callbackLifecycleLabel = formatCallbackLifecycleLabel(callbackLifecycle);
  const waitingHeadline = getCallbackWaitingHeadline({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const waitingChips = listCallbackWaitingChips({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const waitingExplanation = resolvePublishedInvocationCallbackWaitingExplanation(item);
  const executionFocusExplanation = resolvePublishedInvocationExecutionFocusExplanation(item);
  const executionFocusPrimarySignal = executionFocusExplanation?.primary_signal?.trim() || null;
  const executionFocusFollowUp = executionFocusExplanation?.follow_up?.trim() || null;
  const waitingOverviewHeadline = formatPublishedInvocationWaitingHeadline({
    explanation: waitingExplanation,
    fallbackHeadline: waitingHeadline,
    nodeRunId: waitingLifecycle?.node_run_id,
    nodeStatus: waitingLifecycle?.node_status
  });
  const waitingOverviewFollowUp = formatPublishedInvocationWaitingFollowUp(waitingExplanation);
  const sensitiveAccessChips = listPublishedInvocationSensitiveAccessChips(
    waitingLifecycle?.sensitive_access_summary
  );
  const waitingBlockerRows = listCallbackWaitingBlockerRows({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const sensitiveAccessRows = listPublishedInvocationSensitiveAccessRows(
    waitingLifecycle?.sensitive_access_summary
  );
  const inboxHref = buildPublishedInvocationInboxHref({
    invocation: item,
    callbackTickets: [],
    sensitiveAccessEntries: []
  });
  const blockingInboxHref = hasPublishedInvocationBlockingSensitiveAccessSummary(
    waitingLifecycle?.sensitive_access_summary
  )
    ? buildBlockingPublishedInvocationInboxHref({
        runId: item.run_id ?? null,
        blockingNodeRunId: waitingLifecycle?.node_run_id ?? null,
        blockingSensitiveAccessEntries: []
      })
    : null;
  const primaryInboxHref = blockingInboxHref ?? inboxHref;
  const primaryInboxLabel = blockingInboxHref
    ? "open blocker inbox slice"
    : "open waiting inbox";
  const runFollowUp = item.run_follow_up;
  const runFollowUpStatusSummary = runFollowUp
    ? formatMetricSummary({
        waiting: runFollowUp.waiting_run_count,
        running: runFollowUp.running_run_count,
        succeeded: runFollowUp.succeeded_run_count,
        failed: runFollowUp.failed_run_count,
        unknown: runFollowUp.unknown_run_count
      })
    : null;
  const runFollowUpSample = resolvePublishedInvocationRunFollowUpSampleView(item);
  const runFollowUpSampleHasCallbackWaitingSummary =
    runFollowUpSample?.has_callback_waiting_summary ?? false;
  const shouldDeferToSharedCallbackWaitingSummary = runFollowUpSampleHasCallbackWaitingSummary;
  const sharedCallbackWaitingExplanation = runFollowUpSampleHasCallbackWaitingSummary
    ? runFollowUpSample?.run_snapshot.callbackWaitingExplanation ?? null
    : null;
  const canonicalFollowUp = buildPublishedInvocationCanonicalFollowUpCopy({
    explanation: runFollowUp?.explanation ?? null,
    sharedCallbackWaitingExplanations: sharedCallbackWaitingExplanation
      ? [sharedCallbackWaitingExplanation]
      : [],
    fallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。"
  });
  const recommendedNextStep = buildPublishedInvocationRecommendedNextStep({
    runId: item.run_id ?? null,
    canonicalFollowUp,
    callbackWaitingFollowUp: waitingLifecycle ? waitingExplanation?.follow_up ?? null : null,
    executionFocusFollowUp,
    blockingInboxHref,
    approvalInboxHref: inboxHref
  });
  const runFollowUpSamplePrimarySignal = runFollowUpSample?.explanation?.primary_signal?.trim() || null;
  const runFollowUpSampleFocusNodeEvidence = runFollowUpSample
    ? buildExecutionFocusExplainableNode(runFollowUpSample.run_snapshot)
    : null;
  const runSnapshot = normalizePublishedInvocationRunSnapshot(item.run_snapshot);
  const runSnapshotReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(runSnapshot);
  const runFollowUpSampleReadinessNode = runFollowUpSample
    ? buildSandboxReadinessNodeFromRunSnapshot(runFollowUpSample.run_snapshot)
    : null;
  const readinessNode = runFollowUpSampleReadinessNode ?? runSnapshotReadinessNode;
  const runSnapshotExecutionFactBadges = listExecutionFocusRuntimeFactBadges(
    buildExecutionFocusExplainableNode(runSnapshot)
  );
  const sampledRunExecutionFactBadges = runFollowUpSampleFocusNodeEvidence
    ? listExecutionFocusRuntimeFactBadges(runFollowUpSampleFocusNodeEvidence)
    : [];
  const executionFactBadges =
    runSnapshotExecutionFactBadges.length > 0
      ? runSnapshotExecutionFactBadges
      : sampledRunExecutionFactBadges;
  const runStatus = runSnapshot?.status ?? item.run_status ?? null;
  const currentNodeId = runSnapshot?.currentNodeId ?? item.run_current_node_id ?? null;
  const waitingReason = runSnapshot?.waitingReason ?? item.run_waiting_reason ?? null;

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className={`health-pill ${item.status}`}>{item.status}</span>
        <div className="tool-badge-row">
          <span className="event-chip">
            {formatPublishedInvocationCacheStatusLabel(item.cache_status)}
          </span>
          {item.reason_code ? (
            <span className="event-chip">{formatPublishedInvocationReasonLabel(item.reason_code)}</span>
          ) : null}
        </div>
      </div>
      <p className="binding-meta">
        {formatPublishedInvocationSurfaceLabel(item.request_surface)} · {item.request_source} ·{" "}
        {formatTimestamp(item.created_at)} · {formatDurationMs(item.duration_ms)}
      </p>
      {primaryInboxHref ? (
        <div className="tool-badge-row">
          <Link className="event-chip inbox-filter-link" href={primaryInboxHref}>
            {primaryInboxLabel}
          </Link>
        </div>
      ) : null}
      <dl className="compact-meta-list">
        <div>
          <dt>API key</dt>
          <dd>{item.api_key_name ?? item.api_key_prefix ?? "internal"}</dd>
        </div>
        <div>
          <dt>Request keys</dt>
          <dd>{formatKeyList(item.request_preview.keys ?? [])}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>
            {item.run_id ? (
              <Link className="inline-link" href={`/runs/${encodeURIComponent(item.run_id)}`}>
                {item.run_id}
              </Link>
            ) : (
              "not-started"
            )}
          </dd>
        </div>
        <div>
          <dt>Run status</dt>
          <dd>{formatPublishedRunStatusLabel(runStatus)}</dd>
        </div>
        <div>
          <dt>Current node</dt>
          <dd>{currentNodeId ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Waiting reason</dt>
          <dd>{waitingReason ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Callback tickets</dt>
          <dd>
            {item.run_waiting_lifecycle
              ? `${item.run_waiting_lifecycle.callback_ticket_count} · ${formatMetricCounts(item.run_waiting_lifecycle.callback_ticket_status_counts)}`
              : "n/a"}
          </dd>
        </div>
        <div>
          <dt>Scheduled resume</dt>
          <dd>{scheduledResumeLabel}</dd>
        </div>
      </dl>
      {executionFactBadges.length > 0 && !shouldDeferToSharedCallbackWaitingSummary ? (
        <div className="tool-badge-row">
          {executionFactBadges.map((badge) => (
            <span className="event-chip" key={`${item.id}-${badge}`}>
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {runFollowUp?.affected_run_count ? (
        <div className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">Canonical follow-up</span>
        </div>
          <p className="section-copy entry-copy">{canonicalFollowUp.headline}</p>
          {canonicalFollowUp.follow_up ? (
            <p className="binding-meta">{canonicalFollowUp.follow_up}</p>
          ) : null}
          <dl className="compact-meta-list">
            <div>
              <dt>Affected runs</dt>
              <dd>{runFollowUp.affected_run_count}</dd>
            </div>
            <div>
              <dt>Sampled runs</dt>
              <dd>{runFollowUp.sampled_run_count}</dd>
            </div>
            <div>
              <dt>Status summary</dt>
              <dd>{runFollowUpStatusSummary ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Sample focus</dt>
              <dd>
                {runFollowUpSample ? (
                  <Link className="inline-link" href={`/runs/${encodeURIComponent(runFollowUpSample.run_id)}`}>
                    {runFollowUpSample.run_id}
                  </Link>
                ) : (
                  "n/a"
                )}
              </dd>
            </div>
          </dl>
          {runFollowUpSamplePrimarySignal && !runFollowUpSampleHasCallbackWaitingSummary ? (
            <p className="binding-meta">{runFollowUpSamplePrimarySignal}</p>
          ) : null}
          {runFollowUpSample?.snapshot_summary && !shouldDeferToSharedCallbackWaitingSummary ? (
            <p className="binding-meta">{runFollowUpSample.snapshot_summary}</p>
          ) : null}
          {readinessNode ? (
            <SandboxExecutionReadinessCard
              node={readinessNode}
              readiness={sandboxReadiness}
              title="Live sandbox readiness"
            />
          ) : null}
          {runFollowUpSample ? (
            <>
              {runFollowUpSample.execution_focus_artifact_count > 0 ||
              runFollowUpSample.execution_focus_artifact_ref_count > 0 ||
              runFollowUpSample.execution_focus_tool_call_count > 0 ||
              runFollowUpSample.execution_focus_raw_ref_count > 0 ||
              runFollowUpSample.skill_reference_count > 0 ? (
                <div className="tool-badge-row">
                  {runFollowUpSample.execution_focus_artifact_count > 0 ? (
                    <span className="event-chip">
                      artifacts {runFollowUpSample.execution_focus_artifact_count}
                    </span>
                  ) : null}
                  {runFollowUpSample.execution_focus_artifact_ref_count > 0 ? (
                    <span className="event-chip">
                      artifact refs {runFollowUpSample.execution_focus_artifact_ref_count}
                    </span>
                  ) : null}
                  {runFollowUpSample.execution_focus_tool_call_count > 0 ? (
                    <span className="event-chip">
                      tool calls {runFollowUpSample.execution_focus_tool_call_count}
                    </span>
                  ) : null}
                  {runFollowUpSample.execution_focus_raw_ref_count > 0 ? (
                    <span className="event-chip">
                      raw refs {runFollowUpSample.execution_focus_raw_ref_count}
                    </span>
                  ) : null}
                  {runFollowUpSample.skill_reference_count > 0 ? (
                    <span className="event-chip">
                      skill refs {runFollowUpSample.skill_reference_count}
                    </span>
                  ) : null}
                  {runFollowUpSample.skill_reference_phase_summary ? (
                    <span className="event-chip">
                      phases {runFollowUpSample.skill_reference_phase_summary}
                    </span>
                  ) : null}
                  {runFollowUpSample.skill_reference_source_summary ? (
                    <span className="event-chip">
                      sources {runFollowUpSample.skill_reference_source_summary}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {runFollowUpSampleHasCallbackWaitingSummary ? (
                <CallbackWaitingSummaryCard
                  callbackWaitingExplanation={
                    runFollowUpSample.run_snapshot.callbackWaitingExplanation ?? null
                  }
                  lifecycle={runFollowUpSample.run_snapshot.callbackWaitingLifecycle ?? null}
                  focusNodeEvidence={runFollowUpSampleFocusNodeEvidence}
                  focusSkillReferenceCount={
                    runFollowUpSample.run_snapshot.executionFocusSkillTrace?.reference_count ?? 0
                  }
                  focusSkillReferenceLoads={
                    runFollowUpSample.run_snapshot.executionFocusSkillTrace?.loads ?? []
                  }
                  focusSkillReferenceNodeId={
                    runFollowUpSample.run_snapshot.executionFocusNodeId ?? null
                  }
                  focusSkillReferenceNodeName={
                    runFollowUpSample.run_snapshot.executionFocusNodeName ?? null
                  }
                  nodeRunId={runFollowUpSample.run_snapshot.executionFocusNodeRunId ?? null}
                  runId={runFollowUpSample.run_id}
                  scheduledResumeDelaySeconds={
                    runFollowUpSample.run_snapshot.scheduledResumeDelaySeconds ?? null
                  }
                  scheduledResumeDueAt={runFollowUpSample.run_snapshot.scheduledResumeDueAt ?? null}
                  scheduledResumeRequeuedAt={
                    runFollowUpSample.run_snapshot.scheduledResumeRequeuedAt ?? null
                  }
                  scheduledResumeRequeueSource={
                    runFollowUpSample.run_snapshot.scheduledResumeRequeueSource ?? null
                  }
                  scheduledResumeScheduledAt={
                    runFollowUpSample.run_snapshot.scheduledResumeScheduledAt ?? null
                  }
                  scheduledResumeSource={
                    runFollowUpSample.run_snapshot.scheduledResumeSource ?? null
                  }
                  scheduledWaitingStatus={
                    runFollowUpSample.run_snapshot.scheduledWaitingStatus ?? null
                  }
                  showFocusExecutionFacts={shouldDeferToSharedCallbackWaitingSummary}
                  showInlineActions={false}
                  waitingReason={runFollowUpSample.run_snapshot.waitingReason ?? null}
                />
              ) : (
                <>
                  <OperatorFocusEvidenceCard
                    title="Sampled run focus evidence"
                    artifactCount={runFollowUpSample.execution_focus_artifact_count}
                    artifactRefCount={runFollowUpSample.execution_focus_artifact_ref_count}
                    artifactSummary={runFollowUpSample.focus_artifact_summary}
                    artifacts={runFollowUpSample.focus_artifacts}
                    toolCallCount={runFollowUpSample.execution_focus_tool_call_count}
                    toolCallSummaries={runFollowUpSample.focus_tool_call_summaries}
                  />
                  <SkillReferenceLoadList
                    skillReferenceLoads={runFollowUpSample.focus_skill_reference_loads}
                    title="Focused skill trace"
                    description="发布活动卡片现在也会复用 compact snapshot 里的 skill trace，方便直接确认 sampled run 的 focus node 注入来源。"
                  />
                </>
              )}
            </>
          ) : null}
        </div>
      ) : null}
      {recommendedNextStep ? (
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Recommended next step</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
          {recommendedNextStep.href && recommendedNextStep.href_label ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {runStatus === "waiting" && !shouldDeferToSharedCallbackWaitingSummary ? (
        <>
          <p className="section-copy entry-copy">
            {executionFocusPrimarySignal ??
              `该请求已成功接入 durable runtime，当前仍处于 waiting；可直接打开 run detail 继续追踪${
                currentNodeId ? `，当前节点 ${currentNodeId}` : ""
              }${waitingReason ? `，等待原因 ${waitingReason}` : ""}。`}
          </p>
          {executionFocusFollowUp ? <p className="binding-meta">{executionFocusFollowUp}</p> : null}
        </>
      ) : null}
      {waitingLifecycle ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Waiting overview</span>
            </div>
            {!shouldDeferToSharedCallbackWaitingSummary ? (
              <p className="section-copy entry-copy">{waitingOverviewHeadline}</p>
            ) : null}
            {!shouldDeferToSharedCallbackWaitingSummary && waitingOverviewFollowUp ? (
              <p className="binding-meta">{waitingOverviewFollowUp}</p>
            ) : null}
            {!shouldDeferToSharedCallbackWaitingSummary &&
            (waitingChips.length || sensitiveAccessChips.length) ? (
              <p className="binding-meta">
                {[...waitingChips, ...sensitiveAccessChips].join(" · ")}
              </p>
            ) : null}
            <dl className="compact-meta-list">
              <div>
                <dt>Node run</dt>
                <dd>{waitingLifecycle.node_run_id}</dd>
              </div>
              <div>
                <dt>Node status</dt>
                <dd>{waitingLifecycle.node_status}</dd>
              </div>
              <div>
                <dt>Callback tickets</dt>
                <dd>
                  {waitingLifecycle.callback_ticket_count
                    ? `${waitingLifecycle.callback_ticket_count} · ${formatMetricCounts(waitingLifecycle.callback_ticket_status_counts)}`
                    : "0"}
                </dd>
              </div>
              <div>
                <dt>Callback lifecycle</dt>
                <dd>{callbackLifecycleLabel ?? "tracked in detail panel"}</dd>
              </div>
              {!shouldDeferToSharedCallbackWaitingSummary
                ? waitingBlockerRows.map((row) => (
                    <div key={`${item.id}:${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))
                : null}
              {!shouldDeferToSharedCallbackWaitingSummary
                ? sensitiveAccessRows.map((row) => (
                    <div key={`${item.id}:sensitive:${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))
                : null}
            </dl>
          </div>
        </div>
      ) : null}
      {item.run_status === "succeeded" ? (
        <p className="section-copy entry-copy">
          该请求已经走完整条 publish 调用链，run 已结束，可以直接对照 response preview 做回放。
        </p>
      ) : null}
      {item.error_message ? <p className="section-copy entry-copy">error: {item.error_message}</p> : null}
      {hasInvocationDrilldown(item) ? (
        <div className="publish-invocation-actions">
          <Link className="inline-link" href={detailHref}>
            {detailActive ? "查看当前详情" : "打开 invocation detail"}
          </Link>
          <span className="section-copy entry-copy">
            详情面板会补 run / callback ticket / callback lifecycle / cache 四类稳定排障入口。
          </span>
        </div>
      ) : null}
    </article>
  );
}
