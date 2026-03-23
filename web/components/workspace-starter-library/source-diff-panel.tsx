"use client";

import type { WorkspaceStarterSourceDiff } from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterSourceDiffPanelCopy,
  buildWorkspaceStarterSourceDiffSurface,
  type WorkspaceStarterSourceDiffSectionSurface
} from "./shared";

type WorkspaceStarterSourceDiffPanelProps = {
  sourceDiff: WorkspaceStarterSourceDiff | null;
  isLoading: boolean;
  isRebasing: boolean;
  onRebase: () => void;
};

export function WorkspaceStarterSourceDiffPanel({
  sourceDiff,
  isLoading,
  isRebasing,
  onRebase
}: WorkspaceStarterSourceDiffPanelProps) {
  const surfaceCopy = buildWorkspaceStarterSourceDiffPanelCopy();
  const surface = buildWorkspaceStarterSourceDiffSurface(sourceDiff);

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{surface?.eyebrow ?? surfaceCopy.eyebrow}</p>
          <h2>{surface?.title ?? surfaceCopy.title}</h2>
        </div>
        <p className="section-copy">{surface?.description ?? surfaceCopy.description}</p>
      </div>

      {isLoading ? (
        <p className="empty-state">{surface?.loadingMessage ?? surfaceCopy.loadingMessage}</p>
      ) : !surface ? (
        <p className="empty-state">{surfaceCopy.emptyMessage}</p>
      ) : (
        <>
          <div className="summary-strip compact-strip">
            {surface.summaryCards.map((item) => (
              <div className="summary-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="binding-card compact-card">
            <div className="binding-card-header">
              <div>
                <p className="entry-card-title">{surface.rebaseCard.title}</p>
                <p className="binding-meta">{surface.rebaseCard.meta}</p>
              </div>
              <span className="health-pill">{surface.rebaseCard.statusLabel}</span>
            </div>
            <p className="section-copy starter-summary-copy">{surface.rebaseCard.summary}</p>
            <div className="starter-tag-row">
              {surface.rebaseCard.chips.map((item) => (
                <span className="event-chip" key={`rebase-${item}`}>
                  {item}
                </span>
              ))}
            </div>
            <div className="binding-actions">
              <button
                className="sync-button secondary"
                type="button"
                onClick={onRebase}
                disabled={!surface.rebaseCard.canRebase || isRebasing}
              >
                {isRebasing ? surface.rebaseCard.pendingLabel : surface.rebaseCard.actionLabel}
              </button>
            </div>
          </div>

          {surface.sections.map((section) => (
            <DiffSection key={section.key} section={section} />
          ))}
        </>
      )}
    </article>
  );
}

function DiffSection({ section }: { section: WorkspaceStarterSourceDiffSectionSurface }) {
  return (
    <div className="binding-card compact-card">
      <div className="binding-card-header">
        <div>
          <p className="entry-card-title">{section.title}</p>
          <p className="binding-meta">{section.summary}</p>
        </div>
        <span className="health-pill">{section.changeBadge}</span>
      </div>
      {section.entries.length === 0 ? (
        <p className="section-copy starter-summary-copy">{section.emptyMessage}</p>
      ) : (
        <div className="governance-node-list">
          {section.entries.map((entry) => (
            <div className="binding-card compact-card" key={entry.key}>
              <div className="binding-card-header">
                <div>
                  <p className="entry-card-title">{entry.title}</p>
                  <p className="binding-meta">{entry.meta}</p>
                </div>
                <span className="health-pill">{entry.statusLabel}</span>
              </div>
              {entry.changedFields.length > 0 ? (
                <div className="starter-tag-row">
                  {entry.changedFields.map((field) => (
                    <span className="event-chip" key={`${entry.key}-${field}`}>
                      {field}
                    </span>
                  ))}
                </div>
              ) : null}
              {entry.factGroups.map((group) => (
                <div key={group.key}>
                  <p className="binding-meta">{group.label}</p>
                  <div className="starter-tag-row">
                    {group.facts.map((fact) => (
                      <span className="event-chip" key={`${group.key}-${fact}`}>
                        {fact}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
