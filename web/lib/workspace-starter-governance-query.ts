import {
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import type { WorkspaceStarterSourceGovernanceKind } from "@/lib/get-workspace-starters";
import {
  type AuthorFacingWorkflowDetailLinkVariant,
  buildAuthorFacingWorkflowDetailLinkSurface
} from "@/lib/workbench-entry-surfaces";
import { buildRunDetailHref } from "@/lib/workbench-links";

export type TrackFilter = "all" | WorkflowBusinessTrack;
export type ArchiveFilter = "active" | "archived" | "all";
export type SourceGovernanceFilter = "all" | WorkspaceStarterSourceGovernanceKind;

export type WorkspaceStarterLibraryViewState = {
  activeTrack: TrackFilter;
  archiveFilter: ArchiveFilter;
  sourceGovernanceKind: SourceGovernanceFilter;
  needsFollowUp: boolean;
  searchQuery: string;
  selectedTemplateId: string | null;
};

export type WorkspaceStarterGovernanceQueryScope = Pick<
  WorkspaceStarterLibraryViewState,
  "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
>;

export type WorkspaceStarterLibrarySearchParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export const DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE: WorkspaceStarterLibraryViewState = {
  activeTrack: "all",
  archiveFilter: "active",
  sourceGovernanceKind: "all",
  needsFollowUp: false,
  searchQuery: "",
  selectedTemplateId: null
};

const WORKSPACE_STARTER_LIBRARY_TRACK_FILTERS = new Set<TrackFilter>([
  "all",
  ...WORKFLOW_BUSINESS_TRACKS.map((track) => track.id)
]);

const WORKSPACE_STARTER_LIBRARY_ARCHIVE_FILTERS = new Set<ArchiveFilter>([
  "active",
  "archived",
  "all"
]);

const WORKSPACE_STARTER_LIBRARY_SOURCE_GOVERNANCE_FILTERS = new Set<SourceGovernanceFilter>([
  "all",
  "no_source",
  "missing_source",
  "synced",
  "drifted"
]);

export function readWorkspaceStarterLibraryViewState(
  searchParams: WorkspaceStarterLibrarySearchParamSource
): WorkspaceStarterLibraryViewState {
  const trackValue = firstSearchValue(searchParams, "track");
  const archiveValue = firstSearchValue(searchParams, "archive");
  const sourceGovernanceValue = firstSearchValue(searchParams, "source_governance_kind");
  const needsFollowUpValue = firstSearchValue(searchParams, "needs_follow_up");

  return {
    activeTrack: WORKSPACE_STARTER_LIBRARY_TRACK_FILTERS.has(trackValue as TrackFilter)
      ? (trackValue as TrackFilter)
      : DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.activeTrack,
    archiveFilter: WORKSPACE_STARTER_LIBRARY_ARCHIVE_FILTERS.has(archiveValue as ArchiveFilter)
      ? (archiveValue as ArchiveFilter)
      : DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.archiveFilter,
    sourceGovernanceKind: WORKSPACE_STARTER_LIBRARY_SOURCE_GOVERNANCE_FILTERS.has(
      sourceGovernanceValue as SourceGovernanceFilter
    )
      ? (sourceGovernanceValue as SourceGovernanceFilter)
      : DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.sourceGovernanceKind,
    needsFollowUp:
      needsFollowUpValue === "true"
        ? true
        : DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.needsFollowUp,
    searchQuery: firstSearchValue(searchParams, "q") ?? DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.searchQuery,
    selectedTemplateId: firstSearchValue(searchParams, "starter") ?? null
  };
}

export function pickWorkspaceStarterGovernanceQueryScope(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
): WorkspaceStarterGovernanceQueryScope {
  return {
    activeTrack: viewState.activeTrack,
    sourceGovernanceKind: viewState.sourceGovernanceKind,
    needsFollowUp: viewState.needsFollowUp,
    searchQuery: viewState.searchQuery,
    selectedTemplateId: viewState.selectedTemplateId
  };
}

export function hasScopedWorkspaceStarterGovernanceFilters(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "sourceGovernanceKind" | "needsFollowUp" | "searchQuery"
  >
) {
  return Boolean(
    viewState.searchQuery.trim() ||
      viewState.sourceGovernanceKind !==
        DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.sourceGovernanceKind ||
      viewState.needsFollowUp
  );
}

export function buildWorkspaceStarterLibrarySearchParams(
  viewState: WorkspaceStarterLibraryViewState
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);

  if (viewState.archiveFilter !== DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.archiveFilter) {
    searchParams.set("archive", viewState.archiveFilter);
  }

  searchParams.sort();
  return searchParams;
}

export function buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);
  const query = searchParams.toString();
  return query ? `/workspace-starters?${query}` : "/workspace-starters";
}

export function buildWorkflowCreateSearchParamsFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  return buildWorkspaceStarterGovernanceSearchParams(viewState);
}

export function buildWorkflowCreateHrefFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkflowCreateSearchParamsFromWorkspaceStarterViewState(viewState);
  const query = searchParams.toString();
  return query ? `/workflows/new?${query}` : "/workflows/new";
}

export function buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);
  const query = searchParams.toString();
  return query ? `/workflows?${query}` : "/workflows";
}

export function buildWorkspaceHrefFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = new URLSearchParams();

  if (viewState.activeTrack !== DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.activeTrack) {
    searchParams.set("track", viewState.activeTrack);
  }

  const normalizedSearchQuery = viewState.searchQuery.trim();
  if (normalizedSearchQuery) {
    searchParams.set("keyword", normalizedSearchQuery);
  }

  searchParams.sort();
  const query = searchParams.toString();
  return query ? `/workspace?${query}` : "/workspace";
}

export function buildRunLibraryHrefFromWorkspaceStarterViewState(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);
  const query = searchParams.toString();
  return query ? `/runs?${query}` : "/runs";
}

export function buildWorkflowEditorHrefFromWorkspaceStarterViewState(
  workflowId: string,
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);
  const query = searchParams.toString();
  const workflowHref = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId,
    variant: "editor"
  }).href;
  return query ? `${workflowHref}?${query}` : workflowHref;
}

export function buildRunDetailHrefFromWorkspaceStarterViewState(
  runId: string,
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = buildWorkspaceStarterGovernanceSearchParams(viewState);
  const query = searchParams.toString();
  const runHref = buildRunDetailHref(runId);

  return query ? `${runHref}?${query}` : runHref;
}

export function buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
  workflowId,
  viewState,
  variant = "chip"
}: {
  workflowId: string;
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >;
  variant?: AuthorFacingWorkflowDetailLinkVariant;
}) {
  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId,
    variant
  });

  return {
    ...workflowDetailLink,
    href: buildWorkflowEditorHrefFromWorkspaceStarterViewState(workflowId, viewState)
  };
}

function buildWorkspaceStarterGovernanceSearchParams(
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery" | "selectedTemplateId"
  >
) {
  const searchParams = new URLSearchParams();

  if (viewState.activeTrack !== DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.activeTrack) {
    searchParams.set("track", viewState.activeTrack);
  }
  if (
    viewState.sourceGovernanceKind !==
    DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE.sourceGovernanceKind
  ) {
    searchParams.set("source_governance_kind", viewState.sourceGovernanceKind);
  }
  if (viewState.needsFollowUp) {
    searchParams.set("needs_follow_up", "true");
  }

  const normalizedSearchQuery = viewState.searchQuery.trim();
  if (normalizedSearchQuery) {
    searchParams.set("q", normalizedSearchQuery);
  }
  if (viewState.selectedTemplateId) {
    searchParams.set("starter", viewState.selectedTemplateId);
  }

  searchParams.sort();
  return searchParams;
}

function firstSearchValue(source: WorkspaceStarterLibrarySearchParamSource, key: string) {
  if (source instanceof URLSearchParams) {
    return normalizeString(source.get(key));
  }

  const value = source[key];
  return normalizeString(Array.isArray(value) ? value[0] : value);
}

function normalizeString(value: unknown) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}
