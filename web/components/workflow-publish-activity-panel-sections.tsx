import React from "react";
import Link from "next/link";

import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowPublishSelectedNextStepCard } from "@/components/workflow-publish-selected-next-step-card";
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
  buildPublishedInvocationActivityInsightsSurface,
  buildPublishedInvocationApiKeyUsageCardSurface,
  buildPublishedInvocationActivityDetailsSurfaceCopy,
  buildPublishedInvocationFailureReasonCardSurface
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
  selectedInvocationHref?: string | null;
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
  selectedInvocationHref,
  selectedInvocationDetail,
  callbackWaitingAutomation,
  sandboxReadiness,
  activeTimeWindow
}: WorkflowPublishActivityInsightsProps) {
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const timeWindowLabel = formatTimeWindowLabel(activeTimeWindow ?? "all");
  const selectedInvocationSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
    selectedInvocationId: selectedInvocationId ?? null,
    selectedInvocationDetail: selectedInvocationDetail ?? null,
    currentHref: selectedInvocationHref ?? null,
    callbackWaitingAutomation,
    sandboxReadiness
  });
  const insightsSurface = buildPublishedInvocationActivityInsightsSurface({
    invocationAudit,
    rateLimitWindowAudit,
    rateLimitPolicy: binding.rate_limit_policy,
    callbackWaitingAutomation,
    sandboxReadiness,
    timeWindowLabel,
    selectedInvocation:
      selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.detail.invocation : null,
    selectedInvocationErrorMessage:
      selectedInvocationSurface.kind === "ok"
        ? selectedInvocationSurface.detail.invocation.error_message ?? null
        : null,
    selectedInvocationNextStepSurface:
      selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.nextStepSurface : null
  });

  return (
    <>
      <div className="summary-strip compact-strip">
        {insightsSurface.summaryCards.map((card) => (
          <article className="summary-card" key={card.key}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            {card.detail ? <p className="binding-meta">{card.detail}</p> : null}
            {card.href && card.hrefLabel ? (
              <Link className="inline-link" href={card.href}>
                {card.hrefLabel}
              </Link>
            ) : null}
          </article>
        ))}
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurface.trafficMixCard.title}</span>
          </div>
          <p className="section-copy entry-copy">{insightsSurface.trafficMixCard.detail}</p>
          <dl className="compact-meta-list">
            {insightsSurface.trafficMixCard.rows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {insightsSurface.trafficMixCard.requestSurfaceLabels.length ? (
            <div className="tool-badge-row">
              {insightsSurface.trafficMixCard.requestSurfaceLabels.map((label) => (
                <span className="event-chip" key={label}>
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurface.waitingFollowUpCard.title}</span>
          </div>
          <p className="section-copy entry-copy">{insightsSurface.waitingFollowUpCard.headline}</p>
          {insightsSurface.waitingFollowUpCard.chips.length ? (
            <p className="binding-meta">{insightsSurface.waitingFollowUpCard.chips.join(" · ")}</p>
          ) : null}
          <dl className="compact-meta-list">
            {insightsSurface.waitingFollowUpCard.rows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="section-copy entry-copy">{insightsSurface.waitingFollowUpCard.detail}</p>
          {insightsSurface.waitingFollowUpCard.selectedNextStepSurface ? (
            <WorkflowPublishSelectedNextStepCard
              surface={insightsSurface.waitingFollowUpCard.selectedNextStepSurface}
              showTitle={false}
            />
          ) : null}
          {insightsSurface.waitingFollowUpCard.followUpHref &&
          insightsSurface.waitingFollowUpCard.followUpHrefLabel ? (
            <div className="tool-badge-row">
              <Link
                className="event-chip inbox-filter-link"
                href={insightsSurface.waitingFollowUpCard.followUpHref}
              >
                {insightsSurface.waitingFollowUpCard.followUpHrefLabel}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{insightsSurface.rateLimitWindowCard.title}</span>
          </div>
          {insightsSurface.rateLimitWindowCard.enabled ? (
            <>
              <dl className="compact-meta-list">
                {insightsSurface.rateLimitWindowCard.rows.map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {insightsSurface.rateLimitWindowCard.description ? (
                <p className="section-copy entry-copy">{insightsSurface.rateLimitWindowCard.description}</p>
              ) : null}
              {insightsSurface.rateLimitWindowCard.insight ? (
                <p className="section-copy entry-copy">{insightsSurface.rateLimitWindowCard.insight}</p>
              ) : null}
              {insightsSurface.rateLimitWindowCard.selectedNextStepSurface ? (
                <WorkflowPublishSelectedNextStepCard
                  surface={insightsSurface.rateLimitWindowCard.selectedNextStepSurface}
                  showTitle={false}
                />
              ) : null}
            </>
          ) : (
            <p className="empty-state compact">{insightsSurface.rateLimitWindowCard.emptyState}</p>
          )}
        </div>
      </div>

      <WorkflowPublishTrafficTimeline
        timeline={timeline}
        timelineGranularity={timelineGranularity}
        timeWindowLabel={timeWindowLabel}
      />

      {insightsSurface.issueSignalsSurface ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">{insightsSurface.issueSignalsSurface.title}</p>
          <p className="section-copy entry-copy">{insightsSurface.issueSignalsSurface.description}</p>
          {insightsSurface.issueSignalsSurface.insight ? (
            <p className="section-copy entry-copy">{insightsSurface.issueSignalsSurface.insight}</p>
          ) : null}
          {insightsSurface.issueSignalsSurface.selectedNextStepSurface ? (
            <WorkflowPublishSelectedNextStepCard
              surface={insightsSurface.issueSignalsSurface.selectedNextStepSurface}
            />
          ) : null}
          <div className="tool-badge-row">
            {insightsSurface.issueSignalsSurface.chips.map((chip) => (
              <span className="event-chip" key={chip}>
                {chip}
              </span>
            ))}
            {insightsSurface.issueSignalsSurface.followUpHref &&
            insightsSurface.issueSignalsSurface.followUpHrefLabel ? (
              <Link
                className="event-chip inbox-filter-link"
                href={insightsSurface.issueSignalsSurface.followUpHref}
              >
                {insightsSurface.issueSignalsSurface.followUpHrefLabel}
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
  selectedInvocationHref?: string | null;
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
  selectedInvocationHref,
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
    currentHref: selectedInvocationHref ?? null,
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
  const selectedInvocationDetailValue =
    selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.detail.invocation : null;
  const selectedInvocationDetailNextStepSurface =
    selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.nextStepSurface : null;

  return (
    <>
      {apiKeyUsage.length ? (
        <div className="publish-cache-list">
          {apiKeyUsage.map((item) => {
            const cardSurface = buildPublishedInvocationApiKeyUsageCardSurface({
              item,
              selectedInvocation: selectedInvocationDetailValue,
              selectedInvocationNextStepSurface: selectedInvocationDetailNextStepSurface,
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
                {cardSurface.selectedNextStepSurface ? (
                  <WorkflowPublishSelectedNextStepCard
                    surface={cardSurface.selectedNextStepSurface}
                    showTitle={false}
                  />
                ) : null}
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
                  <WorkflowPublishSelectedNextStepCard
                    surface={cardSurface.selectedNextStepSurface}
                    showTitle={false}
                  />
                ) : null}
                <p className="section-copy entry-copy">{cardSurface.lastSeenLabel}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {selectedInvocationSurface.nextStepSurface && !clearInvocationDetailHref ? (
        <WorkflowPublishSelectedNextStepCard surface={selectedInvocationSurface.nextStepSurface} />
      ) : null}

      {items.length ? (
        <>
          {clearInvocationDetailHref && selectedInvocationSurface.kind === "ok" ? (
            <WorkflowPublishInvocationDetailPanel
              clearHref={clearInvocationDetailHref}
              currentHref={selectedInvocationHref}
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
                hideRecommendedNextStep={
                  selectedInvocationId === item.id && Boolean(selectedInvocationSurface.nextStepSurface)
                }
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
