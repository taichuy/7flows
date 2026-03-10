import Link from "next/link";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { RunDetail } from "@/lib/get-run-detail";
import {
  buildRunTraceExportUrl,
  buildRunTraceQueryString,
  DEFAULT_RUN_TRACE_LIMIT,
  type RunTrace,
  type RunTraceQuery
} from "@/lib/get-run-trace";
import {
  formatDuration,
  formatDurationMs,
  formatJsonPayload,
  formatTimestamp
} from "@/lib/runtime-presenters";

type RunDiagnosticsPanelProps = {
  run: RunDetail;
  trace: RunTrace | null;
  traceError?: string | null;
  traceQuery: RunTraceQuery;
};

const TRACE_LIMIT_OPTIONS = [50, 100, 200, 500];

export function RunDiagnosticsPanel({
  run,
  trace,
  traceError,
  traceQuery
}: RunDiagnosticsPanelProps) {
  const eventTypes = run.event_type_counts;
  const activeTraceQuery = trace
    ? toRunTraceQuery(trace.filters)
    : {
        ...traceQuery,
        limit: traceQuery.limit ?? DEFAULT_RUN_TRACE_LIMIT,
        order: traceQuery.order ?? "asc"
      };
  const eventTypeOptions = Array.from(
    new Set([
      ...Object.keys(eventTypes),
      ...(trace?.summary.available_event_types ?? [])
    ])
  ).sort();
  const nodeRunOptions = Array.from(
    new Set([
      ...run.node_runs.map((nodeRun) => nodeRun.id),
      ...(trace?.summary.available_node_run_ids ?? [])
    ])
  ).sort();
  const activeFilters = summarizeActiveFilters(activeTraceQuery);
  const traceHref = buildPageTraceHref(run.id, activeTraceQuery);
  const traceExportJsonHref = buildRunTraceExportUrl(
    run.id,
    activeTraceQuery,
    "json"
  );
  const traceExportJsonlHref = buildRunTraceExportUrl(
    run.id,
    activeTraceQuery,
    "jsonl"
  );
  const eventsApiHref = `${getApiBaseUrl()}/api/runs/${encodeURIComponent(run.id)}/events`;

  return (
    <main className="shell">
      <section className="hero diagnostic-hero">
        <div className="hero-copy">
          <p className="eyebrow">Run Diagnostics</p>
          <h1>{run.workflow_id}</h1>
          <p className="hero-text">
            这页现在直接消费 `run trace`，可以按事件类型、节点、时间窗和
            payload key 顺着 `run_events` 排障，同时保留导出与原始事件入口。
          </p>
          <div className="pill-row">
            <span className="pill">run {run.id}</span>
            <span className="pill">version {run.workflow_version}</span>
            <span className="pill">{run.node_runs.length} node runs</span>
            <span className="pill">{run.event_count} events</span>
          </div>
          <div className="hero-actions">
            <Link className="inline-link" href="/">
              返回系统首页
            </Link>
            <a className="inline-link" href={eventsApiHref} target="_blank" rel="noreferrer">
              打开原始 events API
            </a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">Run status</div>
          <div className="panel-value">{run.status}</div>
          <p className="panel-text">
            创建时间：<strong>{formatTimestamp(run.created_at)}</strong>
          </p>
          <p className="panel-text">
            执行耗时：<strong>{formatDuration(run.started_at, run.finished_at)}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Node runs</dt>
              <dd>{run.node_runs.length}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{run.event_count}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd>{countErroredNodes(run)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="diagnostics-layout runtime-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Envelope</p>
              <h2>Run summary</h2>
            </div>
            <p className="section-copy">
              先看这次执行的总状态、起止时间和输入输出，再往下钻到节点和 trace 级细节。
            </p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Status</span>
              <strong>{run.status}</strong>
            </article>
            <article className="summary-card">
              <span>Started</span>
              <strong>{formatTimestamp(run.started_at)}</strong>
            </article>
            <article className="summary-card">
              <span>Finished</span>
              <strong>{formatTimestamp(run.finished_at)}</strong>
            </article>
            <article className="summary-card">
              <span>Duration</span>
              <strong>{formatDuration(run.started_at, run.finished_at)}</strong>
            </article>
          </div>

          <div className="detail-grid">
            <PayloadCard title="Trigger input" payload={run.input_payload} />
            <PayloadCard
              title="Run output"
              payload={run.output_payload}
              emptyCopy="当前还没有最终输出。"
            />
          </div>

          {run.error_message ? (
            <div className="payload-card">
              <div className="payload-card-header">
                <span className="status-meta">Run error</span>
              </div>
              <pre>{run.error_message}</pre>
            </div>
          ) : null}
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Events</p>
              <h2>Run event overview</h2>
            </div>
            <p className="section-copy">
              首页只看聚合信号；到了这里，就可以继续按类型分布、时间边界和错误节点往下钻。
            </p>
          </div>

          <div className="event-type-strip">
            {Object.keys(eventTypes).length === 0 ? (
              <p className="empty-state compact">当前没有事件类型可统计。</p>
            ) : (
              Object.entries(eventTypes).map(([eventType, count]) => (
                <span className="event-chip" key={eventType}>
                  {eventType} · {count}
                </span>
              ))
            )}
          </div>

          <div className="meta-grid">
            <article className="summary-card">
              <span>First event</span>
              <strong>{formatTimestamp(run.first_event_at)}</strong>
            </article>
            <article className="summary-card">
              <span>Last event</span>
              <strong>{formatTimestamp(run.last_event_at)}</strong>
            </article>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Trace filters</span>
              <strong>{activeFilters.length || "none"}</strong>
            </article>
            <article className="summary-card">
              <span>Current limit</span>
              <strong>{activeTraceQuery.limit ?? DEFAULT_RUN_TRACE_LIMIT}</strong>
            </article>
            <article className="summary-card">
              <span>Order</span>
              <strong>{activeTraceQuery.order ?? "asc"}</strong>
            </article>
          </div>
        </article>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nodes</p>
              <h2>Node execution timeline</h2>
            </div>
            <p className="section-copy">
              每个节点都保留自己的输入、输出、状态和错误信息，方便直接定位执行链路。
            </p>
          </div>

          <div className="timeline-list">
            {run.node_runs.length === 0 ? (
              <p className="empty-state">当前 run 还没有节点执行记录。</p>
            ) : (
              run.node_runs.map((nodeRun) => (
                <article className="timeline-row" key={nodeRun.id}>
                  <div className="activity-header">
                    <div>
                      <h3>{nodeRun.node_name}</h3>
                      <p className="timeline-meta">
                        {nodeRun.node_type} · node {nodeRun.node_id}
                      </p>
                    </div>
                    <span className={`health-pill ${nodeRun.status}`}>
                      {nodeRun.status}
                    </span>
                  </div>
                  <p className="activity-copy">
                    Started {formatTimestamp(nodeRun.started_at)} · Finished{" "}
                    {formatTimestamp(nodeRun.finished_at)} · Duration{" "}
                    {formatDuration(nodeRun.started_at, nodeRun.finished_at)}
                  </p>
                  <p className="event-run">node run {nodeRun.id}</p>
                  {nodeRun.error_message ? (
                    <p className="run-error-message">{nodeRun.error_message}</p>
                  ) : null}
                  <div className="detail-grid">
                    <PayloadCard title="Input" payload={nodeRun.input_payload} />
                    <PayloadCard
                      title="Output"
                      payload={nodeRun.output_payload}
                      emptyCopy="当前没有节点输出。"
                    />
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Trace</p>
              <h2>Trace filters & export</h2>
            </div>
            <p className="section-copy">
              这里直接消费 `/trace`，用于人类排障；AI 和自动化仍应优先直连机器接口。
            </p>
          </div>

          <form className="trace-filter-form" action={`/runs/${run.id}`} method="get">
            <label className="binding-field">
              <span className="binding-label">Event type</span>
              <select
                className="binding-select"
                name="event_type"
                defaultValue={activeTraceQuery.event_type ?? ""}
              >
                <option value="">全部事件</option>
                {eventTypeOptions.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </select>
            </label>

            <label className="binding-field">
              <span className="binding-label">Node run</span>
              <select
                className="binding-select"
                name="node_run_id"
                defaultValue={activeTraceQuery.node_run_id ?? ""}
              >
                <option value="">全部节点</option>
                {nodeRunOptions.map((nodeRunId) => (
                  <option key={nodeRunId} value={nodeRunId}>
                    {nodeRunId}
                  </option>
                ))}
              </select>
            </label>

            <label className="binding-field trace-field-span">
              <span className="binding-label">Payload key contains</span>
              <input
                className="trace-text-input"
                name="payload_key"
                type="text"
                defaultValue={activeTraceQuery.payload_key ?? ""}
                placeholder="artifactType / results.tool_name / error"
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Created after (UTC ISO)</span>
              <input
                className="trace-text-input"
                name="created_after"
                type="text"
                defaultValue={activeTraceQuery.created_after ?? ""}
                placeholder="2026-03-10T08:00:00Z"
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Created before (UTC ISO)</span>
              <input
                className="trace-text-input"
                name="created_before"
                type="text"
                defaultValue={activeTraceQuery.created_before ?? ""}
                placeholder="2026-03-10T09:00:00Z"
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Order</span>
              <select
                className="binding-select"
                name="order"
                defaultValue={activeTraceQuery.order ?? "asc"}
              >
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </select>
            </label>

            <label className="binding-field">
              <span className="binding-label">Limit</span>
              <select
                className="binding-select"
                name="limit"
                defaultValue={String(activeTraceQuery.limit ?? DEFAULT_RUN_TRACE_LIMIT)}
              >
                {TRACE_LIMIT_OPTIONS.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>

            <div className="trace-filter-actions trace-field-span">
              <button className="sync-button" type="submit">
                应用过滤
              </button>
              <Link className="inline-link" href={`/runs/${run.id}`}>
                重置过滤
              </Link>
              <a
                className="activity-link"
                href={traceExportJsonHref}
                target="_blank"
                rel="noreferrer"
              >
                导出 trace JSON
              </a>
              <a
                className="activity-link"
                href={traceExportJsonlHref}
                target="_blank"
                rel="noreferrer"
              >
                导出 trace JSONL
              </a>
            </div>
          </form>

          <div className="trace-filter-hints">
            <span className="event-chip">默认 limit {DEFAULT_RUN_TRACE_LIMIT}</span>
            <span className="event-chip">时间窗输入按 UTC ISO 传给 API</span>
            <span className="event-chip">翻页通过 opaque cursor 保持当前过滤条件</span>
          </div>

          <div className="trace-active-filter-row">
            {activeFilters.length === 0 ? (
              <p className="empty-state compact">当前是默认 trace 视图，没有额外过滤条件。</p>
            ) : (
              activeFilters.map((filter) => (
                <span className="event-chip" key={filter}>
                  {filter}
                </span>
              ))
            )}
          </div>
        </article>
      </section>

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
                <Link className="inline-link" href={`/runs/${run.id}`}>
                  清除过滤并重试
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
                    href={buildPageTraceHref(run.id, {
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
                    href={buildPageTraceHref(run.id, {
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
                  trace.summary.available_payload_keys
                    .slice(0, 18)
                    .map((payloadKey) => (
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
                  {event.node_run_id ? (
                    <p className="event-run">node run {event.node_run_id}</p>
                  ) : null}
                  <pre>{formatJsonPayload(event.payload)}</pre>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function PayloadCard({
  title,
  payload,
  emptyCopy = "当前没有可展示的数据。"
}: {
  title: string;
  payload: unknown;
  emptyCopy?: string;
}) {
  const isEmptyObject =
    payload !== null &&
    typeof payload === "object" &&
    Object.keys(payload as Record<string, unknown>).length === 0;

  return (
    <div className="payload-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {payload == null || isEmptyObject ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <pre>{formatJsonPayload(payload)}</pre>
      )}
    </div>
  );
}

function countErroredNodes(run: RunDetail) {
  return run.node_runs.filter(
    (nodeRun) => nodeRun.status === "failed" || Boolean(nodeRun.error_message)
  ).length;
}

function toRunTraceQuery(filters: RunTrace["filters"]): RunTraceQuery {
  return {
    cursor: filters.cursor ?? undefined,
    event_type: filters.event_type ?? undefined,
    node_run_id: filters.node_run_id ?? undefined,
    created_after: filters.created_after ?? undefined,
    created_before: filters.created_before ?? undefined,
    payload_key: filters.payload_key ?? undefined,
    limit: filters.limit ?? DEFAULT_RUN_TRACE_LIMIT,
    order: filters.order ?? "asc"
  };
}

function summarizeActiveFilters(query: RunTraceQuery) {
  const filters: string[] = [];

  if (query.event_type) {
    filters.push(`event_type=${query.event_type}`);
  }
  if (query.node_run_id) {
    filters.push(`node_run_id=${query.node_run_id}`);
  }
  if (query.payload_key) {
    filters.push(`payload_key~${query.payload_key}`);
  }
  if (query.created_after) {
    filters.push(`after=${query.created_after}`);
  }
  if (query.created_before) {
    filters.push(`before=${query.created_before}`);
  }
  if ((query.order ?? "asc") !== "asc") {
    filters.push(`order=${query.order}`);
  }
  if ((query.limit ?? DEFAULT_RUN_TRACE_LIMIT) !== DEFAULT_RUN_TRACE_LIMIT) {
    filters.push(`limit=${query.limit}`);
  }

  return filters;
}

function buildPageTraceHref(runId: string, query: RunTraceQuery) {
  const queryString = buildRunTraceQueryString(query);
  return `/runs/${encodeURIComponent(runId)}${queryString ? `?${queryString}` : ""}`;
}
