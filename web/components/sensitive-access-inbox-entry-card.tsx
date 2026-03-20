"use client";

import React from "react";
import Link from "next/link";
import {
  ACTION_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  NOTIFICATION_STATUS_LABELS,
  REQUESTER_TYPE_LABELS,
  WAITING_STATUS_LABELS,
  pickLatestNotification
} from "@/components/sensitive-access-inbox-panel-helpers";
import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type {
  NotificationChannelCapabilityItem,
  SensitiveAccessInboxEntry
} from "@/lib/get-sensitive-access";
import {
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusFollowUp,
  formatExecutionFocusReasonLabel,
  formatExecutionFocusPrimarySignal,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { resolveSensitiveAccessInboxEntryScope } from "@/lib/sensitive-access-inbox-entry-scope";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import {
  formatSensitiveAccessDecisionLabel,
  formatSensitiveAccessReasonLabel,
  getSensitiveAccessPolicySummary
} from "@/lib/sensitive-access-presenters";

type SensitiveAccessInboxEntryCardProps = {
  entry: SensitiveAccessInboxEntry;
  notificationChannels?: NotificationChannelCapabilityItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
};

export function SensitiveAccessInboxEntryCard({
  entry,
  notificationChannels = [],
  callbackWaitingAutomation
}: SensitiveAccessInboxEntryCardProps) {
  const request = entry.request;
  const resource = entry.resource;
  const scope = resolveSensitiveAccessInboxEntryScope(entry);
  const latestNotification = pickLatestNotification(entry);
  const callbackWaitingContext = entry.callbackWaitingContext;
  const executionContext = entry.executionContext;
  const executionFocusPrimarySignal = executionContext
    ? executionContext.focusExplanation?.primary_signal ??
      formatExecutionFocusPrimarySignal(executionContext.focusNode)
    : null;
  const executionFocusFollowUp = executionContext
    ? executionContext.focusExplanation?.follow_up ??
      formatExecutionFocusFollowUp(executionContext.focusNode)
    : null;
  const focusToolCallSummaries = executionContext
    ? listExecutionFocusToolCallSummaries(executionContext.focusNode)
    : [];
  const focusArtifactSummary = executionContext
    ? formatExecutionFocusArtifactSummary(executionContext.focusNode)
    : null;
  const focusArtifacts = executionContext
    ? listExecutionFocusArtifactPreviews(executionContext.focusNode)
    : [];
  const executionFactBadges = executionContext
    ? listExecutionFocusRuntimeFactBadges(executionContext.focusNode)
    : [];
  const focusInboxHref = executionContext
    ? buildSensitiveAccessInboxHref({
        runId: executionContext.runId,
        nodeRunId: executionContext.focusNode.node_run_id
      })
    : null;
  const focusSkillTraceReferenceLoads = executionContext?.skillTrace?.loads ?? [];
  const focusSkillTraceReferenceCount = executionContext?.skillTrace?.reference_count ?? null;

  return (
    <article className="activity-row">
      <div className="activity-header">
        <div>
          <h3>{resource?.label ?? `Resource ${request?.resource_id ?? "unknown"}`}</h3>
          <p>
            {request
              ? `${REQUESTER_TYPE_LABELS[request.requester_type]} ${request.requester_id} 发起 ${ACTION_TYPE_LABELS[request.action_type]}`
              : "当前未能关联到 access request，建议回到后端事实层排查。"}
          </p>
        </div>
        <div className="tool-badge-row">
          <span className={`health-pill ${entry.ticket.status}`}>
            {APPROVAL_STATUS_LABELS[entry.ticket.status]}
          </span>
          <span className={`health-pill ${entry.ticket.waiting_status}`}>
            {WAITING_STATUS_LABELS[entry.ticket.waiting_status]}
          </span>
        </div>
      </div>

      <p className="binding-meta">
        ticket {entry.ticket.id} · sensitivity {resource?.sensitivity_level ?? "unknown"} · source{" "}
        {resource?.source ?? "unknown"}
      </p>

      <div className="tool-badge-row">
        {request ? (
          <span className="event-chip">{formatSensitiveAccessDecisionLabel(request)}</span>
        ) : null}
        {request && formatSensitiveAccessReasonLabel(request) ? (
          <span className="event-chip">reason {formatSensitiveAccessReasonLabel(request)}</span>
        ) : null}
        {entry.ticket.run_id ? (
          <Link className="event-chip inbox-filter-link" href={`/runs/${entry.ticket.run_id}`}>
            run {entry.ticket.run_id.slice(0, 8)}
          </Link>
        ) : null}
        <span className="event-chip">created {formatTimestamp(entry.ticket.created_at)}</span>
        <span className="event-chip">expires {formatTimestamp(entry.ticket.expires_at)}</span>
        <span className="event-chip">notifications {entry.notifications.length}</span>
      </div>

      {request?.purpose_text ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Purpose</p>
          <p className="section-copy entry-copy">{request.purpose_text}</p>
        </div>
      ) : null}

      {request && getSensitiveAccessPolicySummary(request) ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Policy summary</p>
          <p className="section-copy entry-copy">{getSensitiveAccessPolicySummary(request)}</p>
        </div>
      ) : null}

      {executionContext ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Execution focus</p>
          <div className="tool-badge-row">
            <span className="event-chip">
              {formatExecutionFocusReasonLabel(executionContext.focusReason)}
            </span>
            <span className="event-chip">node run {executionContext.focusNode.node_run_id}</span>
          </div>
          <p className="section-copy entry-copy">
            {executionContext.focusMatchesEntry
              ? "当前票据已经命中后端选出的 canonical blocker；优先按本条目上的 approval / callback follow-up 恢复即可。"
              : executionContext.entryNodeRunId
                ? `当前票据关联 node run ${executionContext.entryNodeRunId}，但当前 run 的 canonical blocker 已切到 ${executionContext.focusNode.node_name}；建议先跳到该 focus 节点统一排障。`
                : `当前票据还没有稳定映射到具体 node run，但当前 run 的 canonical blocker 已定位到 ${executionContext.focusNode.node_name}。`}
          </p>
          <p className="binding-meta">
            {executionContext.focusNode.node_type} · focus node {executionContext.focusNode.node_id}
          </p>
          {executionFactBadges.length > 0 ? (
            <div className="tool-badge-row">
              {executionFactBadges.map((badge) => (
                <span className="event-chip" key={`${executionContext.runId}-${badge}`}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          {executionFocusPrimarySignal ? (
            <p className="section-copy entry-copy">{executionFocusPrimarySignal}</p>
          ) : null}
          {executionFocusFollowUp ? (
            <p className="binding-meta">{executionFocusFollowUp}</p>
          ) : null}
          <OperatorFocusEvidenceCard
            artifactCount={executionContext.focusNode.artifacts.length}
            artifactRefCount={executionContext.focusNode.artifact_refs.length}
            artifactSummary={focusArtifactSummary}
            artifacts={focusArtifacts}
            toolCallCount={executionContext.focusNode.tool_calls.length}
            toolCallSummaries={focusToolCallSummaries}
          />
          <div className="tool-badge-row">
            <Link className="event-chip inbox-filter-link" href={`/runs/${executionContext.runId}`}>
              open run
            </Link>
            {focusInboxHref ? (
              <Link className="event-chip inbox-filter-link" href={focusInboxHref}>
                slice to focus node
              </Link>
              ) : null}
          </div>
        </div>
      ) : null}

      {callbackWaitingContext ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Callback waiting follow-up</p>
          <CallbackWaitingSummaryCard
            callbackTickets={callbackWaitingContext.callbackTickets}
            callbackWaitingAutomation={callbackWaitingAutomation}
            callbackWaitingExplanation={callbackWaitingContext.callbackWaitingExplanation}
            focusNodeEvidence={executionContext?.focusNode ?? null}
            focusSkillReferenceLoads={focusSkillTraceReferenceLoads}
            focusSkillReferenceCount={focusSkillTraceReferenceCount}
            lifecycle={callbackWaitingContext.lifecycle}
            nodeRunId={callbackWaitingContext.nodeRunId}
            runId={callbackWaitingContext.runId}
            scheduledResumeDelaySeconds={callbackWaitingContext.scheduledResumeDelaySeconds}
            scheduledResumeSource={callbackWaitingContext.scheduledResumeSource}
            scheduledWaitingStatus={callbackWaitingContext.scheduledWaitingStatus}
            scheduledResumeScheduledAt={callbackWaitingContext.scheduledResumeScheduledAt}
            scheduledResumeDueAt={callbackWaitingContext.scheduledResumeDueAt}
            scheduledResumeRequeuedAt={callbackWaitingContext.scheduledResumeRequeuedAt}
            scheduledResumeRequeueSource={callbackWaitingContext.scheduledResumeRequeueSource}
            sensitiveAccessEntries={callbackWaitingContext.sensitiveAccessEntries}
            waitingReason={callbackWaitingContext.waitingReason}
            focusSkillReferenceNodeId={executionContext?.focusNode.node_id ?? null}
            focusSkillReferenceNodeName={executionContext?.focusNode.node_name ?? null}
          />
        </div>
      ) : null}

      {entry.notifications.length > 0 ? (
        <div className="tool-badge-row">
          {entry.notifications.map((notification) => (
            <span className="event-chip" key={notification.id}>
              {notification.channel} · {NOTIFICATION_STATUS_LABELS[notification.status]} · {notification.target}
            </span>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前票据还没有关联的通知投递记录。</p>
      )}

      {latestNotification?.error ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Latest notification status</p>
          <p className="section-copy entry-copy">
            {latestNotification.channel} 当前未成功投递：{latestNotification.error}
          </p>
        </div>
      ) : null}

      <SensitiveAccessInlineActions
        compact
        nodeRunId={scope.nodeRunId}
        notifications={entry.notifications}
        notificationChannels={notificationChannels}
        runId={scope.runId}
        ticket={entry.ticket}
      />
    </article>
  );
}
