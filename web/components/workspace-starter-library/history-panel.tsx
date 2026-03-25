"use client";

import React from "react";

import { WorkbenchEntryLink } from "@/components/workbench-entry-links";
import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import type {
  WorkspaceStarterHistoryItem,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import type { WorkflowDefinitionToolGovernance } from "@/lib/workflow-definition-tool-governance";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

import {
  buildWorkspaceStarterEmptyStateFollowUp,
  buildWorkspaceStarterHistoryPayloadSnapshot,
  buildWorkspaceStarterHistoryMetaChips,
  buildWorkspaceStarterHistoryNarrative,
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterTemplateFollowUpSurface,
  type WorkspaceStarterFollowUpSurface,
  formatTimestamp
} from "./shared";

type WorkspaceStarterHistoryPanelProps = {
  selectedTemplate: WorkspaceStarterTemplateItem | null;
  historyItems: WorkspaceStarterHistoryItem[];
  isLoading: boolean;
  createWorkflowHref?: string | null;
  selectedTemplateToolGovernance?: WorkflowDefinitionToolGovernance | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  emptyStateFollowUp?: WorkspaceStarterFollowUpSurface | null;
};

export function WorkspaceStarterHistoryPanel({
  selectedTemplate,
  historyItems,
  isLoading,
  createWorkflowHref = null,
  selectedTemplateToolGovernance = null,
  workspaceStarterGovernanceQueryScope = null,
  emptyStateFollowUp = null
}: WorkspaceStarterHistoryPanelProps) {
  const missingToolGovernanceSurface = selectedTemplate
    ? buildWorkspaceStarterMissingToolGovernanceSurface({
        template: selectedTemplate,
        missingToolIds: selectedTemplateToolGovernance?.missingToolIds ?? [],
        workspaceStarterGovernanceQueryScope
      })
    : null;
  const resolvedEmptyStateFollowUp =
    emptyStateFollowUp ??
    (createWorkflowHref
      ? buildWorkspaceStarterEmptyStateFollowUp({
          sourceGovernancePrimaryFollowUp: null,
          createWorkflowHref
        })
      : {
          label: "先从左侧选择 starter",
          headline: "当前还没有聚焦中的 workspace starter。",
          detail: "先从左侧列表选择一个 starter，这里会显示治理动作留下的结构化历史记录。",
          focusTemplateId: null,
          focusLabel: null
        });
  const historyEmptyStateFollowUp = buildWorkspaceStarterTemplateFollowUpSurface({
    template: selectedTemplate,
    createWorkflowHref,
    workspaceStarterGovernanceQueryScope,
    fallbackHeadline: "当前 starter 还没有治理历史记录。",
    fallbackDetail:
      "先完成一次 refresh / rebase / 元数据调整、归档或恢复动作，这里才会留下可追溯的结构化治理记录。"
  });
  const emptyPanelFollowUp = selectedTemplate
    ? missingToolGovernanceSurface ?? historyEmptyStateFollowUp
    : resolvedEmptyStateFollowUp;

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">History</p>
          <h2>Governance activity</h2>
        </div>
        <p className="section-copy">
          记录模板治理动作，避免刷新、归档和元数据调整继续只留在口头上下文里。
        </p>
      </div>

      {isLoading ? (
        <p className="empty-state">正在加载模板治理历史...</p>
      ) : historyItems.length === 0 ? (
        <>
          <p className="empty-state">
            {selectedTemplate
              ? "当前模板还没有治理历史记录。"
              : "选中一个模板后，这里会显示治理动作留下的结构化历史记录。"}
          </p>
          {emptyPanelFollowUp ? (
            <WorkspaceStarterFollowUpCard
              detail={emptyPanelFollowUp.detail}
              headline={emptyPanelFollowUp.headline}
              label={emptyPanelFollowUp.label}
              primaryResourceSummary={emptyPanelFollowUp.primaryResourceSummary}
              actions={
                emptyPanelFollowUp.entryKey ? (
                  <WorkbenchEntryLink
                    className="inline-link"
                    linkKey={emptyPanelFollowUp.entryKey}
                    override={emptyPanelFollowUp.entryOverride}
                  />
                ) : null
              }
            />
          ) : null}
        </>
      ) : (
        <div className="governance-node-list">
          {historyItems.map((item) => {
            const chips = buildWorkspaceStarterHistoryMetaChips(item);
            const narrativeItems = buildWorkspaceStarterHistoryNarrative(item);
            const payloadSnapshotItems = buildWorkspaceStarterHistoryPayloadSnapshot(item);

            return (
              <div className="binding-card compact-card" key={item.id}>
                <div className="binding-card-header">
                  <div>
                    <p className="entry-card-title">{item.summary}</p>
                    <p className="binding-meta">{formatTimestamp(item.created_at)}</p>
                  </div>
                  <span className="health-pill">{formatAction(item.action)}</span>
                </div>

                {chips.length > 0 ? (
                  <div className="starter-tag-row">
                    {chips.map((chip) => (
                      <span className="event-chip" key={`${item.id}-${chip}`}>
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}

                {narrativeItems.map((entry) => (
                  <p className="section-copy starter-summary-copy" key={`${item.id}-${entry.label}`}>
                    <strong>{entry.label}:</strong> {entry.text}
                  </p>
                ))}

                {payloadSnapshotItems.length > 0 ? (
                  <details>
                    <summary className="binding-meta">查看结构化 payload</summary>
                    {payloadSnapshotItems.map((entry) => (
                      <p className="section-copy starter-summary-copy" key={`${item.id}-payload-${entry.label}`}>
                        <strong>{entry.label}:</strong> {entry.text}
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function formatAction(action: WorkspaceStarterHistoryItem["action"]) {
  return {
    created: "created",
    updated: "updated",
    archived: "archived",
    restored: "restored",
    refreshed: "refreshed",
    rebased: "rebased"
  }[action];
}
