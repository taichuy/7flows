import Link from "next/link";

import type { WorkspaceAppSearchFormState } from "@/lib/workspace-app-query-state";

export function WorkspaceCatalogHeader({
  currentRoleLabel,
  catalogDescription,
  requestedKeyword,
  searchState
}: {
  currentRoleLabel: string;
  catalogDescription: string;
  requestedKeyword: string;
  searchState: WorkspaceAppSearchFormState;
}) {
  return (
    <section
      className="workspace-apps-stage-header workspace-catalog-card"
      data-component="workspace-catalog-header"
    >
      <div className="workspace-apps-stage-copy">
        <p className="workspace-eyebrow">Workspace</p>
        <div className="workspace-apps-stage-title-row">
          <h1>应用工作台</h1>
          <span className="workspace-tag accent">当前身份：{currentRoleLabel}</span>
        </div>
        <p className="workspace-muted workspace-apps-stage-copy-text">{catalogDescription}</p>
      </div>

      <form
        action="/workspace"
        className="workspace-search-form workspace-search-form-board workspace-search-form-studio workspace-apps-stage-search"
      >
        {searchState.filter ? <input name="filter" type="hidden" value={searchState.filter} /> : null}
        {searchState.mode ? <input name="mode" type="hidden" value={searchState.mode} /> : null}
        {searchState.track ? <input name="track" type="hidden" value={searchState.track} /> : null}
        <input
          className="workspace-search-input workspace-search-input-board"
          defaultValue={requestedKeyword}
          name="keyword"
          placeholder="搜索应用或治理焦点"
          type="search"
        />
        <button className="workspace-primary-button compact" type="submit">
          搜索
        </button>
        {searchState.clearHref ? (
          <Link className="workspace-ghost-button compact" href={searchState.clearHref}>
            清除
          </Link>
        ) : null}
      </form>
    </section>
  );
}
