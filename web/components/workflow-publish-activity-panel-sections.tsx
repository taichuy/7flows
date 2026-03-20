import React from "react";
import Link from "next/link";

import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import { WorkflowPublishInvocationDetailPanel } from "@/components/workflow-publish-invocation-detail-panel";
import { WorkflowPublishInvocationEntryCard } from "@/components/workflow-publish-invocation-entry-card";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListResponse
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationInboxHref,
  buildPublishedInvocationRecommendedNextStep,
  buildPublishedInvocationWaitingOverview,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  formatRateLimitPressure,
  listPublishedInvocationRunFollowUpSampleViews
} from "@/lib/published-invocation-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { hasExecutionNodeCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import { formatExecutionFocusFollowUp } from "@/lib/run-execution-focus-presenters";
import {
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxBlockedClasses
} from "@/lib/sandbox-readiness-presenters";

import { facetCount, formatTimeWindowLabel } from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";

type WorkflowPublishActivityInsightsProps = {
  binding: WorkflowPublishActivityPanelProps["binding"];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  activeTimeWindow: WorkflowPublishActivityPanelProps["activeInvocationFilter"] extends infer T
    ? T extends { timeWindow: infer U }
      ? U | null
      : never
    : never;
};

function buildRateLimitWindowInsight({
  pressure,
  remainingQuota,
  windowRejected,
  failedCount,
  activeTimeWindow
}: {
  pressure: ReturnType<typeof formatRateLimitPressure> | null;
  remainingQuota: number | null;
  windowRejected: number;
  failedCount: number;
  activeTimeWindow: WorkflowPublishActivityInsightsProps["activeTimeWindow"];
}) {
  if (!pressure || remainingQuota === null) {
    return null;
  }

  if (windowRejected > 0) {
    return `当前窗口已经出现 ${windowRejected} 次限流拒绝；如果失败面板同时看到 runtime failed，先把 quota hit 与执行链路异常拆开排查。`;
  }

  if (pressure.percentage >= 80) {
    return `当前 ${formatTimeWindowLabel(activeTimeWindow ?? "all")} 切片里已用掉 ${pressure.label} 配额，只剩 ${remainingQuota} 次；继续放量前先观察是否开始转成 rate_limit_exceeded。`;
  }

  if (failedCount > 0) {
    return `当前窗口还剩 ${remainingQuota} 次配额，说明这段时间里的 failed 更可能来自运行时、鉴权或协议边界，而不是 rate limit 本身。`;
  }

  return `当前窗口还剩 ${remainingQuota} 次配额，rate limit 现在还不是这条 binding 的主阻塞面。`;
}

function buildFailureReasonInsight({
  reasonCounts,
  failureReasons,
  sandboxReadiness
}: {
  reasonCounts: NonNullable<PublishedEndpointInvocationListResponse>["facets"]["reason_counts"];
  failureReasons: NonNullable<PublishedEndpointInvocationListResponse>["facets"]["recent_failure_reasons"];
  sandboxReadiness?: SandboxReadinessCheck | null;
}) {
  const runtimeFailedCount = facetCount(reasonCounts, "runtime_failed");
  const rateLimitExceededCount = facetCount(reasonCounts, "rate_limit_exceeded");
  const authRejectedCount =
    facetCount(reasonCounts, "api_key_invalid") + facetCount(reasonCounts, "api_key_required");

  if (runtimeFailedCount > 0) {
    if (sandboxReadiness) {
      const readinessHeadline = formatSandboxReadinessHeadline(sandboxReadiness);
      const readinessDetail = formatSandboxReadinessDetail(sandboxReadiness);
      const hasLiveReadinessPressure =
        listSandboxBlockedClasses(sandboxReadiness).length > 0 ||
        sandboxReadiness.offline_backend_count > 0 ||
        sandboxReadiness.degraded_backend_count > 0;

      return hasLiveReadinessPressure
        ? `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；结合 live sandbox readiness：${readinessHeadline}${readinessDetail ? ` ${readinessDetail}` : ""}，要优先判断是不是强隔离 backend / capability 仍 blocked。`
        : `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；live sandbox readiness 现在没有继续报警，失败更可能来自 run 当时的 backend 健康度、节点配置或协议转换。`;
    }

    return `当前 reason code 里已有 ${runtimeFailedCount} 条 Runtime failed；需要继续结合 run diagnostics 区分执行链路、节点配置和协议转换问题。`;
  }

  if (rateLimitExceededCount > 0) {
    return `当前 reason code 里已有 ${rateLimitExceededCount} 条 Rate limit exceeded；优先对照上面的 rate limit window，而不是把拒绝误当成 runtime 故障。`;
  }

  if (authRejectedCount > 0) {
    return `当前拒绝更集中在 API key / auth 边界，先检查 key 轮换、binding 暴露方式与调用方鉴权，再回头看执行层。`;
  }

  const latestFailure = failureReasons[0]?.message?.trim();
  if (latestFailure) {
    return `最近失败明细集中在：${latestFailure}`;
  }

  return null;
}

function buildFailureReasonCardDiagnosis({
  message,
  reasonCounts,
  sandboxReadiness
}: {
  message: string;
  reasonCounts: NonNullable<PublishedEndpointInvocationListResponse>["facets"]["reason_counts"];
  sandboxReadiness?: SandboxReadinessCheck | null;
}) {
  const normalizedMessage = message.toLowerCase();
  const runtimeFailedCount = facetCount(reasonCounts, "runtime_failed");
  const rateLimitExceededCount = facetCount(reasonCounts, "rate_limit_exceeded");
  const authRejectedCount =
    facetCount(reasonCounts, "api_key_invalid") + facetCount(reasonCounts, "api_key_required");
  const mentionsQuota =
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("429");
  const mentionsAuth =
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("unauthor") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("auth");
  const mentionsSandbox =
    normalizedMessage.includes("sandbox") ||
    normalizedMessage.includes("microvm") ||
    normalizedMessage.includes("execution class") ||
    normalizedMessage.includes("backend offline") ||
    normalizedMessage.includes("tool execution");

  if (mentionsSandbox || runtimeFailedCount > 0) {
    if (!sandboxReadiness) {
      return {
        headline: "这条 failure 很可能落在执行链路或强隔离能力上。",
        detail: "继续结合 invocation detail / run diagnostics 查看 execution focus，区分 live blockage 与历史故障。"
      };
    }

    const hasLiveReadinessPressure =
      listSandboxBlockedClasses(sandboxReadiness).length > 0 ||
      sandboxReadiness.offline_backend_count > 0 ||
      sandboxReadiness.degraded_backend_count > 0;
    const readinessHeadline = formatSandboxReadinessHeadline(sandboxReadiness);
    const readinessDetail = formatSandboxReadinessDetail(sandboxReadiness);

    return hasLiveReadinessPressure
      ? {
          headline: "当前 live sandbox readiness 仍在报警。",
          detail: `${readinessHeadline}${readinessDetail ? ` ${readinessDetail}` : ""} 这说明这条 failure 不能只按历史 message 处理，先确认强隔离 backend / capability 是否仍 blocked。`
        }
      : {
          headline: "当前 live sandbox readiness 已恢复。",
          detail:
            "这更像 run 当时的 backend 健康度、definition capability 不匹配或协议转换历史故障；继续看 invocation detail / run diagnostics 的 execution focus。"
        };
  }

  if (mentionsQuota || rateLimitExceededCount > 0) {
    return {
      headline: "这条 failure 更像 quota / rate limit 侧信号。",
      detail:
        runtimeFailedCount > 0
          ? "先看上面的 rate limit window，再把 quota hit 与 execution/runtime failed 拆成两条链路排查，避免误把拒绝当成执行链路故障。"
          : "优先回看上面的 rate limit window，而不是直接把这条 message 当成 runtime 故障。"
    };
  }

  if (mentionsAuth || authRejectedCount > 0) {
    return {
      headline: "这条 failure 更像鉴权 / API key 边界问题。",
      detail: "先检查调用方 key 是否过期、binding 暴露方式是否匹配，再决定是否继续深挖执行链路。"
    };
  }

  return null;
}

export function WorkflowPublishActivityInsights({
  binding,
  invocationAudit,
  rateLimitWindowAudit,
  sandboxReadiness,
  activeTimeWindow
}: WorkflowPublishActivityInsightsProps) {
  const summary = invocationAudit?.summary;
  const requestSourceCounts = invocationAudit?.facets.request_source_counts ?? [];
  const requestSurfaceCounts = invocationAudit?.facets.request_surface_counts ?? [];
  const cacheStatusCounts = invocationAudit?.facets.cache_status_counts ?? [];
  const runStatusCounts = invocationAudit?.facets.run_status_counts ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const rateLimitPolicy = binding.rate_limit_policy;
  const waitingOverview = buildPublishedInvocationWaitingOverview({
    summary,
    runStatusCounts,
    reasonCounts
  });
  const windowUsed = rateLimitWindowAudit
    ? rateLimitWindowAudit.summary.succeeded_count + rateLimitWindowAudit.summary.failed_count
    : 0;
  const windowRejected = rateLimitWindowAudit?.summary.rejected_count ?? 0;
  const remainingQuota = rateLimitPolicy ? Math.max(rateLimitPolicy.requests - windowUsed, 0) : null;
  const pressure = rateLimitPolicy ? formatRateLimitPressure(rateLimitPolicy.requests, windowUsed) : null;
  const rateLimitWindowInsight = buildRateLimitWindowInsight({
    pressure,
    remainingQuota,
    windowRejected,
    failedCount: summary?.failed_count ?? 0,
    activeTimeWindow
  });
  const failureReasonInsight = buildFailureReasonInsight({
    reasonCounts,
    failureReasons: invocationAudit?.facets.recent_failure_reasons ?? [],
    sandboxReadiness
  });

  return (
    <>
      <div className="publish-summary-grid">
        <article className="status-card compact-card">
          <span className="status-label">Total calls</span>
          <strong>{summary?.total_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Succeeded</span>
          <strong>{summary?.succeeded_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Failed</span>
          <strong>{summary?.failed_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Rejected</span>
          <strong>{summary?.rejected_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Last run status</span>
          <strong>{summary?.last_run_status ?? "n/a"}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Waiting now</span>
          <strong>{waitingOverview.activeWaitingCount}</strong>
        </article>
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Traffic mix</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Workflow</dt>
              <dd>{facetCount(requestSourceCounts, "workflow")}</dd>
            </div>
            <div>
              <dt>Alias</dt>
              <dd>{facetCount(requestSourceCounts, "alias")}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{facetCount(requestSourceCounts, "path")}</dd>
            </div>
            <div>
              <dt>Cache surface</dt>
              <dd>
                hit {facetCount(cacheStatusCounts, "hit")} / miss {facetCount(cacheStatusCounts, "miss")} /
                bypass {facetCount(cacheStatusCounts, "bypass")}
              </dd>
            </div>
            <div>
              <dt>Run states</dt>
              <dd>
                {runStatusCounts.length
                  ? runStatusCounts
                      .map((item) => `${formatPublishedRunStatusLabel(item.value)} ${item.count}`)
                      .join(" / ")
                  : "n/a"}
              </dd>
            </div>
          </dl>
          {requestSurfaceCounts.length ? (
            <div className="tool-badge-row">
              {requestSurfaceCounts.map((item) => (
                <span className="event-chip" key={item.value}>
                  {formatPublishedInvocationSurfaceLabel(item.value)} {item.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Waiting follow-up</span>
          </div>
          <p className="section-copy entry-copy">{waitingOverview.headline}</p>
          {waitingOverview.chips.length ? (
            <p className="binding-meta">{waitingOverview.chips.join(" · ")}</p>
          ) : null}
          <dl className="compact-meta-list">
            <div>
              <dt>Active waiting</dt>
              <dd>{waitingOverview.activeWaitingCount}</dd>
            </div>
            <div>
              <dt>Callback waits</dt>
              <dd>{waitingOverview.callbackWaitingCount}</dd>
            </div>
            <div>
              <dt>Approval/input waits</dt>
              <dd>{waitingOverview.waitingInputCount}</dd>
            </div>
            <div>
              <dt>Generic waits</dt>
              <dd>{waitingOverview.generalWaitingCount}</dd>
            </div>
            <div>
              <dt>Sync waiting rejected</dt>
              <dd>{waitingOverview.syncWaitingRejectedCount}</dd>
            </div>
            <div>
              <dt>Latest run status</dt>
              <dd>{waitingOverview.lastRunStatusLabel ?? "n/a"}</dd>
            </div>
          </dl>
          <p className="section-copy entry-copy">{waitingOverview.detail}</p>
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Rate limit window</span>
          </div>
          {rateLimitPolicy ? (
            <>
              <dl className="compact-meta-list">
                <div>
                  <dt>Policy</dt>
                  <dd>
                    {rateLimitPolicy.requests} / {rateLimitPolicy.windowSeconds}s
                  </dd>
                </div>
                <div>
                  <dt>Used</dt>
                  <dd>{windowUsed}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{remainingQuota}</dd>
                </div>
                <div>
                  <dt>Pressure</dt>
                  <dd>{pressure?.label ?? "0%"}</dd>
                </div>
                <div>
                  <dt>Rejected</dt>
                  <dd>{windowRejected}</dd>
                </div>
              </dl>
              <p className="section-copy entry-copy">
                当前窗口从 {formatTimestamp(rateLimitWindowAudit?.filters.created_from ?? null)} 开始统计成功和失败调用，
                `rejected` 仅作为治理信号，不占配额。
              </p>
              {rateLimitWindowInsight ? (
                <p className="section-copy entry-copy">{rateLimitWindowInsight}</p>
              ) : null}
            </>
          ) : (
            <p className="empty-state compact">当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。</p>
          )}
        </div>
      </div>

      <WorkflowPublishTrafficTimeline
        timeline={timeline}
        timelineGranularity={timelineGranularity}
        timeWindowLabel={formatTimeWindowLabel(activeTimeWindow ?? "all")}
      />

      {reasonCounts.length ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Issue signals</p>
          <p className="section-copy entry-copy">
            将 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。
          </p>
          {failureReasonInsight ? (
            <p className="section-copy entry-copy">{failureReasonInsight}</p>
          ) : null}
          <div className="tool-badge-row">
            {reasonCounts.map((item) => (
              <span className="event-chip" key={item.value}>
                {formatPublishedInvocationReasonLabel(item.value)} {item.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

type WorkflowPublishActivityDetailsProps = {
  tools: PluginToolRegistryItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  buildInvocationDetailHref: (invocationId: string) => string;
  clearInvocationDetailHref: string | null;
};

export function WorkflowPublishActivityDetails({
  tools,
  invocationAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  callbackWaitingAutomation,
  sandboxReadiness,
  buildInvocationDetailHref,
  clearInvocationDetailHref
}: WorkflowPublishActivityDetailsProps) {
  const items = invocationAudit?.items ?? [];
  const apiKeyUsage = invocationAudit?.facets.api_key_usage ?? [];
  const failureReasons = invocationAudit?.facets.recent_failure_reasons ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const selectedInvocationDrilldown =
    selectedInvocationDetail?.kind === "ok"
      ? (() => {
          const detail = selectedInvocationDetail.data;
          const samples = listPublishedInvocationRunFollowUpSampleViews(detail.run_follow_up ?? null);
          const sharedCallbackWaitingExplanations = samples
            .filter((sample) => sample.has_callback_waiting_summary)
            .map((sample) => sample.run_snapshot.callbackWaitingExplanation);
          const canonicalFollowUp = buildPublishedInvocationCanonicalFollowUpCopy({
            explanation: detail.run_follow_up?.explanation ?? null,
            sharedCallbackWaitingExplanations,
            fallbackHeadline: "当前 invocation 已接入 canonical follow-up 事实链。"
          });
          const executionFocusFollowUp =
            detail.execution_focus_explanation?.follow_up ??
            (detail.execution_focus_node &&
            !hasExecutionNodeCallbackWaitingSummaryFacts(detail.execution_focus_node)
              ? formatExecutionFocusFollowUp(detail.execution_focus_node)
              : null);

          return buildPublishedInvocationRecommendedNextStep({
            runId: detail.run?.id ?? detail.invocation.run_id ?? null,
            canonicalFollowUp,
            callbackWaitingFollowUp: detail.callback_waiting_explanation?.follow_up ?? null,
            executionFocusFollowUp,
            blockingInboxHref: buildBlockingPublishedInvocationInboxHref({
              runId: detail.run?.id ?? detail.invocation.run_id ?? null,
              blockingNodeRunId: detail.blocking_node_run_id,
              blockingSensitiveAccessEntries: detail.blocking_sensitive_access_entries
            }),
            approvalInboxHref: buildPublishedInvocationInboxHref({
              invocation: detail.invocation,
              callbackTickets: detail.callback_tickets,
              sensitiveAccessEntries: detail.sensitive_access_entries
            })
          });
        })()
      : null;

  return (
    <>
      {apiKeyUsage.length ? (
        <div className="publish-cache-list">
          {apiKeyUsage.map((item) => (
            <article className="payload-card compact-card" key={item.api_key_id}>
              <div className="payload-card-header">
                <span className="status-meta">{item.name ?? item.api_key_id}</span>
                <span className="event-chip">{item.key_prefix ?? "no-prefix"}</span>
              </div>
              <dl className="compact-meta-list">
                <div>
                  <dt>Calls</dt>
                  <dd>{item.invocation_count}</dd>
                </div>
                <div>
                  <dt>Status mix</dt>
                  <dd>
                    ok {item.succeeded_count} / failed {item.failed_count} / rejected {item.rejected_count}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{item.last_status ?? item.status ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{formatTimestamp(item.last_invoked_at)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      {failureReasons.length ? (
        <div className="publish-cache-list">
          {failureReasons.map((item) => {
            const diagnosis = buildFailureReasonCardDiagnosis({
              message: item.message,
              reasonCounts,
              sandboxReadiness
            });

            return (
              <article className="payload-card compact-card" key={item.message}>
                <div className="payload-card-header">
                  <span className="status-meta">Failure reason</span>
                  <span className="event-chip">count {item.count}</span>
                </div>
                <p className="binding-meta">{item.message}</p>
                {diagnosis ? (
                  <>
                    <p className="section-copy entry-copy">{diagnosis.headline}</p>
                    <p className="binding-meta">{diagnosis.detail}</p>
                  </>
                ) : null}
                <p className="section-copy entry-copy">最近一次出现在 {formatTimestamp(item.last_invoked_at)}。</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {selectedInvocationId && selectedInvocationDetail?.kind === "ok" && selectedInvocationDrilldown ? (
        <article className="entry-card compact-card">
          <div className="payload-card-header">
            <div>
              <p className="entry-card-title">Selected invocation next step</p>
              <p className="binding-meta">{selectedInvocationId}</p>
            </div>
            <span className="event-chip">{selectedInvocationDrilldown.label}</span>
          </div>
          <p className="section-copy entry-copy">{selectedInvocationDrilldown.detail}</p>
          {selectedInvocationDrilldown.href && selectedInvocationDrilldown.href_label ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={selectedInvocationDrilldown.href}>
                {selectedInvocationDrilldown.href_label}
              </Link>
            </div>
          ) : null}
        </article>
      ) : null}

      {items.length ? (
        <>
          {selectedInvocationId && clearInvocationDetailHref ? (
            selectedInvocationDetail?.kind === "ok" ? (
              <WorkflowPublishInvocationDetailPanel
                clearHref={clearInvocationDetailHref}
                detail={selectedInvocationDetail.data}
                tools={tools}
                callbackWaitingAutomation={callbackWaitingAutomation}
                sandboxReadiness={sandboxReadiness}
              />
            ) : selectedInvocationDetail?.kind === "blocked" ? (
              <SensitiveAccessBlockedCard
                clearHref={clearInvocationDetailHref}
                payload={selectedInvocationDetail.payload}
                summary="当前 invocation detail 已被纳入统一敏感访问控制；可先查看审批票据和关联 run，再决定是否继续申请明细查看。"
                title="Invocation detail access blocked"
              />
            ) : (
              <article className="entry-card compact-card">
                <div className="payload-card-header">
                  <div>
                    <p className="entry-card-title">Invocation detail unavailable</p>
                    <p className="binding-meta">当前未能拉取该 invocation 的详情 payload。</p>
                  </div>
                </div>
                <p className="section-copy entry-copy">
                  审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。
                </p>
              </article>
            )
          ) : null}
          <div className="publish-cache-list">
            {items.map((item) => (
              <WorkflowPublishInvocationEntryCard
                detailActive={selectedInvocationId === item.id}
                detailHref={buildInvocationDetailHref(item.id)}
                item={item}
                sandboxReadiness={sandboxReadiness}
                key={item.id}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="empty-state compact">当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。</p>
      )}
    </>
  );
}
