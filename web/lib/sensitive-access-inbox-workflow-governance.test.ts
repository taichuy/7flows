import { describe, expect, it } from "vitest";

import { buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff } from "./sensitive-access-inbox-workflow-governance";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "./workflow-publish-legacy-auth-test-fixtures";
import {
  buildSensitiveAccessInboxEntryFixture,
  buildSensitiveAccessRequestFixture,
  buildSensitiveAccessTicketFixture
} from "./workbench-page-test-fixtures";

describe("sensitive access inbox workflow governance handoff", () => {
  it("preserves scoped workflow detail hrefs when provided by the caller", () => {
    const handoff = buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
      entry: buildSensitiveAccessInboxEntryFixture({
        ticket: buildSensitiveAccessTicketFixture({
          run_id: "run-1",
          node_run_id: "node-run-1"
        }),
        request: buildSensitiveAccessRequestFixture({
          run_id: "run-1",
          node_run_id: "node-run-1"
        }),
        runSnapshot: {
          workflowId: "workflow-1"
        },
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          recommendedAction: null,
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: {
                workflowId: "workflow-1"
              },
              callbackTickets: [],
              sensitiveAccessEntries: [],
              toolGovernance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              },
              legacyAuthGovernance:
                buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                  binding: {
                    workflow_id: "workflow-1",
                    workflow_name: "Workflow 1"
                  }
                })
            }
          ]
        }
      }),
      resolveWorkflowDetailHref: (workflowId) =>
        `/workflows/${workflowId}?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92`,
      subjectLabel: "operator backlog",
      returnDetail: "先回到 workflow 编辑器补齐 binding / publish auth contract。"
    });

    expect(handoff).toMatchObject({
      workflowId: "workflow-1",
      workflowCatalogGapHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=legacy_publish_auth",
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap"
    });
    expect(handoff.workflowCatalogGapDetail).toContain("operator backlog");
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
  });

  it("prefers the canonical sampled run before deriving workflow governance links", () => {
    const handoff = buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
      entry: buildSensitiveAccessInboxEntryFixture({
        ticket: buildSensitiveAccessTicketFixture({
          run_id: null,
          node_run_id: "node-run-1"
        }),
        request: buildSensitiveAccessRequestFixture({
          run_id: null,
          node_run_id: "node-run-1"
        }),
        runFollowUp: {
          affectedRunCount: 2,
          sampledRunCount: 2,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 1,
          unknownRunCount: 0,
          recommendedAction: null,
          sampledRuns: [
            {
              runId: "run-stale",
              snapshot: {
                workflowId: "workflow-stale"
              },
              callbackTickets: [],
              sensitiveAccessEntries: [],
              toolGovernance: {
                referenced_tool_ids: ["native.stale-gap"],
                missing_tool_ids: ["native.stale-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              },
              legacyAuthGovernance:
                buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                  binding: {
                    workflow_id: "workflow-stale",
                    workflow_name: "Workflow stale"
                  }
                })
            },
            {
              runId: "run-current",
              snapshot: {
                workflowId: "workflow-current"
              },
              callbackTickets: [],
              sensitiveAccessEntries: [],
              toolGovernance: {
                referenced_tool_ids: ["native.current-gap"],
                missing_tool_ids: ["native.current-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              },
              legacyAuthGovernance:
                buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                  binding: {
                    workflow_id: "workflow-current",
                    workflow_name: "Workflow current"
                  }
                })
            }
          ]
        }
      }),
      canonicalRunId: "run-current",
      subjectLabel: "callback summary",
      returnDetail: "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy。"
    });

    expect(handoff).toMatchObject({
      workflowId: "workflow-current",
      workflowCatalogGapSummary: "catalog gap · native.current-gap",
      workflowCatalogGapHref: "/workflows/workflow-current?definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-current?definition_issue=legacy_publish_auth"
    });
    expect(handoff.workflowCatalogGapDetail).toContain("callback summary");
    expect(handoff.workflowCatalogGapDetail).toContain(
      "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy。"
    );
  });

  it("falls back to entry legacy-auth governance when sampled runs omit tool governance", () => {
    const baseLegacyAuth = buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "workflow-entry",
        workflow_name: "Workflow entry"
      }
    });

    const handoff = buildSensitiveAccessInboxEntryWorkflowGovernanceHandoff({
      entry: buildSensitiveAccessInboxEntryFixture({
        legacyAuthGovernance: {
          ...baseLegacyAuth,
          workflows: [
            {
              ...baseLegacyAuth.workflows[0],
              tool_governance: {
                referenced_tool_ids: ["native.entry-gap"],
                missing_tool_ids: ["native.entry-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              }
            }
          ]
        },
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          recommendedAction: null,
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: {
                workflowId: "workflow-entry"
              },
              callbackTickets: [],
              sensitiveAccessEntries: []
            }
          ]
        }
      }),
      runSnapshot: {
        workflowId: "workflow-entry"
      },
      subjectLabel: "operator backlog",
      returnDetail: "先回到 workflow 编辑器收口 publish auth contract。"
    });

    expect(handoff).toMatchObject({
      workflowId: "workflow-entry",
      workflowCatalogGapSummary: "catalog gap · native.entry-gap",
      workflowCatalogGapHref: "/workflows/workflow-entry?definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-entry?definition_issue=legacy_publish_auth"
    });
    expect(handoff.workflowCatalogGapDetail).toContain("operator backlog");
    expect(handoff.workflowCatalogGapDetail).toContain(
      "先回到 workflow 编辑器收口 publish auth contract。"
    );
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
  });
});
