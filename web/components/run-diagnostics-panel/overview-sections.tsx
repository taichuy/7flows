import { formatDuration, formatTimestamp } from "@/lib/runtime-presenters";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunTraceQuery } from "@/lib/get-run-trace";

import { RunDetailExecutionFocusCard } from "@/components/run-detail-execution-focus-card";
import { PayloadCard, countErroredNodes } from "@/components/run-diagnostics-panel/shared";
import { buildExecutionFocusSurfaceDescription } from "@/lib/run-execution-focus-presenters";

type RunDiagnosticsOverviewSectionsProps = {
  run: RunDetail;
  eventTypes: Record<string, number>;
  activeFilters: string[];
  activeTraceQuery: RunTraceQuery;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function RunDiagnosticsOverviewSections({
  run,
  eventTypes,
  activeFilters,
  activeTraceQuery,
  callbackWaitingAutomation = null,
  sandboxReadiness = null
}: RunDiagnosticsOverviewSectionsProps) {
  return (
    <>
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

          <RunDetailExecutionFocusCard
            run={run}
            description={buildExecutionFocusSurfaceDescription("diagnostics")}
            callbackWaitingAutomation={callbackWaitingAutomation}
            sandboxReadiness={sandboxReadiness}
          />
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
              <strong>{activeTraceQuery.limit}</strong>
            </article>
            <article className="summary-card">
              <span>Order</span>
              <strong>{activeTraceQuery.order}</strong>
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
                    <span className={`health-pill ${nodeRun.status}`}>{nodeRun.status}</span>
                  </div>
                  <p className="activity-copy">
                    Started {formatTimestamp(nodeRun.started_at)} · Finished {" "}
                    {formatTimestamp(nodeRun.finished_at)} · Duration {" "}
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
      </section>
    </>
  );
}

export { countErroredNodes };
