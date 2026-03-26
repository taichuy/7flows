import { describe, expect, it } from "vitest";

import { buildOperatorRunSampleCards } from "@/lib/operator-run-sample-cards";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

function buildSampleApprovalEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool",
      requester_id: "callback.wait",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "Inspect callback blocker",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "Approval is required.",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Callback gate",
      description: "Protected callback endpoint",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T10:00:00Z",
      updated_at: "2026-03-20T10:00:00Z"
    },
    approval_ticket: {
      id: "approval-ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
      follow_up: "优先处理审批票据，再观察 callback waiting 是否恢复。"
    }
  };
}

describe("buildOperatorRunSampleCards", () => {
  it("builds inbox hrefs from sample approval context before callback tickets", () => {
    const cards = buildOperatorRunSampleCards([
      {
        runId: "run-1",
        snapshot: {
          status: "waiting",
          currentNodeId: "callback_node",
          waitingReason: "callback pending",
          executionFocusNodeId: "callback_node",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Callback node",
          callbackWaitingExplanation: {
            primary_signal: "当前 waiting 节点仍在等待 callback。"
          },
          executionFocusArtifactRefs: [],
          executionFocusArtifacts: [],
          executionFocusToolCalls: [],
          executionFocusSkillTrace: null
        },
        callbackTickets: [
          {
            ticket: "callback-ticket-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_call_id: "tool-call-1",
            tool_id: "callback.wait",
            tool_call_index: 0,
            waiting_status: "waiting",
            status: "pending",
            reason: "callback pending",
            callback_payload: null,
            created_at: "2026-03-20T10:00:00Z",
            expires_at: null,
            consumed_at: null,
            canceled_at: null,
            expired_at: null
          }
        ],
        sensitiveAccessEntries: [buildSampleApprovalEntry()]
      }
    ]);

    expect(cards[0]).toMatchObject({
      inboxHref:
        "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-1&node_run_id=node-run-1&access_request_id=request-1&approval_ticket_id=approval-ticket-1"
    });
  });

  it("prioritizes legacy publish auth workflow handoff on sampled run cards", () => {
    const cards = buildOperatorRunSampleCards([
      {
        runId: "run-1",
        snapshot: {
          workflowId: "workflow-sampled",
          status: "waiting",
          currentNodeId: "approval_gate",
          executionFocusArtifactRefs: [],
          executionFocusArtifacts: [],
          executionFocusToolCalls: [],
          executionFocusSkillTrace: null
        },
        callbackTickets: [],
        sensitiveAccessEntries: [],
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          binding: {
            workflow_id: "workflow-sampled",
            workflow_name: "Sampled Workflow"
          }
        })
      }
    ]);

    expect(cards[0]).toMatchObject({
      workflowGovernanceHref: "/workflows/workflow-sampled?definition_issue=legacy_publish_auth",
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
    expect(cards[0].workflowCatalogGapDetail).toContain("catalog gap（native.catalog-gap）");
    expect(cards[0].legacyAuthHandoff?.detail).toContain("published blocker");
  });

  it("preserves scoped workflow detail href when a resolver is provided", () => {
    const cards = buildOperatorRunSampleCards(
      [
        {
          runId: "run-1",
          snapshot: {
            workflowId: "workflow-sampled",
            status: "waiting",
            currentNodeId: "approval_gate",
            executionFocusArtifactRefs: [],
            executionFocusArtifacts: [],
            executionFocusToolCalls: [],
            executionFocusSkillTrace: null
          },
          callbackTickets: [],
          sensitiveAccessEntries: [],
          toolGovernance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
            binding: {
              workflow_id: "workflow-sampled",
              workflow_name: "Sampled Workflow"
            }
          })
        }
      ],
      {
        resolveWorkflowDetailHref: (workflowId) =>
          workflowId === "workflow-sampled"
            ? "/workflows/workflow-sampled?starter=starter-openclaw"
            : null
      }
    );

    expect(cards[0]).toMatchObject({
      workflowCatalogGapHref:
        "/workflows/workflow-sampled?starter=starter-openclaw&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-sampled?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    });
  });
});
