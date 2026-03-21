import { describe, expect, it } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterLibrarySearchParams,
  resolveWorkspaceStarterLibraryViewState
} from "./shared";

const templates: WorkspaceStarterTemplateItem[] = [
  {
    id: "starter-active-a",
    workspace_id: "default",
    name: "Active starter A",
    description: "active template",
    business_track: "应用新建编排",
    default_workflow_name: "Starter A",
    workflow_focus: "entry flow",
    recommended_next_step: "",
    tags: ["entry"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-a",
    created_from_workflow_version: "0.1.0",
    archived: false,
    archived_at: null,
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T10:00:00Z"
  },
  {
    id: "starter-archived-sandbox",
    workspace_id: "default",
    name: "Archived sandbox starter",
    description: "sandbox template",
    business_track: "编排节点能力",
    default_workflow_name: "Sandbox starter",
    workflow_focus: "sandbox authoring",
    recommended_next_step: "",
    tags: ["sandbox"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-b",
    created_from_workflow_version: "0.2.0",
    archived: true,
    archived_at: "2026-03-21T12:00:00Z",
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T12:00:00Z"
  },
  {
    id: "starter-active-sandbox",
    workspace_id: "default",
    name: "Active sandbox starter",
    description: "sandbox template",
    business_track: "编排节点能力",
    default_workflow_name: "Sandbox starter active",
    workflow_focus: "sandbox authoring",
    recommended_next_step: "",
    tags: ["sandbox"],
    definition: {
      nodes: [],
      edges: []
    },
    created_from_workflow_id: "wf-c",
    created_from_workflow_version: "0.3.0",
    archived: false,
    archived_at: null,
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T12:00:00Z"
  }
];

describe("workspace starter library URL state", () => {
  it("restores focused starter from coherent query filters", () => {
    const viewState = resolveWorkspaceStarterLibraryViewState(
      {
        track: "编排节点能力",
        archive: "archived",
        q: " sandbox ",
        starter: "starter-archived-sandbox"
      },
      templates
    );

    expect(viewState).toEqual({
      activeTrack: "编排节点能力",
      archiveFilter: "archived",
      searchQuery: "sandbox",
      selectedTemplateId: "starter-archived-sandbox"
    });
  });

  it("falls back to the first filtered starter when requested focus is stale", () => {
    const viewState = resolveWorkspaceStarterLibraryViewState(
      {
        track: "编排节点能力",
        archive: "active",
        starter: "missing-starter"
      },
      templates
    );

    expect(viewState.selectedTemplateId).toBe("starter-active-sandbox");
    expect(viewState.activeTrack).toBe("编排节点能力");
    expect(viewState.archiveFilter).toBe("active");
  });

  it("serializes only non-default filters while keeping the selected starter", () => {
    const searchParams = buildWorkspaceStarterLibrarySearchParams({
      activeTrack: "编排节点能力",
      archiveFilter: "archived",
      searchQuery: " sandbox ",
      selectedTemplateId: "starter-archived-sandbox"
    });

    expect(searchParams.get("track")).toBe("编排节点能力");
    expect(searchParams.get("archive")).toBe("archived");
    expect(searchParams.get("q")).toBe("sandbox");
    expect(searchParams.get("starter")).toBe("starter-archived-sandbox");
  });
});
