import Link from "next/link";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishInvocationDetailPanelProps = {
  detail: PublishedEndpointInvocationDetailResponse;
  clearHref: string;
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function formatMetricCounts(metrics: Record<string, number> | null | undefined): string {
  if (!metrics) {
    return "n/a";
  }

  const parts = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);

  return parts.length ? parts.join(" · ") : "0";
}

function formatScheduledResume(detail: PublishedEndpointInvocationDetailResponse): string {
  const scheduledResume = detail.invocation.run_waiting_lifecycle;
  if (!scheduledResume?.scheduled_resume_delay_seconds) {
    return "n/a";
  }

  const parts = [`${scheduledResume.scheduled_resume_delay_seconds}s`];
  if (scheduledResume.scheduled_resume_source) {
    parts.push(scheduledResume.scheduled_resume_source);
  }
  if (scheduledResume.scheduled_waiting_status) {
    parts.push(scheduledResume.scheduled_waiting_status);
  }
  return parts.join(" · ");
}

function formatCallbackLifecycle(detail: PublishedEndpointInvocationDetailResponse): string {
  const lifecycle = detail.invocation.run_waiting_lifecycle?.callback_waiting_lifecycle;
  if (!lifecycle) {
    return "n/a";
  }

  const parts: string[] = [];
  if (lifecycle.wait_cycle_count > 0) {
    parts.push(`wait cycles ${lifecycle.wait_cycle_count}`);
  }
  if (lifecycle.expired_ticket_count > 0) {
    parts.push(`expired ${lifecycle.expired_ticket_count}`);
  }
  if (lifecycle.late_callback_count > 0) {
    parts.push(`late callbacks ${lifecycle.late_callback_count}`);
  }
  if (typeof lifecycle.last_resume_delay_seconds === "number") {
    parts.push(`resume ${lifecycle.last_resume_delay_seconds}s`);
  }
  if (lifecycle.last_resume_backoff_attempt > 0) {
    parts.push(`backoff #${lifecycle.last_resume_backoff_attempt}`);
  }
  if (lifecycle.max_expired_ticket_count > 0) {
    parts.push(`max expired ${lifecycle.max_expired_ticket_count}`);
  }
  if (lifecycle.terminated) {
    parts.push("terminated");
  }
  if (lifecycle.last_ticket_status) {
    parts.push(`last ticket ${lifecycle.last_ticket_status}`);
  }

  return parts.length ? parts.join(" · ") : "tracked";
}

export function WorkflowPublishInvocationDetailPanel({
  detail,
  clearHref
}: WorkflowPublishInvocationDetailPanelProps) {
  const {
    invocation,
    run,
    callback_tickets: callbackTickets,
    sensitive_access_entries: sensitiveAccessEntries,
    cache
  } = detail;
  const waitingLifecycle = invocation.run_waiting_lifecycle;

  return (
    <article className="entry-card compact-card publish-invocation-detail-panel">
      <div className="payload-card-header">
        <div>
          <p className="entry-card-title">Invocation detail</p>
          <p className="binding-meta">
            {invocation.id} · {formatTimestamp(invocation.created_at)} · {formatDurationMs(invocation.duration_ms)}
          </p>
        </div>
        <Link className="inline-link secondary" href={clearHref}>
          关闭详情
        </Link>
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Run drilldown</span>
            {run?.id ? (
              <Link className="inline-link" href={`/runs/${encodeURIComponent(run.id)}`}>
                打开 run
              </Link>
            ) : null}
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Run</dt>
              <dd>{run?.id ?? invocation.run_id ?? "not-started"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{run?.status ?? invocation.run_status ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Current node</dt>
              <dd>{run?.current_node_id ?? invocation.run_current_node_id ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Waiting reason</dt>
              <dd>{invocation.run_waiting_reason ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Waiting node run</dt>
              <dd>{waitingLifecycle?.node_run_id ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Callback tickets</dt>
              <dd>
                {waitingLifecycle
                  ? `${waitingLifecycle.callback_ticket_count} · ${formatMetricCounts(waitingLifecycle.callback_ticket_status_counts)}`
                  : "n/a"}
              </dd>
            </div>
            <div>
              <dt>Scheduled resume</dt>
              <dd>{formatScheduledResume(detail)}</dd>
            </div>
            <div>
              <dt>Callback lifecycle</dt>
              <dd>{formatCallbackLifecycle(detail)}</dd>
            </div>
            <div>
              <dt>Termination</dt>
              <dd>
                {waitingLifecycle?.callback_waiting_lifecycle?.terminated
                  ? [
                      waitingLifecycle.callback_waiting_lifecycle.termination_reason,
                      formatTimestamp(waitingLifecycle.callback_waiting_lifecycle.terminated_at)
                    ]
                      .filter(Boolean)
                      .join(" · ") || "terminated"
                  : "n/a"}
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatTimestamp(run?.started_at)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{formatTimestamp(run?.finished_at ?? invocation.finished_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Cache drilldown</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Status</dt>
              <dd>{cache.cache_status}</dd>
            </div>
            <div>
              <dt>Cache key</dt>
              <dd>{cache.cache_key ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>{cache.cache_entry_id ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Entry hits</dt>
              <dd>{cache.inventory_entry?.hit_count ?? 0}</dd>
            </div>
            <div>
              <dt>Last hit</dt>
              <dd>{formatTimestamp(cache.inventory_entry?.last_hit_at)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatTimestamp(cache.inventory_entry?.expires_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="publish-meta-grid">
        <div>
          <strong>Request preview</strong>
          <p className="section-copy entry-copy">
            request keys: {formatKeyList(invocation.request_preview.keys ?? [])}
          </p>
          <pre className="trace-preview">{formatJsonPreview(invocation.request_preview)}</pre>
        </div>
        <div>
          <strong>Response preview</strong>
          <pre className="trace-preview">{formatJsonPreview(invocation.response_preview)}</pre>
        </div>
      </div>

      {callbackTickets.length ? (
        <div className="publish-cache-list">
          {callbackTickets.map((ticket) => (
            <article className="payload-card compact-card" key={ticket.ticket}>
              <div className="payload-card-header">
                <span className="status-meta">Callback ticket</span>
                <span className="event-chip">{ticket.status}</span>
              </div>
              <dl className="compact-meta-list">
                <div>
                  <dt>Ticket</dt>
                  <dd>{ticket.ticket}</dd>
                </div>
                <div>
                  <dt>Node run</dt>
                  <dd>{ticket.node_run_id}</dd>
                </div>
                <div>
                  <dt>Tool</dt>
                  <dd>
                    {ticket.tool_id ?? "n/a"} · call #{ticket.tool_call_index}
                  </dd>
                </div>
                <div>
                  <dt>Waiting status</dt>
                  <dd>{ticket.waiting_status}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{ticket.reason ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(ticket.created_at)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatTimestamp(ticket.expires_at)}</dd>
                </div>
                <div>
                  <dt>Consumed</dt>
                  <dd>{formatTimestamp(ticket.consumed_at)}</dd>
                </div>
                <div>
                  <dt>Canceled</dt>
                  <dd>{formatTimestamp(ticket.canceled_at)}</dd>
                </div>
                <div>
                  <dt>Expired</dt>
                  <dd>{formatTimestamp(ticket.expired_at)}</dd>
                </div>
              </dl>
              {ticket.callback_payload ? (
                <>
                  <p className="section-copy entry-copy">callback payload preview</p>
                  <pre className="trace-preview">{formatJsonPreview(ticket.callback_payload)}</pre>
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前这次 invocation 没有关联 callback ticket。</p>
      )}

      <div>
        <strong>Approval timeline</strong>
        <p className="section-copy entry-copy">
          Sensitive access decisions, approval tickets and notification delivery are grouped here
          so published-surface debugging no longer has to jump back to the inbox.
        </p>
        <SensitiveAccessTimelineEntryList
          defaultRunId={run?.id ?? invocation.run_id ?? null}
          entries={sensitiveAccessEntries}
          emptyCopy="当前这次 invocation 没有关联 sensitive access timeline。"
        />
      </div>
    </article>
  );
}
