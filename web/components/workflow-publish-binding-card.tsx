import { updatePublishedEndpointLifecycle } from "@/app/actions/publish";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowPublishActivityPanel } from "@/components/workflow-publish-activity-panel";
import { WorkflowPublishApiKeyManager } from "@/components/workflow-publish-api-key-manager";
import { WorkflowPublishLifecycleForm } from "@/components/workflow-publish-lifecycle-form";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointCacheInventoryResponse,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";
import type { WorkflowDetail } from "@/lib/get-workflows";
import { formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishBindingCardProps = {
  workflow: WorkflowDetail;
  tools: PluginToolRegistryItem[];
  binding: WorkflowPublishedEndpointItem;
  cacheInventory: SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>;
  apiKeys: PublishedEndpointApiKeyItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter | null;
};

export function WorkflowPublishBindingCard({
  workflow,
  tools,
  binding,
  cacheInventory,
  apiKeys,
  invocationAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  rateLimitWindowAudit,
  activeInvocationFilter
}: WorkflowPublishBindingCardProps) {
  const cacheSummary = binding.cache_inventory;
  const activity = binding.activity;
  const resolvedCacheInventory = cacheInventory?.kind === "ok" ? cacheInventory.data : null;
  const varyBy =
    cacheSummary && cacheSummary.vary_by.length > 0
      ? cacheSummary.vary_by
      : ["full-payload"];

  return (
    <article className="binding-card">
      <div className="binding-card-header">
        <div>
          <p className="status-meta">Endpoint</p>
          <h3>{binding.endpoint_name}</h3>
        </div>
        <span className={`health-pill ${binding.lifecycle_status}`}>
          {binding.lifecycle_status}
        </span>
      </div>

      <p className="binding-meta">
        <strong>{binding.endpoint_id}</strong> · alias {binding.endpoint_alias} · path{" "}
        {binding.route_path}
      </p>

      <div className="tool-badge-row">
        <span className="event-chip">{binding.protocol}</span>
        <span className="event-chip">{binding.auth_mode}</span>
        <span className="event-chip">
          workflow {binding.workflow_version} {"->"} {binding.target_workflow_version}
        </span>
        <span className="event-chip">
          {binding.streaming ? "streaming" : "non-streaming"}
        </span>
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Activity</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Total</dt>
              <dd>{activity?.total_count ?? 0}</dd>
            </div>
            <div>
              <dt>Success</dt>
              <dd>{activity?.succeeded_count ?? 0}</dd>
            </div>
            <div>
              <dt>Cache</dt>
              <dd>
                hit {activity?.cache_hit_count ?? 0} / miss {activity?.cache_miss_count ?? 0}
              </dd>
            </div>
            <div>
              <dt>Last call</dt>
              <dd>{formatTimestamp(activity?.last_invoked_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Policy</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Rate limit</dt>
              <dd>
                {binding.rate_limit_policy
                  ? `${binding.rate_limit_policy.requests} / ${binding.rate_limit_policy.windowSeconds}s`
                  : "disabled"}
              </dd>
            </div>
            <div>
              <dt>Cache policy</dt>
              <dd>
                {binding.cache_policy
                  ? `ttl ${binding.cache_policy.ttl}s · max ${binding.cache_policy.maxEntries}`
                  : "disabled"}
              </dd>
            </div>
            <div>
              <dt>Published at</dt>
              <dd>{formatTimestamp(binding.published_at)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatTimestamp(binding.updated_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <WorkflowPublishActivityPanel
        workflowId={workflow.id}
        tools={tools}
        binding={binding}
        apiKeys={apiKeys}
        invocationAudit={invocationAudit}
        selectedInvocationId={selectedInvocationId}
        selectedInvocationDetail={selectedInvocationDetail}
        selectedInvocationDetailHref={null}
        clearInvocationDetailHref={null}
        rateLimitWindowAudit={rateLimitWindowAudit}
        activeInvocationFilter={activeInvocationFilter}
      />

      <div className="entry-card compact-card">
        <p className="entry-card-title">Cache inventory</p>
        <p className="section-copy entry-copy">
          命中统计回答“被用了多少次”，inventory 回答“当前缓存里还留着什么”。
        </p>
        <div className="summary-strip compact-strip">
          <article className="summary-card">
            <span>Enabled</span>
            <strong>{cacheSummary?.enabled ? "yes" : "no"}</strong>
          </article>
          <article className="summary-card">
            <span>Entries</span>
            <strong>{cacheSummary?.active_entry_count ?? 0}</strong>
          </article>
          <article className="summary-card">
            <span>Total hits</span>
            <strong>{cacheSummary?.total_hit_count ?? 0}</strong>
          </article>
          <article className="summary-card">
            <span>Nearest expiry</span>
            <strong>{formatTimestamp(cacheSummary?.nearest_expires_at)}</strong>
          </article>
        </div>

        {cacheSummary?.enabled ? (
          <>
            <div className="tool-badge-row">
              {varyBy.map((fieldPath) => (
                <span className="event-chip" key={`${binding.id}-${fieldPath}`}>
                  vary {fieldPath}
                </span>
              ))}
            </div>

            {cacheInventory?.kind === "blocked" ? (
              <SensitiveAccessBlockedCard
                payload={cacheInventory.payload}
                summary="当前 binding 的 cache inventory 已被标记为敏感详情入口；summary 仍可见，但具体 cache entries 需走审批。"
                title="Cache inventory access blocked"
              />
            ) : resolvedCacheInventory?.items?.length ? (
              <div className="publish-cache-list">
                {resolvedCacheInventory.items.map((item) => (
                  <article className="payload-card compact-card" key={item.id}>
                    <div className="payload-card-header">
                      <span className="status-meta">Cache entry</span>
                      <span className="event-chip">hits {item.hit_count}</span>
                    </div>
                    <p className="binding-meta">
                      {item.cache_key.slice(0, 16)}... · expires {formatTimestamp(item.expires_at)}
                    </p>
                    <p className="section-copy entry-copy">
                      keys:{" "}
                      {item.response_preview.keys?.length
                        ? item.response_preview.keys.join(", ")
                        : "none"}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state compact">
                {cacheInventory === null
                  ? "当前暂时无法拉取 cache inventory，活动 summary 仍可继续使用。"
                  : "当前还没有活跃缓存条目，首次命中前这里会保持为空。"}
              </p>
            )}
          </>
        ) : (
          <p className="empty-state compact">
            该 endpoint 没有启用 publish cache，当前不会保留 response cache entry。
          </p>
        )}
      </div>

      <WorkflowPublishLifecycleForm
        workflowId={workflow.id}
        bindingId={binding.id}
        currentStatus={binding.lifecycle_status}
        action={updatePublishedEndpointLifecycle}
      />

      {binding.auth_mode === "api_key" ? (
        <WorkflowPublishApiKeyManager
          workflowId={workflow.id}
          bindingId={binding.id}
          apiKeys={apiKeys}
        />
      ) : (
        <div className="entry-card compact-card">
          <p className="entry-card-title">API key governance</p>
          <p className="empty-state compact">
            当前 binding 使用 `auth_mode={binding.auth_mode}`，不需要单独管理 published API key。
          </p>
        </div>
      )}
    </article>
  );
}
