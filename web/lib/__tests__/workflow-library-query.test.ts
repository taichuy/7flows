import { describe, expect, it } from "vitest";

import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";
import {
  appendWorkflowLibraryViewStateForWorkflow,
  appendWorkflowLibraryViewState,
  buildWorkflowLibrarySearchParams,
  readWorkflowLibraryViewState,
  resolveWorkflowLibraryViewStateForWorkflow
} from "@/lib/workflow-library-query";

describe("workflow-library-query", () => {
  it("reads and normalizes the workflow library definition issue filter", () => {
    expect(
      readWorkflowLibraryViewState({
        definition_issue: [" legacy_publish_auth ", "ignored"]
      })
    ).toEqual({
      definitionIssue: "legacy_publish_auth"
    });
  });

  it("accepts the missing tool workflow definition issue filter", () => {
    expect(
      readWorkflowLibraryViewState({
        definition_issue: [" missing_tool ", "ignored"]
      })
    ).toEqual({
      definitionIssue: "missing_tool"
    });
  });

  it("drops unsupported workflow library definition issue filters", () => {
    expect(
      readWorkflowLibraryViewState(
        new URLSearchParams({
          definition_issue: "unknown"
        })
      )
    ).toEqual({
      definitionIssue: null
    });
  });

  it("round-trips the definition issue filter through search params and hrefs", () => {
    const searchParams = buildWorkflowLibrarySearchParams({
      definitionIssue: "missing_tool"
    });

    expect(readWorkflowLibraryViewState(searchParams)).toEqual({
      definitionIssue: "missing_tool"
    });
    expect(
      appendWorkflowLibraryViewState(
        "/workflows?needs_follow_up=true&starter=starter-openclaw",
        {
          definitionIssue: "missing_tool"
        }
      )
    ).toBe(
      "/workflows?needs_follow_up=true&starter=starter-openclaw&definition_issue=missing_tool"
    );
    expect(
      appendWorkflowLibraryViewState(
        "/workflows?definition_issue=legacy_publish_auth&starter=starter-openclaw",
        {
          definitionIssue: null
        }
      )
    ).toBe("/workflows?starter=starter-openclaw");
  });

  it("defaults workflow detail links to missing-tool scope when the workflow has a catalog gap", () => {
    expect(
      resolveWorkflowLibraryViewStateForWorkflow(
        {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: [" native.catalog-gap ", "native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        },
        {
          definitionIssue: null
        }
      )
    ).toEqual({
      definitionIssue: "missing_tool"
    });
    expect(
      appendWorkflowLibraryViewStateForWorkflow(
        "/workflows/workflow-gap?starter=starter-openclaw",
        {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        },
        {
          definitionIssue: null
        }
      )
    ).toBe(
      "/workflows/workflow-gap?starter=starter-openclaw&definition_issue=missing_tool"
    );
  });

  it("defaults workflow detail links to legacy-auth scope when the workflow still has publish auth blockers", () => {
    expect(
      resolveWorkflowLibraryViewStateForWorkflow(
        {
          legacy_auth_governance: {
            binding_count: 2,
            draft_candidate_count: 1,
            published_blocker_count: 1,
            offline_inventory_count: 0
          }
        },
        {
          definitionIssue: null
        }
      )
    ).toEqual({
      definitionIssue: "legacy_publish_auth"
    });
    expect(
      appendWorkflowLibraryViewStateForWorkflow(
        "/workflows/workflow-auth?starter=starter-openclaw",
        {
          legacy_auth_governance: {
            binding_count: 1,
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 0
          }
        },
        {
          definitionIssue: null
        }
      )
    ).toBe(
      "/workflows/workflow-auth?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
  });

  it("treats run-level legacy auth snapshots as legacy-auth workflow scope", () => {
    expect(
      appendWorkflowLibraryViewStateForWorkflow(
        "/workflows/workflow-run?starter=starter-openclaw",
        {
          legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
            binding: {
              workflow_id: "workflow-run"
            }
          })
        },
        {
          definitionIssue: null
        }
      )
    ).toBe(
      "/workflows/workflow-run?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
  });

  it("prioritizes legacy-auth scope over missing-tool scope when both governance blockers exist", () => {
    expect(
      appendWorkflowLibraryViewStateForWorkflow(
        "/workflows/workflow-mixed?starter=starter-openclaw",
        {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacy_auth_governance: {
            binding_count: 1,
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 0
          }
        },
        {
          definitionIssue: null
        }
      )
    ).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
  });

  it("preserves an explicit workflow library scope when the workflow already has one", () => {
    expect(
      appendWorkflowLibraryViewStateForWorkflow(
        "/workflows/workflow-auth?starter=starter-openclaw",
        {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        },
        {
          definitionIssue: "legacy_publish_auth"
        }
      )
    ).toBe(
      "/workflows/workflow-auth?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
  });
});
