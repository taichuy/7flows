import { describe, expect, it } from "vitest";

import {
  appendWorkflowLibraryViewState,
  buildWorkflowLibrarySearchParams,
  readWorkflowLibraryViewState
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
      definitionIssue: "legacy_publish_auth"
    });

    expect(readWorkflowLibraryViewState(searchParams)).toEqual({
      definitionIssue: "legacy_publish_auth"
    });
    expect(
      appendWorkflowLibraryViewState(
        "/workflows?needs_follow_up=true&starter=starter-openclaw",
        {
          definitionIssue: "legacy_publish_auth"
        }
      )
    ).toBe(
      "/workflows?needs_follow_up=true&starter=starter-openclaw&definition_issue=legacy_publish_auth"
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
});
