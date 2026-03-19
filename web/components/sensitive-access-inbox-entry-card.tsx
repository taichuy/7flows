"use client";

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
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import {
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusFollowUp,
  formatExecutionFocusReasonLabel,
  formatExecutionFocusPrimarySignal,
  formatMetricSummary,
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
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
};

export function SensitiveAccessInboxEntryCard({
  entry,
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
  const focusArtifacts =
    executionContext?.focusNode.artifacts.slice(0, 2).map((artifact, index) => ({
      key: artifact.uri?.trim() || artifact.summary?.trim() || `focus-artifact-${index}`,
      artifactKind: artifact.artifact_kind,
      contentType: artifact.content_type,
      summary: artifact.summary,
      uri: artifact.uri
    })) ?? [];
  const focusInboxHref = executionContext
    ? buildSensitiveAccessInboxHref({
        runId: executionContext.runId,
        nodeRunId: executionContext.focusNode.node_run_id
      })
    : null;

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
            <span className={`event-chip`}>{executionContext.focusNode.status}</span>
            <span className="event-chip">node run {executionContext.focusNode.node_run_id}</span>
            {executionContext.focusNode.execution_blocked_count > 0 ? (
              <span className="event-chip">
                blocked {executionContext.focusNode.execution_blocked_count}
              </span>
            ) : null}
            {executionContext.focusNode.execution_unavailable_count > 0 ? (
              <span className="event-chip">
                unavailable {executionContext.focusNode.execution_unavailable_count}
              </span>
            ) : null}
          </div>
          <p className="section-copy entry-copy">
            {executionContext.focusMatchesEntry
              ? "当前票据已经命中后端选出的 canonical blocker；优先按本条目上的 approval / callback follow-up 恢复即可。"
              : executionContext.entryNode
                ? `当前票据关联节点 ${executionContext.entryNode.node_name}，但当前 run 的 canonical blocker 已切到 ${executionContext.focusNode.node_name}；建议先跳到该 focus 节点统一排障。`
                : `当前票据还没有稳定映射到具体 node run，但当前 run 的 canonical blocker 已定位到 ${executionContext.focusNode.node_name}。`}
          </p>
          <p className="binding-meta">
            {executionContext.focusNode.node_type} · phase {executionContext.focusNode.phase ?? "n/a"}
            {` · exec ${executionContext.focusNode.execution_class}`}
            {executionContext.focusNode.effective_execution_class
              ? ` · effective ${executionContext.focusNode.effective_execution_class}`
              : ""}
          </p>
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
          {executionContext.skillTrace ? (
            <div className="event-list">
              <div className="entry-card compact-card">
                <div className="payload-card-header">
                  <span className="status-meta">Focused skill trace</span>
                  <span className="event-chip">
                    refs {executionContext.skillTrace.reference_count}
                  </span>
                </div>
                <p className="section-copy entry-copy">
                  {executionContext.skillTrace.scope === "execution_focus_node"
                    ? "当前 operator inbox 已直接消费 execution focus 节点的 skill trace，无需再跳回 run detail 才能看见 agent 实际加载的参考资料。"
                    : "当前 focus 节点没有独立 skill trace，因此这里回退展示整个 run 的 skill 注入摘要。"}
                </p>
                <div className="tool-badge-row">
                  {formatMetricSummary(executionContext.skillTrace.phase_counts) ? (
                    <span className="event-chip">
                      phases {formatMetricSummary(executionContext.skillTrace.phase_counts)}
                    </span>
                  ) : null}
                  {formatMetricSummary(executionContext.skillTrace.source_counts) ? (
                    <span className="event-chip">
                      sources {formatMetricSummary(executionContext.skillTrace.source_counts)}
                    </span>
                  ) : null}
                </div>
                {executionContext.skillTrace.nodes.map((node) => (
                  <div key={node.node_run_id}>
                    <p className="section-copy entry-copy">
                      {node.node_name ?? node.node_id ?? node.node_run_id} · node run {node.node_run_id}
                    </p>
                    <SkillReferenceLoadList
                      skillReferenceLoads={node.loads}
                      title="Injected references"
                      description="当前 operator 入口、run detail 和 publish detail 现在围绕同一份 skill trace 事实解释 agent 注入来源。"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {callbackWaitingContext ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Callback waiting follow-up</p>
          <CallbackWaitingSummaryCard
            callbackTickets={callbackWaitingContext.callbackTickets}
            callbackWaitingAutomation={callbackWaitingAutomation}
            callbackWaitingExplanation={callbackWaitingContext.callbackWaitingExplanation}
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
        runId={scope.runId}
        ticket={entry.ticket}
      />
    </article>
  );
}
