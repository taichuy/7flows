import type { WorkspaceAppSearchFormState } from "@/lib/workspace-app-query-state";

export type WorkspaceModeTab = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

export type WorkspaceScopePill = {
  key: string;
  label: string;
  value: string;
  href: string;
};

export type WorkspaceStatusFilter = {
  key: string;
  label: string;
  href: string;
  active: boolean;
};

export type WorkspaceSignal = {
  label: string;
  value: string;
};

export type WorkspaceQuickCreateEntry = {
  title: string;
  detail: string;
  href: string;
  badge: string;
};

export type WorkspaceStarterHighlight = {
  id: string;
  name: string;
  description: string;
  href: string;
  track: string;
  priority: string;
  modeShortLabel: string;
};

export type WorkspaceAppCard = {
  id: string;
  name: string;
  href: string;
  status: string;
  healthLabel: string;
  recommendedNextStep: string;
  updatedAt: string;
  nodeCount: number;
  publishCount: number;
  missingToolCount: number;
  followUpCount: number;
  mode: {
    label: string;
    shortLabel: string;
  };
  track: {
    id: string;
    priority: string;
    focus: string;
    summary: string;
  };
};

export type WorkspaceAppsWorkbenchProps = {
  workspaceName: string;
  currentRoleLabel: string;
  currentUserDisplayName: string;
  requestedKeyword: string;
  activeModeLabel: string | null;
  activeModeDescription: string;
  visibleAppSummary: string;
  modeTabs: WorkspaceModeTab[];
  scopePills: WorkspaceScopePill[];
  statusFilters: WorkspaceStatusFilter[];
  workspaceSignals: WorkspaceSignal[];
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  workspaceUtilityEntry: WorkspaceQuickCreateEntry | null;
  starterHighlights: WorkspaceStarterHighlight[];
  starterCount: number;
  filteredApps: WorkspaceAppCard[];
  searchState: WorkspaceAppSearchFormState;
};

export function getWorkspaceScopeSummary({
  activeModeDescription,
  activeModeLabel,
  requestedKeyword
}: {
  activeModeDescription: string;
  activeModeLabel: string | null;
  requestedKeyword: string;
}) {
  return requestedKeyword
    ? `已按“${requestedKeyword}”聚焦应用`
    : activeModeLabel
      ? `当前筛选：${activeModeLabel}`
      : activeModeDescription;
}
