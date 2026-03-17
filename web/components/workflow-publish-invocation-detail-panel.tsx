import Link from "next/link";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationInboxHref
} from "@/lib/published-invocation-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishInvocationDetailPanelProps = {
  detail: PublishedEndpointInvocationDetailResponse;
  clearHref: string;
  tools: PluginToolRegistryItem[];
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function WorkflowPublishInvocationDetailPanel({
  detail,
  clearHref,
  tools
}: WorkflowPublishInvocationDetailPanelProps) {
  const {
    invocation,
    run,
    callback_tickets: callbackTickets,
    blocking_node_run_id: blockingNodeRunId,
    blocking_sensitive_access_entries: blockingSensitiveAccessEntries,
    sensitive_access_entries: sensitiveAccessEntries,
    cache
  } = detail;
  const waitingLifecycle = invocation.run_waiting_lifecycle;
  const runId = run?.id ?? invocation.run_id ?? null;
  const blockingInboxHref = buildBlockingPublishedInvocationInboxHref({
    runId,
    blockingNodeRunId,
    blockingSensitiveAccessEntries
  });
  const approvalInboxHref = buildPublishedInvocationInboxHref({
    invocation,
    callbackTickets,
    sensitiveAccessEntries
  });
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  const involvedToolIds = Array.from(
    new Set(callbackTickets.map((ticket) => ticket.tool_id).filter((toolId): toolId is string => Boolean(toolId)))
  );
  const involvedTools = involvedToolIds
    .map((toolId) => toolsById.get(toolId) ?? null)
    .filter((tool): tool is PluginToolRegistryItem => tool !== null);
  const unresolvedToolIds = involvedToolIds.filter((toolId) => !toolsById.has(toolId));

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

      <WorkflowPublishInvocationCallbackSection
        invocation={invocation}
        callbackTickets={callbackTickets}
        sensitiveAccessEntries={sensitiveAccessEntries}
      />

      {involvedTools.length > 0 || unresolvedToolIds.length > 0 ? (
        <div>
          <strong>Tool governance context</strong>
          <p className="section-copy entry-copy">
            把 callback waiting 关联 tool 的默认执行边界和敏感级别一起带到 publish detail，避免 operator 只看到阻断结果却看不见治理原因。
          </p>
          {unresolvedToolIds.length ? (
            <div className="tool-badge-row">
              {unresolvedToolIds.map((toolId) => (
                <span className="event-chip" key={`missing-tool-${toolId}`}>
                  missing catalog entry {toolId}
                </span>
              ))}
            </div>
          ) : null}
          {involvedTools.length ? (
            <div className="publish-cache-list">
              {involvedTools.map((tool) => (
                <ToolGovernanceSummary
                  key={`tool-governance-${tool.id}`}
                  tool={tool}
                  title="Execution and sensitivity"
                  subtitle={tool.name}
                  trailingChip={tool.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {blockingSensitiveAccessEntries.length > 0 &&
      blockingSensitiveAccessEntries.length < sensitiveAccessEntries.length ? (
        <div>
          <strong>Blocking approval timeline</strong>
          <p className="section-copy entry-copy">
            Focus the approval history for the waiting node run first so operator triage can stay
            on the blocker instead of scanning the entire run timeline.
            {blockingNodeRunId ? ` Current blocking node run: ${blockingNodeRunId}.` : ""}
          </p>
          {blockingInboxHref ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={blockingInboxHref}>
                open blocker inbox slice
              </Link>
            </div>
          ) : null}
          <SensitiveAccessTimelineEntryList
            defaultRunId={runId}
            entries={blockingSensitiveAccessEntries}
            emptyCopy="当前阻塞节点没有关联 sensitive access timeline。"
          />
        </div>
      ) : null}

      <div>
        <strong>Approval timeline</strong>
        <p className="section-copy entry-copy">
          Sensitive access decisions, approval tickets and notification delivery are grouped here
          so published-surface debugging no longer has to jump back to the inbox.
        </p>
        {approvalInboxHref ? (
          <div className="tool-badge-row">
            <Link className="event-chip inbox-filter-link" href={approvalInboxHref}>
              open approval inbox slice
            </Link>
          </div>
        ) : null}
        <SensitiveAccessTimelineEntryList
          defaultRunId={runId}
          entries={sensitiveAccessEntries}
          emptyCopy="当前这次 invocation 没有关联 sensitive access timeline。"
        />
      </div>
    </article>
  );
}
