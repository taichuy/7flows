"use client";

import React from "react";

import type { WorkspaceStarterHistoryItem } from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterHistoryMetaChips,
  buildWorkspaceStarterHistoryNarrative,
  formatTimestamp
} from "./shared";

type WorkspaceStarterHistoryPanelProps = {
  historyItems: WorkspaceStarterHistoryItem[];
  isLoading: boolean;
};

export function WorkspaceStarterHistoryPanel({
  historyItems,
  isLoading
}: WorkspaceStarterHistoryPanelProps) {
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
        <p className="empty-state">当前模板还没有治理历史记录。</p>
      ) : (
        <div className="governance-node-list">
          {historyItems.map((item) => {
            const chips = buildWorkspaceStarterHistoryMetaChips(item);
            const narrativeItems = buildWorkspaceStarterHistoryNarrative(item);
            const hasPayload = Object.keys(item.payload).length > 0;

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

                {hasPayload ? (
                  <details>
                    <summary className="binding-meta">查看原始 payload</summary>
                    <pre className="trace-preview">{JSON.stringify(item.payload, null, 2)}</pre>
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
