import type {
  RunArtifactItem,
  RunEvidenceNodeItem,
  RunEvidenceView,
  RunExecutionNodeItem,
  RunExecutionView
} from "@/lib/get-run-views";
import {
  formatDuration,
  formatDurationMs,
  formatJsonPayload,
  formatTimestamp
} from "@/lib/runtime-presenters";

type RunDiagnosticsExecutionSectionsProps = {
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
};

export function RunDiagnosticsExecutionSections({
  executionView,
  evidenceView
}: RunDiagnosticsExecutionSectionsProps) {
  return (
    <>
      <section className="diagnostics-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Execution View</p>
              <h2>Runtime facts by node</h2>
            </div>
            <p className="section-copy">
              这层直接消费 `run_artifacts / tool_call_records / ai_call_records / callback tickets`
              的聚合视图，用来回答“这次执行到底沉淀了哪些事实”。
            </p>
          </div>

          {!executionView ? (
            <p className="empty-state">当前 execution view 不可用。</p>
          ) : (
            <>
              <div className="summary-strip">
                <article className="summary-card">
                  <span>Node runs</span>
                  <strong>{executionView.summary.node_run_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Artifacts</span>
                  <strong>{executionView.summary.artifact_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Tool calls</span>
                  <strong>{executionView.summary.tool_call_count}</strong>
                </article>
                <article className="summary-card">
                  <span>AI calls</span>
                  <strong>{executionView.summary.ai_call_count}</strong>
                </article>
              </div>

              <div className="summary-strip">
                <article className="summary-card">
                  <span>Waiting nodes</span>
                  <strong>{executionView.summary.waiting_node_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Errored nodes</span>
                  <strong>{executionView.summary.errored_node_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Assistant calls</span>
                  <strong>{executionView.summary.assistant_call_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Callback tickets</span>
                  <strong>{executionView.summary.callback_ticket_count}</strong>
                </article>
              </div>

              <MetricChipRow
                emptyCopy="当前没有 callback ticket 状态。"
                metrics={executionView.summary.callback_ticket_status_counts}
                prefix="ticket"
              />
            </>
          )}
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Evidence View</p>
              <h2>Assistant distilled context</h2>
            </div>
            <p className="section-copy">
              这一层只保留 evidence 节点，不把原始大结果重新铺满整个页面，继续保持“摘要优先、原文可追溯”。
            </p>
          </div>

          {!evidenceView ? (
            <p className="empty-state">当前 evidence view 不可用。</p>
          ) : evidenceView.nodes.length === 0 ? (
            <p className="empty-state">
              当前 run 还没有 evidence 节点，说明本次执行没有 assistant 蒸馏结果或证据上下文。
            </p>
          ) : (
            <>
              <div className="summary-strip">
                <article className="summary-card">
                  <span>Evidence nodes</span>
                  <strong>{evidenceView.summary.node_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Supporting artifacts</span>
                  <strong>{evidenceView.summary.artifact_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Tool calls</span>
                  <strong>{evidenceView.summary.tool_call_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Assistant calls</span>
                  <strong>{evidenceView.summary.assistant_call_count}</strong>
                </article>
              </div>

              <div className="event-type-strip">
                {evidenceView.nodes.map((node) => (
                  <span className="event-chip" key={node.node_run_id}>
                    {node.node_name} · {node.status}
                  </span>
                ))}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Execution Timeline</p>
              <h2>Artifacts, tool calls and callback lifecycle</h2>
            </div>
            <p className="section-copy">
              这里按节点展开调用轨迹，避免继续从全量 `RunDetail` 里手动拼装运行事实。
            </p>
          </div>

          {!executionView ? (
            <p className="empty-state">当前 execution view 不可用。</p>
          ) : executionView.nodes.length === 0 ? (
            <p className="empty-state">当前没有可展示的 execution 节点。</p>
          ) : (
            <div className="timeline-list">
              {executionView.nodes.map((node) => (
                <ExecutionNodeCard key={node.node_run_id} node={node} />
              ))}
            </div>
          )}
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Evidence Nodes</p>
              <h2>Decision basis and supporting refs</h2>
            </div>
            <p className="section-copy">
              这里展示 `summary / key points / conflicts / unknowns / supporting artifacts`，
              方便后续继续推进 execution view 和 evidence view 的 UI 复用。
            </p>
          </div>

          {!evidenceView ? (
            <p className="empty-state">当前 evidence view 不可用。</p>
          ) : evidenceView.nodes.length === 0 ? (
            <p className="empty-state">当前没有 evidence 节点可展示。</p>
          ) : (
            <div className="timeline-list">
              {evidenceView.nodes.map((node) => (
                <EvidenceNodeCard key={node.node_run_id} node={node} />
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}

function ExecutionNodeCard({ node }: { node: RunExecutionNodeItem }) {
  return (
    <article className="timeline-row">
      <div className="activity-header">
        <div>
          <h3>{node.node_name}</h3>
          <p className="timeline-meta">
            {node.node_type} · node {node.node_id}
          </p>
        </div>
        <span className={`health-pill ${node.status}`}>{node.status}</span>
      </div>

      <p className="activity-copy">
        Phase {node.phase ?? "n/a"} · Started {formatTimestamp(node.started_at)} · Finished{" "}
        {formatTimestamp(node.finished_at)} · Duration{" "}
        {formatDuration(node.started_at, node.finished_at)}
      </p>
      <p className="event-run">node run {node.node_run_id}</p>

      {node.waiting_reason ? <p className="run-error-message">{node.waiting_reason}</p> : null}
      {node.error_message ? <p className="run-error-message">{node.error_message}</p> : null}

      <div className="event-type-strip">
        <span className="event-chip">exec {node.execution_class}</span>
        <span className="event-chip">source {node.execution_source}</span>
        {node.execution_profile ? (
          <span className="event-chip">profile {node.execution_profile}</span>
        ) : null}
        {typeof node.execution_timeout_ms === "number" ? (
          <span className="event-chip">timeout {formatDurationMs(node.execution_timeout_ms)}</span>
        ) : null}
        {node.execution_network_policy ? (
          <span className="event-chip">network {node.execution_network_policy}</span>
        ) : null}
        {node.execution_filesystem_policy ? (
          <span className="event-chip">fs {node.execution_filesystem_policy}</span>
        ) : null}
      </div>

      <div className="event-type-strip">
        <span className="event-chip">events {node.event_count}</span>
        <span className="event-chip">artifacts {node.artifacts.length}</span>
        <span className="event-chip">tools {node.tool_calls.length}</span>
        <span className="event-chip">ai {node.ai_calls.length}</span>
        {node.callback_tickets.length > 0 ? (
          <span className="event-chip">tickets {node.callback_tickets.length}</span>
        ) : null}
        {node.last_event_type ? (
          <span className="event-chip">last {node.last_event_type}</span>
        ) : null}
      </div>

      {node.callback_waiting_lifecycle ? (
        <div className="event-type-strip">
          <span className="event-chip">
            wait cycles {node.callback_waiting_lifecycle.wait_cycle_count}
          </span>
          <span className="event-chip">
            expired {node.callback_waiting_lifecycle.expired_ticket_count}
          </span>
          {node.callback_waiting_lifecycle.late_callback_count > 0 ? (
            <span className="event-chip">
              late callbacks {node.callback_waiting_lifecycle.late_callback_count}
            </span>
          ) : null}
          {typeof node.callback_waiting_lifecycle.last_resume_delay_seconds === "number" ? (
            <span className="event-chip">
              resume {node.callback_waiting_lifecycle.last_resume_delay_seconds}s
            </span>
          ) : null}
          {node.callback_waiting_lifecycle.last_resume_backoff_attempt > 0 ? (
            <span className="event-chip">
              backoff #{node.callback_waiting_lifecycle.last_resume_backoff_attempt}
            </span>
          ) : null}
        </div>
      ) : null}

      <MetricChipRow
        emptyCopy="当前没有节点事件类型分布。"
        metrics={node.event_type_counts}
        prefix="event"
      />

      {node.tool_calls.length > 0 ? (
        <div className="event-list">
          {node.tool_calls.map((toolCall) => (
            <article className="event-row compact-card" key={toolCall.id}>
              <div className="event-meta">
                <span>{toolCall.tool_name}</span>
                <span>{toolCall.status}</span>
              </div>
              <p className="event-run">
                {toolCall.phase} · {formatDurationMs(toolCall.latency_ms)} · tool{" "}
                {toolCall.tool_id}
              </p>
              <pre>{formatJsonPayload({
                request_summary: toolCall.request_summary,
                response_summary: toolCall.response_summary,
                raw_ref: toolCall.raw_ref
              })}</pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.ai_calls.length > 0 ? (
        <div className="event-list">
          {node.ai_calls.map((aiCall) => (
            <article className="event-row compact-card" key={aiCall.id}>
              <div className="event-meta">
                <span>{aiCall.role}</span>
                <span>{aiCall.status}</span>
              </div>
              <p className="event-run">
                {aiCall.provider ?? "provider?"} · {aiCall.model_id ?? "model?"} ·{" "}
                {formatDurationMs(aiCall.latency_ms)}
              </p>
              <pre>{formatJsonPayload({
                input_summary: aiCall.input_summary,
                output_summary: aiCall.output_summary,
                assistant: aiCall.assistant,
                token_usage: aiCall.token_usage
              })}</pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.callback_tickets.length > 0 ? (
        <div className="event-list">
          {node.callback_tickets.map((ticket) => (
            <article className="event-row compact-card" key={ticket.ticket}>
              <div className="event-meta">
                <span>{ticket.status}</span>
                <span>{ticket.waiting_status}</span>
              </div>
              <p className="event-run">
                ticket {ticket.ticket} · tool {ticket.tool_id ?? "n/a"}
              </p>
              <pre>{formatJsonPayload({
                reason: ticket.reason,
                callback_payload: ticket.callback_payload
              })}</pre>
            </article>
          ))}
        </div>
      ) : null}

      <ArtifactPreviewList artifacts={node.artifacts} />
    </article>
  );
}

function EvidenceNodeCard({ node }: { node: RunEvidenceNodeItem }) {
  return (
    <article className="timeline-row">
      <div className="activity-header">
        <div>
          <h3>{node.node_name}</h3>
          <p className="timeline-meta">
            {node.node_type} · node {node.node_id}
          </p>
        </div>
        <span className={`health-pill ${node.status}`}>{node.status}</span>
      </div>

      <p className="activity-copy">
        Phase {node.phase ?? "n/a"} · Confidence {node.confidence ?? "n/a"} · node run{" "}
        {node.node_run_id}
      </p>

      <div className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">Evidence summary</span>
        </div>
        {node.summary ? (
          <p>{node.summary}</p>
        ) : (
          <p className="empty-state compact">当前 evidence 节点还没有 summary。</p>
        )}
      </div>

      <StringListRow emptyCopy="当前没有 key points。" items={node.key_points} title="Key points" />
      <StringListRow emptyCopy="当前没有 conflicts。" items={node.conflicts} title="Conflicts" />
      <StringListRow emptyCopy="当前没有 unknowns。" items={node.unknowns} title="Unknowns" />
      <StringListRow
        emptyCopy="当前没有 recommended focus。"
        items={node.recommended_focus}
        title="Recommended focus"
      />

      {node.evidence.length > 0 ? (
        <div className="event-list">
          {node.evidence.map((item, index) => (
            <article className="event-row compact-card" key={`${node.node_run_id}-${index}`}>
              <div className="event-meta">
                <span>{item.title || "evidence"}</span>
                <span>{item.source_ref ?? "no source ref"}</span>
              </div>
              <pre>{formatJsonPayload(item)}</pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.assistant_calls.length > 0 ? (
        <div className="event-list">
          {node.assistant_calls.map((aiCall) => (
            <article className="event-row compact-card" key={aiCall.id}>
              <div className="event-meta">
                <span>{aiCall.role}</span>
                <span>{formatDurationMs(aiCall.latency_ms)}</span>
              </div>
              <pre>{formatJsonPayload({
                provider: aiCall.provider,
                model_id: aiCall.model_id,
                output_summary: aiCall.output_summary
              })}</pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.tool_calls.length > 0 ? (
        <div className="event-list">
          {node.tool_calls.map((toolCall) => (
            <article className="event-row compact-card" key={toolCall.id}>
              <div className="event-meta">
                <span>{toolCall.tool_name}</span>
                <span>{toolCall.status}</span>
              </div>
              <pre>{formatJsonPayload({
                response_summary: toolCall.response_summary,
                raw_ref: toolCall.raw_ref
              })}</pre>
            </article>
          ))}
        </div>
      ) : null}

      <PayloadPreview
        emptyCopy="当前没有 final decision payload。"
        title="Decision output"
        value={node.decision_output}
      />
      <ArtifactPreviewList artifacts={node.supporting_artifacts} />
    </article>
  );
}

function MetricChipRow({
  title,
  metrics,
  prefix,
  emptyCopy
}: {
  title?: string;
  metrics: Record<string, number>;
  prefix: string;
  emptyCopy: string;
}) {
  const entries = Object.entries(metrics);

  return (
    <div className="trace-active-filter-row">
      {title ? <span className="status-meta">{title}</span> : null}
      {entries.length === 0 ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        entries.map(([key, value]) => (
          <span className="event-chip" key={`${prefix}-${key}`}>
            {key} · {value}
          </span>
        ))
      )}
    </div>
  );
}

function StringListRow({
  title,
  items,
  emptyCopy
}: {
  title: string;
  items: string[];
  emptyCopy: string;
}) {
  return (
    <div className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <div className="event-type-strip">
          {items.map((item) => (
            <span className="event-chip" key={`${title}-${item}`}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactPreviewList({ artifacts }: { artifacts: RunArtifactItem[] }) {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div className="event-list">
      {artifacts.map((artifact) => (
        <article className="event-row compact-card" key={artifact.id}>
          <div className="event-meta">
            <span>{artifact.artifact_kind}</span>
            <span>{artifact.content_type}</span>
          </div>
          <p className="event-run">
            {artifact.uri} · {formatTimestamp(artifact.created_at)}
          </p>
          <pre>{formatJsonPayload({
            summary: artifact.summary,
            metadata_payload: artifact.metadata_payload
          })}</pre>
        </article>
      ))}
    </div>
  );
}

function PayloadPreview({
  title,
  value,
  emptyCopy
}: {
  title: string;
  value: unknown;
  emptyCopy: string;
}) {
  const isEmptyObject =
    value !== null &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length === 0;

  return (
    <div className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {value == null || isEmptyObject ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <pre>{formatJsonPayload(value)}</pre>
      )}
    </div>
  );
}
