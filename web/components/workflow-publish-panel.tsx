import React from "react";
import Link from "next/link";

import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
import {
  buildWorkflowPublishPrimaryFollowUpToneSurface,
  buildWorkflowPublishPrimaryFollowUpSurface,
  buildWorkflowPublishSummaryCardSurfaces,
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
  const primaryFollowUpToneSurface = buildWorkflowPublishPrimaryFollowUpToneSurface(
    primaryFollowUp.tone
  );
  const summaryCards = buildWorkflowPublishSummaryCardSurfaces({
    bindings,
    primaryFollowUp
  });

  return (
    <section className="shell workflow-management-shell">
      <article className="diagnostic-panel panel-span">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{surfaceCopy.eyebrow}</p>
            <h2>{surfaceCopy.title}</h2>
          </div>
          <p className="section-copy">{surfaceCopy.description}</p>
        </div>

        <WorkbenchEntryLinks {...surfaceCopy.headerLinks} />

        <div className="summary-strip">
          {summaryCards.map((card) => (
            <article className="summary-card" key={card.key}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <p className="binding-meta">{card.detail}</p> : null}
              {card.href && card.hrefLabel ? (
                <Link className="inline-link" href={card.href}>
                  {card.hrefLabel}
                </Link>
              ) : null}
            </article>
          ))}
        </div>

        <article className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.primaryFollowUpTitle}</span>
            <span className={`health-pill ${primaryFollowUpToneSurface.toneClassName}`}>
              {primaryFollowUpToneSurface.label}
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
          title={surfaceCopy.sandboxReadinessTitle}
          intro={surfaceCopy.sandboxReadinessDescription}
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
