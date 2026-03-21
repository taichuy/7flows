import React from "react";
import Link from "next/link";

import {
  WorkspaceStarterBulkGovernanceCard,
} from "@/components/workspace-starter-library/bulk-governance-card";
import type {
  WorkspaceStarterBulkAction,
  WorkspaceStarterBulkPreview,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterSourceGovernanceScopeSummary,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS
} from "@/lib/workflow-business-tracks";
import type { WorkflowDefinitionToolGovernance } from "@/lib/workflow-definition-tool-governance";

import {
  buildWorkspaceStarterBulkPreviewFocusTargets,
  buildWorkspaceStarterBulkResultFocusTargets,
  buildWorkspaceStarterSourceGovernancePresenter,
  formatTimestamp,
  type ArchiveFilter,
  type TrackFilter
} from "./shared";

type WorkspaceStarterTemplateListPanelProps = {
  templates: WorkspaceStarterTemplateItem[];
  filteredTemplates: WorkspaceStarterTemplateItem[];
  selectedTemplateId: string | null;
  activeTrack: TrackFilter;
  archiveFilter: ArchiveFilter;
  searchQuery: string;
  activeTemplateCount: number;
  archivedTemplateCount: number;
  templateToolGovernanceById: Map<string, WorkflowDefinitionToolGovernance>;
  bulkPreview: WorkspaceStarterBulkPreview | null;
  bulkPreviewNotice: string | null;
  isBulkMutating: boolean;
  isLoadingBulkPreview: boolean;
  isLoadingSourceGovernanceScope: boolean;
  lastBulkResult: WorkspaceStarterBulkActionResult | null;
  sourceGovernanceScope: WorkspaceStarterSourceGovernanceScopeSummary | null;
  onTrackChange: (track: TrackFilter) => void;
  onArchiveFilterChange: (filter: ArchiveFilter) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onFocusTemplate: (templateId: string) => void;
  onBulkAction: (action: WorkspaceStarterBulkAction) => void;
};

export function WorkspaceStarterTemplateListPanel({
  templates,
  filteredTemplates,
  selectedTemplateId,
  activeTrack,
  archiveFilter,
  searchQuery,
  activeTemplateCount,
  archivedTemplateCount,
  templateToolGovernanceById,
  bulkPreview,
  bulkPreviewNotice,
  isBulkMutating,
  isLoadingBulkPreview,
  isLoadingSourceGovernanceScope,
  lastBulkResult,
  sourceGovernanceScope,
  onTrackChange,
  onArchiveFilterChange,
  onSearchQueryChange,
  onSelectTemplate,
  onFocusTemplate,
  onBulkAction
}: WorkspaceStarterTemplateListPanelProps) {
  const resultFocusTargets = lastBulkResult
    ? buildWorkspaceStarterBulkResultFocusTargets(lastBulkResult, templates)
    : [];
  const previewFocusTargets = buildWorkspaceStarterBulkPreviewFocusTargets(
    bulkPreview,
    templates
  );

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h2>Template list</h2>
        </div>
        <p className="section-copy">
          先按主业务线和关键字收敛范围，再进入具体模板详情，避免 workspace starter
          library 只停留在“知道它存在”。
        </p>
      </div>

      <div className="starter-track-bar" role="tablist" aria-label="Workspace starter tracks">
        <button
          className={`starter-track-chip ${activeTrack === "all" ? "selected" : ""}`}
          type="button"
          onClick={() => onTrackChange("all")}
        >
          <span>All</span>
          <strong>全部主线</strong>
          <small>{templates.length} starters</small>
        </button>
        {WORKFLOW_BUSINESS_TRACKS.map((track) => (
          <button
            key={track.id}
            className={`starter-track-chip ${activeTrack === track.id ? "selected" : ""}`}
            type="button"
            onClick={() => onTrackChange(track.id)}
          >
            <span>{track.priority}</span>
            <strong>{track.id}</strong>
            <small>
              {templates.filter((template) => template.business_track === track.id).length} starters
            </small>
          </button>
        ))}
      </div>

      <div className="binding-form governance-filter-form">
        <div className="starter-track-bar" role="tablist" aria-label="Workspace starter status">
          {[
            {
              id: "active" as const,
              title: "Active",
              subtitle: "可复用模板",
              count: activeTemplateCount
            },
            {
              id: "archived" as const,
              title: "Archived",
              subtitle: "已归档模板",
              count: archivedTemplateCount
            },
            {
              id: "all" as const,
              title: "All",
              subtitle: "全部状态",
              count: templates.length
            }
          ].map((item) => (
            <button
              key={item.id}
              className={`starter-track-chip ${archiveFilter === item.id ? "selected" : ""}`}
              type="button"
              onClick={() => onArchiveFilterChange(item.id)}
            >
              <span>{item.title}</span>
              <strong>{item.subtitle}</strong>
              <small>{item.count} starters</small>
            </button>
          ))}
        </div>

        <label className="binding-field">
          <span className="binding-label">Search templates</span>
          <input
            className="trace-text-input"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="按名称、描述、焦点或标签筛选"
          />
        </label>

        <WorkspaceStarterBulkGovernanceCard
          inScopeCount={filteredTemplates.length}
          sourceGovernanceScope={sourceGovernanceScope}
          preview={bulkPreview}
          previewNotice={bulkPreviewNotice}
          isMutating={isBulkMutating}
          isLoadingPreview={isLoadingBulkPreview}
          isLoadingSourceGovernanceScope={isLoadingSourceGovernanceScope}
          lastResult={lastBulkResult}
          previewFocusTargets={previewFocusTargets}
          resultFocusTargets={resultFocusTargets}
          selectedTemplateId={selectedTemplateId}
          onFocusTemplate={onFocusTemplate}
          onAction={onBulkAction}
        />
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="empty-state-block">
          <p className="empty-state">
            当前筛选条件下还没有 workspace starter。可以先回到创建页新建 workflow，
            再从 editor 保存一个模板进入治理库。
          </p>
          <Link className="inline-link" href="/workflows/new">
            去创建第一个 starter
          </Link>
        </div>
      ) : (
        <div className="starter-grid">
          {filteredTemplates.map((template) => {
            const toolGovernance = templateToolGovernanceById.get(template.id);
            const sourceGovernance = buildWorkspaceStarterSourceGovernancePresenter(template);

            return (
              <button
                key={template.id}
                className={`starter-card ${template.id === selectedTemplateId ? "selected" : ""}`}
                type="button"
                onClick={() => onSelectTemplate(template.id)}
              >
                <div className="starter-card-header">
                  <span className="starter-track">{template.business_track}</span>
                  <div className="starter-tag-row">
                    <span className="health-pill">
                      {getWorkflowBusinessTrack(template.business_track).priority}
                    </span>
                    <span className="health-pill">{sourceGovernance.statusLabel}</span>
                    {sourceGovernance.actionStatusLabel ? (
                      <span className="event-chip">{sourceGovernance.actionStatusLabel}</span>
                    ) : null}
                    {sourceGovernance.sourceVersion ? (
                      <span className="event-chip">source {sourceGovernance.sourceVersion}</span>
                    ) : null}
                    {toolGovernance && toolGovernance.strongIsolationToolCount > 0 ? (
                      <span className="event-chip">strong isolation</span>
                    ) : null}
                    {toolGovernance && toolGovernance.missingToolIds.length > 0 ? (
                      <span className="event-chip">missing tools</span>
                    ) : null}
                    {template.archived ? <span className="event-chip">archived</span> : null}
                  </div>
                </div>
                <strong>{template.name}</strong>
                <p>{template.description || "暂未填写描述。"}</p>
                <p className="starter-focus-copy">
                  {template.workflow_focus || "暂未填写 workflow focus。"}
                </p>
                <p className="binding-meta">
                  <strong>Source:</strong> {sourceGovernance.summary}
                </p>
                {sourceGovernance.followUp && sourceGovernance.needsAttention ? (
                  <p className="binding-meta">{sourceGovernance.followUp}</p>
                ) : null}
                <div className="starter-meta-row">
                  <span>{template.definition.nodes?.length ?? 0} nodes</span>
                  <span>{toolGovernance?.governedToolCount ?? 0} governed tools</span>
                  <span>{toolGovernance?.strongIsolationToolCount ?? 0} strong isolation</span>
                  <span>{template.tags.length} tags</span>
                  <span>{formatTimestamp(template.updated_at)}</span>
                </div>
                {toolGovernance && toolGovernance.missingToolIds.length > 0 ? (
                  <p className="binding-meta">
                    缺少 catalog tool：{toolGovernance.missingToolIds.slice(0, 2).join("、")}
                    {toolGovernance.missingToolIds.length > 2
                      ? ` 等 ${toolGovernance.missingToolIds.length} 个`
                      : ""}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
