import React from "react";
import Link from "next/link";
import { Alert, Button, Card, Descriptions, Tag } from "antd";

import {
  WorkflowStudioUtilityEmptyState,
  WorkflowStudioUtilityFrame,
  type WorkflowStudioUtilityAction,
  type WorkflowStudioUtilityMetric,
  type WorkflowStudioUtilityTag,
} from "@/components/workflow-studio-utility-frame";
import { resolveWorkflowPublishSelectedInvocationDetailSurface } from "@/components/workflow-publish-activity-panel-helpers";
import type {
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListResponse,
} from "@/lib/get-workflow-publish";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
} from "@/lib/get-system-overview";
import type { RunEvidenceView, RunExecutionView } from "@/lib/get-run-views";
import { formatDurationMs, formatTimestamp } from "@/lib/runtime-presenters";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import type { WorkflowPublishActivityWorkflowLike } from "@/lib/workflow-publish-activity-query";
import type { WorkflowLogsSelectionSource } from "@/lib/workflow-logs-surface";

export type WorkflowLogsSurfaceRunItem = {
  id: string;
  workflowVersion: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastEventAt?: string | null;
  nodeRunCount: number;
  eventCount: number;
  errorMessage?: string | null;
  logsHref: string;
  detailHref: string;
};

export type WorkflowLogsSurfaceBindingItem = {
  id: string;
  endpointAlias: string;
  routePath: string;
  protocol: string;
  authMode: string;
  workflowVersion: string;
};

type WorkflowLogsSurfaceInvocationItem = PublishedEndpointInvocationListResponse["items"][number];

type WorkflowLogsGovernanceHandoff = {
  workflowCatalogGapSummary?: string | null;
  workflowCatalogGapDetail?: string | null;
  workflowCatalogGapHref?: string | null;
  workflowGovernanceHref?: string | null;
  legacyAuthHandoff?: {
    detail?: string | null;
    statusChipLabel?: string | null;
  } | null;
} | null;

type WorkflowLogsSurfaceProps = {
  workflowId: string;
  workflow?: WorkflowPublishActivityWorkflowLike | null;
  activeBinding?: WorkflowLogsSurfaceBindingItem | null;
  invocationAudit?: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId?: string | null;
  selectedInvocationDetail?: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  buildInvocationHref?: (invocationId: string) => string;
  clearInvocationHref?: string | null;
  recentRuns: WorkflowLogsSurfaceRunItem[];
  selectionSource: WorkflowLogsSelectionSource;
  selectionNotice?: string | null;
  activeRunSummary: WorkflowLogsSurfaceRunItem | null;
  activeRunDetail: RunDetail | null;
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
  publishHref: string;
  runLibraryHref: string;
  workflowEditorHref: string;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

function formatLogsSelectionSourceLabel(
  selectionSource: WorkflowLogsSelectionSource,
  latestSubject: "invocation" | "run"
) {
  if (selectionSource === "latest") {
    return latestSubject === "invocation" ? "最新请求" : "最新 run";
  }

  if (selectionSource === "query") {
    return "URL 指定";
  }

  if (selectionSource === "fallback") {
    return "诚实回退";
  }

  return selectionSource;
}

function formatRunTraceSummary(run: WorkflowLogsSurfaceRunItem | null) {
  if (!run) {
    return "当前 selection 暂无 run";
  }

  return `${run.id} · ${run.status}`;
}

function renderRunTraceHandoff({
  workflowId,
  workflowEditorHref,
  callbackWaitingAutomation,
  sandboxReadiness,
  activeRunSummary,
  activeRunDetail,
  executionView,
  evidenceView,
}: {
  workflowId: string;
  workflowEditorHref: string;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness: SandboxReadinessCheck | null;
  activeRunSummary: WorkflowLogsSurfaceRunItem | null;
  activeRunDetail: RunDetail | null;
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
}) {
  if (activeRunDetail) {
    const activeRunId = activeRunDetail.id ?? activeRunSummary?.id ?? "n/a";
    const executionFocusLabel =
      activeRunDetail.execution_focus_node?.node_name?.trim() ||
      activeRunDetail.current_node_id?.trim() ||
      "当前还没有 execution focus";
    const runFollowUp = activeRunDetail.run_follow_up;
    const recommendedAction = runFollowUp?.recommended_action ?? null;
    const callbackHealthLabel = callbackWaitingAutomation.status === "healthy" ? "healthy" : "attention";
    const sandboxHealthLabel = sandboxReadiness
      ? sandboxReadiness.healthy_backend_count > 0
        ? "ready"
        : "degraded"
      : "unknown";

    return (
      <Card className="workflow-logs-handoff-card" data-component="workflow-logs-run-handoff">
        <div className="workflow-logs-card-heading">
          <div>
            <p className="eyebrow">Trace handoff</p>
            <h2>继续沿 trace 下钻</h2>
          </div>
          <p className="workflow-studio-utility-inline-copy">
            日志页只保留当前焦点请求命中的 run 摘要与 trace 接力；如果要继续看 execution / evidence，直接跳到
            canonical run detail，避免在 workflow 壳层里伪造完整诊断树。
          </p>
        </div>

        <div className="summary-strip" data-component="workflow-logs-run-summary">
          <article className="summary-card">
            <span>当前 run</span>
            <strong>{activeRunId}</strong>
          </article>
          <article className="summary-card">
            <span>Status</span>
            <strong>{activeRunDetail.status}</strong>
          </article>
          <article className="summary-card">
            <span>执行焦点</span>
            <strong>{executionFocusLabel}</strong>
          </article>
          <article className="summary-card">
            <span>事件数</span>
            <strong>{activeRunDetail.event_count}</strong>
          </article>
          <article className="summary-card">
            <span>Execution 节点</span>
            <strong>{executionView?.summary.node_run_count ?? activeRunDetail.node_runs.length}</strong>
          </article>
          <article className="summary-card">
            <span>Evidence 节点</span>
            <strong>{evidenceView?.summary.node_count ?? 0}</strong>
          </article>
        </div>

        <Descriptions className="workflow-logs-context-descriptions" column={1} size="small">
          <Descriptions.Item label="Workflow">{workflowId}</Descriptions.Item>
          <Descriptions.Item label="当前版本">{activeRunDetail.workflow_version}</Descriptions.Item>
          <Descriptions.Item label="当前节点">{activeRunDetail.current_node_id ?? "n/a"}</Descriptions.Item>
          <Descriptions.Item label="阻塞 node run">
            {activeRunDetail.blocking_node_run_id ?? "n/a"}
          </Descriptions.Item>
          <Descriptions.Item label="最后事件">
            {formatTimestamp(activeRunDetail.last_event_at ?? activeRunSummary?.lastEventAt ?? null)}
          </Descriptions.Item>
          <Descriptions.Item label="Trace 模式">canonical run detail handoff</Descriptions.Item>
        </Descriptions>

        <div className="tool-badge-row">
          <span className="event-chip">callback automation · {callbackHealthLabel}</span>
          <span className="event-chip">sandbox · {sandboxHealthLabel}</span>
          {executionView ? (
            <span className="event-chip">tool calls · {executionView.summary.tool_call_count}</span>
          ) : null}
          {evidenceView ? (
            <span className="event-chip">artifacts · {evidenceView.summary.artifact_count}</span>
          ) : null}
          {activeRunDetail.execution_focus_reason ? (
            <span className="event-chip">focus reason · {activeRunDetail.execution_focus_reason}</span>
          ) : null}
        </div>

        {activeRunDetail.execution_focus_explanation?.primary_signal ? (
          <Alert
            description={
              activeRunDetail.execution_focus_explanation.follow_up ??
              "继续沿完整 run diagnostics 查看 execution / evidence。"
            }
            title={activeRunDetail.execution_focus_explanation.primary_signal}
            showIcon
            type="info"
          />
        ) : null}

        {activeRunDetail.error_message ? (
          <Alert
            description={activeRunDetail.error_message}
            title="Run 错误"
            showIcon
            type="error"
          />
        ) : null}

        {runFollowUp?.explanation?.primary_signal || recommendedAction?.label ? (
          <div className="payload-card compact-card" data-component="workflow-logs-run-follow-up">
            <div className="payload-card-header">
              <span className="status-meta">Trace 后续动作</span>
              {recommendedAction?.label ? <span className="event-chip">{recommendedAction.label}</span> : null}
            </div>
            {runFollowUp?.explanation?.primary_signal ? (
              <p className="binding-meta">{runFollowUp.explanation.primary_signal}</p>
            ) : null}
            {runFollowUp?.explanation?.follow_up ? (
              <p className="section-copy entry-copy">{runFollowUp.explanation.follow_up}</p>
            ) : null}
            {recommendedAction?.href ? (
              <div className="tool-badge-row">
                <Link className="event-chip inbox-filter-link" href={recommendedAction.href}>
                  {recommendedAction.label ?? "打开 follow-up"}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="workflow-logs-card-actions">
          {activeRunSummary?.detailHref ? (
            <Button href={activeRunSummary.detailHref} type="primary">
              打开完整 run 诊断
            </Button>
          ) : null}
          <Button href={workflowEditorHref}>回到编排编辑器</Button>
        </div>
      </Card>
    );
  }

  if (activeRunSummary) {
    return (
      <Card className="workflow-logs-handoff-card" data-component="workflow-logs-run-handoff-empty">
        <div className="workflow-logs-card-heading">
          <div>
            <p className="eyebrow">Trace handoff</p>
            <h2>Trace 详情暂不可用</h2>
          </div>
          <p className="workflow-studio-utility-inline-copy">
            当前焦点请求已关联 run {activeRunSummary.id}，但 run detail payload 还没拿到；页面保留直接跳到完整
            run diagnostics 的入口，避免在 workflow 壳层输出不完整 trace。
          </p>
        </div>

        <Alert
          description={`当前焦点请求已命中 run ${activeRunSummary.id}，但 server 还没返回 run detail payload。`}
          title="继续跳到完整 run 诊断，避免在 workflow 壳层渲染不完整 trace。"
          showIcon
          type="warning"
        />

        <div className="workflow-logs-card-actions">
          <Button href={activeRunSummary.detailHref} type="primary">
            打开完整 run 诊断
          </Button>
          <Button href={workflowEditorHref}>回到编排编辑器</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="workflow-logs-handoff-card" data-component="workflow-logs-run-handoff-empty">
      <div className="workflow-logs-card-heading">
        <div>
          <p className="eyebrow">Trace handoff</p>
          <h2>这条请求还没有 trace 可继续</h2>
        </div>
        <p className="workflow-studio-utility-inline-copy">
          当前焦点请求还没有可继续下钻的 run trace；页面保留 honest fallback，提醒作者先回到
          publish / editor 触发一次真实运行，而不是伪造 run detail。
        </p>
      </div>

      <Alert
        description="先回到发布治理确认 endpoint 已对外暴露，或回到编排编辑器重新触发一次运行。"
        title="当前焦点请求还没有 trace 可继续下钻。"
        showIcon
        type="info"
      />

      <div className="workflow-logs-card-actions">
        <Button href={workflowEditorHref} type="primary">
          回到编排编辑器
        </Button>
      </div>
    </Card>
  );
}

function renderInvocationDetailState({
  selectedInvocationSurface,
}: {
  selectedInvocationSurface: ReturnType<typeof resolveWorkflowPublishSelectedInvocationDetailSurface>;
}) {
  if (selectedInvocationSurface.kind === "blocked") {
    return (
      <Alert
        description={selectedInvocationSurface.blockedSurfaceCopy.summary}
        title={selectedInvocationSurface.blockedSurfaceCopy.title}
        showIcon
        type="warning"
      />
    );
  }

  if (selectedInvocationSurface.kind === "unavailable") {
    return (
      <Alert
        description={`${selectedInvocationSurface.unavailableSurfaceCopy.summary} ${selectedInvocationSurface.unavailableSurfaceCopy.detail}`}
        title={selectedInvocationSurface.unavailableSurfaceCopy.title}
        showIcon
        type="info"
      />
    );
  }

  return (
    <Alert
      description="请先从左侧请求目录选择一条调用，再沿同一条 workflow-scoped facts 查看详情与 trace handoff。"
      title="当前还没有选中的请求详情。"
      showIcon
      type="info"
    />
  );
}

function formatInvocationPreview(value: unknown) {
  if (!value) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function renderInvocationDirectoryEntry({
  item,
  isActive,
  detailHref,
}: {
  item: WorkflowLogsSurfaceInvocationItem;
  isActive: boolean;
  detailHref: string | null;
}) {
  return (
    <article
      className="activity-row"
      data-active={isActive ? "true" : "false"}
      data-component="workflow-logs-directory-entry"
      data-invocation-id={item.id}
      key={item.id}
    >
      <div className="activity-header">
        <div>
          <h3>{isActive ? `当前焦点请求 · ${item.id}` : `请求 ${item.id}`}</h3>
          <p>
            {item.endpoint_alias ?? item.binding_id} · {item.request_source} · {item.request_surface}
          </p>
        </div>
        <span className={`health-pill ${item.status}`}>{item.status}</span>
      </div>
      <p className="activity-copy">
        {item.route_path} · 收到于 {formatTimestamp(item.created_at)}
      </p>
      <p className="event-run">
        trace {item.run_id ?? "n/a"} · 缓存 {item.cache_status} · 耗时 {formatDurationMs(item.duration_ms)}
      </p>
      {item.error_message ? (
        <p className="run-error-message">{item.error_message}</p>
      ) : item.reason_code ? (
        <p className="section-copy">原因码 {item.reason_code}</p>
      ) : (
        <p className="section-copy">这条请求没有显式错误，继续在右侧对照详情与 trace handoff。</p>
      )}
      {detailHref ? (
        <div className="section-actions">
          <Link className="activity-link" href={detailHref}>
            {isActive ? "保持当前焦点" : "查看这条请求"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function renderWorkflowGovernanceNote(workflowGovernanceHandoff: WorkflowLogsGovernanceHandoff) {
  if (!workflowGovernanceHandoff) {
    return null;
  }

  return (
    <div className="payload-card compact-card" data-component="workflow-logs-governance-note">
      <div className="payload-card-header">
        <span className="status-meta">Workflow governance</span>
        {workflowGovernanceHandoff.workflowCatalogGapSummary ? (
          <span className="event-chip">{workflowGovernanceHandoff.workflowCatalogGapSummary}</span>
        ) : null}
        {workflowGovernanceHandoff.legacyAuthHandoff?.statusChipLabel ? (
          <span className="event-chip">{workflowGovernanceHandoff.legacyAuthHandoff.statusChipLabel}</span>
        ) : null}
      </div>
      {workflowGovernanceHandoff.workflowCatalogGapDetail ? (
        <p className="section-copy entry-copy">{workflowGovernanceHandoff.workflowCatalogGapDetail}</p>
      ) : null}
      {workflowGovernanceHandoff.legacyAuthHandoff?.detail ? (
        <p className="binding-meta">{workflowGovernanceHandoff.legacyAuthHandoff.detail}</p>
      ) : null}
      <div className="tool-badge-row">
        {workflowGovernanceHandoff.workflowCatalogGapHref ? (
          <Link
            className="event-chip inbox-filter-link"
            href={workflowGovernanceHandoff.workflowCatalogGapHref}
          >
            处理 catalog gap
          </Link>
        ) : null}
        {workflowGovernanceHandoff.workflowGovernanceHref ? (
          <Link
            className="event-chip inbox-filter-link"
            href={workflowGovernanceHandoff.workflowGovernanceHref}
          >
            回到 workflow 编辑器
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function renderSelectedInvocationOverview({
  selectedInvocationSurface,
  activeInvocationItem,
}: {
  selectedInvocationSurface: ReturnType<typeof resolveWorkflowPublishSelectedInvocationDetailSurface>;
  activeInvocationItem: WorkflowLogsSurfaceInvocationItem | null;
}) {
  if (selectedInvocationSurface.kind !== "ok") {
    return renderInvocationDetailState({ selectedInvocationSurface });
  }

  const detail = selectedInvocationSurface.detail;
  const invocation = detail.invocation;
  const requestPreview = formatInvocationPreview(invocation.request_preview);
  const responsePreview = formatInvocationPreview(invocation.response_preview);

  return (
    <div className="workflow-logs-detail-body" data-component="workflow-logs-invocation-summary">
      <div className="summary-strip">
        <article className="summary-card">
          <span>Status</span>
          <strong>{invocation.status}</strong>
        </article>
        <article className="summary-card">
          <span>收到于</span>
          <strong>{formatTimestamp(invocation.created_at)}</strong>
        </article>
        <article className="summary-card">
          <span>Trace 接力</span>
          <strong>{detail.run?.id ?? invocation.run_id ?? "n/a"}</strong>
        </article>
        <article className="summary-card">
          <span>耗时</span>
          <strong>{formatDurationMs(invocation.duration_ms)}</strong>
        </article>
      </div>

      <dl className="compact-meta-list">
        <div>
          <dt>当前入口</dt>
          <dd>{invocation.endpoint_alias ?? invocation.binding_id}</dd>
        </div>
        <div>
          <dt>请求路径</dt>
          <dd>{invocation.route_path}</dd>
        </div>
        <div>
          <dt>调用来源</dt>
          <dd>
            {invocation.request_source} · {invocation.request_surface}
          </dd>
        </div>
        <div>
          <dt>缓存</dt>
          <dd>{invocation.cache_status}</dd>
        </div>
        <div>
          <dt>原因码</dt>
          <dd>{invocation.reason_code ?? "n/a"}</dd>
        </div>
        <div>
          <dt>当前焦点</dt>
          <dd>{activeInvocationItem?.id ?? invocation.id}</dd>
        </div>
      </dl>

      {invocation.error_message ? (
        <Alert description={invocation.error_message} title="请求错误" showIcon type="error" />
      ) : null}

      {selectedInvocationSurface.nextStepSurface ? (
        <div className="payload-card compact-card" data-component="workflow-logs-next-step">
          <div className="payload-card-header">
            <span className="status-meta">{selectedInvocationSurface.nextStepSurface.title}</span>
            <span className="event-chip">{selectedInvocationSurface.nextStepSurface.label}</span>
          </div>
          <p className="section-copy entry-copy">{selectedInvocationSurface.nextStepSurface.detail}</p>
          {selectedInvocationSurface.nextStepSurface.primaryResourceSummary ? (
            <p className="binding-meta">{selectedInvocationSurface.nextStepSurface.primaryResourceSummary}</p>
          ) : null}
          <div className="tool-badge-row">
            {selectedInvocationSurface.nextStepSurface.href &&
            selectedInvocationSurface.nextStepSurface.hrefLabel ? (
              <Link
                className="event-chip inbox-filter-link"
                href={selectedInvocationSurface.nextStepSurface.href}
              >
                {selectedInvocationSurface.nextStepSurface.hrefLabel}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {renderWorkflowGovernanceNote(
        selectedInvocationSurface.nextStepSurface?.workflowGovernanceHandoff ?? null
      )}

      {requestPreview ? (
        <div className="payload-card compact-card" data-component="workflow-logs-request-preview">
          <div className="payload-card-header">
            <span className="status-meta">Request preview</span>
          </div>
          <pre>{requestPreview}</pre>
        </div>
      ) : null}

      {responsePreview ? (
        <div className="payload-card compact-card" data-component="workflow-logs-response-preview">
          <div className="payload-card-header">
            <span className="status-meta">Response preview</span>
          </div>
          <pre>{responsePreview}</pre>
        </div>
      ) : null}
    </div>
  );
}

function renderRunFallbackContent({
  workflowId,
  recentRuns,
  selectionNotice,
  selectionSource,
  activeRunSummary,
  activeRunDetail,
  callbackWaitingAutomation,
  sandboxReadiness,
  workflowEditorHref,
  executionView,
  evidenceView,
}: {
  workflowId: string;
  recentRuns: WorkflowLogsSurfaceRunItem[];
  selectionNotice: string | null;
  selectionSource: WorkflowLogsSelectionSource;
  activeRunSummary: WorkflowLogsSurfaceRunItem | null;
  activeRunDetail: RunDetail | null;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness: SandboxReadinessCheck | null;
  workflowEditorHref: string;
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
}) {
  const activeErrorMessage =
    activeRunDetail?.error_message?.trim() || activeRunSummary?.errorMessage?.trim() || null;
  const activeRunId = activeRunDetail?.id ?? activeRunSummary?.id ?? "none";

  return (
    <section className="workflow-logs-workbench" data-component="workflow-logs-run-fallback">
      <Card className="workflow-logs-directory-card" data-component="workflow-logs-run-list">
        <div className="workflow-logs-card-heading">
          <div>
            <p className="eyebrow">Run directory</p>
            <h2>Workflow scoped run fallback</h2>
          </div>
          <p className="workflow-studio-utility-inline-copy">
            当前 workflow 还没有可读的 published invocation 列表，因此页面诚实回退到 workflow scoped recent runs；先选
            一条 run，再继续下钻 execution / evidence。
          </p>
        </div>

        {selectionNotice ? (
          <Alert description={selectionNotice} title="Selection notice" showIcon type="info" />
        ) : null}

        <Descriptions className="workflow-logs-context-descriptions" column={1} size="small">
          <Descriptions.Item label="Active run">{activeRunId}</Descriptions.Item>
          <Descriptions.Item label="Selection">
            {formatLogsSelectionSourceLabel(selectionSource, "run")}
          </Descriptions.Item>
          <Descriptions.Item label="Last event">
            {formatTimestamp(activeRunDetail?.last_event_at ?? activeRunSummary?.lastEventAt ?? null)}
          </Descriptions.Item>
          <Descriptions.Item label="Trace mode">workflow scoped recent runs</Descriptions.Item>
        </Descriptions>

        <div className="workflow-logs-directory-list activity-list">
          {recentRuns.map((run) => {
            const isActive = run.id === activeRunSummary?.id;

            return (
              <article
                className="activity-row"
                data-active={isActive ? "true" : "false"}
                data-run-id={run.id}
                key={run.id}
              >
                <div className="activity-header">
                  <div>
                    <h3>{isActive ? `当前焦点 · ${run.id}` : `run ${run.id}`}</h3>
                    <p>
                      workflow {workflowId} · version {run.workflowVersion} · node runs {run.nodeRunCount}
                    </p>
                  </div>
                  <span className={`health-pill ${run.status}`}>{run.status}</span>
                </div>
                <p className="activity-copy">
                  Created {formatTimestamp(run.createdAt)} · Last event {formatTimestamp(run.lastEventAt)}
                </p>
                <p className="event-run">events {run.eventCount}</p>
                {run.errorMessage ? (
                  <p className="run-error-message">{run.errorMessage}</p>
                ) : (
                  <p className="section-copy">
                    当前 run 没有记录 run 级错误，继续下钻 execution / evidence。
                  </p>
                )}
                <div className="section-actions">
                  <Link className="activity-link" href={run.logsHref}>
                    {isActive ? "保持当前焦点" : "切换到此 run"}
                  </Link>
                  <Link className="inline-link secondary" href={run.detailHref}>
                    打开完整 run 诊断
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </Card>

      <div className="workflow-logs-detail-rail" data-component="workflow-logs-detail-rail">
        <Card className="workflow-logs-detail-card" data-component="workflow-logs-active-run">
          <div className="workflow-logs-card-heading">
            <div>
              <p className="eyebrow">Selected run</p>
              <h2>Execution / evidence drilldown</h2>
            </div>
            <p className="workflow-studio-utility-inline-copy">
              先看当前焦点 run 的状态、事件边界和错误说明，再继续顺着 execution / evidence sections 下钻。
            </p>
          </div>

          <div className="workflow-logs-card-actions">
            {activeRunSummary ? (
              <Button href={activeRunSummary.detailHref} type="primary">
                打开完整 run 诊断
              </Button>
            ) : null}
            <Button href={workflowEditorHref}>回到编排编辑器</Button>
          </div>

          {activeRunDetail ? (
            <>
              <div className="summary-strip">
                <article className="summary-card">
                  <span>Status</span>
                  <strong>{activeRunDetail.status}</strong>
                </article>
                <article className="summary-card">
                  <span>Created</span>
                  <strong>{formatTimestamp(activeRunDetail.created_at)}</strong>
                </article>
                <article className="summary-card">
                  <span>Events</span>
                  <strong>{activeRunDetail.event_count}</strong>
                </article>
                <article className="summary-card">
                  <span>Last event</span>
                  <strong>{formatTimestamp(activeRunDetail.last_event_at)}</strong>
                </article>
              </div>

              {activeErrorMessage ? (
                <Alert description={activeErrorMessage} title="Run error" showIcon type="error" />
              ) : null}
            </>
          ) : (
            <Alert
              description="请先进入完整 run 诊断或稍后重试，避免在 workflow 壳层里渲染不完整的日志事实。"
              title="当前 run detail 暂时不可用。"
              showIcon
              type="info"
            />
          )}
        </Card>

        {renderRunTraceHandoff({
          workflowId,
          workflowEditorHref,
          callbackWaitingAutomation,
          sandboxReadiness,
          activeRunSummary,
          activeRunDetail,
          executionView,
          evidenceView,
        })}
      </div>
    </section>
  );
}

export function WorkflowLogsSurface({
  workflowId,
  workflow = null,
  activeBinding = null,
  invocationAudit = null,
  selectedInvocationId = null,
  selectedInvocationDetail = null,
  buildInvocationHref,
  clearInvocationHref = null,
  recentRuns,
  selectionSource,
  selectionNotice = null,
  activeRunSummary,
  activeRunDetail,
  executionView,
  evidenceView,
  publishHref,
  runLibraryHref,
  workflowEditorHref,
  callbackWaitingAutomation,
  sandboxReadiness = null,
}: WorkflowLogsSurfaceProps) {
  const invocationItems = invocationAudit?.items ?? [];
  const activeInvocationItem =
    invocationItems.find((item) => item.id === selectedInvocationId) ?? invocationItems[0] ?? null;
  const activeInvocationHref =
    selectedInvocationId && buildInvocationHref ? buildInvocationHref(selectedInvocationId) : null;
  const selectedInvocationSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
    selectedInvocationId,
    selectedInvocationDetail,
    currentHref: activeInvocationHref,
    callbackWaitingAutomation,
    sandboxReadiness,
  });
  const sharedActions: WorkflowStudioUtilityAction[] = [
    {
      key: "publish",
      href: publishHref,
      label: "查看发布治理",
      variant: "primary",
    },
    {
      key: "runs",
      href: runLibraryHref,
      label: "打开全局 run 列表",
    },
  ];

  if (invocationItems.length === 0 && recentRuns.length === 0) {
    return (
        <WorkflowStudioUtilityEmptyState
          actions={sharedActions}
          dataComponent="workflow-logs-empty-state"
          description="日志页优先展示请求目录；如果当前还没有 published request facts，才会诚实回退到 workflow recent runs。"
          emptyDescription="当前 workflow 还没有 recent published requests 或 recent runs；请先从编辑器调试或发布入口触发一次运行，再回来查看请求详情与 trace handoff。"
          eyebrow="Request directory"
          surface="logs"
          title="日志与标注"
        />
    );
  }

  if (invocationItems.length === 0) {
    const fallbackMetrics: WorkflowStudioUtilityMetric[] = [
      {
        key: "recent-runs",
        label: "最近 runs",
        value: String(recentRuns.length),
      },
      {
        key: "active-run",
        label: "当前焦点 run",
        value: activeRunDetail?.id ?? activeRunSummary?.id ?? "none",
        detail: `status: ${activeRunDetail?.status ?? activeRunSummary?.status ?? "unknown"}`,
      },
      {
        key: "last-event",
        label: "最后事件",
        value: formatTimestamp(activeRunDetail?.last_event_at ?? activeRunSummary?.lastEventAt ?? null),
      },
      {
        key: "execution-focus",
        label: "执行焦点",
        value:
          activeRunDetail?.execution_focus_node?.node_name?.trim() ||
          activeRunDetail?.current_node_id?.trim() ||
          "当前还没有 execution focus",
        detail: `selection: ${formatLogsSelectionSourceLabel(selectionSource, "run")}`,
        wide: true,
      },
    ];
    const fallbackTags: WorkflowStudioUtilityTag[] = [
      {
        key: "mode",
        label: "run fallback",
        color: "processing",
      },
      {
        key: "selection-source",
        label: `selection · ${formatLogsSelectionSourceLabel(selectionSource, "run")}`,
        color: "default",
      },
    ];

    return (
      <div
        className="workflow-logs-surface"
        data-component="workflow-logs-surface"
        data-selection-source={selectionSource}
      >
        <WorkflowStudioUtilityFrame
          actions={sharedActions}
          description="当前 workflow 还没有可读的请求目录，因此页面诚实回退到 workflow recent runs、run detail 与 execution / evidence view。"
          eyebrow="Request fallback"
          metrics={fallbackMetrics}
          surface="logs"
          tags={fallbackTags}
          title="日志与标注"
        >
          {renderRunFallbackContent({
            workflowId,
            recentRuns,
            selectionNotice,
            selectionSource,
            activeRunSummary,
            activeRunDetail,
            callbackWaitingAutomation,
            sandboxReadiness,
            workflowEditorHref,
            executionView,
            evidenceView,
          })}
        </WorkflowStudioUtilityFrame>
      </div>
    );
  }

  const selectedInvocationDetailValue =
    selectedInvocationSurface.kind === "ok" ? selectedInvocationSurface.detail : null;
  const selectedInvocationStatus =
    selectedInvocationDetailValue?.invocation.status ?? activeInvocationItem?.status ?? "unknown";
  const selectedInvocationRunId =
    selectedInvocationDetailValue?.run?.id ??
    selectedInvocationDetailValue?.invocation.run_id ??
    activeInvocationItem?.run_id ??
    activeRunSummary?.id ??
    null;
  const overviewMetrics: WorkflowStudioUtilityMetric[] = [
    {
      key: "binding",
      label: "请求入口",
      value: activeBinding?.endpointAlias ?? activeBinding?.routePath ?? "N/A",
      detail: activeBinding ? `${activeBinding.protocol} · ${activeBinding.authMode}` : "当前没有 active binding",
      wide: true,
    },
    {
      key: "recent-invocations",
      label: "最近请求",
      value: String(invocationAudit?.summary.total_count ?? invocationItems.length),
    },
    {
      key: "current-focus",
      label: "当前焦点",
      value: selectedInvocationId ?? activeInvocationItem?.id ?? "N/A",
      detail: `status: ${selectedInvocationStatus}`,
    },
    {
      key: "last-invoked",
      label: "最近一次调用",
      value: formatTimestamp(
        invocationAudit?.summary.last_invoked_at ?? activeInvocationItem?.created_at ?? null
      ),
    },
    {
      key: "run-trace",
      label: "Trace 接力",
      value: selectedInvocationRunId ?? "当前 invocation 暂无 run",
      detail: `selection: ${formatLogsSelectionSourceLabel(selectionSource, "invocation")}`,
      wide: true,
    },
  ];
  const overviewTags: WorkflowStudioUtilityTag[] = [
    {
      key: "selection-source",
      label: `selection · ${formatLogsSelectionSourceLabel(selectionSource, "invocation")}`,
      color: "processing",
    },
  ];

  if (activeBinding) {
    overviewTags.push({
      key: "binding-protocol",
      label: `${activeBinding.protocol} · ${activeBinding.authMode}`,
      color: "blue",
    });
  }

  return (
    <div
      className="workflow-logs-surface"
      data-component="workflow-logs-surface"
      data-selection-source={selectionSource}
    >
      <WorkflowStudioUtilityFrame
        actions={sharedActions}
        description="当前页面先在左侧请求目录固定一条调用，再在右侧查看当前焦点详情，并顺着 trace handoff 继续下钻。"
        eyebrow="Request directory"
        metrics={overviewMetrics}
        surface="logs"
        tags={overviewTags}
        title="日志与标注"
      >
        <section className="workflow-logs-workbench" data-component="workflow-logs-workbench">
          <Card className="workflow-logs-directory-card" data-component="workflow-logs-invocation-list">
            <div className="workflow-logs-card-heading">
              <div>
                <p className="eyebrow">Request directory</p>
                <h2>最近请求目录</h2>
              </div>
              <p className="workflow-studio-utility-inline-copy">
                只展示当前 workflow binding 最近的请求，方便作者沿同一条 workflow-scoped facts 对照详情与 trace。
              </p>
            </div>

            {selectionNotice ? (
              <Alert description={selectionNotice} title="当前焦点提示" showIcon type="info" />
            ) : null}

            <Descriptions className="workflow-logs-context-descriptions" column={1} size="small">
              <Descriptions.Item label="当前 endpoint">
                {activeBinding?.endpointAlias ?? activeBinding?.routePath ?? "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="请求路径">
                {activeBinding?.routePath ?? "当前没有 active binding"}
              </Descriptions.Item>
              <Descriptions.Item label="当前焦点来源">
                {formatLogsSelectionSourceLabel(selectionSource, "invocation")}
              </Descriptions.Item>
              <Descriptions.Item label="Trace 接力">{selectedInvocationRunId ?? "当前请求暂时没有 run"}</Descriptions.Item>
            </Descriptions>

            {activeBinding ? (
              <div className="workflow-logs-context-tags">
                <Tag color="blue">{activeBinding.protocol}</Tag>
                <Tag>{activeBinding.authMode}</Tag>
                <Tag color="purple">workflow {activeBinding.workflowVersion}</Tag>
              </div>
            ) : null}

            <div className="payload-card compact-card" data-component="workflow-logs-focus-guide">
              <div className="payload-card-header">
                <span className="status-meta">当前焦点怎么读</span>
                <span className="event-chip">请求目录 → 详情 → trace handoff</span>
              </div>
              <p className="section-copy entry-copy">
                左侧目录只保留当前 workflow binding 的最近请求；先固定一条当前焦点，再沿右侧详情与下方 trace
                handoff 继续排障，不额外伪造 session backend。
              </p>
            </div>

            <div className="workflow-logs-directory-list activity-list">
              {invocationItems.map((item) =>
                renderInvocationDirectoryEntry({
                  item,
                  isActive: item.id === (selectedInvocationId ?? activeInvocationItem?.id ?? null),
                  detailHref: buildInvocationHref
                    ? buildInvocationHref(item.id)
                    : activeInvocationHref,
                })
              )}
            </div>
          </Card>

          <div className="workflow-logs-detail-rail" data-component="workflow-logs-detail-rail">
            <Card className="workflow-logs-detail-card" data-component="workflow-logs-invocation-detail">
              <div className="workflow-logs-card-heading">
                <div>
                  <p className="eyebrow">Current focus</p>
                  <h2>请求详情与 trace 接力</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  当前焦点详情继续复用 publish activity detail payload；如果已经关联 run，下方的 trace handoff 会继续保留
                  canonical run detail / execution / evidence 入口。
                </p>
              </div>

              <div className="workflow-logs-card-actions">
                {clearInvocationHref ? <Button href={clearInvocationHref}>回到该入口最新请求</Button> : null}
                {activeRunSummary ? (
                  <Button href={activeRunSummary.detailHref} type="primary">
                    打开 run 详情
                  </Button>
                ) : null}
                <Button href={workflowEditorHref}>回到编排编辑器</Button>
              </div>

              {renderSelectedInvocationOverview({
                selectedInvocationSurface,
                activeInvocationItem,
              })}
            </Card>

            {renderRunTraceHandoff({
              workflowId,
              workflowEditorHref,
              callbackWaitingAutomation,
              sandboxReadiness,
              activeRunSummary,
              activeRunDetail,
              executionView,
              evidenceView,
            })}
          </div>
        </section>
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
