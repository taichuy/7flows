import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadWorkflowCreateWizardBootstrap } from "@/components/workflow-create-wizard/bootstrap";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflows } from "@/lib/get-workflows";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-client";

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/workflow-publish-client", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [{ type: "trigger" }],
    starters: [{ id: "starter-1" }],
    starterSourceLanes: [{ kind: "starter" }],
    nodeSourceLanes: [{ kind: "node" }],
    toolSourceLanes: [{ kind: "tool" }],
    tools: [{ id: "tool-1" }, { id: "tool-2" }]
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
  vi.mocked(getWorkflows).mockResolvedValue([
    { id: "workflow-1" }
  ] as Awaited<ReturnType<typeof getWorkflows>>);
  vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue({
    generated_at: "2026-03-31T04:30:00Z",
    workflow_count: 0,
    binding_count: 0,
    summary: {
      draft_candidate_count: 0,
      published_blocker_count: 0,
      offline_inventory_count: 0
    },
    checklist: [],
    workflows: [],
    buckets: {
      draft_candidates: [],
      published_blockers: [],
      offline_inventory: []
    }
  } as Awaited<ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>>);
});

describe("loadWorkflowCreateWizardBootstrap", () => {
  it("loads create setup with scoped library query after the entry seam", async () => {
    const result = await loadWorkflowCreateWizardBootstrap({
      governanceQueryScope: {
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        searchQuery: "drift",
        selectedTemplateId: null
      },
      includeLegacyAuthGovernanceSnapshot: false,
      libraryQuery: {
        businessTrack: "应用新建编排",
        search: "drift",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        includeBuiltinStarters: false,
        includeStarterDefinitions: true
      }
    });

    expect(vi.mocked(getWorkflowLibrarySnapshot)).toHaveBeenCalledWith({
      businessTrack: "应用新建编排",
      search: "drift",
      sourceGovernanceKind: "drifted",
      needsFollowUp: true,
      includeBuiltinStarters: false,
      includeStarterDefinitions: true
    });
    expect(vi.mocked(getWorkflows)).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot)
    ).not.toHaveBeenCalled();
    expect(result.catalogToolCount).toBe(2);
    expect(result.starters).toHaveLength(1);
    expect(result.workflows).toHaveLength(1);
  });

  it("includes legacy auth governance only when the request asks for it", async () => {
    const result = await loadWorkflowCreateWizardBootstrap({
      governanceQueryScope: {
        activeTrack: "应用新建编排",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        searchQuery: "drift",
        selectedTemplateId: "starter-1"
      },
      includeLegacyAuthGovernanceSnapshot: true,
      libraryQuery: {
        businessTrack: "应用新建编排",
        search: "drift",
        sourceGovernanceKind: "drifted",
        needsFollowUp: true,
        includeBuiltinStarters: true,
        includeStarterDefinitions: true
      }
    });

    expect(
      vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot)
    ).toHaveBeenCalledTimes(1);
    expect(result.legacyAuthGovernanceSnapshot).not.toBeNull();
  });
});
