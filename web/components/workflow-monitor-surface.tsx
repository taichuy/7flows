import React from "react";
import Link from "next/link";

import { OperatorRunSampleCardList } from "@/components/operator-run-sample-card-list";
import {
  WorkflowStudioUtilityEmptyState,
  WorkflowStudioUtilityFrame,
  type WorkflowStudioUtilityAction,
  type WorkflowStudioUtilityMetric,
  type WorkflowStudioUtilityTag,
} from "@/components/workflow-studio-utility-frame";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import { WorkflowPublishSelectedNextStepCard } from "@/components/workflow-publish-selected-next-step-card";
import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import type {
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem,
} from "@/lib/get-workflow-publish";
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

  return (
    <div className="workflow-monitor-surface" data-component="workflow-monitor-surface">
      <WorkflowStudioUtilityFrame
        actions={sharedActions}
        description="当前页面直接把 published invocation、traffic timeline 和 sampled run follow-up 接回 workflow 壳层，方便作者在同一路由里判断真实流量、待跟进事项和最近的运行信号。"
        eyebrow="Workflow monitor"
        metrics={overviewMetrics}
        surface="monitor"
        tags={overviewTags}
        title="监测报表"
      >
        {model.focus ? (
          <article
            className="diagnostic-panel"
            data-component="workflow-monitor-focus-card"
            data-selection-source={model.focus.selectionSource}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Fresh focus</p>
                <h2>Current smoke window</h2>
              </div>
              <p className="section-copy">
                monitor 继续沿 API sample handoff 的 binding / invocation / run 聚焦同一扇流量窗口，避免作者回到宽泛 aggregate 后再去猜哪一条才是刚触发的 smoke。
              </p>
            </div>
            <p className="binding-meta">{model.focus.headline}</p>
            <p className="section-copy entry-copy">{model.focus.detail}</p>
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
            <div className="section-actions">
              <Link className="activity-link" href={logsHref}>
                打开对应日志钻取
              </Link>
              <Link className="inline-link secondary" href={workflowEditorHref}>
                回到编排编辑器
              </Link>
            </div>
          </article>
        ) : null}

        <section className="workflow-studio-surface workflow-studio-surface-utility" data-surface="monitor">
          <article className="diagnostic-panel" data-component="workflow-monitor-primary-follow-up">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Primary follow-up</p>
                <h2>Backlog signal</h2>
              </div>
              <p className="section-copy">
                优先看当前 workflow 在 publish / invocation 事实上的第一阻塞项，避免只盯单条 run
                而忽略共享 backlog。
              </p>
            </div>
            <div className="payload-card compact-card">
              <div className="payload-card-header">
                <span className="status-meta">Summary focus</span>
                <span
                  className={`health-pill ${
                    model.primaryFollowUp.tone === "healthy" ? "healthy" : "pending"
                  }`}
                >
                  {model.primaryFollowUp.tone === "healthy" ? "clear" : "attention"}
                </span>
              </div>
              <p className="binding-meta">{model.primaryFollowUp.headline}</p>
              <p className="section-copy entry-copy">{model.primaryFollowUp.detail}</p>
              {model.primaryFollowUp.href && model.primaryFollowUp.hrefLabel ? (
                <div className="tool-badge-row">
                  <Link className="event-chip inbox-filter-link" href={model.primaryFollowUp.href}>
                    {model.primaryFollowUp.hrefLabel}
                  </Link>
                </div>
              ) : null}
            </div>
          </article>

          {summaryFocusGovernanceHandoff ? (
            <WorkflowGovernanceHandoffCards
              workflowCatalogGapSummary={summaryFocusGovernanceHandoff.workflowCatalogGapSummary}
              workflowCatalogGapDetail={summaryFocusGovernanceHandoff.workflowCatalogGapDetail}
              workflowCatalogGapHref={summaryFocusGovernanceHandoff.workflowCatalogGapHref}
              workflowGovernanceHref={summaryFocusGovernanceHandoff.workflowGovernanceHref}
              legacyAuthHandoff={summaryFocusGovernanceHandoff.legacyAuthHandoff}
            />
          ) : null}

          {!model.hasInvocationFacts ? (
            <article className="diagnostic-panel" data-component="workflow-monitor-no-traffic-state">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">No live traffic yet</p>
                  <h2>还没有 invocation / follow-up 样本</h2>
                </div>
                <p className="section-copy">
                  {model.focus
                    ? "当前 fresh focus 对应的 binding / window 还没有回读到足够的 invocation facts；先回到日志页确认 sample invocation 是否已经落到 published audit，再回来查看 monitor。"
                    : "当前 workflow 已有 published binding，但监测页暂时还没有足够的调用样本。先从发布治理确认 endpoint 已对外暴露，再到日志页查看第一批 run。"}
                </p>
              </div>
              <div className="section-actions">
                <Link className="activity-link" href={publishHref}>
                  回到发布治理
                </Link>
                <Link className="inline-link secondary" href={logsHref}>
                  打开 workflow 日志
                </Link>
              </div>
            </article>
          ) : null}

          {model.hasInvocationFacts ? (
            <section className="workflow-monitor-trend-deck" data-component="workflow-monitor-trend-deck">
              {model.trendCards.map((card) => {
                const seriesMax = card.series.reduce((max, value) => Math.max(max, value), 0);

                return (
                  <article
                    className={`workspace-panel workflow-monitor-trend-card workflow-monitor-trend-card-${card.tone}`}
                    data-component="workflow-monitor-trend-card"
                    data-trend-key={card.key}
                    key={card.key}
                  >
                    <div className="workflow-monitor-trend-head">
                      <div>
                        <p className="workflow-studio-placeholder-eyebrow">Workflow trend</p>
                        <h3>{card.label}</h3>
                      </div>
                      <strong className="workflow-monitor-trend-value">{card.value}</strong>
                    </div>
                    {card.series.length ? (
                      <div className="workflow-monitor-sparkline" aria-hidden="true">
                        {card.series.map((value, index) => {
                          const height =
                            seriesMax > 0
                              ? Math.max((value / seriesMax) * 100, value > 0 ? 14 : 6)
                              : 6;

                          return (
                            <span className="workflow-monitor-sparkline-bar" key={`${card.key}:${index}`}>
                              <span
                                className="workflow-monitor-sparkline-bar-fill"
                                style={{ height: `${height}%` }}
                              />
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="empty-state compact">当前还没有足够的时间桶样本。</p>
                    )}
                    <p className="binding-meta">{card.detail}</p>
                    <p className="section-copy entry-copy">{card.trendLabel}</p>
                  </article>
                );
              })}
            </section>
          ) : null}

          {model.hasInvocationFacts && (model.windowSummary || model.insightsSurface) ? (
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
                  <p className="section-copy entry-copy">
                    {model.insightsSurface.trafficMixCard.detail}
                  </p>
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
                  <p className="binding-meta">{model.insightsSurface.waitingFollowUpCard.headline}</p>
                  <p className="section-copy entry-copy">{model.insightsSurface.waitingFollowUpCard.detail}</p>
                  <dl className="compact-meta-list">
                    {model.insightsSurface.waitingFollowUpCard.rows.map((row) => (
                      <div key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {model.insightsSurface.waitingFollowUpCard.chips.length ? (
                    <div className="tool-badge-row">
                      {model.insightsSurface.waitingFollowUpCard.chips.map((chip) => (
                        <span className="event-chip" key={chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {model.insightsSurface.waitingFollowUpCard.selectedNextStepSurface ? (
                    <WorkflowPublishSelectedNextStepCard
                      surface={model.insightsSurface.waitingFollowUpCard.selectedNextStepSurface}
                      showTitle={false}
                    />
                  ) : null}
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
                  <p className="section-copy entry-copy">
                    {model.insightsSurface.issueSignalsSurface.description}
                  </p>
                  {model.insightsSurface.issueSignalsSurface.insight ? (
                    <p className="binding-meta">{model.insightsSurface.issueSignalsSurface.insight}</p>
                  ) : null}
                  {model.insightsSurface.issueSignalsSurface.selectedNextStepSurface ? (
                    <WorkflowPublishSelectedNextStepCard
                      surface={model.insightsSurface.issueSignalsSurface.selectedNextStepSurface}
                      showTitle={false}
                    />
                  ) : null}
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
          ) : null}

          <WorkflowPublishTrafficTimeline
            timeline={model.timeline}
            timelineGranularity={model.timelineGranularity}
            timeWindowLabel={model.timeWindowLabel}
          />

          {model.sampledRunCards.length > 0 ? (
            <section className="diagnostic-panel" data-component="workflow-monitor-sampled-runs">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Sampled follow-up</p>
                  <h2>Recent run follow-up samples</h2>
                </div>
                <p className="section-copy">
                  只展示 monitor 当前时间窗里已经回接到 publish invocation 的 sampled run，方便在 workflow 壳层里快速看到 callback waiting、execution focus 和治理缺口。
                </p>
              </div>
              <OperatorRunSampleCardList
                cards={model.sampledRunCards}
                currentHref={currentHref}
                resolveRunDetailHref={buildRunDetailHref}
                skillTraceDescription={`workflow ${workflowId} monitor sample 继续复用 canonical skill trace。`}
              />
            </section>
          ) : model.hasInvocationFacts ? (
            <article className="diagnostic-panel" data-component="workflow-monitor-follow-up-empty-state">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Follow-up samples</p>
                  <h2>当前时间窗还没有 sampled run</h2>
                </div>
                <p className="section-copy">
                  timeline 已经有 invocation 事实，但当前列表还没有回接到 sampled run 快照；继续到日志页查看 workflow recent runs，可以拿到更细的 execution / evidence 细节。
                </p>
              </div>
              <div className="section-actions">
                <Link className="activity-link" href={logsHref}>
                  查看 workflow 日志
                </Link>
                <Link className="inline-link secondary" href={workflowEditorHref}>
                  回到编排编辑器
                </Link>
              </div>
            </article>
          ) : null}
        </section>
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
