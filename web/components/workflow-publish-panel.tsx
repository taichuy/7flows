import React from "react";
import Link from "next/link";

import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import {
  WorkflowStudioUtilityEmptyCard,
  WorkflowStudioUtilityFrame,
  type WorkflowStudioUtilityAction,
  type WorkflowStudioUtilityMetric,
  type WorkflowStudioUtilityTag,
} from "@/components/workflow-studio-utility-frame";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import { WorkflowPublishBindingCard } from "@/components/workflow-publish-binding-card";
import { WorkflowPublishLegacyAuthCleanupCard } from "@/components/workflow-publish-legacy-auth-cleanup-card";
import {
  buildWorkflowPublishLegacyAuthCleanupSurface,
  buildWorkflowPublishLegacyAuthExportHint,
} from "@/lib/workflow-publish-legacy-auth-cleanup";
import {
  buildWorkflowGovernanceDetailHrefFromCurrentHref,
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff,
} from "@/lib/workflow-governance-handoff";
import {
  buildWorkflowPublishPrimaryFollowUpToneSurface,
  buildWorkflowPublishPrimaryFollowUpSurface,
  buildWorkflowPublishSummaryCardSurfaces,
} from "@/lib/published-invocation-presenters";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
} from "@/lib/get-system-overview";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointCacheInventoryResponse,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem,
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";
import type { WorkflowDetail } from "@/lib/get-workflows";
import { resolveWorkbenchEntryLinks } from "@/lib/workbench-entry-links";
import { buildWorkflowPublishPanelSurfaceCopy } from "@/lib/workbench-entry-surfaces";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope,
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowPublishActivityHrefFromCurrentHref,
  buildWorkflowPublishSurfaceHrefFromCurrentHref,
} from "@/lib/workflow-publish-activity-query";

type WorkflowPublishPanelProps = {
  workflow: WorkflowDetail;
  tools: PluginToolRegistryItem[];
  bindings: WorkflowPublishedEndpointItem[];
  cacheInventories: Record<
    string,
    SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>
  >;
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
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  expandedBindingId?: string | null;
  workflowLibraryHref?: string;
  currentHref?: string | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
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
  callbackWaitingAutomation = null,
  sandboxReadiness,
  expandedBindingId = null,
  workflowLibraryHref,
  currentHref = null,
  workspaceStarterGovernanceQueryScope = null,
}: WorkflowPublishPanelProps) {
  const surfaceCopy = buildWorkflowPublishPanelSurfaceCopy({ workflowLibraryHref });
  const primaryFollowUp = buildWorkflowPublishPrimaryFollowUpSurface(bindings);
  const primaryFollowUpToneSurface = buildWorkflowPublishPrimaryFollowUpToneSurface(
    primaryFollowUp.tone
  );
  const legacyAuthCleanupSurface = buildWorkflowPublishLegacyAuthCleanupSurface(bindings);
  const legacyAuthExportHint = buildWorkflowPublishLegacyAuthExportHint(
    legacyAuthCleanupSurface
  );
  const scopedCurrentWorkflowHref =
    currentHref ??
    (workspaceStarterGovernanceQueryScope
      ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
          workflowId: workflow.id,
          viewState: workspaceStarterGovernanceQueryScope,
          variant: "editor",
        }).href
      : null);
  const workflowDetailHref = buildWorkflowGovernanceDetailHrefFromCurrentHref({
    workflowId: workflow.id,
    currentHref: scopedCurrentWorkflowHref,
  });
  const publishSurfaceHref = buildWorkflowPublishSurfaceHrefFromCurrentHref(
    workflow.id,
    currentHref
  );
  const summaryCards = buildWorkflowPublishSummaryCardSurfaces({
    bindings,
    primaryFollowUp,
  });
  const workflowGovernanceHandoff = buildWorkflowGovernanceHandoff({
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowDetailHref,
    toolGovernance: workflow.tool_governance,
    legacyAuthGovernance: workflow.legacy_auth_governance ?? null,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance: workflow.tool_governance,
      subjectLabel: "publish summary",
      returnDetail:
        "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续处理 publish lifecycle、binding activity 与 invocation 诊断。",
    }),
  });
  const headerActions = resolveWorkbenchEntryLinks(
    surfaceCopy.headerLinks.keys,
    surfaceCopy.headerLinks.overrides
  ).map<WorkflowStudioUtilityAction>((link, index) => ({
    key: link.key,
    href: link.href,
    label: link.label,
    variant:
      link.key === surfaceCopy.headerLinks.primaryKey ||
      (!surfaceCopy.headerLinks.primaryKey && index === 0)
        ? "primary"
        : "default",
  }));
  const overviewMetrics = summaryCards.map<WorkflowStudioUtilityMetric>((card) => ({
    key: card.key,
    label: card.label,
    value: card.value,
    detail: card.detail ?? undefined,
  }));
  const overviewTags: WorkflowStudioUtilityTag[] = [
    {
      key: "workflow-version",
      label: `v${workflow.version}`,
      color: "blue",
    },
    {
      key: "binding-count",
      label: `${bindings.length} bindings`,
      color: bindings.length > 0 ? "gold" : "default",
    },
  ];

  if (expandedBindingId) {
    overviewTags.push({
      key: "binding-focus",
      label: `focus · ${expandedBindingId}`,
      color: "processing",
    });
  }

  return (
    <div className="workflow-publish-panel" data-component="workflow-publish-panel">
      <WorkflowStudioUtilityFrame
        actions={headerActions}
        className="workflow-management-shell"
        description={surfaceCopy.description}
        eyebrow={surfaceCopy.eyebrow}
        metrics={overviewMetrics}
        surface="publish"
        tags={overviewTags}
        title={surfaceCopy.title}
      >
        <div className="workflow-publish-panel-body">
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

          <WorkflowGovernanceHandoffCards
            workflowCatalogGapSummary={workflowGovernanceHandoff.workflowCatalogGapSummary}
            workflowCatalogGapDetail={workflowGovernanceHandoff.workflowCatalogGapDetail}
            workflowCatalogGapHref={workflowGovernanceHandoff.workflowCatalogGapHref}
            workflowGovernanceHref={workflowGovernanceHandoff.workflowGovernanceHref}
            legacyAuthHandoff={workflowGovernanceHandoff.legacyAuthHandoff}
            cardClassName="payload-card compact-card"
            currentHref={currentHref ?? workflowDetailHref}
          />

          <SandboxReadinessOverviewCard
            readiness={sandboxReadiness}
            title={surfaceCopy.sandboxReadinessTitle}
            intro={surfaceCopy.sandboxReadinessDescription}
          />

          {bindings.length > 0 ? (
            <WorkflowPublishLegacyAuthCleanupCard
              workflowId={workflow.id}
              workflowName={workflow.name}
              workflow={workflow}
              workflowDetailHref={workflowDetailHref}
              currentHref={currentHref ?? workflowDetailHref}
              bindings={bindings}
            />
          ) : null}

          {bindings.length === 0 ? (
            <WorkflowStudioUtilityEmptyCard
              dataComponent="workflow-publish-empty-card"
              description={surfaceCopy.emptyStateDescription}
            />
          ) : (
            <div className="publish-card-grid">
              {bindings.map((binding) => (
                <WorkflowPublishBindingCard
                  key={binding.id}
                  workflow={workflow}
                  tools={tools}
                  binding={binding}
                  showGovernanceDetails={expandedBindingId === binding.id}
                  governanceDetailHref={
                    expandedBindingId === binding.id
                      ? currentHref
                      : buildWorkflowPublishActivityHrefFromCurrentHref(
                          workflow.id,
                          {
                            bindingId: binding.id,
                            timeWindow: activeInvocationFilter.timeWindow,
                          },
                          currentHref
                        )
                  }
                  collapseGovernanceHref={publishSurfaceHref}
                  legacyAuthExportHint={legacyAuthExportHint}
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
                  currentHref={currentHref ?? workflowDetailHref}
                  activeInvocationFilter={
                    activeInvocationFilter.bindingId === binding.id
                      ? activeInvocationFilter
                      : null
                  }
                  workspaceStarterGovernanceQueryScope={
                    workspaceStarterGovernanceQueryScope
                  }
                />
              ))}
            </div>
          )}
        </div>
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
