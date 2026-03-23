import React from "react";

import { updatePublishedEndpointLifecycle } from "@/app/actions/publish";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowPublishActivityPanel } from "@/components/workflow-publish-activity-panel";
import { WorkflowPublishApiKeyManager } from "@/components/workflow-publish-api-key-manager";
import { WorkflowPublishLifecycleForm } from "@/components/workflow-publish-lifecycle-form";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
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
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";
import { buildWorkflowPublishBindingCardSurface } from "@/lib/workflow-publish-binding-presenters";
import { buildPublishedCacheInventorySurfaceCopy } from "@/lib/published-invocation-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { buildSensitiveAccessBlockedSurfaceCopy } from "@/lib/sensitive-access-presenters";

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
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
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
  activeInvocationFilter,
  callbackWaitingAutomation,
  sandboxReadiness,
  workspaceStarterGovernanceQueryScope = null
}: WorkflowPublishBindingCardProps) {
  const bindingSurface = buildWorkflowPublishBindingCardSurface(binding);
  const cacheSummary = binding.cache_inventory;
  const activity = binding.activity;
  const resolvedCacheInventory = cacheInventory?.kind === "ok" ? cacheInventory.data : null;
  const cacheInventoryBlockedCopy =
    cacheInventory?.kind === "blocked"
      ? buildSensitiveAccessBlockedSurfaceCopy({
          surfaceLabel: bindingSurface.cacheInventoryTitle,
          payload: cacheInventory.payload,
          guardedActionLabel: bindingSurface.cacheInventoryGuardedActionLabel
        })
      : null;
  const cacheInventorySurfaceCopy = buildPublishedCacheInventorySurfaceCopy({
    enabled: Boolean(cacheSummary?.enabled),
    state:
      cacheInventory === null
        ? "unavailable"
        : resolvedCacheInventory?.items?.length
          ? "populated"
          : "empty"
  });

  return (
    <article className="binding-card">
      <div className="binding-card-header">
        <div>
          <p className="status-meta">{bindingSurface.headerEyebrow}</p>
          <h3>{binding.endpoint_name}</h3>
        </div>
        <span className={`health-pill ${binding.lifecycle_status}`}>
          {bindingSurface.lifecycleLabel}
        </span>
      </div>

      <p className="binding-meta">{bindingSurface.endpointSummary}</p>

      <div className="tool-badge-row">
        {bindingSurface.protocolChips.map((chip) => (
          <span className="event-chip" key={`${binding.id}-${chip}`}>
            {chip}
          </span>
        ))}
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{bindingSurface.activityTitle}</span>
          </div>
          <dl className="compact-meta-list">
            {bindingSurface.activityRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{bindingSurface.policyTitle}</span>
          </div>
          <dl className="compact-meta-list">
            {bindingSurface.policyRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <SandboxReadinessOverviewCard
        readiness={sandboxReadiness}
        title={bindingSurface.sandboxReadinessTitle}
        intro={bindingSurface.sandboxReadinessDescription}
        hideWhenHealthy={(activity?.total_count ?? 0) === 0}
      />

      <WorkflowPublishActivityPanel
        workflowId={workflow.id}
        tools={tools}
        binding={binding}
        apiKeys={apiKeys}
        invocationAudit={invocationAudit}
        selectedInvocationId={selectedInvocationId}
        selectedInvocationDetail={selectedInvocationDetail}
        rateLimitWindowAudit={rateLimitWindowAudit}
        callbackWaitingAutomation={callbackWaitingAutomation}
        sandboxReadiness={sandboxReadiness}
        activeInvocationFilter={activeInvocationFilter}
        workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
      />

      <div className="entry-card compact-card">
        <p className="entry-card-title">{bindingSurface.cacheInventoryTitle}</p>
        <p className="section-copy entry-copy">{cacheInventorySurfaceCopy.description}</p>
        <div className="summary-strip compact-strip">
          {bindingSurface.cacheInventorySummaryCards.map((card) => (
            <article className="summary-card" key={card.key}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        {cacheSummary?.enabled ? (
          <>
            <div className="tool-badge-row">
              {bindingSurface.cacheInventoryVaryLabels.map((label) => (
                <span className="event-chip" key={`${binding.id}-${label}`}>
                  {label}
                </span>
              ))}
            </div>

            {cacheInventory?.kind === "blocked" ? (
              <SensitiveAccessBlockedCard
                callbackWaitingAutomation={callbackWaitingAutomation}
                payload={cacheInventory.payload}
                sandboxReadiness={sandboxReadiness}
                summary={cacheInventoryBlockedCopy?.summary}
                title={
                  cacheInventoryBlockedCopy?.title ??
                  bindingSurface.cacheInventoryBlockedFallbackTitle
                }
              />
            ) : resolvedCacheInventory?.items?.length ? (
              <div className="publish-cache-list">
                {resolvedCacheInventory.items.map((item) => (
                  <article className="payload-card compact-card" key={item.id}>
                    <div className="payload-card-header">
                      <span className="status-meta">{bindingSurface.cacheEntryTitle}</span>
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
              <p className="empty-state compact">{cacheInventorySurfaceCopy.emptyState}</p>
            )}
          </>
        ) : (
          <p className="empty-state compact">{cacheInventorySurfaceCopy.emptyState}</p>
        )}
      </div>

      <WorkflowPublishLifecycleForm
        workflowId={workflow.id}
        bindingId={binding.id}
        currentStatus={binding.lifecycle_status}
        sandboxReadiness={sandboxReadiness}
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
          <p className="entry-card-title">{bindingSurface.apiKeyGovernanceTitle}</p>
          <p className="empty-state compact">{bindingSurface.apiKeyGovernanceEmptyState}</p>
        </div>
      )}
    </article>
  );
}
