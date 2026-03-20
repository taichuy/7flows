import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { ExecutionNodeCard } from "@/components/run-diagnostics-execution/execution-node-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import { buildExecutionFocusExplainableNode } from "@/lib/operator-inline-action-feedback";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationInboxHref,
  listPublishedInvocationRunFollowUpSampleViews,
  normalizePublishedInvocationRunSnapshot
} from "@/lib/published-invocation-presenters";
import {
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  formatExecutionFocusReasonLabel,
  formatMetricSummary,
  listExecutionFocusRuntimeFactBadges
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
  const runSnapshot = normalizePublishedInvocationRunSnapshot(
    detail.run_snapshot ?? invocation.run_snapshot ?? null
  );
  const runId = run?.id ?? invocation.run_id ?? null;
  const runStatus = runSnapshot?.status ?? run?.status ?? invocation.run_status ?? null;
  const currentNodeId =
    runSnapshot?.currentNodeId ?? run?.current_node_id ?? invocation.run_current_node_id ?? null;
  const waitingReason = runSnapshot?.waitingReason ?? invocation.run_waiting_reason ?? null;
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
              <dd>{runStatus ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Current node</dt>
              <dd>{currentNodeId ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Waiting reason</dt>
              <dd>{waitingReason ?? "n/a"}</dd>
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
                const sampleFocusNodeEvidence = buildExecutionFocusExplainableNode(
                  sample.run_snapshot
                );
                const sampleExecutionFactBadges = listExecutionFocusRuntimeFactBadges(
                  sampleFocusNodeEvidence
                );
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
                    {samplePrimarySignal && !sample.has_callback_waiting_summary ? (
                      <p className="section-copy entry-copy">{samplePrimarySignal}</p>
                    ) : null}
                    {sampleFollowUp && !sample.has_callback_waiting_summary ? (
                      <p className="binding-meta">{sampleFollowUp}</p>
                    ) : null}
                    {!samplePrimarySignal && !sample.has_callback_waiting_summary ? (
                      <p className="section-copy entry-copy">
                        该 sampled run 已回接 canonical follow-up 快照。
                      </p>
                    ) : null}
                    {sample.snapshot_summary ? (
                      <p className="binding-meta">{sample.snapshot_summary}</p>
                    ) : null}
                    {sample.execution_focus_artifact_count > 0 ||
                    sample.execution_focus_artifact_ref_count > 0 ||
                    sample.execution_focus_tool_call_count > 0 ||
                    sample.execution_focus_raw_ref_count > 0 ||
                    sample.skill_reference_count > 0 ||
                    sampleExecutionFactBadges.length > 0 ? (
                      <div className="tool-badge-row">
                        {sample.execution_focus_artifact_count > 0 ? (
                          <span className="event-chip">
                            artifacts {sample.execution_focus_artifact_count}
                          </span>
                        ) : null}
                        {sample.execution_focus_artifact_ref_count > 0 ? (
                          <span className="event-chip">
                            artifact refs {sample.execution_focus_artifact_ref_count}
                          </span>
                        ) : null}
                        {sample.execution_focus_tool_call_count > 0 ? (
                          <span className="event-chip">
                            tool calls {sample.execution_focus_tool_call_count}
                          </span>
                        ) : null}
                        {sample.execution_focus_raw_ref_count > 0 ? (
                          <span className="event-chip">
                            raw refs {sample.execution_focus_raw_ref_count}
                          </span>
                        ) : null}
                        {sample.skill_reference_count > 0 ? (
                          <span className="event-chip">
                            skill refs {sample.skill_reference_count}
                          </span>
                        ) : null}
                        {sample.skill_reference_phase_summary ? (
                          <span className="event-chip">
                            phases {sample.skill_reference_phase_summary}
                          </span>
                        ) : null}
                        {sample.skill_reference_source_summary ? (
                          <span className="event-chip">
                            sources {sample.skill_reference_source_summary}
                          </span>
                        ) : null}
                        {!sample.has_callback_waiting_summary
                          ? sampleExecutionFactBadges.map((badge) => (
                              <span className="event-chip" key={`${sample.run_id}-${badge}`}>
                                {badge}
                              </span>
                            ))
                          : null}
                      </div>
                    ) : null}
                    {sample.has_callback_waiting_summary ? (
                      <CallbackWaitingSummaryCard
                        callbackWaitingExplanation={
                          sample.run_snapshot.callbackWaitingExplanation ?? null
                        }
                        lifecycle={sample.run_snapshot.callbackWaitingLifecycle ?? null}
                        focusNodeEvidence={sampleFocusNodeEvidence}
                        focusSkillReferenceCount={
                          sample.run_snapshot.executionFocusSkillTrace?.reference_count ?? 0
                        }
                        focusSkillReferenceLoads={
                          sample.run_snapshot.executionFocusSkillTrace?.loads ?? []
                        }
                        focusSkillReferenceNodeId={sample.run_snapshot.executionFocusNodeId ?? null}
                        focusSkillReferenceNodeName={
                          sample.run_snapshot.executionFocusNodeName ?? null
                        }
                        nodeRunId={sample.run_snapshot.executionFocusNodeRunId ?? null}
                        runId={sample.run_id}
                        showFocusExecutionFacts
                        scheduledResumeDelaySeconds={
                          sample.run_snapshot.scheduledResumeDelaySeconds ?? null
                        }
                        scheduledResumeDueAt={sample.run_snapshot.scheduledResumeDueAt ?? null}
                        scheduledResumeRequeuedAt={
                          sample.run_snapshot.scheduledResumeRequeuedAt ?? null
                        }
                        scheduledResumeRequeueSource={
                          sample.run_snapshot.scheduledResumeRequeueSource ?? null
                        }
                        scheduledResumeScheduledAt={
                          sample.run_snapshot.scheduledResumeScheduledAt ?? null
                        }
                        scheduledResumeSource={sample.run_snapshot.scheduledResumeSource ?? null}
                        scheduledWaitingStatus={sample.run_snapshot.scheduledWaitingStatus ?? null}
                        showInlineActions={false}
                        waitingReason={sample.run_snapshot.waitingReason ?? null}
                      />
                    ) : null}
                    {!sample.has_callback_waiting_summary &&
                    (sample.focus_artifact_summary ||
                      sample.focus_tool_call_summaries.length > 0 ||
                      sample.focus_artifacts.length > 0) ? (
                      <OperatorFocusEvidenceCard
                        title="Sampled run focus evidence"
                        artifactCount={sample.execution_focus_artifact_count}
                        artifactRefCount={sample.execution_focus_artifact_ref_count}
                        artifactSummary={sample.focus_artifact_summary}
                        artifacts={sample.focus_artifacts}
                        toolCallCount={sample.execution_focus_tool_call_count}
                        toolCallSummaries={sample.focus_tool_call_summaries}
                      />
                    ) : null}
                    {!sample.has_callback_waiting_summary ? (
                      <SkillReferenceLoadList
                        skillReferenceLoads={sample.focus_skill_reference_loads}
                        title="Focused skill trace"
                        description="publish invocation detail 里的 sampled run 现在也直接复用 compact snapshot 的 skill trace，避免还要回跳 run detail 才能确认 focus node 实际加载了哪些参考资料。"
                      />
                    ) : null}
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
            skillTrace={skillTrace}
          />
        </div>
      ) : null}

      <WorkflowPublishInvocationCallbackSection
        invocation={invocation}
        callbackTickets={callbackTickets}
        sensitiveAccessEntries={sensitiveAccessEntries}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={callbackWaitingExplanation}
        executionFocusNode={executionFocusNode}
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
