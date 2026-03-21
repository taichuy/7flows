"use client";

import React from "react";

import type {
  WorkspaceStarterBulkAction,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterBulkPreview,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import {
  type WorkspaceStarterBulkPreviewFocusTarget,
  type WorkspaceStarterBulkResultFocusTarget,
  buildWorkspaceStarterBulkPreviewNarrative,
  buildWorkspaceStarterBulkResultNarrative,
  buildWorkspaceStarterSourceGovernanceScopeSummary,
  getWorkspaceStarterBulkActionButtonLabel,
  getWorkspaceStarterBulkActionLabel,
  getWorkspaceStarterBulkSkipReasonLabel
} from "./shared";

type WorkspaceStarterBulkGovernanceCardProps = {
  inScopeCount: number;
  inScopeTemplates: WorkspaceStarterTemplateItem[];
  preview: WorkspaceStarterBulkPreview | null;
  previewNotice: string | null;
  isMutating: boolean;
  isLoadingPreview: boolean;
  lastResult: WorkspaceStarterBulkActionResult | null;
  previewFocusTargets: WorkspaceStarterBulkPreviewFocusTarget[];
  resultFocusTargets: WorkspaceStarterBulkResultFocusTarget[];
  selectedTemplateId: string | null;
  onFocusTemplate: (templateId: string) => void;
  onAction: (action: WorkspaceStarterBulkAction) => void;
};

const BULK_ACTIONS: WorkspaceStarterBulkAction[] = [
  "archive",
  "restore",
  "refresh",
  "rebase",
  "delete"
];

export function WorkspaceStarterBulkGovernanceCard({
  inScopeCount,
  inScopeTemplates,
  preview,
  previewNotice,
  isMutating,
  isLoadingPreview,
  lastResult,
  previewFocusTargets,
  resultFocusTargets,
  selectedTemplateId,
  onFocusTemplate,
  onAction
}: WorkspaceStarterBulkGovernanceCardProps) {
  const previewNarrativeItems = buildWorkspaceStarterBulkPreviewNarrative(preview);
  const narrativeItems = lastResult ? buildWorkspaceStarterBulkResultNarrative(lastResult) : [];
  const sourceGovernanceScope = buildWorkspaceStarterSourceGovernanceScopeSummary(inScopeTemplates);
  const outcomePrimarySignal = lastResult?.outcome_explanation?.primary_signal?.trim() || null;
  const outcomeFollowUp = lastResult?.outcome_explanation?.follow_up?.trim() || null;

  return (
    <div className="binding-card compact-card">
      <div className="binding-card-header">
        <div>
          <p className="entry-card-title">Bulk governance</p>
          <p className="binding-meta">
            先用筛选条件收敛模板范围，再对当前结果集批量治理。
          </p>
        </div>
        <span className="health-pill">{inScopeCount} in scope</span>
      </div>
      <div className="starter-tag-row">
        {BULK_ACTIONS.map((action) => {
          const actionPreview = preview?.previews[action] ?? null;
          const candidateCount = actionPreview?.candidate_count ?? 0;
          const blockedCount = actionPreview?.blocked_count ?? 0;
          return (
            <span className="event-chip" key={action}>
              {getWorkspaceStarterBulkActionLabel(action)} {candidateCount}
              {blockedCount > 0 ? ` · block ${blockedCount}` : ""}
            </span>
          );
        })}
      </div>
      <p className="section-copy starter-summary-copy">
        删除仍然遵循“先归档再删除”；rebase 会同步 source-derived 字段，批量操作前请先确认当前筛选范围。
      </p>
      {sourceGovernanceScope ? (
        <div className="binding-section">
          <p className="binding-meta">Scope</p>
          {sourceGovernanceScope.chips.length > 0 ? (
            <div className="starter-tag-row">
              {sourceGovernanceScope.chips.map((item) => (
                <span className="event-chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          <p className="section-copy starter-summary-copy">
            <strong>Source governance:</strong> {sourceGovernanceScope.summary}
          </p>
        </div>
      ) : null}
      {isLoadingPreview ? (
        <p className="section-copy starter-summary-copy">
          <strong>Preview:</strong> 正在从后端预检当前筛选结果的批量治理候选。
        </p>
      ) : null}
      {previewNotice ? (
        <p className="section-copy starter-summary-copy">
          <strong>Preview:</strong> {previewNotice}
        </p>
      ) : null}
      {previewNarrativeItems.map((item) => (
        <p className="section-copy starter-summary-copy" key={`${item.label}-${item.text}`}>
          <strong>{item.label}:</strong> {item.text}
        </p>
      ))}
      {previewFocusTargets.length > 0 ? (
        <div className="binding-section">
          <p className="binding-meta">Preview focus</p>
          <p className="section-copy starter-summary-copy">
            后端 bulk preview 已把 refresh / rebase 的候选和阻塞项统一折叠成共享决策；点击
            starter 可直接聚焦右侧 source diff / metadata 详情。
          </p>
          <div className="starter-tag-row">
            {previewFocusTargets.map((item) => (
              <button
                key={item.templateId}
                className={`event-chip event-chip-button ${
                  selectedTemplateId === item.templateId ? "active" : ""
                }`}
                type="button"
                onClick={() => onFocusTemplate(item.templateId)}
                disabled={isMutating}
                aria-pressed={selectedTemplateId === item.templateId}
              >
                {item.name}
                {item.statusLabel ? ` · ${item.statusLabel}` : ""}
                {item.sourceWorkflowVersion ? ` · source ${item.sourceWorkflowVersion}` : ""}
                {item.archived ? " · archived" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {lastResult ? (
        <>
          <div className="starter-tag-row">
            <span className="health-pill">
              last run: {getWorkspaceStarterBulkActionLabel(lastResult.action)}
            </span>
            <span className="event-chip">updated {lastResult.updated_count}</span>
            {lastResult.deleted_items.length > 0 ? (
              <span className="event-chip">deleted {lastResult.deleted_items.length}</span>
            ) : null}
            {lastResult.skipped_count > 0 ? (
              <span className="event-chip">skipped {lastResult.skipped_count}</span>
            ) : (
              <span className="event-chip">no skips</span>
            )}
            {lastResult.skipped_reason_summary.map((item) => (
              <span className="event-chip" key={`${item.reason}-${item.count}`}>
                {getWorkspaceStarterBulkSkipReasonLabel(item.reason)} {item.count}
              </span>
            ))}
            {lastResult.sandbox_dependency_changes ? (
              <span className="event-chip">
                sandbox drift
                {" "}
                {lastResult.sandbox_dependency_changes.added_count +
                  lastResult.sandbox_dependency_changes.removed_count +
                  lastResult.sandbox_dependency_changes.changed_count}
              </span>
            ) : null}
          </div>

          {narrativeItems.map((item) => (
            <p className="section-copy starter-summary-copy" key={`${item.label}-${item.text}`}>
              <strong>{item.label}:</strong> {item.text}
            </p>
          ))}

          {outcomePrimarySignal || outcomeFollowUp ? (
            <div className="binding-section">
              <p className="binding-meta">Operator follow-up</p>
              <p className="section-copy starter-summary-copy">
                同一份 result receipt 现在会把 operator / AI 复用的 follow-up 解释直接放进后端共享契约，
                不再只依赖页面局部描述。
              </p>
              {outcomePrimarySignal ? (
                <p className="section-copy starter-summary-copy">
                  <strong>Primary signal:</strong> {outcomePrimarySignal}
                </p>
              ) : null}
              {outcomeFollowUp ? (
                <p className="section-copy starter-summary-copy">
                  <strong>Next step:</strong> {outcomeFollowUp}
                </p>
              ) : null}
            </div>
          ) : null}

          {resultFocusTargets.length > 0 ? (
            <div className="binding-section">
              <p className="binding-meta">Result receipt focus</p>
              <p className="section-copy starter-summary-copy">
                result receipt 已把“已处理 / 已跳过”的 starter 收口到同一张清单里；点击任一条目会自动
                切换筛选范围，并把右侧详情聚焦到对应模板的 source diff / metadata。
              </p>
              <div className="starter-tag-row">
                {resultFocusTargets.map((item) => (
                  <button
                    key={item.templateId}
                    className={`event-chip event-chip-button ${
                      selectedTemplateId === item.templateId ? "active" : ""
                    }`}
                    type="button"
                    onClick={() => onFocusTemplate(item.templateId)}
                    disabled={isMutating}
                    aria-pressed={selectedTemplateId === item.templateId}
                  >
                    {item.name}
                    {item.statusLabel ? ` · ${item.statusLabel}` : ""}
                    {item.sourceWorkflowVersion ? ` · source ${item.sourceWorkflowVersion}` : ""}
                    {item.sandboxNodeSummary ? ` · ${item.sandboxNodeSummary}` : ""}
                    {item.driftNodeCount > 0 ? ` · drift ${item.driftNodeCount}` : ""}
                    {item.archived ? " · archived" : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="binding-actions">
        {BULK_ACTIONS.map((action) => {
          const candidateCount = preview?.previews[action].candidate_count ?? 0;
          return (
            <button
              key={action}
              className="sync-button secondary"
              type="button"
              onClick={() => onAction(action)}
              disabled={candidateCount === 0 || isMutating || isLoadingPreview || Boolean(previewNotice)}
            >
              {isMutating ? "处理中..." : getWorkspaceStarterBulkActionButtonLabel(action)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
