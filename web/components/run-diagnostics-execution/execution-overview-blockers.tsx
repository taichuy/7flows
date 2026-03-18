import type { RunExecutionNodeItem, RunExecutionView } from "@/lib/get-run-views";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import { formatTimestamp } from "@/lib/runtime-presenters";

function countPendingApprovals(node: RunExecutionNodeItem): number {
  return node.sensitive_access_entries.filter((entry) => entry.approval_ticket?.status === "pending")
    .length;
}

function countPendingTickets(node: RunExecutionNodeItem): number {
  return node.callback_tickets.filter((ticket) => ticket.status === "pending").length;
}

function hasScheduledResume(node: RunExecutionNodeItem): boolean {
  return typeof node.scheduled_resume_delay_seconds === "number";
}

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

function getNodePriorityScore(node: RunExecutionNodeItem): number {
  const pendingApprovals = countPendingApprovals(node);
  const pendingTickets = countPendingTickets(node);
  const lifecycle = node.callback_waiting_lifecycle;

  let score = 0;
  score += pendingApprovals * 100;
  score += pendingTickets * 80;
  score += (lifecycle?.expired_ticket_count ?? 0) * 20;
  score += (lifecycle?.late_callback_count ?? 0) * 15;
  score += node.callback_tickets.length * 5;
  score += node.sensitive_access_entries.length * 3;
  if (hasScheduledResume(node)) {
    score -= 20;
  }
  if (node.status.includes("waiting")) {
    score += 10;
  }
  if (lifecycle?.terminated) {
    score -= 25;
  }
  return score;
}

function pickTopBlockerNodes(executionView: RunExecutionView): RunExecutionNodeItem[] {
  return executionView.nodes
    .filter((node) => {
      return (
        countPendingApprovals(node) > 0 ||
        countPendingTickets(node) > 0 ||
        hasScheduledResume(node) ||
        node.callback_tickets.length > 0 ||
        node.sensitive_access_entries.length > 0 ||
        Boolean(node.waiting_reason)
      );
    })
    .sort((left, right) => getNodePriorityScore(right) - getNodePriorityScore(left))
    .slice(0, 3);
}

export function RunDiagnosticsExecutionOverviewBlockers({
  executionView
}: {
  executionView: RunExecutionView;
}) {
  const blockerNodes = pickTopBlockerNodes(executionView);

  if (blockerNodes.length === 0) {
    return null;
  }

  return (
    <section>
      <strong>Priority blockers</strong>
      <p className="section-copy entry-copy">
        Priority blockers surface the most actionable waiting or approval nodes directly in the
        overview so operator recovery does not always start from a deep node card.
      </p>
      <div className="publish-cache-list">
        {blockerNodes.map((node) => {
          const pendingApprovals = countPendingApprovals(node);
          const pendingTickets = countPendingTickets(node);
          const lifecycle = node.callback_waiting_lifecycle;
          const inboxHref = buildNodeInboxHref(node);

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
              <CallbackWaitingSummaryCard
                callbackTickets={node.callback_tickets}
                className="callback-waiting-summary-card"
                inboxHref={inboxHref}
                lifecycle={lifecycle}
                nodeRunId={node.node_run_id}
                runId={executionView.run_id}
                scheduledResumeDelaySeconds={node.scheduled_resume_delay_seconds}
                scheduledResumeSource={node.scheduled_resume_source}
                scheduledWaitingStatus={node.scheduled_waiting_status}
                scheduledResumeScheduledAt={node.scheduled_resume_scheduled_at}
                scheduledResumeDueAt={node.scheduled_resume_due_at}
                sensitiveAccessEntries={node.sensitive_access_entries}
                waitingReason={node.waiting_reason}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
