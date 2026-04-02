import React from "react";
import Link from "next/link";
import { Button, Card, Descriptions, Tag } from "antd";

import {
  WorkflowStudioUtilityEmptyState,
  WorkflowStudioUtilityFrame,
  type WorkflowStudioUtilityAction,
  type WorkflowStudioUtilityMetric,
  type WorkflowStudioUtilityTag,
} from "@/components/workflow-studio-utility-frame";
import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import type {
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem,
} from "@/lib/get-workflow-publish";
import type { OperatorRunSampleCard } from "@/lib/operator-run-sample-cards";
import { buildRunDetailHref } from "@/lib/workbench-links";
import { buildWorkflowMonitorSurfaceModel } from "@/lib/workflow-monitor-surface";

type WorkflowMonitorSurfaceProps = {
  workflowId: string;
  bindings: WorkflowPublishedEndpointItem[];
  invocationAuditsByBinding: Record<string, PublishedEndpointInvocationListResponse | null>;
  publishHref: string;
  logsHref: string;
  workflowEditorHref: string;
  currentHref: string;
  focusBindingId?: string | null;
  focusInvocationId?: string | null;
  focusRunId?: string | null;
};

type WorkflowMonitorGovernanceHandoff = {
  workflowCatalogGapSummary?: string | null;
  workflowCatalogGapDetail?: string | null;
  workflowCatalogGapHref?: string | null;
  workflowGovernanceHref?: string | null;
  legacyAuthHandoff?: {
    detail?: string | null;
    bindingChipLabel?: string | null;
    statusChipLabel?: string | null;
  } | null;
} | null;

type WorkflowMonitorSelectedNextStepSurface = {
  title: string;
  label: string;
  detail: string;
  href?: string | null;
  hrefLabel?: string | null;
  primaryResourceSummary?: string | null;
  workflowGovernanceHandoff?: WorkflowMonitorGovernanceHandoff;
} | null;

function renderMonitorGovernanceNote(
  workflowGovernanceHandoff: WorkflowMonitorGovernanceHandoff,
  dataComponent = "workflow-monitor-governance-note"
) {
  if (!workflowGovernanceHandoff) {
    return null;
  }

  return (
    <div className="payload-card compact-card" data-component={dataComponent}>
      <div className="payload-card-header">
        <span className="status-meta">Workflow governance</span>
        {workflowGovernanceHandoff.workflowCatalogGapSummary ? (
          <span className="event-chip">{workflowGovernanceHandoff.workflowCatalogGapSummary}</span>
        ) : null}
        {workflowGovernanceHandoff.legacyAuthHandoff?.bindingChipLabel ? (
          <span className="event-chip">{workflowGovernanceHandoff.legacyAuthHandoff.bindingChipLabel}</span>
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
          <Link className="event-chip inbox-filter-link" href={workflowGovernanceHandoff.workflowCatalogGapHref}>
            处理 catalog gap
          </Link>
        ) : null}
        {workflowGovernanceHandoff.workflowGovernanceHref ? (
          <Link className="event-chip inbox-filter-link" href={workflowGovernanceHandoff.workflowGovernanceHref}>
            回到 workflow 编辑器
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function renderMonitorSelectedNextStep(
  surface: WorkflowMonitorSelectedNextStepSurface,
  dataComponent = "workflow-monitor-next-step"
) {
  if (!surface) {
    return null;
  }

  return (
    <div className="payload-card compact-card" data-component={dataComponent}>
      <div className="payload-card-header">
        <span className="status-meta">{surface.title}</span>
        <span className="event-chip">{surface.label}</span>
      </div>
      <p className="section-copy entry-copy">{surface.detail}</p>
      {surface.primaryResourceSummary ? (
        <p className="binding-meta">{surface.primaryResourceSummary}</p>
      ) : null}
      <div className="tool-badge-row">
        {surface.href && surface.hrefLabel ? (
          <Link className="event-chip inbox-filter-link" href={surface.href}>
            {surface.hrefLabel}
          </Link>
        ) : null}
      </div>
      {renderMonitorGovernanceNote(surface.workflowGovernanceHandoff ?? null, `${dataComponent}-governance`)}
    </div>
  );
}

function renderMonitorSampledRunCards(cards: OperatorRunSampleCard[]) {
  return (
    <div className="workflow-logs-directory-list" data-component="workflow-monitor-sampled-run-list">
      {cards.map((card) => (
        <article
          className="payload-card compact-card"
          data-component="workflow-monitor-sampled-run-card"
          data-run-id={card.runId}
          key={card.runId}
        >
          <div className="payload-card-header">
            <span className="status-meta">sampled run {card.shortRunId}</span>
            <span className="event-chip">{card.runStatus ?? "unknown"}</span>
            {card.hasCallbackWaitingSummary ? <span className="event-chip">callback waiting</span> : null}
          </div>
          <p className="binding-meta">{card.summary ?? `focus ${card.focusNodeLabel ?? card.currentNodeId ?? "n/a"}`}</p>
          <dl className="compact-meta-list">
            <div>
              <dt>Focus</dt>
              <dd>{card.focusNodeLabel ?? card.focusNodeId ?? card.currentNodeId ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Waiting</dt>
              <dd>{card.waitingReason ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>{card.runId}</dd>
            </div>
          </dl>
          {card.executionFactBadges.length ? (
            <div className="tool-badge-row">
              {card.executionFactBadges.slice(0, 6).map((badge) => (
                <span className="event-chip" key={`${card.runId}-${badge}`}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          <div className="tool-badge-row">
            <Link className="event-chip inbox-filter-link" href={buildRunDetailHref(card.runId)}>
              打开 run 诊断
            </Link>
            {card.inboxHref ? (
              <Link className="event-chip inbox-filter-link" href={card.inboxHref}>
                打开 follow-up inbox
              </Link>
            ) : null}
            {card.workflowCatalogGapHref ? (
              <Link className="event-chip inbox-filter-link" href={card.workflowCatalogGapHref}>
                处理 catalog gap
              </Link>
            ) : null}
            {card.workflowGovernanceHref ? (
              <Link className="event-chip inbox-filter-link" href={card.workflowGovernanceHref}>
                回到 workflow 编辑器
              </Link>
            ) : null}
          </div>
          {renderMonitorGovernanceNote(
            card.workflowCatalogGapSummary || card.legacyAuthHandoff
              ? {
                  workflowCatalogGapSummary: card.workflowCatalogGapSummary,
                  workflowCatalogGapDetail: card.workflowCatalogGapDetail,
                  workflowCatalogGapHref: card.workflowCatalogGapHref,
                  workflowGovernanceHref: card.workflowGovernanceHref,
                  legacyAuthHandoff: card.legacyAuthHandoff,
                }
              : null,
            "workflow-monitor-sampled-governance"
          )}
        </article>
      ))}
    </div>
  );
}

export function WorkflowMonitorSurface({
  workflowId,
  bindings,
  invocationAuditsByBinding,
  publishHref,
  logsHref,
  workflowEditorHref,
  currentHref,
  focusBindingId = null,
  focusInvocationId = null,
  focusRunId = null,
}: WorkflowMonitorSurfaceProps) {
  const model = buildWorkflowMonitorSurfaceModel({
    bindings,
    invocationAuditsByBinding,
    resolveWorkflowDetailHref: () => workflowEditorHref,
    focusBindingId,
    focusInvocationId,
    focusRunId,
  });
  const hasDraftBindings = bindings.some((binding) => binding.lifecycle_status === "draft");
  const summaryFocusGovernanceHandoff =
    model.insightsSurface?.summaryCards.find((card) => card.key === "summary-focus")
      ?.workflowGovernanceHandoff ?? null;
  const sharedActions: WorkflowStudioUtilityAction[] = [
    {
      key: "publish",
      href: publishHref,
      label: "前往发布治理",
      variant: "primary",
    },
    {
      key: "logs",
      href: logsHref,
      label: "打开 workflow 日志",
    },
  ];

  if (model.publishedBindings.length === 0) {
    return (
      <WorkflowStudioUtilityEmptyState
        actions={sharedActions}
        dataComponent="workflow-monitor-empty-state"
        description="monitor 只消费 published binding 的真实调用事实，不会把 draft / offline 定义伪装成流量报表。"
        emptyDescription={
          hasDraftBindings
            ? "当前 workflow 只有 draft / offline publish definition；请先完成发布治理，再回来查看 invocation timeline、follow-up 和 backlog 信号。"
            : "当前 workflow 还没有 published binding；监测页不会伪造流量或报表，请先完成发布治理再回来查看真实调用事实。"
        }
        eyebrow="Workflow monitor"
        surface="monitor"
        title="监测报表"
      />
    );
  }

  const overviewMetrics = model.summaryCards.map<WorkflowStudioUtilityMetric>((card) => ({
    key: card.key,
    label: card.label,
    value: card.value,
    detail: card.detail ?? undefined,
  }));
  const overviewTags: WorkflowStudioUtilityTag[] = [
    {
      key: "published-bindings",
      label: `${model.publishedBindings.length} published bindings`,
      color: "blue",
    },
    {
      key: "time-window",
      label: `window · ${model.timeWindowLabel}`,
      color: "processing",
    },
  ];

  if (model.focus?.activeBindingId) {
    overviewTags.push({
      key: "focus-binding",
      label: `focus · ${model.focus.activeBindingId}`,
      color: "purple",
    });
  }

  const contractNotice = (
    <p className="workflow-studio-utility-inline-copy" data-component="workflow-monitor-contract-notice">
      当前 monitor 仅展示 published invocation 聚合指标与 hour / day timeline；Token 输出速度、全部会话数、全部消息数，以及 month / year 筛选当前没有后端契约，因此保持 fail-closed，不伪造图表或筛选项。
    </p>
  );

  return (
    <div className="workflow-monitor-surface" data-component="workflow-monitor-surface">
      <WorkflowStudioUtilityFrame
        actions={sharedActions}
        description="当前页面直接把 published invocation、traffic timeline 和 sampled run follow-up 接回 workflow 壳层，方便作者在同一路由里判断真实流量、待跟进事项和最近的运行信号。"
        eyebrow="Workflow monitor"
        metrics={overviewMetrics}
        notice={contractNotice}
        surface="monitor"
        tags={overviewTags}
        title="监测报表"
      >
        <section className="workflow-monitor-summary-grid" data-component="workflow-monitor-summary-workbench">
          {model.focus ? (
            <Card
              className="workflow-monitor-focus-shell"
              data-component="workflow-monitor-focus-card"
              data-selection-source={model.focus.selectionSource}
            >
              <div className="workflow-monitor-card-heading">
                <div>
                  <p className="eyebrow">Fresh focus</p>
                  <h2>Current smoke window</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  monitor 继续沿 API sample handoff 的 binding / invocation / run 聚焦同一扇流量窗口，避免作者回到宽泛 aggregate 后再去猜哪一条才是刚触发的 smoke。
                </p>
              </div>

              <p className="binding-meta">{model.focus.headline}</p>
              <p className="section-copy entry-copy">{model.focus.detail}</p>

              <Descriptions className="workflow-monitor-focus-descriptions" column={1} size="small">
                <Descriptions.Item label="Binding">
                  {model.focus.activeBindingId ?? "n/a"}
                </Descriptions.Item>
                <Descriptions.Item label="Invocation">
                  {model.focus.selectedInvocationId ?? "n/a"}
                </Descriptions.Item>
                <Descriptions.Item label="Run">{model.focus.selectedRunId ?? "n/a"}</Descriptions.Item>
                <Descriptions.Item label="Selection source">
                  {model.focus.selectionSource}
                </Descriptions.Item>
              </Descriptions>

              {model.focus.chips.length ? (
                <div className="tool-badge-row">
                  {model.focus.chips.map((chip) => (
                    <span className="event-chip" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}

              {model.focus.selectionNotice ? (
                <p className="section-copy">{model.focus.selectionNotice}</p>
              ) : null}

              <div className="workflow-monitor-card-actions">
                <Button href={logsHref} type="primary">
                  打开对应日志钻取
                </Button>
                <Button href={workflowEditorHref}>回到编排编辑器</Button>
              </div>
            </Card>
          ) : null}

          <div className="workflow-monitor-summary-rail" data-component="workflow-monitor-primary-rail">
            <Card className="workflow-monitor-report-card" data-component="workflow-monitor-primary-follow-up">
              <div className="workflow-monitor-card-heading">
                <div>
                  <p className="eyebrow">Primary follow-up</p>
                  <h2>Backlog signal</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  优先看当前 workflow 在 publish / invocation 事实上的第一阻塞项，避免只盯单条 run 而忽略共享 backlog。
                </p>
              </div>

              <div className="payload-card compact-card">
                <div className="payload-card-header">
                  <span className="status-meta">Summary focus</span>
                  <Tag color={model.primaryFollowUp.tone === "healthy" ? "success" : "warning"}>
                    {model.primaryFollowUp.tone === "healthy" ? "clear" : "attention"}
                  </Tag>
                </div>
                <p className="binding-meta">{model.primaryFollowUp.headline}</p>
                <p className="section-copy entry-copy">{model.primaryFollowUp.detail}</p>
                <Descriptions className="workflow-monitor-follow-up-descriptions" column={1} size="small">
                  <Descriptions.Item label="Window">{model.timeWindowLabel}</Descriptions.Item>
                  <Descriptions.Item label="Published bindings">
                    {String(model.publishedBindings.length)}
                  </Descriptions.Item>
                </Descriptions>
                {model.primaryFollowUp.href && model.primaryFollowUp.hrefLabel ? (
                  <div className="tool-badge-row">
                    <Link className="event-chip inbox-filter-link" href={model.primaryFollowUp.href}>
                      {model.primaryFollowUp.hrefLabel}
                    </Link>
                  </div>
                ) : null}
              </div>
            </Card>

            {renderMonitorGovernanceNote(summaryFocusGovernanceHandoff, "workflow-monitor-summary-governance")}

            {!model.hasInvocationFacts ? (
              <Card className="workflow-monitor-report-card" data-component="workflow-monitor-no-traffic-state">
                <div className="workflow-monitor-card-heading">
                  <div>
                    <p className="eyebrow">No live traffic yet</p>
                    <h2>还没有 invocation / follow-up 样本</h2>
                  </div>
                  <p className="workflow-studio-utility-inline-copy">
                    {model.focus
                      ? "当前 fresh focus 对应的 binding / window 还没有回读到足够的 invocation facts；先回到日志页确认 sample invocation 是否已经落到 published audit，再回来查看 monitor。"
                      : "当前 workflow 已有 published binding，但监测页暂时还没有足够的调用样本。先从发布治理确认 endpoint 已对外暴露，再到日志页查看第一批 run。"}
                  </p>
                </div>

                <div className="workflow-monitor-card-actions">
                  <Button href={publishHref} type="primary">
                    回到发布治理
                  </Button>
                  <Button href={logsHref}>打开 workflow 日志</Button>
                </div>
              </Card>
            ) : null}
          </div>
        </section>

        {model.hasInvocationFacts ? (
          <section className="workflow-monitor-report-grid" data-component="workflow-monitor-report-grid">
            <Card className="workflow-monitor-report-card" data-component="workflow-monitor-trend-shell">
              <div className="workflow-monitor-card-heading">
                <div>
                  <p className="eyebrow">Traffic trend</p>
                  <h2>Window trend deck</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  先看时间窗里的 aggregate traffic 变化，再决定是否回到日志页或发布治理继续处理具体 follow-up。
                </p>
              </div>

              <section className="workflow-monitor-trend-deck" data-component="workflow-monitor-trend-deck">
                {model.trendCards.map((card) => (
                  <article
                    className={`workspace-panel workflow-monitor-trend-card workflow-monitor-trend-card-${card.tone}`}
                    data-component="workflow-monitor-trend-card"
                    data-trend-key={card.key}
                    key={card.key}
                  >
                    <div className="workflow-monitor-trend-head">
                      <div>
                        <p className="eyebrow">{card.trendLabel}</p>
                        <h3>{card.label}</h3>
                      </div>
                      <strong className="workflow-monitor-trend-value">{card.value}</strong>
                    </div>
                    <p className="section-copy entry-copy">{card.detail}</p>
                    <div className="workflow-monitor-sparkline" aria-hidden="true">
                      {card.series.map((value, index) => {
                        const maxValue = Math.max(...card.series, 1);
                        const height = `${Math.max(12, Math.round((value / maxValue) * 100))}%`;

                        return (
                          <span className="workflow-monitor-sparkline-bar" key={`${card.key}:${index}`}>
                            <span className="workflow-monitor-sparkline-bar-fill" style={{ height }} />
                          </span>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </section>
            </Card>

            <Card className="workflow-monitor-report-card" data-component="workflow-monitor-insights-shell">
              <div className="workflow-monitor-card-heading">
                <div>
                  <p className="eyebrow">Window diagnosis</p>
                  <h2>Insight and follow-up rail</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  把 window summary、traffic mix、waiting follow-up 与 issue signals 放在同一组 rail，方便作者在 monitor 页直接判断下一步去哪儿。
                </p>
              </div>

              <section className="publish-meta-grid workflow-monitor-insight-grid" data-component="workflow-monitor-insight-grid">
                {model.windowSummary ? (
                  <article className="payload-card compact-card" data-component="workflow-monitor-window-summary">
                    <div className="payload-card-header">
                      <span className="status-meta">Window summary</span>
                    </div>
                    <p className="binding-meta">{model.windowSummary.headline}</p>
                    <p className="section-copy entry-copy">{model.windowSummary.detail}</p>
                    {model.windowSummary.chips.length ? (
                      <div className="tool-badge-row">
                        {model.windowSummary.chips.map((chip) => (
                          <span className="event-chip" key={chip}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : null}

                {model.insightsSurface?.trafficMixCard ? (
                  <article className="payload-card compact-card" data-component="workflow-monitor-traffic-mix-card">
                    <div className="payload-card-header">
                      <span className="status-meta">{model.insightsSurface.trafficMixCard.title}</span>
                    </div>
                    <p className="section-copy entry-copy">{model.insightsSurface.trafficMixCard.detail}</p>
                    <dl className="compact-meta-list">
                      {model.insightsSurface.trafficMixCard.rows.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {model.insightsSurface.trafficMixCard.requestSurfaceLabels.length ? (
                      <div className="tool-badge-row">
                        {model.insightsSurface.trafficMixCard.requestSurfaceLabels.map((label) => (
                          <span className="event-chip" key={label}>
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : null}

                {model.insightsSurface?.waitingFollowUpCard ? (
                  <article className="payload-card compact-card" data-component="workflow-monitor-waiting-card">
                    <div className="payload-card-header">
                      <span className="status-meta">{model.insightsSurface.waitingFollowUpCard.title}</span>
                    </div>
                    <p className="section-copy entry-copy">{model.insightsSurface.waitingFollowUpCard.headline}</p>
                    {model.insightsSurface.waitingFollowUpCard.chips.length ? (
                      <p className="binding-meta">{model.insightsSurface.waitingFollowUpCard.chips.join(" · ")}</p>
                    ) : null}
                    <dl className="compact-meta-list">
                      {model.insightsSurface.waitingFollowUpCard.rows.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="section-copy entry-copy">{model.insightsSurface.waitingFollowUpCard.detail}</p>
                    {renderMonitorSelectedNextStep(
                      model.insightsSurface.waitingFollowUpCard.selectedNextStepSurface,
                      "workflow-monitor-waiting-next-step"
                    )}
                    {model.insightsSurface.waitingFollowUpCard.followUpHref &&
                    model.insightsSurface.waitingFollowUpCard.followUpHrefLabel ? (
                      <div className="tool-badge-row">
                        <Link
                          className="event-chip inbox-filter-link"
                          href={model.insightsSurface.waitingFollowUpCard.followUpHref}
                        >
                          {model.insightsSurface.waitingFollowUpCard.followUpHrefLabel}
                        </Link>
                      </div>
                    ) : null}
                  </article>
                ) : null}

                {model.insightsSurface?.issueSignalsSurface ? (
                  <article className="payload-card compact-card" data-component="workflow-monitor-issue-signals-card">
                    <div className="payload-card-header">
                      <span className="status-meta">{model.insightsSurface.issueSignalsSurface.title}</span>
                    </div>
                    <p className="section-copy entry-copy">{model.insightsSurface.issueSignalsSurface.description}</p>
                    {model.insightsSurface.issueSignalsSurface.insight ? (
                      <p className="binding-meta">{model.insightsSurface.issueSignalsSurface.insight}</p>
                    ) : null}
                    {renderMonitorSelectedNextStep(
                      model.insightsSurface.issueSignalsSurface.selectedNextStepSurface,
                      "workflow-monitor-issue-next-step"
                    )}
                    <div className="tool-badge-row">
                      {model.insightsSurface.issueSignalsSurface.chips.map((chip) => (
                        <span className="event-chip" key={chip}>
                          {chip}
                        </span>
                      ))}
                      {model.insightsSurface.issueSignalsSurface.followUpHref &&
                      model.insightsSurface.issueSignalsSurface.followUpHrefLabel ? (
                        <Link
                          className="event-chip inbox-filter-link"
                          href={model.insightsSurface.issueSignalsSurface.followUpHref}
                        >
                          {model.insightsSurface.issueSignalsSurface.followUpHrefLabel}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ) : null}
              </section>
            </Card>
          </section>
        ) : null}

        <Card className="workflow-monitor-report-card" data-component="workflow-monitor-timeline-shell">
          <div className="workflow-monitor-card-heading">
            <div>
              <p className="eyebrow">Traffic timeline</p>
              <h2>Published invocation timeline</h2>
            </div>
            <p className="workflow-studio-utility-inline-copy">
              timeline 保持 aggregate 视角，只回答当前时间窗里有多少流量和信号；具体请求和 run 继续通过日志页与 sample follow-up 下钻。
            </p>
          </div>

          <WorkflowPublishTrafficTimeline
            timeline={model.timeline}
            timelineGranularity={model.timelineGranularity}
            timeWindowLabel={model.timeWindowLabel}
          />
        </Card>

        {model.sampledRunCards.length > 0 ? (
          <Card className="workflow-monitor-report-card" data-component="workflow-monitor-sampled-shell">
            <section data-component="workflow-monitor-sampled-runs">
              <div className="workflow-monitor-card-heading">
                <div>
                  <p className="eyebrow">Sampled follow-up</p>
                  <h2>Recent run follow-up samples</h2>
                </div>
                <p className="workflow-studio-utility-inline-copy">
                  只展示 monitor 当前时间窗里已经回接到 publish invocation 的 sampled run，方便在 workflow 壳层里快速看到 callback waiting、execution focus 和治理缺口。
                </p>
              </div>
              {renderMonitorSampledRunCards(model.sampledRunCards)}
            </section>
          </Card>
        ) : model.hasInvocationFacts ? (
          <Card className="workflow-monitor-report-card" data-component="workflow-monitor-follow-up-empty-state">
            <div className="workflow-monitor-card-heading">
              <div>
                <p className="eyebrow">Follow-up samples</p>
                <h2>当前时间窗还没有 sampled run</h2>
              </div>
              <p className="workflow-studio-utility-inline-copy">
                timeline 已经有 invocation 事实，但当前列表还没有回接到 sampled run 快照；继续到日志页查看 workflow recent runs，可以拿到更细的 execution / evidence 细节。
              </p>
            </div>
            <div className="workflow-monitor-card-actions">
              <Button href={logsHref} type="primary">
                查看 workflow 日志
              </Button>
              <Button href={workflowEditorHref}>回到编排编辑器</Button>
            </div>
          </Card>
        ) : null}
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
