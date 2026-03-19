import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { RunExecutionNodeItem, RunExecutionView } from "@/lib/get-run-views";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import {
  countPendingApprovals,
  countPendingTickets,
  hasScheduledResume,
  pickTopBlockerNodes
} from "@/lib/run-execution-blockers";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import {
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  formatExecutionFocusReasonLabel,
  formatMetricSummary
} from "@/lib/run-execution-focus-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";

function buildNodeInboxHref(node: RunExecutionNodeItem): string | null {
  const latestApprovalEntry = node.sensitive_access_entries.find((entry) => entry.approval_ticket);
  if (!latestApprovalEntry && node.callback_tickets.length === 0) {
    return null;
  }

  return buildSensitiveAccessInboxHref({
    runId: latestApprovalEntry?.request.run_id ?? latestApprovalEntry?.approval_ticket?.run_id ?? null,
    nodeRunId: node.node_run_id,
    status: latestApprovalEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestApprovalEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestApprovalEntry?.request.id ?? null,
    approvalTicketId: latestApprovalEntry?.approval_ticket?.id ?? null
  });
}

export function RunDiagnosticsExecutionOverviewBlockers({
  executionView,
  callbackWaitingAutomation
}: {
  executionView: RunExecutionView;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
}) {
  const focusNode = executionView.execution_focus_node ?? null;
  const skillTrace = executionView.skill_trace ?? null;
  const focusNodePrimarySignal =
    executionView.execution_focus_explanation?.primary_signal ??
    (focusNode ? formatExecutionFocusPrimarySignal(focusNode) : null);
  const focusNodeFollowUp =
    executionView.execution_focus_explanation?.follow_up ??
    (focusNode ? formatExecutionFocusFollowUp(focusNode) : null);
  const blockerNodes = pickTopBlockerNodes(executionView).filter(
    (node) => node.node_run_id !== focusNode?.node_run_id
  );

  if (!focusNode && blockerNodes.length === 0) {
    return null;
  }

  return (
    <section>
      <strong>Priority blockers</strong>
      <p className="section-copy entry-copy">
        Run diagnostics now consumes the backend-selected execution focus first, so operator recovery
        starts from the same canonical node that publish detail and runtime facts already agree on.
      </p>
      {focusNode ? (
        <div className="publish-cache-list">
          <article className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Execution focus</span>
              <span className="event-chip">
                {formatExecutionFocusReasonLabel(executionView.execution_focus_reason)}
              </span>
            </div>
            <p className="entry-card-title">{focusNode.node_name}</p>
            <p className="timeline-meta">
              {focusNode.node_type} · node run {focusNode.node_run_id}
            </p>
            <p className="binding-meta">This node is selected from backend execution facts.</p>
            {focusNodePrimarySignal ? (
              <p className="section-copy entry-copy">{focusNodePrimarySignal}</p>
            ) : null}
            {focusNodeFollowUp ? <p className="binding-meta">{focusNodeFollowUp}</p> : null}
            <CallbackWaitingSummaryCard
              callbackTickets={focusNode.callback_tickets}
              callbackWaitingAutomation={callbackWaitingAutomation}
              callbackWaitingExplanation={focusNode.callback_waiting_explanation}
              className="callback-waiting-summary-card"
              focusNodeEvidence={focusNode}
              inboxHref={buildNodeInboxHref(focusNode)}
              lifecycle={focusNode.callback_waiting_lifecycle}
              nodeRunId={focusNode.node_run_id}
              runId={executionView.run_id}
              scheduledResumeDelaySeconds={focusNode.scheduled_resume_delay_seconds}
              scheduledResumeSource={focusNode.scheduled_resume_source}
              scheduledWaitingStatus={focusNode.scheduled_waiting_status}
              scheduledResumeScheduledAt={focusNode.scheduled_resume_scheduled_at}
              scheduledResumeDueAt={focusNode.scheduled_resume_due_at}
              scheduledResumeRequeuedAt={focusNode.scheduled_resume_requeued_at}
              scheduledResumeRequeueSource={focusNode.scheduled_resume_requeue_source}
              sensitiveAccessEntries={focusNode.sensitive_access_entries}
              waitingReason={focusNode.waiting_reason}
            />
          </article>
          {skillTrace ? (
            <article className="payload-card compact-card">
              <div className="payload-card-header">
                <span className="status-meta">Focused skill trace</span>
                <span className="event-chip">refs {skillTrace.reference_count}</span>
              </div>
              <p className="section-copy entry-copy">
                {skillTrace.scope === "execution_focus_node"
                  ? "当前优先展示 execution focus 节点真正加载到 agent phase 的参考资料。"
                  : "当前节点没有命中独立 skill trace，因此展示整个 run 的注入摘要。"}
              </p>
              <div className="tool-badge-row">
                {formatMetricSummary(skillTrace.phase_counts) ? (
                  <span className="event-chip">phases {formatMetricSummary(skillTrace.phase_counts)}</span>
                ) : null}
                {formatMetricSummary(skillTrace.source_counts) ? (
                  <span className="event-chip">sources {formatMetricSummary(skillTrace.source_counts)}</span>
                ) : null}
              </div>
              {skillTrace.nodes.map((node) => (
                <div key={node.node_run_id}>
                  <p className="section-copy entry-copy">
                    {node.node_name ?? node.node_id ?? node.node_run_id} · node run {node.node_run_id}
                  </p>
                  <SkillReferenceLoadList
                    skillReferenceLoads={node.loads}
                    title="Injected references"
                    description="当前 run overview 和 publish detail 现在都能围绕同一执行聚焦节点解释 agent 注入来源。"
                  />
                </div>
              ))}
            </article>
          ) : null}
        </div>
      ) : null}
      {blockerNodes.length > 0 ? (
      <div className="publish-cache-list">
        {blockerNodes.map((node) => {
          const pendingApprovals = countPendingApprovals(node);
          const pendingTickets = countPendingTickets(node);
          const lifecycle = node.callback_waiting_lifecycle;
          const inboxHref = buildNodeInboxHref(node);
          const primarySignal =
            node.execution_focus_explanation?.primary_signal ??
            formatExecutionFocusPrimarySignal(node);
          const followUp =
            node.execution_focus_explanation?.follow_up ??
            formatExecutionFocusFollowUp(node);

          return (
            <article className="payload-card compact-card" key={node.node_run_id}>
              <div className="payload-card-header">
                <span className="status-meta">Priority blocker</span>
                <span className={`event-chip`}>{node.status}</span>
              </div>
              <p className="entry-card-title">{node.node_name}</p>
              <p className="timeline-meta">
                {node.node_type} · node run {node.node_run_id}
              </p>
              <p className="binding-meta">
                approvals {pendingApprovals} · callback tickets {node.callback_tickets.length}
                {pendingTickets > 0 ? ` · pending tickets ${pendingTickets}` : ""}
                {typeof lifecycle?.last_resume_delay_seconds === "number"
                  ? ` · last resume ${lifecycle.last_resume_delay_seconds}s`
                  : ""}
              </p>
              {node.started_at ? (
                <p className="binding-meta">Started {formatTimestamp(node.started_at)}</p>
              ) : null}
              {primarySignal ? <p className="section-copy entry-copy">{primarySignal}</p> : null}
              {followUp ? <p className="binding-meta">{followUp}</p> : null}
              <CallbackWaitingSummaryCard
                callbackTickets={node.callback_tickets}
                callbackWaitingAutomation={callbackWaitingAutomation}
                callbackWaitingExplanation={node.callback_waiting_explanation}
                className="callback-waiting-summary-card"
                focusNodeEvidence={node}
                inboxHref={inboxHref}
                lifecycle={lifecycle}
                nodeRunId={node.node_run_id}
                runId={executionView.run_id}
                scheduledResumeDelaySeconds={node.scheduled_resume_delay_seconds}
                scheduledResumeSource={node.scheduled_resume_source}
                scheduledWaitingStatus={node.scheduled_waiting_status}
                scheduledResumeScheduledAt={node.scheduled_resume_scheduled_at}
                scheduledResumeDueAt={node.scheduled_resume_due_at}
                scheduledResumeRequeuedAt={node.scheduled_resume_requeued_at}
                scheduledResumeRequeueSource={node.scheduled_resume_requeue_source}
                sensitiveAccessEntries={node.sensitive_access_entries}
                waitingReason={node.waiting_reason}
              />
            </article>
          );
        })}
      </div>
      ) : null}
    </section>
  );
}
