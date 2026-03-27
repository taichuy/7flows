import { describe, expect, it } from "vitest";

import {
  buildLegacyPublishAuthGovernanceSurfaceCopy,
  buildLegacyPublishAuthWorkflowHandoff,
  buildLegacyPublishAuthWorkflowHandoffFromWorkflowSummary
} from "@/lib/legacy-publish-auth-governance-presenters";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

describe("legacy publish auth governance presenters", () => {
  it("keeps the cross-entry legacy auth handoff copy on a shared contract", () => {
    expect(buildLegacyPublishAuthGovernanceSurfaceCopy()).toEqual({
      title: "Legacy publish auth handoff",
      description:
        "publish activity export、run diagnostics 和 invocation detail 现在共享同一份 workflow 级 legacy publish auth artifact，避免 operator 在 audit 入口重新拼 draft cleanup / published blocker checklist。",
      workflowFollowUpTitle: "Workflow follow-up",
      workflowFollowUpFallback:
        "回到 workflow detail 继续处理 draft cleanup / published blocker；当前 publish audit detail 与 export 现在共享同一份 workflow handoff。"
    });
  });

  it("builds a workflow-scoped legacy auth handoff for compact run surfaces", () => {
    expect(
      buildLegacyPublishAuthWorkflowHandoff(
        buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          binding: {
            workflow_id: "workflow-run-1",
            workflow_name: "Run Workflow"
          }
        }),
        "workflow-run-1"
      )
    ).toEqual({
      bindingChipLabel: "1 legacy bindings",
      statusChipLabel: "publish auth blocker",
      detail:
        "当前 workflow 仍有 0 条 draft cleanup、1 条 published blocker、0 条 offline inventory。" +
        "Publish auth contract：supported api_key / internal；legacy token。",
      workflowSummary: {
        workflow_id: "workflow-run-1",
        workflow_name: "Run Workflow",
        binding_count: 1,
        draft_candidate_count: 0,
        published_blocker_count: 1,
        offline_inventory_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      }
    });
  });


  it("builds a workflow-scoped legacy auth handoff from workflow summaries", () => {
    expect(
      buildLegacyPublishAuthWorkflowHandoffFromWorkflowSummary({
        workflow_id: "workflow-summary-1",
        workflow_name: "Summary Workflow",
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0,
        tool_governance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      })
    ).toEqual({
      bindingChipLabel: "2 legacy bindings",
      statusChipLabel: "publish auth blocker",
      detail: "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。",
      workflowSummary: {
        workflow_id: "workflow-summary-1",
        workflow_name: "Summary Workflow",
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0,
        tool_governance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      }
    });
  });
});
