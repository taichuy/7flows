import Link from "next/link";

import { ExecutionNodeCard } from "@/components/run-diagnostics-execution/execution-node-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationInboxHref,
  listPublishedInvocationRunFollowUpSampleViews
} from "@/lib/published-invocation-presenters";
import {
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  formatExecutionFocusReasonLabel,
  formatMetricSummary
} from "@/lib/run-execution-focus-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishInvocationDetailPanelProps = {
  detail: PublishedEndpointInvocationDetailResponse;
  clearHref: string;
  tools: PluginToolRegistryItem[];
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}
export function WorkflowPublishInvocationDetailPanel({
  detail,
  clearHref,
  tools,
  callbackWaitingAutomation
}: WorkflowPublishInvocationDetailPanelProps) {
  const {
    invocation,
    run,
    run_follow_up: runFollowUp,
    callback_tickets: callbackTickets,
    blocking_node_run_id: blockingNodeRunId,
    execution_focus_reason: executionFocusReason,
    execution_focus_node: executionFocusNode,
    callback_waiting_explanation: callbackWaitingExplanation,
    skill_trace: skillTrace,
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
  const executionFocusPrimarySignal =
    detail.execution_focus_explanation?.primary_signal ??
    (executionFocusNode ? formatExecutionFocusPrimarySignal(executionFocusNode) : null);
  const executionFocusFollowUp =
    detail.execution_focus_explanation?.follow_up ??
    (executionFocusNode ? formatExecutionFocusFollowUp(executionFocusNode) : null);
  const runFollowUpPrimarySignal = runFollowUp?.explanation?.primary_signal?.trim() || null;
  const runFollowUpFollowUp = runFollowUp?.explanation?.follow_up?.trim() || null;
  const runFollowUpStatusSummary = runFollowUp
    ? formatMetricSummary({
        waiting: runFollowUp.waiting_run_count,
        running: runFollowUp.running_run_count,
        succeeded: runFollowUp.succeeded_run_count,
        failed: runFollowUp.failed_run_count,
        unknown: runFollowUp.unknown_run_count
      })
    : null;
  const runFollowUpSamples = listPublishedInvocationRunFollowUpSampleViews(runFollowUp);

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

      {runFollowUp ? (
        <div>
          <strong>Canonical follow-up</strong>
          <p className="section-copy entry-copy">
            publish invocation detail 现在直接复用 operator follow-up 的后端事实链，不再只给局部 waiting / execution 片段，方便从发布入口直接判断下一步该回看 run 还是 inbox。
          </p>
          <div className="tool-badge-row">
            <span className="event-chip">affected {runFollowUp.affected_run_count}</span>
            <span className="event-chip">sampled {runFollowUp.sampled_run_count}</span>
            {runFollowUpStatusSummary ? (
              <span className="event-chip">status {runFollowUpStatusSummary}</span>
            ) : null}
          </div>
          {runFollowUpPrimarySignal ? (
            <p className="section-copy entry-copy">{runFollowUpPrimarySignal}</p>
          ) : null}
          {runFollowUpFollowUp ? (
            <p className="binding-meta">{runFollowUpFollowUp}</p>
          ) : null}
          {runFollowUpSamples.length ? (
            <div className="publish-meta-grid">
              {runFollowUpSamples.map((sample) => {
                const samplePrimarySignal = sample.explanation?.primary_signal?.trim() || null;
                const sampleFollowUp = sample.explanation?.follow_up?.trim() || null;
                const sampleReasonLabel =
                  sample.explanation_source === "callback_waiting"
                    ? "callback waiting"
                    : sample.explanation_source === "execution_focus"
                      ? "execution focus"
                      : "run snapshot";

                return (
                  <div className="payload-card compact-card" key={sample.run_id}>
                    <div className="payload-card-header">
                      <Link className="inline-link" href={`/runs/${encodeURIComponent(sample.run_id)}`}>
                        {sample.run_id}
                      </Link>
                      <span className="status-meta">{sampleReasonLabel}</span>
                    </div>
                    <p className="section-copy entry-copy">
                      {samplePrimarySignal ?? "该 sampled run 已回接 canonical follow-up 快照。"}
                    </p>
                    {sampleFollowUp ? <p className="binding-meta">{sampleFollowUp}</p> : null}
                    <dl className="compact-meta-list">
                      <div>
                        <dt>Status</dt>
                        <dd>{sample.status ?? "n/a"}</dd>
                      </div>
                      <div>
                        <dt>Current node</dt>
                        <dd>{sample.current_node_id ?? "n/a"}</dd>
                      </div>
                      <div>
                        <dt>Waiting reason</dt>
                        <dd>{sample.waiting_reason ?? "n/a"}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {runId && executionFocusNode ? (
        <div>
          <strong>Execution focus</strong>
          <p className="section-copy entry-copy">
            当前 publish invocation detail 直接复用 run diagnostics 的 execution 事实，优先聚焦当前最相关的 node run。
          </p>
          {executionFocusPrimarySignal ? (
            <p className="section-copy entry-copy">{executionFocusPrimarySignal}</p>
          ) : null}
          {executionFocusFollowUp ? (
            <p className="binding-meta">{executionFocusFollowUp}</p>
          ) : null}
          <div className="tool-badge-row">
            <span className="event-chip">
              {formatExecutionFocusReasonLabel(executionFocusReason)}
            </span>
            <span className="event-chip">node run {executionFocusNode.node_run_id}</span>
          </div>
          <ExecutionNodeCard
            node={executionFocusNode}
            runId={runId}
            callbackWaitingAutomation={callbackWaitingAutomation}
          />
        </div>
      ) : null}

      <WorkflowPublishInvocationCallbackSection
        invocation={invocation}
        callbackTickets={callbackTickets}
        sensitiveAccessEntries={sensitiveAccessEntries}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={callbackWaitingExplanation}
      />

      {skillTrace ? (
        <div>
          <strong>Skill trace</strong>
          <p className="section-copy entry-copy">
            把 publish invocation 背后的 skill reference load 直接带到当前详情页，避免外部调用排障还要跳回 run detail 才能看见 agent 真正注入了哪些参考资料。
            {skillTrace.scope === "execution_focus_node" && skillTrace.nodes[0]?.node_run_id
              ? ` 当前优先聚焦 execution focus 节点 ${skillTrace.nodes[0].node_run_id}。`
              : " 当前展示整个 run 的 skill 注入摘要。"}
          </p>
          <div className="tool-badge-row">
            <span className="event-chip">refs {skillTrace.reference_count}</span>
            {formatMetricSummary(skillTrace.phase_counts) ? (
              <span className="event-chip">phases {formatMetricSummary(skillTrace.phase_counts)}</span>
            ) : null}
            {formatMetricSummary(skillTrace.source_counts) ? (
              <span className="event-chip">sources {formatMetricSummary(skillTrace.source_counts)}</span>
            ) : null}
          </div>
          <div className="publish-cache-list">
            {skillTrace.nodes.map((node) => (
              <div className="payload-card compact-card" key={node.node_run_id}>
                <div className="payload-card-header">
                  <span className="status-meta">{node.node_name ?? node.node_id ?? node.node_run_id}</span>
                  <span className="event-chip">refs {node.reference_count}</span>
                </div>
                <p className="section-copy entry-copy">
                  node run {node.node_run_id}
                  {node.node_id ? ` · node ${node.node_id}` : ""}
                </p>
                <SkillReferenceLoadList
                  skillReferenceLoads={node.loads}
                  title="Injected references"
                  description="当前节点真正加载到 agent phase 的 skill references。发布入口和 run detail 现在共享同一条 trace 事实。"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
