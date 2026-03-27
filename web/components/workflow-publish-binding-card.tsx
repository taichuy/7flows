import React from "react";
import Link from "next/link";

import { updatePublishedEndpointLifecycle } from "@/app/actions/publish";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
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
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import { buildWorkflowPublishBindingCardSurface } from "@/lib/workflow-publish-binding-presenters";
import { buildPublishedCacheInventorySurfaceCopy } from "@/lib/published-invocation-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { buildSensitiveAccessBlockedSurfaceCopy } from "@/lib/sensitive-access-presenters";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";

type WorkflowPublishBindingCardProps = {
  workflow: WorkflowDetail;
  tools: PluginToolRegistryItem[];
  binding: WorkflowPublishedEndpointItem;
  legacyAuthExportHint?: string | null;
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
  legacyAuthExportHint = null,
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
  const bindingSurface = buildWorkflowPublishBindingCardSurface(binding, {
    currentWorkflowVersion: workflow.version,
    currentDraftPublishEndpoints: workflow.definition.publish ?? []
  });
  const workflowDetailHref = workspaceStarterGovernanceQueryScope
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: workflow.id,
        viewState: workspaceStarterGovernanceQueryScope,
        variant: "editor"
      }).href
    : null;
  const buildBindingWorkflowGovernanceHandoff = ({
    subjectLabel,
    returnDetail
  }: {
    subjectLabel: string;
    returnDetail: string;
  }) =>
    buildWorkflowGovernanceHandoff({
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowDetailHref,
      toolGovernance: workflow.tool_governance,
      legacyAuthGovernance: workflow.legacy_auth_governance ?? null,
      workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
        toolGovernance: workflow.tool_governance,
        subjectLabel,
        returnDetail
      })
    });
  const issueWorkflowGovernanceHandoff = bindingSurface.issueSurface
    ? buildBindingWorkflowGovernanceHandoff({
        subjectLabel: "publish binding",
        returnDetail:
          "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续处理当前 binding lifecycle blocker 与 publish activity。"
      })
    : null;
  const lifecycleWorkflowGovernanceHandoff = bindingSurface.issueSurface
    ? buildBindingWorkflowGovernanceHandoff({
        subjectLabel: "publish lifecycle action",
        returnDetail:
          "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续执行当前 lifecycle preflight。"
      })
    : null;
  const authGovernanceWorkflowHandoff = bindingSurface.issueSurface
    ? buildBindingWorkflowGovernanceHandoff({
        subjectLabel: "publish auth governance",
        returnDetail:
          "先回到 workflow 编辑器补齐 catalog gap 与 publish auth contract，再回来决定当前 binding 是否仍需要 published API key。"
      })
    : null;
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

      {bindingSurface.issueSurface ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">{bindingSurface.issueSurface.title}</p>
          <p className="section-copy entry-copy">{bindingSurface.issueSurface.message}</p>
          {bindingSurface.issueSurface.remediation ? (
            <p className="binding-meta">{bindingSurface.issueSurface.remediation}</p>
          ) : null}
          {bindingSurface.issueSurface.followUpHref && bindingSurface.issueSurface.followUpLabel ? (
            <Link className="inline-link" href={bindingSurface.issueSurface.followUpHref}>
              {bindingSurface.issueSurface.followUpLabel}
            </Link>
          ) : null}

          {issueWorkflowGovernanceHandoff?.workflowCatalogGapSummary ||
          issueWorkflowGovernanceHandoff?.legacyAuthHandoff ? (
            <div className="publish-key-list">
              <div>
                <p className="entry-card-title">Workflow handoff</p>
                <p className="section-copy entry-copy">
                  当前 publish binding blocker 也直接复用 shared workflow governance handoff，
                  避免作者在 draft endpoint blocker、catalog gap 与 legacy publish auth contract
                  之间来回跳页拼接治理事实。
                </p>
              </div>

              <WorkflowGovernanceHandoffCards
                workflowCatalogGapSummary={
                  issueWorkflowGovernanceHandoff.workflowCatalogGapSummary
                }
                workflowCatalogGapDetail={issueWorkflowGovernanceHandoff.workflowCatalogGapDetail}
                workflowCatalogGapHref={issueWorkflowGovernanceHandoff.workflowCatalogGapHref}
                workflowGovernanceHref={issueWorkflowGovernanceHandoff.workflowGovernanceHref}
                legacyAuthHandoff={issueWorkflowGovernanceHandoff.legacyAuthHandoff}
                cardClassName="payload-card compact-card"
              />
            </div>
          ) : null}
        </div>
      ) : null}

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
        workflow={workflow}
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
        legacyAuthExportHint={legacyAuthExportHint}
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
        issues={binding.issues}
        workflowGovernanceHandoff={lifecycleWorkflowGovernanceHandoff}
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
          {authGovernanceWorkflowHandoff?.workflowCatalogGapSummary ||
          authGovernanceWorkflowHandoff?.legacyAuthHandoff ? (
            <div className="publish-key-list">
              <div>
                <p className="entry-card-title">Workflow handoff</p>
                <p className="section-copy entry-copy">
                  当前 auth governance 空状态也直接复用 shared workflow governance handoff，
                  避免作者在确认当前 binding 不走 published API key 后，还要回到 workflow
                  detail 补 catalog gap / publish auth contract 上下文。
                </p>
              </div>

              <WorkflowGovernanceHandoffCards
                workflowCatalogGapSummary={
                  authGovernanceWorkflowHandoff.workflowCatalogGapSummary
                }
                workflowCatalogGapDetail={authGovernanceWorkflowHandoff.workflowCatalogGapDetail}
                workflowCatalogGapHref={authGovernanceWorkflowHandoff.workflowCatalogGapHref}
                workflowGovernanceHref={authGovernanceWorkflowHandoff.workflowGovernanceHref}
                legacyAuthHandoff={authGovernanceWorkflowHandoff.legacyAuthHandoff}
                cardClassName="payload-card compact-card"
              />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
