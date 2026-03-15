import Link from "next/link";

import { RunTraceExportActions } from "@/components/run-trace-export-actions";
import { DEFAULT_RUN_TRACE_LIMIT, type RunTraceQuery } from "@/lib/get-run-trace";

import { TRACE_LIMIT_OPTIONS } from "@/components/run-diagnostics-panel/shared";

type RunDiagnosticsTraceFiltersSectionProps = {
  runId: string;
  activeTraceQuery: RunTraceQuery;
  eventTypeOptions: string[];
  nodeRunOptions: string[];
  activeFilters: string[];
};

export function RunDiagnosticsTraceFiltersSection({
  runId,
  activeTraceQuery,
  eventTypeOptions,
  nodeRunOptions,
  activeFilters
}: RunDiagnosticsTraceFiltersSectionProps) {
  return (
    <section className="diagnostics-layout">
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

        <form className="trace-filter-form" action={`/runs/${runId}`} method="get">
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
            <select className="binding-select" name="order" defaultValue={activeTraceQuery.order}>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </label>

          <label className="binding-field">
            <span className="binding-label">Limit</span>
            <select
              className="binding-select"
              name="limit"
              defaultValue={String(activeTraceQuery.limit)}
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
            <Link className="inline-link" href={`/runs/${runId}`}>
              重置过滤
            </Link>
            <RunTraceExportActions
              blockedSummary="当前 diagnostics trace export 已接入统一敏感访问控制；可先查看审批票据和关联 run，再决定是否继续申请导出。"
              query={activeTraceQuery}
              requesterId="run-diagnostics-trace-export"
              runId={runId}
            />
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
  );
}
