import { describe, expect, it } from "vitest";

import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

describe("workspace-starter-governance-query", () => {
  it("reads workspace starter governance view state from search params", () => {
    const viewState = readWorkspaceStarterLibraryViewState({
      track: "应用新建编排",
      archive: "archived",
      source_governance_kind: "drifted",
      needs_follow_up: "true",
      q: " drift ",
      starter: "workspace-starter-1"
    });

    expect(viewState).toEqual({
      activeTrack: "应用新建编排",
      archiveFilter: "archived",
      sourceGovernanceKind: "drifted",
      needsFollowUp: true,
      searchQuery: "drift",
      selectedTemplateId: "workspace-starter-1"
    });
  });

  it("keeps governance scope in workspace starter and editor hrefs", () => {
    const viewState = {
      activeTrack: "应用新建编排" as const,
      sourceGovernanceKind: "drifted" as const,
      needsFollowUp: true,
      searchQuery: " drift ",
      selectedTemplateId: "workspace-starter-1"
    };

    expect(buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(
      buildWorkflowEditorHrefFromWorkspaceStarterViewState("  workflow alpha/beta  ", viewState)
    ).toBe(
      "/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(buildWorkflowCreateHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(buildWorkflowLibraryHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workflows?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("builds scoped workflow detail link surfaces from the shared contract", () => {
    const viewState = {
      activeTrack: "应用新建编排" as const,
      sourceGovernanceKind: "drifted" as const,
      needsFollowUp: true,
      searchQuery: " drift ",
      selectedTemplateId: "workspace-starter-1"
    };

    expect(
      buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: "  workflow alpha/beta  ",
        viewState,
        variant: "recent"
      })
    ).toEqual({
      href: "/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      label: "打开最近 workflow"
    });
  });

  it("keeps all-track governance scopes unspecialized in downstream hrefs", () => {
    const viewState = pickWorkspaceStarterGovernanceQueryScope({
      activeTrack: "all",
      sourceGovernanceKind: "drifted",
      needsFollowUp: true,
      searchQuery: " drift ",
      selectedTemplateId: "workspace-starter-1"
    });

    expect(buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1"
    );
    expect(buildWorkflowLibraryHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workflows?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1"
    );
    expect(buildWorkflowCreateHrefFromWorkspaceStarterViewState(viewState)).toBe(
      "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1"
    );
  });

  it("only treats actual governance filters as scoped", () => {
    expect(
      hasScopedWorkspaceStarterGovernanceFilters({
        searchQuery: "",
        sourceGovernanceKind: "all",
        needsFollowUp: false
      })
    ).toBe(false);

    expect(
      hasScopedWorkspaceStarterGovernanceFilters({
        searchQuery: " drift ",
        sourceGovernanceKind: "all",
        needsFollowUp: false
      })
    ).toBe(true);
  });
});
