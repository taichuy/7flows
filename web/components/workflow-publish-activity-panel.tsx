import Link from "next/link";

import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";
import {
  PUBLISHED_INVOCATION_CACHE_STATUSES,
  PUBLISHED_INVOCATION_REASON_CODES,
  PUBLISHED_INVOCATION_REQUEST_SURFACES,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatRateLimitPressure
} from "@/lib/published-invocation-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishActivityPanelProps = {
  workflowId: string;
  binding: WorkflowPublishedEndpointItem;
  apiKeys: PublishedEndpointApiKeyItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter | null;
};

const TIME_WINDOW_OPTIONS = [
  { value: "all", label: "全部时间" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
] as const;

function facetCount(
  facets: PublishedEndpointInvocationFacetItem[] | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}

function formatTimeWindowLabel(value: "24h" | "7d" | "30d" | "all") {
  return (
    TIME_WINDOW_OPTIONS.find((option) => option.value === value)?.label ?? "全部时间"
  );
}

function buildActiveFilterChips(
  activeInvocationFilter: WorkflowPublishActivityPanelProps["activeInvocationFilter"],
  apiKeys: PublishedEndpointApiKeyItem[]
) {
  if (!activeInvocationFilter) {
    return [];
  }

  const chips: string[] = [];
  if (activeInvocationFilter.status) {
    chips.push(`status ${activeInvocationFilter.status}`);
  }
  if (activeInvocationFilter.requestSource) {
    chips.push(`source ${activeInvocationFilter.requestSource}`);
  }
  if (activeInvocationFilter.requestSurface) {
    chips.push(formatPublishedInvocationSurfaceLabel(activeInvocationFilter.requestSurface));
  }
  if (activeInvocationFilter.cacheStatus) {
    chips.push(formatPublishedInvocationCacheStatusLabel(activeInvocationFilter.cacheStatus));
  }
  if (activeInvocationFilter.reasonCode) {
    chips.push(formatPublishedInvocationReasonLabel(activeInvocationFilter.reasonCode));
  }
  if (activeInvocationFilter.apiKeyId) {
    const apiKey = apiKeys.find((item) => item.id === activeInvocationFilter.apiKeyId);
    chips.push(`key ${apiKey?.name ?? apiKey?.key_prefix ?? activeInvocationFilter.apiKeyId}`);
  }
  if (activeInvocationFilter.timeWindow !== "all") {
    chips.push(formatTimeWindowLabel(activeInvocationFilter.timeWindow));
  }
  return chips;
}

export function WorkflowPublishActivityPanel({
  workflowId,
  binding,
  apiKeys,
  invocationAudit,
  rateLimitWindowAudit,
  activeInvocationFilter
}: WorkflowPublishActivityPanelProps) {
  const summary = invocationAudit?.summary;
  const items = invocationAudit?.items ?? [];
  const requestSourceCounts = invocationAudit?.facets.request_source_counts ?? [];
  const requestSurfaceCounts = invocationAudit?.facets.request_surface_counts ?? [];
  const cacheStatusCounts = invocationAudit?.facets.cache_status_counts ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const apiKeyUsage = invocationAudit?.facets.api_key_usage ?? [];
  const failureReasons = invocationAudit?.facets.recent_failure_reasons ?? [];
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const rateLimitPolicy = binding.rate_limit_policy;
  const windowUsed = rateLimitWindowAudit
    ? rateLimitWindowAudit.summary.succeeded_count +
      rateLimitWindowAudit.summary.failed_count
    : 0;
  const windowRejected = rateLimitWindowAudit?.summary.rejected_count ?? 0;
  const remainingQuota = rateLimitPolicy
    ? Math.max(rateLimitPolicy.requests - windowUsed, 0)
    : null;
  const pressure = rateLimitPolicy
    ? formatRateLimitPressure(rateLimitPolicy.requests, windowUsed)
    : null;
  const activeFilterChips = buildActiveFilterChips(activeInvocationFilter, apiKeys);
  const formAction = `/workflows/${workflowId}`;

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">Invocation governance</p>
      <p className="section-copy entry-copy">
        这里消费独立的 published invocation audit，用于回答“谁在调、有没有被限流、最近失败因为什么”。
      </p>

      <form action={formAction} className="trace-filter-form governance-filter-form" method="get">
        <input type="hidden" name="publish_binding" value={binding.id} />

        <label className="binding-field">
          <span className="binding-label">Status</span>
          <select
            className="binding-select"
            name="publish_status"
            defaultValue={activeInvocationFilter?.status ?? ""}
          >
            <option value="">全部状态</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
            <option value="rejected">rejected</option>
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">Request source</span>
          <select
            className="binding-select"
            name="publish_request_source"
            defaultValue={activeInvocationFilter?.requestSource ?? ""}
          >
            <option value="">全部入口</option>
            <option value="workflow">workflow</option>
            <option value="alias">alias</option>
            <option value="path">path</option>
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">Request surface</span>
          <select
            className="binding-select"
            name="publish_request_surface"
            defaultValue={activeInvocationFilter?.requestSurface ?? ""}
          >
            <option value="">全部协议面</option>
            {PUBLISHED_INVOCATION_REQUEST_SURFACES.map((requestSurface) => (
              <option key={requestSurface} value={requestSurface}>
                {formatPublishedInvocationSurfaceLabel(requestSurface)}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">Cache status</span>
          <select
            className="binding-select"
            name="publish_cache_status"
            defaultValue={activeInvocationFilter?.cacheStatus ?? ""}
          >
            <option value="">全部缓存状态</option>
            {PUBLISHED_INVOCATION_CACHE_STATUSES.map((cacheStatus) => (
              <option key={cacheStatus} value={cacheStatus}>
                {formatPublishedInvocationCacheStatusLabel(cacheStatus)}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">Reason code</span>
          <select
            className="binding-select"
            name="publish_reason_code"
            defaultValue={activeInvocationFilter?.reasonCode ?? ""}
          >
            <option value="">全部问题</option>
            {PUBLISHED_INVOCATION_REASON_CODES.map((reasonCode) => (
              <option key={reasonCode} value={reasonCode}>
                {formatPublishedInvocationReasonLabel(reasonCode)}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">API key</span>
          <select
            className="binding-select"
            name="publish_api_key_id"
            defaultValue={activeInvocationFilter?.apiKeyId ?? ""}
          >
            <option value="">全部 key</option>
            {apiKeys.map((apiKey) => (
              <option key={apiKey.id} value={apiKey.id}>
                {apiKey.name} · {apiKey.key_prefix}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field trace-field-span">
          <span className="binding-label">Time window</span>
          <select
            className="binding-select"
            name="publish_window"
            defaultValue={activeInvocationFilter?.timeWindow ?? "all"}
          >
            {TIME_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="trace-filter-actions trace-field-span">
          <button className="sync-button" type="submit">
            应用治理过滤
          </button>
          <Link className="inline-link" href={formAction}>
            重置过滤
          </Link>
        </div>
      </form>

      {activeFilterChips.length ? (
        <div className="trace-active-filter-row">
          {activeFilterChips.map((chip) => (
            <span className="event-chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Total calls</span>
          <strong>{summary?.total_count ?? 0}</strong>
        </article>
        <article className="summary-card">
          <span>Rejected</span>
          <strong>{summary?.rejected_count ?? 0}</strong>
        </article>
        <article className="summary-card">
          <span>Last status</span>
          <strong>{summary?.last_status ?? "none"}</strong>
        </article>
        <article className="summary-card">
          <span>Last issue</span>
          <strong>{formatPublishedInvocationReasonLabel(summary?.last_reason_code)}</strong>
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
                hit {facetCount(cacheStatusCounts, "hit")} / miss{" "}
                {facetCount(cacheStatusCounts, "miss")} / bypass{" "}
                {facetCount(cacheStatusCounts, "bypass")}
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
                当前窗口从{" "}
                {formatTimestamp(rateLimitWindowAudit?.filters.created_from ?? null)} 开始统计成功和失败调用，
                `rejected` 只作为治理信号，不占配额。
              </p>
            </>
          ) : (
            <p className="empty-state compact">
              当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。
            </p>
          )}
        </div>
      </div>

      <WorkflowPublishTrafficTimeline
        timeline={timeline}
        timelineGranularity={timelineGranularity}
        timeWindowLabel={formatTimeWindowLabel(activeInvocationFilter?.timeWindow ?? "all")}
      />

      {reasonCounts.length ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Issue signals</p>
          <p className="section-copy entry-copy">
            把 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。
          </p>
          <div className="tool-badge-row">
            {reasonCounts.map((item) => (
              <span className="event-chip" key={item.value}>
                {formatPublishedInvocationReasonLabel(item.value)} {item.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
                    ok {item.succeeded_count} / failed {item.failed_count} / rejected{" "}
                    {item.rejected_count}
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
          {failureReasons.map((item) => (
            <article className="payload-card compact-card" key={item.message}>
              <div className="payload-card-header">
                <span className="status-meta">Failure reason</span>
                <span className="event-chip">count {item.count}</span>
              </div>
              <p className="binding-meta">{item.message}</p>
              <p className="section-copy entry-copy">
                最近一次出现在 {formatTimestamp(item.last_invoked_at)}。
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <div className="publish-cache-list">
          {items.map((item) => (
            <article className="payload-card compact-card" key={item.id}>
              <div className="payload-card-header">
                <span className={`health-pill ${item.status}`}>{item.status}</span>
                <div className="tool-badge-row">
                  <span className="event-chip">
                    {formatPublishedInvocationCacheStatusLabel(item.cache_status)}
                  </span>
                  {item.reason_code ? (
                    <span className="event-chip">
                      {formatPublishedInvocationReasonLabel(item.reason_code)}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="binding-meta">
                {formatPublishedInvocationSurfaceLabel(item.request_surface)} ·{" "}
                {item.request_source} · {formatTimestamp(item.created_at)} · {formatDurationMs(item.duration_ms)}
              </p>
              <dl className="compact-meta-list">
                <div>
                  <dt>API key</dt>
                  <dd>{item.api_key_name ?? item.api_key_prefix ?? "internal"}</dd>
                </div>
                <div>
                  <dt>Request keys</dt>
                  <dd>{formatKeyList(item.request_preview.keys ?? [])}</dd>
                </div>
                <div>
                  <dt>Run</dt>
                  <dd>{item.run_id ?? "not-started"}</dd>
                </div>
              </dl>
              {item.error_message ? (
                <p className="section-copy entry-copy">error: {item.error_message}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">
          当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。
        </p>
      )}
    </div>
  );
}
