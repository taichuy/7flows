import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsLegacyAuthGovernanceCard } from "@/components/run-diagnostics-execution/legacy-auth-governance-card";
import type { RunExecutionView } from "@/lib/get-run-views";
import { buildLegacyPublishAuthGovernanceSurfaceCopy } from "@/lib/legacy-publish-auth-governance-presenters";
import {
  buildLegacyAuthGovernanceBindingFixture,
  buildLegacyAuthGovernanceDraftCleanupChecklistFixture,
  buildLegacyAuthGovernancePublishedFollowUpChecklistFixture,
  buildLegacyAuthGovernanceSnapshotFixture,
  buildLegacyAuthGovernanceWorkflowFixture
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildExecutionView(): RunExecutionView {
  return {
    run_id: "run-123",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    compiled_blueprint_id: null,
    status: "waiting",
    summary: {
      node_run_count: 0,
      waiting_node_count: 0,
      errored_node_count: 0,
      execution_dispatched_node_count: 0,
      execution_fallback_node_count: 0,
      execution_blocked_node_count: 0,
      execution_unavailable_node_count: 0,
      artifact_count: 0,
      tool_call_count: 0,
      ai_call_count: 0,
      assistant_call_count: 0,
      callback_ticket_count: 0,
      skill_reference_load_count: 0,
      sensitive_access_request_count: 0,
      sensitive_access_approval_ticket_count: 0,
      sensitive_access_notification_count: 0,
      artifact_kind_counts: {},
      tool_status_counts: {},
      ai_role_counts: {},
      execution_requested_class_counts: {},
      execution_effective_class_counts: {},
      execution_executor_ref_counts: {},
      execution_sandbox_backend_counts: {},
      skill_reference_phase_counts: {},
      skill_reference_source_counts: {},
      callback_ticket_status_counts: {},
      sensitive_access_decision_counts: {},
      sensitive_access_approval_status_counts: {},
      sensitive_access_notification_status_counts: {},
      callback_waiting: {
        node_count: 0,
        terminated_node_count: 0,
        issued_ticket_count: 0,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 0,
        scheduled_resume_pending_node_count: 0,
        scheduled_resume_requeued_node_count: 0,
        resume_source_counts: {},
        scheduled_resume_source_counts: {},
        termination_reason_counts: {}
      }
    },
    blocking_node_run_id: null,
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    legacy_auth_governance: buildLegacyAuthGovernanceSnapshotFixture({
      workflow_count: 1,
      binding_count: 2,
      summary: {
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0
      },
      checklist: [
        buildLegacyAuthGovernanceDraftCleanupChecklistFixture({
          workflow_name: "Demo Workflow",
          detail: "先处理 draft cleanup。"
        }),
        buildLegacyAuthGovernancePublishedFollowUpChecklistFixture({
          workflow_name: "Demo Workflow",
          detail: "再处理 live legacy published blockers。"
        })
      ],
      workflows: [
        buildLegacyAuthGovernanceWorkflowFixture({
          workflow_id: "workflow-1",
          workflow_name: "Demo Workflow",
          binding_count: 2,
          draft_candidate_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 0
        })
      ],
      buckets: {
        draft_candidates: [
          buildLegacyAuthGovernanceBindingFixture({
            workflow_id: "workflow-1",
            workflow_name: "Demo Workflow",
            binding_id: "binding-draft",
            endpoint_id: "endpoint-draft",
            endpoint_name: "Draft Endpoint",
            workflow_version: "1.0.0",
            lifecycle_status: "draft"
          })
        ],
        published_blockers: [
          buildLegacyAuthGovernanceBindingFixture({
            workflow_id: "workflow-1",
            workflow_name: "Demo Workflow",
            binding_id: "binding-live",
            endpoint_id: "endpoint-live",
            endpoint_name: "Live Endpoint",
            workflow_version: "1.0.0"
          })
        ],
        offline_inventory: []
      }
    }),
    run_snapshot: null,
    run_follow_up: null,
    skill_trace: null,
    nodes: []
  };
}

describe("RunDiagnosticsLegacyAuthGovernanceCard", () => {
  it("renders the workflow legacy auth handoff in run diagnostics", () => {
    const surfaceCopy = buildLegacyPublishAuthGovernanceSurfaceCopy();
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsLegacyAuthGovernanceCard, {
        executionView: buildExecutionView()
      })
    );

    expect(html).toContain(surfaceCopy.title);
    expect(html).toContain("Publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain("legacy token");
    expect(html).toContain("shared workflow artifact");
    expect(html).toContain(surfaceCopy.description);
    expect(html).toContain("Draft cleanup");
    expect(html).toContain("Published blockers");
    expect(html).toContain("先批量下线 draft legacy bindings");
    expect(html).toContain("再补发支持鉴权的 replacement bindings");
    expect(html).toContain(surfaceCopy.workflowFollowUpTitle);
    expect(html).toContain("回到 workflow 编辑器");
    expect(html).toContain('href="/workflows/workflow-1"');
    expect(html).toContain("当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory");
  });

  it("keeps the workflow handoff inside missing-tool scope when the workflow still has a catalog gap", () => {
    const executionView = buildExecutionView();
    executionView.legacy_auth_governance = buildLegacyAuthGovernanceSnapshotFixture({
      workflow_count: 1,
      binding_count: 1,
      workflows: [
        buildLegacyAuthGovernanceWorkflowFixture({
          workflow_id: "workflow-1",
          workflow_name: "Demo Workflow",
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        })
      ]
    });

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsLegacyAuthGovernanceCard, {
        executionView
      })
    );

    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
  });

  it("returns nothing when the run has no legacy auth governance snapshot", () => {
    const executionView = buildExecutionView();
    executionView.legacy_auth_governance = null;

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsLegacyAuthGovernanceCard, {
        executionView
      })
    );

    expect(html).toBe("");
  });
});
