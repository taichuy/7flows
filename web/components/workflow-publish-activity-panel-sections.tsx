import React from "react";
import Link from "next/link";

import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import { WorkflowPublishInvocationDetailPanel } from "@/components/workflow-publish-invocation-detail-panel";
import { WorkflowPublishInvocationEntryCard } from "@/components/workflow-publish-invocation-entry-card";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListResponse
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import {
  buildPublishedInvocationApiKeyUsageCardSurface,
  buildPublishedInvocationActivityDetailsSurfaceCopy,
  buildPublishedInvocationActivityInsightsSurfaceCopy,
  buildPublishedInvocationActivityTrafficMixSurface,
  buildPublishedInvocationFailureReasonCardSurface,
  buildPublishedInvocationIssueSignalsSurface,
  buildPublishedInvocationRateLimitWindowInsight,
  buildPublishedInvocationWaitingOverview,
  formatRateLimitPressure,
  listPublishedInvocationActivitySummaryRows,
  listPublishedInvocationActivityWaitingRows,
  listPublishedInvocationRateLimitRows
} from "@/lib/published-invocation-presenters";

import {
  formatTimeWindowLabel,
  resolveWorkflowPublishSelectedInvocationDetailSurface
} from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";

type WorkflowPublishActivityInsightsProps = {
  binding: WorkflowPublishActivityPanelProps["binding"];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId?: string | null;
  selectedInvocationDetail?: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse> | null;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  activeTimeWindow: WorkflowPublishActivityPanelProps["activeInvocationFilter"] extends infer T
    ? T extends { timeWindow: infer U }
      ? U | null
      : never
    : never;
};

export function WorkflowPublishActivityInsights({
  binding,
  invocationAudit,
  rateLimitWindowAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  callbackWaitingAutomation,
  sandboxReadiness,
  activeTimeWindow
}: WorkflowPublishActivityInsightsProps) {
  const summary = invocationAudit?.summary;
  const requestSourceCounts = invocationAudit?.facets.request_source_counts ?? [];
  const requestSurfaceCounts = invocationAudit?.facets.request_surface_counts ?? [];
  const cacheStatusCounts = invocationAudit?.facets.cache_status_counts ?? [];
  const runStatusCounts = invocationAudit?.facets.run_status_counts ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const rateLimitPolicy = binding.rate_limit_policy;
  const waitingOverview = buildPublishedInvocationWaitingOverview({
    summary,
    runStatusCounts,
    reasonCounts,
    callbackWaitingAutomation
  });
  const windowUsed = rateLimitWindowAudit
    ? rateLimitWindowAudit.summary.succeeded_count + rateLimitWindowAudit.summary.failed_count
    : 0;
  const windowRejected = rateLimitWindowAudit?.summary.rejected_count ?? 0;
  const remainingQuota = rateLimitPolicy ? Math.max(rateLimitPolicy.requests - windowUsed, 0) : null;
  const pressure = rateLimitPolicy ? formatRateLimitPressure(rateLimitPolicy.requests, windowUsed) : null;
  const rateLimitWindowInsight = buildPublishedInvocationRateLimitWindowInsight({
    pressure,
    remainingQuota,
    windowRejected,
    failedCount: summary?.failed_count ?? 0,
    timeWindowLabel: formatTimeWindowLabel(activeTimeWindow ?? "all")
  });
  const insightsSurfaceCopy = buildPublishedInvocationActivityInsightsSurfaceCopy({
    rateLimitWindowStartedAt: rateLimitWindowAudit?.filters.created_from ?? null
  });
  const selectedInvocationSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
    selectedInvocationId: selectedInvocationId ?? null,
    selectedInvocationDetail: selectedInvocationDetail ?? null,
    callbackWaitingAutomation,
    sandboxReadiness
  });
  const summaryRows = listPublishedInvocationActivitySummaryRows({
    summary,
    waitingOverview,
    surfaceCopy: insightsSurfaceCopy
  });
  const waitingRows = listPublishedInvocationActivityWaitingRows({
    waitingOverview,
    surfaceCopy: insightsSurfaceCopy
  });
  const rateLimitRows = rateLimitPolicy
    ? listPublishedInvocationRateLimitRows({
        rateLimitPolicy,
        windowUsed,
        remainingQuota,
        pressureLabel: pressure?.label ?? "0%",
        windowRejected,
        surfaceCopy: insightsSurfaceCopy
      })
    : [];
  const trafficMixSurface = buildPublishedInvocationActivityTrafficMixSurface({
    requestSourceCounts,
    requestSurfaceCounts,
    cacheStatusCounts,
    runStatusCounts,
    runStatesEmptyLabel: insightsSurfaceCopy.trafficRunStatesEmptyLabel
  });
  const issueSignalsSurface = buildPublishedInvocationIssueSignalsSurface({
    reasonCounts,
    runStatusCounts,
    failureReasons: invocationAudit?.facets.recent_failure_reasons ?? [],
    sandboxReadiness,
    callbackWaitingAutomation,
    selectedInvocationErrorMessage:
      selectedInvocationSurface.kind === "ok"
        ? selectedInvocationSurface.detail.invocation.error_message ?? null
        : null,
    selectedInvocationNextStepSurface:
      selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.nextStepSurface : null,
    surfaceCopy: insightsSurfaceCopy
  });

  return (
    <>
      <div className="publish-summary-grid">
        {summaryRows.map((row) => (
          <article className="status-card compact-card" key={row.key}>
            <span className="status-label">{row.label}</span>
            <strong>{row.value}</strong>
          </article>
        ))}
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurfaceCopy.trafficMixTitle}</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>{insightsSurfaceCopy.trafficWorkflowLabel}</dt>
              <dd>{trafficMixSurface.workflowCount}</dd>
            </div>
            <div>
              <dt>{insightsSurfaceCopy.trafficAliasLabel}</dt>
              <dd>{trafficMixSurface.aliasCount}</dd>
            </div>
            <div>
              <dt>{insightsSurfaceCopy.trafficPathLabel}</dt>
              <dd>{trafficMixSurface.pathCount}</dd>
            </div>
            <div>
              <dt>{insightsSurfaceCopy.trafficCacheSurfaceLabel}</dt>
              <dd>{trafficMixSurface.cacheSurfaceSummary}</dd>
            </div>
            <div>
              <dt>{insightsSurfaceCopy.trafficRunStatesLabel}</dt>
              <dd>{trafficMixSurface.runStatesSummary}</dd>
            </div>
          </dl>
          {trafficMixSurface.requestSurfaceLabels.length ? (
            <div className="tool-badge-row">
              {trafficMixSurface.requestSurfaceLabels.map((label) => (
                <span className="event-chip" key={label}>
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurfaceCopy.waitingFollowUpTitle}</span>
          </div>
          <p className="section-copy entry-copy">{waitingOverview.headline}</p>
          {waitingOverview.chips.length ? (
            <p className="binding-meta">{waitingOverview.chips.join(" · ")}</p>
          ) : null}
          <dl className="compact-meta-list">
            {waitingRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="section-copy entry-copy">{waitingOverview.detail}</p>
          {waitingOverview.followUpHref && waitingOverview.followUpHrefLabel ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={waitingOverview.followUpHref}>
                {waitingOverview.followUpHrefLabel}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurfaceCopy.rateLimitWindowTitle}</span>
          </div>
          {rateLimitPolicy ? (
            <>
              <dl className="compact-meta-list">
                {rateLimitRows.map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="section-copy entry-copy">{insightsSurfaceCopy.rateLimitWindowDescription}</p>
              {rateLimitWindowInsight ? (
                <p className="section-copy entry-copy">{rateLimitWindowInsight}</p>
              ) : null}
            </>
          ) : (
            <p className="empty-state compact">{insightsSurfaceCopy.rateLimitDisabledEmptyState}</p>
          )}
        </div>
      </div>

      <WorkflowPublishTrafficTimeline
        timeline={timeline}
        timelineGranularity={timelineGranularity}
        timeWindowLabel={formatTimeWindowLabel(activeTimeWindow ?? "all")}
      />

      {issueSignalsSurface ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">{issueSignalsSurface.title}</p>
          <p className="section-copy entry-copy">{issueSignalsSurface.description}</p>
          {issueSignalsSurface.insight ? (
            <p className="section-copy entry-copy">{issueSignalsSurface.insight}</p>
          ) : null}
          {issueSignalsSurface.selectedNextStepSurface ? (
            <div className="entry-card compact-card">
              <div className="payload-card-header">
                <div>
                  <p className="entry-card-title">{issueSignalsSurface.selectedNextStepSurface.title}</p>
                  <p className="binding-meta">{issueSignalsSurface.selectedNextStepSurface.invocationId}</p>
                </div>
                <span className="event-chip">{issueSignalsSurface.selectedNextStepSurface.label}</span>
              </div>
              <p className="section-copy entry-copy">{issueSignalsSurface.selectedNextStepSurface.detail}</p>
              {issueSignalsSurface.selectedNextStepSurface.href &&
              issueSignalsSurface.selectedNextStepSurface.hrefLabel ? (
                <div className="tool-badge-row">
                  <Link
                    className="event-chip inbox-filter-link"
                    href={issueSignalsSurface.selectedNextStepSurface.href}
                  >
                    {issueSignalsSurface.selectedNextStepSurface.hrefLabel}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="tool-badge-row">
            {issueSignalsSurface.chips.map((chip) => (
              <span className="event-chip" key={chip}>
                {chip}
              </span>
            ))}
            {issueSignalsSurface.followUpHref && issueSignalsSurface.followUpHrefLabel ? (
              <Link className="event-chip inbox-filter-link" href={issueSignalsSurface.followUpHref}>
                {issueSignalsSurface.followUpHrefLabel}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

type WorkflowPublishActivityDetailsProps = {
  tools: PluginToolRegistryItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  buildInvocationDetailHref: (invocationId: string) => string;
  clearInvocationDetailHref: string | null;
};

export function WorkflowPublishActivityDetails({
  tools,
  invocationAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  callbackWaitingAutomation,
  sandboxReadiness,
  buildInvocationDetailHref,
  clearInvocationDetailHref
}: WorkflowPublishActivityDetailsProps) {
  const items = invocationAudit?.items ?? [];
  const detailsSurfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy();
  const apiKeyUsage = invocationAudit?.facets.api_key_usage ?? [];
  const failureReasons = invocationAudit?.facets.recent_failure_reasons ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const selectedInvocationSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
    selectedInvocationId,
    selectedInvocationDetail,
    callbackWaitingAutomation,
    sandboxReadiness
  });
  const selectedInvocationFailureBridgeNextStepSurface =
    clearInvocationDetailHref && selectedInvocationSurface.kind === "ok"
      ? selectedInvocationSurface.nextStepSurface
      : null;
  const selectedInvocationFailureBridgeErrorMessage =
    clearInvocationDetailHref && selectedInvocationSurface.kind === "ok"
      ? selectedInvocationSurface.detail.invocation.error_message ?? null
      : null;
  const selectedInvocationUnavailableSurface =
    selectedInvocationSurface.kind === "unavailable"
      ? selectedInvocationSurface.unavailableSurfaceCopy
      : null;

  return (
    <>
      {apiKeyUsage.length ? (
        <div className="publish-cache-list">
          {apiKeyUsage.map((item) => {
            const cardSurface = buildPublishedInvocationApiKeyUsageCardSurface({
              item,
              surfaceCopy: detailsSurfaceCopy
            });

            return (
              <article className="payload-card compact-card" key={item.api_key_id}>
                <div className="payload-card-header">
                  <span className="status-meta">{cardSurface.title}</span>
                  <span className="event-chip">{cardSurface.chipLabel}</span>
                </div>
                <dl className="compact-meta-list">
                  {cardSurface.rows.map((row) => (
                    <div key={`${item.api_key_id}:${row.key}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
      ) : null}

      {failureReasons.length ? (
        <div className="publish-cache-list">
          {failureReasons.map((item) => {
            const cardSurface = buildPublishedInvocationFailureReasonCardSurface({
              item,
              reasonCounts,
              sandboxReadiness,
              callbackWaitingAutomation,
              selectedInvocationErrorMessage: selectedInvocationFailureBridgeErrorMessage,
              selectedInvocationNextStepSurface: selectedInvocationFailureBridgeNextStepSurface,
              surfaceCopy: detailsSurfaceCopy
            });

            return (
              <article className="payload-card compact-card" key={item.message}>
                <div className="payload-card-header">
                  <span className="status-meta">{cardSurface.title}</span>
                  <span className="event-chip">{cardSurface.countLabel}</span>
                </div>
                <p className="binding-meta">{cardSurface.message}</p>
                {cardSurface.diagnosis ? (
                  <>
                    <p className="section-copy entry-copy">{cardSurface.diagnosis.headline}</p>
                    <p className="binding-meta">{cardSurface.diagnosis.detail}</p>
                    {cardSurface.diagnosis.href && cardSurface.diagnosis.hrefLabel ? (
                      <div className="tool-badge-row">
                        <Link className="event-chip inbox-filter-link" href={cardSurface.diagnosis.href}>
                          {cardSurface.diagnosis.hrefLabel}
                        </Link>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {cardSurface.selectedNextStepSurface ? (
                  <div className="entry-card compact-card">
                    <div className="payload-card-header">
                      <span className="status-meta">{cardSurface.selectedNextStepSurface.invocationId}</span>
                      <span className="event-chip">{cardSurface.selectedNextStepSurface.label}</span>
                    </div>
                    <p className="section-copy entry-copy">
                      {cardSurface.selectedNextStepSurface.detail}
                    </p>
                    {cardSurface.selectedNextStepSurface.href &&
                    cardSurface.selectedNextStepSurface.hrefLabel ? (
                      <div className="tool-badge-row">
                        <Link
                          className="event-chip inbox-filter-link"
                          href={cardSurface.selectedNextStepSurface.href}
                        >
                          {cardSurface.selectedNextStepSurface.hrefLabel}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <p className="section-copy entry-copy">{cardSurface.lastSeenLabel}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {selectedInvocationSurface.nextStepSurface && !clearInvocationDetailHref ? (
        <article className="entry-card compact-card">
          <div className="payload-card-header">
            <div>
              <p className="entry-card-title">{selectedInvocationSurface.nextStepSurface.title}</p>
              <p className="binding-meta">{selectedInvocationSurface.nextStepSurface.invocationId}</p>
            </div>
            <span className="event-chip">{selectedInvocationSurface.nextStepSurface.label}</span>
          </div>
          <p className="section-copy entry-copy">{selectedInvocationSurface.nextStepSurface.detail}</p>
          {selectedInvocationSurface.nextStepSurface.href &&
          selectedInvocationSurface.nextStepSurface.hrefLabel ? (
            <div className="tool-badge-row">
              <Link
                className="event-chip inbox-filter-link"
                href={selectedInvocationSurface.nextStepSurface.href}
              >
                {selectedInvocationSurface.nextStepSurface.hrefLabel}
              </Link>
            </div>
          ) : null}
        </article>
      ) : null}

      {items.length ? (
        <>
          {clearInvocationDetailHref && selectedInvocationSurface.kind === "ok" ? (
            <WorkflowPublishInvocationDetailPanel
              clearHref={clearInvocationDetailHref}
              detail={selectedInvocationSurface.detail}
              tools={tools}
              callbackWaitingAutomation={callbackWaitingAutomation}
              sandboxReadiness={sandboxReadiness}
              selectedNextStepSurface={selectedInvocationSurface.nextStepSurface}
            />
          ) : clearInvocationDetailHref && selectedInvocationSurface.kind === "blocked" ? (
            <SensitiveAccessBlockedCard
              callbackWaitingAutomation={callbackWaitingAutomation}
              clearHref={clearInvocationDetailHref}
              payload={selectedInvocationSurface.payload}
              sandboxReadiness={sandboxReadiness}
              summary={selectedInvocationSurface.blockedSurfaceCopy.summary}
              title={selectedInvocationSurface.blockedSurfaceCopy.title}
            />
          ) : clearInvocationDetailHref && selectedInvocationUnavailableSurface ? (
            <article className="entry-card compact-card">
              <div className="payload-card-header">
                <div>
                  <p className="entry-card-title">{selectedInvocationUnavailableSurface.title}</p>
                  <p className="binding-meta">{selectedInvocationUnavailableSurface.summary}</p>
                </div>
              </div>
              <p className="section-copy entry-copy">{selectedInvocationUnavailableSurface.detail}</p>
            </article>
          ) : null}
          <div className="publish-cache-list">
            {items.map((item) => (
              <WorkflowPublishInvocationEntryCard
                callbackWaitingAutomation={callbackWaitingAutomation}
                detailActive={selectedInvocationId === item.id}
                detailHref={buildInvocationDetailHref(item.id)}
                item={item}
                sandboxReadiness={sandboxReadiness}
                key={item.id}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="empty-state compact">{detailsSurfaceCopy.invocationAuditEmptyState}</p>
      )}
    </>
  );
}
