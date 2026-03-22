import React from "react";
import Link from "next/link";

import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
import {
  buildWorkflowPublishPrimaryFollowUpSurface,
} from "@/lib/published-invocation-presenters";
import { buildWorkflowPublishPanelSurfaceCopy } from "@/lib/workbench-entry-surfaces";
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
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
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
  activeInvocationFilter,
  callbackWaitingAutomation,
  sandboxReadiness
}: WorkflowPublishPanelProps) {
  const surfaceCopy = buildWorkflowPublishPanelSurfaceCopy();
  const primaryFollowUp = buildWorkflowPublishPrimaryFollowUpSurface(bindings);
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
          <p className="section-copy">{surfaceCopy.description}</p>
        </div>

        <WorkbenchEntryLinks {...surfaceCopy.headerLinks} />

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

        <article className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Primary follow-up</span>
            <span className={`health-pill ${primaryFollowUp.tone === "healthy" ? "healthy" : "pending"}`}>
              {primaryFollowUp.tone === "healthy" ? "healthy" : "attention"}
            </span>
            {primaryFollowUp.href && primaryFollowUp.hrefLabel ? (
              <Link className="event-chip inbox-filter-link" href={primaryFollowUp.href}>
                {primaryFollowUp.hrefLabel}
              </Link>
            ) : null}
          </div>
          <p className="binding-meta">{primaryFollowUp.headline}</p>
          <p className="section-copy entry-copy">{primaryFollowUp.detail}</p>
        </article>

        <SandboxReadinessOverviewCard
          readiness={sandboxReadiness}
          title="Live sandbox readiness"
          intro="Publish summary 先直接对齐当前 live sandbox readiness；进入 invocation entry/detail 前，就能先判断强隔离 execution class 是已 ready、正在 degraded，还是仍会 fail-closed。"
        />

        {bindings.length === 0 ? (
          <div className="entry-card">
            <p className="entry-card-title">{workflow.name}</p>
            <p className="section-copy entry-copy">{surfaceCopy.emptyStateDescription}</p>
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
                callbackWaitingAutomation={callbackWaitingAutomation}
                sandboxReadiness={sandboxReadiness}
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
