import React from "react";
import Link from "next/link";

import { formatDurationMs, formatJsonPayload, formatTimestamp } from "@/lib/runtime-presenters";
import type { RunTrace, RunTraceQuery } from "@/lib/get-run-trace";
import { buildRequiredOperatorRunDetailLinkSurface } from "@/lib/operator-follow-up-presenters";

import { buildPageTraceHref } from "@/components/run-diagnostics-panel/shared";

type RunDiagnosticsTraceResultsSectionProps = {
  runId: string;
  trace: RunTrace | null;
  traceError?: string | null;
  activeTraceQuery: RunTraceQuery;
  traceHref: string;
};

export function RunDiagnosticsTraceResultsSection({
  runId,
  trace,
  traceError,
  activeTraceQuery,
  traceHref
}: RunDiagnosticsTraceResultsSectionProps) {
  const clearFiltersLink = buildRequiredOperatorRunDetailLinkSurface({
    runId,
    hrefLabel: "清除过滤并重试"
  });

  return (
    <section className="diagnostics-layout">
      <article className="diagnostic-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trace summary</p>
            <h2>Replay & cursor markers</h2>
          </div>
          <p className="section-copy">
            这一层展示当前 trace 窗口的匹配数量、时间边界、游标和 replay 偏移信息。
          </p>
        </div>

        {traceError ? (
          <div className="payload-card">
            <div className="payload-card-header">
              <span className="status-meta">Trace error</span>
            </div>
            <p className="run-error-message">{traceError}</p>
            <div className="hero-actions">
              <Link className="inline-link" href={clearFiltersLink.href}>
                {clearFiltersLink.label}
              </Link>
              <a className="activity-link" href={traceHref}>
                刷新当前 trace
              </a>
            </div>
          </div>
        ) : trace ? (
          <>
            <div className="summary-strip">
              <article className="summary-card">
                <span>Total events</span>
                <strong>{trace.summary.total_event_count}</strong>
              </article>
              <article className="summary-card">
                <span>Matched events</span>
                <strong>{trace.summary.matched_event_count}</strong>
              </article>
              <article className="summary-card">
                <span>Returned window</span>
                <strong>{trace.summary.returned_event_count}</strong>
              </article>
              <article className="summary-card">
                <span>Returned duration</span>
                <strong>{formatDurationMs(trace.summary.returned_duration_ms)}</strong>
              </article>
            </div>

            <div className="meta-grid">
              <article className="summary-card">
                <span>Trace start</span>
                <strong>{formatTimestamp(trace.summary.trace_started_at)}</strong>
              </article>
              <article className="summary-card">
                <span>Trace finish</span>
                <strong>{formatTimestamp(trace.summary.trace_finished_at)}</strong>
              </article>
              <article className="summary-card">
                <span>Matched start</span>
                <strong>{formatTimestamp(trace.summary.matched_started_at)}</strong>
              </article>
              <article className="summary-card">
                <span>Matched finish</span>
                <strong>{formatTimestamp(trace.summary.matched_finished_at)}</strong>
              </article>
            </div>

            <div className="summary-strip">
              <article className="summary-card">
                <span>First event id</span>
                <strong>{trace.summary.first_event_id ?? "N/A"}</strong>
              </article>
              <article className="summary-card">
                <span>Last event id</span>
                <strong>{trace.summary.last_event_id ?? "N/A"}</strong>
              </article>
              <article className="summary-card">
                <span>Has more</span>
                <strong>{trace.summary.has_more ? "yes" : "no"}</strong>
              </article>
              <article className="summary-card">
                <span>Payload keys</span>
                <strong>{trace.summary.available_payload_keys.length}</strong>
              </article>
            </div>

            <div className="trace-pagination">
              {trace.summary.prev_cursor ? (
                <Link
                  className="inline-link"
                  href={buildPageTraceHref(runId, {
                    ...activeTraceQuery,
                    cursor: trace.summary.prev_cursor
                  })}
                >
                  上一窗口
                </Link>
              ) : (
                <span className="trace-page-placeholder">没有更早窗口</span>
              )}
              {trace.summary.next_cursor ? (
                <Link
                  className="inline-link"
                  href={buildPageTraceHref(runId, {
                    ...activeTraceQuery,
                    cursor: trace.summary.next_cursor
                  })}
                >
                  下一窗口
                </Link>
              ) : (
                <span className="trace-page-placeholder">没有更多窗口</span>
              )}
            </div>

            <div className="trace-key-cloud">
              {trace.summary.available_payload_keys.length === 0 ? (
                <p className="empty-state compact">当前没有可发现的 payload keys。</p>
              ) : (
                trace.summary.available_payload_keys.slice(0, 18).map((payloadKey) => (
                  <span className="event-chip" key={payloadKey}>
                    {payloadKey}
                  </span>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="empty-state">当前无法加载 trace 摘要。</p>
        )}
      </article>

      <article className="diagnostic-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Log spine</p>
            <h2>Filtered trace events</h2>
          </div>
          <p className="section-copy">
            事件列表会带上 sequence 和 replay offset，方便你沿时间线继续回放或导出。
          </p>
        </div>

        <div className="event-list">
          {!trace ? (
            <p className="empty-state">当前无法加载 trace 事件列表。</p>
          ) : trace.events.length === 0 ? (
            <p className="empty-state">当前过滤条件下没有命中任何事件。</p>
          ) : (
            trace.events.map((event) => (
              <article className="event-row" key={event.id}>
                <div className="event-meta">
                  <span>{event.event_type}</span>
                  <span>{formatTimestamp(event.created_at)}</span>
                </div>
                <div className="event-payload-meta">
                  <span>event {event.id}</span>
                  <span>sequence {event.sequence}</span>
                  <span>replay +{formatDurationMs(event.replay_offset_ms)}</span>
                </div>
                <p className="event-run">run {event.run_id}</p>
                {event.node_run_id ? <p className="event-run">node run {event.node_run_id}</p> : null}
                <pre>{formatJsonPayload(event.payload)}</pre>
              </article>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
