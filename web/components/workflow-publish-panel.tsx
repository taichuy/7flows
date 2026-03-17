import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
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

type WorkflowPublishPanelProps = {
  workflow: WorkflowDetail;
  tools: PluginToolRegistryItem[];
  bindings: WorkflowPublishedEndpointItem[];
  cacheInventories: Record<string, SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>>;
  apiKeysByBinding: Record<string, PublishedEndpointApiKeyItem[]>;
  invocationAuditsByBinding: Record<string, PublishedEndpointInvocationListResponse | null>;
  invocationDetailsByBinding: Record<
    string,
    SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>
  >;
  selectedInvocationId: string | null;
  rateLimitWindowAuditsByBinding: Record<
    string,
    PublishedEndpointInvocationListResponse | null
  >;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter;
};

export function WorkflowPublishPanel({
  workflow,
  tools,
  bindings,
  cacheInventories,
  apiKeysByBinding,
  invocationAuditsByBinding,
  invocationDetailsByBinding,
  selectedInvocationId,
  rateLimitWindowAuditsByBinding,
  activeInvocationFilter
}: WorkflowPublishPanelProps) {
  const publishedCount = bindings.filter(
    (binding) => binding.lifecycle_status === "published"
  ).length;
  const cacheEnabledCount = bindings.filter(
    (binding) => binding.cache_inventory?.enabled
  ).length;
  const cacheEntryCount = bindings.reduce(
    (count, binding) => count + (binding.cache_inventory?.active_entry_count ?? 0),
    0
  );
  const rejectedCount = bindings.reduce(
    (count, binding) => count + (binding.activity?.rejected_count ?? 0),
    0
  );

  return (
    <section className="shell workflow-management-shell">
      <article className="diagnostic-panel panel-span">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Publish</p>
            <h2>Endpoint governance</h2>
          </div>
          <p className="section-copy">
            工作流页现在直接消费 publish binding、activity、rate-limit window 与 cache inventory
            事实层，不再让开放 API 能力只停留在后端可用、前端不可见。
          </p>
        </div>

        <div className="summary-strip">
          <article className="summary-card">
            <span>Bindings</span>
            <strong>{bindings.length}</strong>
          </article>
          <article className="summary-card">
            <span>Published</span>
            <strong>{publishedCount}</strong>
          </article>
          <article className="summary-card">
            <span>Rejected calls</span>
            <strong>{rejectedCount}</strong>
          </article>
          <article className="summary-card">
            <span>Active cache entries</span>
            <strong>{cacheEntryCount}</strong>
          </article>
          <article className="summary-card">
            <span>Cache enabled</span>
            <strong>{cacheEnabledCount}</strong>
          </article>
        </div>

        {bindings.length === 0 ? (
          <div className="entry-card">
            <p className="entry-card-title">{workflow.name}</p>
            <p className="section-copy entry-copy">
              当前 workflow definition 还没有声明 `publish`，因此没有可治理的开放 API endpoint。
            </p>
          </div>
        ) : (
          <div className="publish-card-grid">
            {bindings.map((binding) => (
              <WorkflowPublishBindingCard
                key={binding.id}
                workflow={workflow}
                tools={tools}
                binding={binding}
                cacheInventory={cacheInventories[binding.id] ?? null}
                apiKeys={apiKeysByBinding[binding.id] ?? []}
                invocationAudit={invocationAuditsByBinding[binding.id] ?? null}
                selectedInvocationId={
                  activeInvocationFilter.bindingId === binding.id ? selectedInvocationId : null
                }
                selectedInvocationDetail={invocationDetailsByBinding[binding.id] ?? null}
                rateLimitWindowAudit={rateLimitWindowAuditsByBinding[binding.id] ?? null}
                activeInvocationFilter={
                  activeInvocationFilter.bindingId === binding.id
                    ? activeInvocationFilter
                    : null
                }
              />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
