import React from "react";

import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";

type WorkflowPersistBlockerNoticeProps = {
  title: string;
  summary?: string | null;
  blockers: WorkflowPersistBlocker[];
  limit?: number;
};

export function WorkflowPersistBlockerNotice({
  title,
  summary = null,
  blockers,
  limit = 4
}: WorkflowPersistBlockerNoticeProps) {
  if (blockers.length === 0) {
    return null;
  }

  return (
    <div className="sync-message error">
      <strong>{title}</strong>
      {summary ? <p className="section-copy entry-copy">{summary}</p> : null}
      <ul className="event-list compact-list">
        {blockers.slice(0, limit).map((blocker) => (
          <li key={blocker.id}>
            <strong>{blocker.label}</strong>：{blocker.detail} {blocker.nextStep}
          </li>
        ))}
      </ul>
    </div>
  );
}
