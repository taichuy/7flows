import type { RunExecutionView } from "@/lib/get-run-views";

import { RunDiagnosticsExecutionOverviewBlockers } from "@/components/run-diagnostics-execution/execution-overview-blockers";
import { MetricChipRow, SummaryCard } from "@/components/run-diagnostics-execution/shared";

export function RunDiagnosticsExecutionOverview({
  executionView
}: {
  executionView: RunExecutionView | null;
}) {
  if (!executionView) {
    return <p className="empty-state">Execution view is unavailable for this run.</p>;
  }

  const callbackWaiting = executionView.summary.callback_waiting;

  return (
    <>
      <div className="summary-strip">
        <SummaryCard label="Node runs" value={executionView.summary.node_run_count} />
        <SummaryCard label="Artifacts" value={executionView.summary.artifact_count} />
        <SummaryCard label="Tool calls" value={executionView.summary.tool_call_count} />
        <SummaryCard label="AI calls" value={executionView.summary.ai_call_count} />
      </div>

      <div className="summary-strip">
        <SummaryCard label="Waiting nodes" value={executionView.summary.waiting_node_count} />
        <SummaryCard label="Errored nodes" value={executionView.summary.errored_node_count} />
        <SummaryCard label="Assistant calls" value={executionView.summary.assistant_call_count} />
        <SummaryCard label="Callback tickets" value={executionView.summary.callback_ticket_count} />
      </div>

      <div className="summary-strip">
        <SummaryCard
          label="Execution dispatched"
          value={executionView.summary.execution_dispatched_node_count}
        />
        <SummaryCard
          label="Execution fallback"
          value={executionView.summary.execution_fallback_node_count}
        />
        <SummaryCard
          label="Execution blocked"
          value={executionView.summary.execution_blocked_node_count}
        />
        <SummaryCard
          label="Execution unavailable"
          value={executionView.summary.execution_unavailable_node_count}
        />
      </div>

      {executionView.summary.sensitive_access_request_count > 0 ? (
        <div className="summary-strip">
          <SummaryCard
            label="Sensitive requests"
            value={executionView.summary.sensitive_access_request_count}
          />
          <SummaryCard
            label="Approval tickets"
            value={executionView.summary.sensitive_access_approval_ticket_count}
          />
          <SummaryCard
            label="Notifications"
            value={executionView.summary.sensitive_access_notification_count}
          />
        </div>
      ) : null}

      {callbackWaiting.node_count > 0 ? (
        <div className="summary-strip">
          <SummaryCard label="Callback waits" value={callbackWaiting.node_count} />
          <SummaryCard label="Expired tickets" value={callbackWaiting.expired_ticket_count} />
          <SummaryCard label="Resume schedules" value={callbackWaiting.resume_schedule_count} />
          <SummaryCard label="Late callbacks" value={callbackWaiting.late_callback_count} />
          <SummaryCard label="Terminated waits" value={callbackWaiting.terminated_node_count} />
        </div>
      ) : null}

      <MetricChipRow
        title="Ticket statuses"
        emptyCopy="No callback tickets recorded for this run."
        metrics={executionView.summary.callback_ticket_status_counts}
        prefix="ticket"
      />

      <MetricChipRow
        title="Requested execution classes"
        emptyCopy="No execution dispatch signals were recorded for this run."
        metrics={executionView.summary.execution_requested_class_counts}
        prefix="requested-exec"
      />

      <MetricChipRow
        title="Effective execution classes"
        emptyCopy="No effective execution classes were observed for this run."
        metrics={executionView.summary.execution_effective_class_counts}
        prefix="effective-exec"
      />

      <MetricChipRow
        title="Execution executors"
        emptyCopy="No execution executor refs were recorded for this run."
        metrics={executionView.summary.execution_executor_ref_counts}
        prefix="executor-ref"
      />

      {executionView.summary.sensitive_access_request_count > 0 ? (
        <>
          <MetricChipRow
            title="Sensitive decisions"
            emptyCopy="No sensitive access decisions were recorded for this run."
            metrics={executionView.summary.sensitive_access_decision_counts}
            prefix="decision"
          />
          <MetricChipRow
            title="Approval statuses"
            emptyCopy="No approval tickets were issued for this run."
            metrics={executionView.summary.sensitive_access_approval_status_counts}
            prefix="approval"
          />
          <MetricChipRow
            title="Notification statuses"
            emptyCopy="No notification dispatches were recorded for this run."
            metrics={executionView.summary.sensitive_access_notification_status_counts}
            prefix="notification"
          />
        </>
      ) : null}

      {callbackWaiting.node_count > 0 ? (
        <>
          <RunDiagnosticsExecutionOverviewBlockers executionView={executionView} />

          <MetricChipRow
            title="Resume sources"
            emptyCopy="No callback resumes have been scheduled yet."
            metrics={callbackWaiting.resume_source_counts}
            prefix="resume-source"
          />
          <MetricChipRow
            title="Termination reasons"
            emptyCopy="No callback waiting nodes have been terminated."
            metrics={callbackWaiting.termination_reason_counts}
            prefix="termination-reason"
          />
        </>
      ) : null}
    </>
  );
}
