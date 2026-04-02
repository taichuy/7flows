import React from "react";
import Link from "next/link";
import { Button, Card, Tag } from "antd";

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
import { buildWorkflowPublishBindingCardSurface } from "@/lib/workflow-publish-binding-presenters";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope,
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowPublishActivityHrefFromCurrentHref,
  buildWorkflowPublishSurfaceHrefFromCurrentHref,
} from "@/lib/workflow-publish-activity-query";


function resolvePublishLifecycleTagColor(status: string) {
  if (status === "published") {
    return "success";
  }

  if (status === "draft") {
    return "gold";
  }

  if (status === "offline") {
    return "default";
  }

  return "processing";
}

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

  const bindingEntries = bindings.map((binding) => {
    const surface = buildWorkflowPublishBindingCardSurface(binding, {
      currentWorkflowVersion: workflow.version,
      currentDraftPublishEndpoints: workflow.definition.publish ?? [],
    });
    const detailHref = buildWorkflowPublishActivityHrefFromCurrentHref(
      workflow.id,
      {
        bindingId: binding.id,
        status: activeInvocationFilter.status,
        requestSource: activeInvocationFilter.requestSource,
        requestSurface: activeInvocationFilter.requestSurface,
        cacheStatus: activeInvocationFilter.cacheStatus,
        runStatus: activeInvocationFilter.runStatus,
        apiKeyId: activeInvocationFilter.apiKeyId,
        reasonCode: activeInvocationFilter.reasonCode,
        timeWindow: activeInvocationFilter.timeWindow,
      },
      currentHref
    );

    return {
      binding,
      surface,
      detailHref,
    };
  });

  const selectedBindingEntry =
    bindingEntries.find((entry) => entry.binding.id === expandedBindingId) ?? bindingEntries[0] ?? null;
  const selectedBindingHasDetail =
    Boolean(expandedBindingId) && selectedBindingEntry?.binding.id === expandedBindingId;

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
          <div className="workflow-publish-summary-grid">
            <div className="workflow-publish-summary-rail">
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
            </div>

            <div className="workflow-publish-summary-rail">
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
            </div>
          </div>

          {bindings.length === 0 ? (
            <WorkflowStudioUtilityEmptyCard
              dataComponent="workflow-publish-empty-card"
              description={surfaceCopy.emptyStateDescription}
            />
          ) : (
            <div className="binding-workbench workflow-publish-workbench">
              <Card
                className="workflow-publish-directory-card"
                data-component="workflow-publish-binding-directory"
              >
                <div className="workflow-publish-directory-copy">
                  <span className="workflow-studio-utility-eyebrow">Endpoint directory</span>
                  <h2>Scan bindings before opening detail</h2>
                  <p className="workflow-studio-utility-inline-copy">
                    先看 lifecycle、协议与当前 blocker，再只把一个 binding 的 publish activity、cache、sandbox 与 API key 治理拉到右侧 detail。
                  </p>
                </div>

                <div className="workflow-publish-directory-list">
                  {bindingEntries.map((entry) => {
                    const isSelected = entry.binding.id === selectedBindingEntry?.binding.id;

                    return (
                      <article
                        className={[
                          "workflow-publish-directory-item",
                          isSelected ? "workflow-publish-directory-item-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-binding-id={entry.binding.id}
                        key={entry.binding.id}
                      >
                        <div className="workflow-publish-directory-item-header">
                          <div>
                            <span className="workflow-studio-utility-eyebrow">
                              {entry.surface.headerEyebrow}
                            </span>
                            <h3>{entry.binding.endpoint_name}</h3>
                          </div>
                          <Tag color={resolvePublishLifecycleTagColor(entry.binding.lifecycle_status)}>
                            {entry.surface.lifecycleLabel}
                          </Tag>
                        </div>

                        <p className="binding-meta">{entry.surface.endpointSummary}</p>

                        <div className="workflow-publish-directory-tag-row">
                          {entry.surface.protocolChips.map((chip) => (
                            <Tag key={`${entry.binding.id}-${chip}`}>{chip}</Tag>
                          ))}
                          {entry.surface.issueSurface ? (
                            <Tag color="red">{entry.surface.issueSurface.title}</Tag>
                          ) : null}
                        </div>

                        <dl className="workflow-publish-directory-meta-list">
                          <div>
                            <dt>{entry.surface.activityRows[0]?.label ?? "Total"}</dt>
                            <dd>{entry.surface.activityRows[0]?.value ?? "0"}</dd>
                          </div>
                          <div>
                            <dt>{entry.surface.activityRows[3]?.label ?? "Last call"}</dt>
                            <dd>{entry.surface.activityRows[3]?.value ?? "n/a"}</dd>
                          </div>
                          <div>
                            <dt>{entry.surface.policyRows[0]?.label ?? "Rate limit"}</dt>
                            <dd>{entry.surface.policyRows[0]?.value ?? "disabled"}</dd>
                          </div>
                        </dl>

                        <p className="workflow-studio-utility-inline-copy workflow-publish-directory-note">
                          {entry.surface.issueSurface?.message ??
                            "Open detail when you need the selected binding's lifecycle action, invocation diagnosis, cache inventory or API key governance."}
                        </p>

                        <div className="workflow-publish-directory-actions">
                          {isSelected ? <Tag color="processing">selected</Tag> : null}
                          {entry.detailHref ? (
                            <Button href={entry.detailHref} type={selectedBindingHasDetail && isSelected ? "primary" : "default"}>
                              {selectedBindingHasDetail && isSelected ? "Detail active" : "Open detail"}
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Card>

              {selectedBindingEntry ? (
                <div className="workflow-publish-detail-rail" data-component="workflow-publish-detail-rail">
                  <Card className="workflow-publish-selected-binding-card">
                    <div className="workflow-publish-directory-item-header">
                      <div>
                        <span className="workflow-studio-utility-eyebrow">Selected endpoint</span>
                        <h2>{selectedBindingEntry.binding.endpoint_name}</h2>
                      </div>
                      <Tag
                        color={resolvePublishLifecycleTagColor(
                          selectedBindingEntry.binding.lifecycle_status
                        )}
                      >
                        {selectedBindingEntry.surface.lifecycleLabel}
                      </Tag>
                    </div>

                    <p className="binding-meta">
                      {selectedBindingEntry.surface.endpointSummary}
                    </p>
                    <p className="workflow-studio-utility-inline-copy">
                      {selectedBindingHasDetail
                        ? "当前 detail rail 已锁定这个 binding；lifecycle、activity、cache、sandbox 与 API key 治理都会沿同一条 endpoint 事实链展开。"
                        : "默认先保持 summary-first，只为当前选中的 binding 打开 detail；这样 publish 首屏仍能快速扫描 endpoint 列表，而不会把每个 no-store 细节都绑上来。"}
                    </p>

                    <div className="workflow-publish-directory-tag-row">
                      {selectedBindingEntry.surface.protocolChips.map((chip) => (
                        <Tag key={`${selectedBindingEntry.binding.id}-selected-${chip}`}>{chip}</Tag>
                      ))}
                    </div>

                    <div className="workflow-publish-directory-actions">
                      {!selectedBindingHasDetail && selectedBindingEntry.detailHref ? (
                        <Button href={selectedBindingEntry.detailHref} type="primary">
                          Open detail
                        </Button>
                      ) : null}
                      {selectedBindingHasDetail && publishSurfaceHref ? (
                        <Button href={publishSurfaceHref}>Back to summary</Button>
                      ) : null}
                      {selectedBindingEntry.surface.issueSurface?.followUpHref &&
                      selectedBindingEntry.surface.issueSurface.followUpLabel ? (
                        <Button href={selectedBindingEntry.surface.issueSurface.followUpHref}>
                          {selectedBindingEntry.surface.issueSurface.followUpLabel}
                        </Button>
                      ) : null}
                    </div>
                  </Card>

                  <WorkflowPublishBindingCard
                    workflow={workflow}
                    tools={tools}
                    binding={selectedBindingEntry.binding}
                    showGovernanceDetails={selectedBindingHasDetail}
                    governanceDetailHref={null}
                    collapseGovernanceHref={null}
                    legacyAuthExportHint={legacyAuthExportHint}
                    cacheInventory={cacheInventories[selectedBindingEntry.binding.id] ?? null}
                    apiKeys={apiKeysByBinding[selectedBindingEntry.binding.id] ?? []}
                    invocationAudit={
                      invocationAuditsByBinding[selectedBindingEntry.binding.id] ?? null
                    }
                    selectedInvocationId={
                      activeInvocationFilter.bindingId === selectedBindingEntry.binding.id
                        ? selectedInvocationId
                        : null
                    }
                    selectedInvocationDetail={
                      invocationDetailsByBinding[selectedBindingEntry.binding.id] ?? null
                    }
                    rateLimitWindowAudit={
                      rateLimitWindowAuditsByBinding[selectedBindingEntry.binding.id] ?? null
                    }
                    callbackWaitingAutomation={callbackWaitingAutomation}
                    sandboxReadiness={sandboxReadiness}
                    currentHref={currentHref ?? workflowDetailHref}
                    activeInvocationFilter={
                      activeInvocationFilter.bindingId === selectedBindingEntry.binding.id
                        ? activeInvocationFilter
                        : null
                    }
                    workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
