import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsExecutionOverview } from "@/components/run-diagnostics-execution/execution-overview";
import type { RunExecutionView } from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import {
  buildLegacyAuthGovernanceSnapshotFixture,
  buildLegacyAuthGovernanceWorkflowFixture
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-diagnostics-execution/operator-follow-up-card", () => ({
  RunDiagnosticsOperatorFollowUpCard: () =>
    createElement("div", { "data-testid": "operator-follow-up-card" }, "operator follow-up")
}));

vi.mock("@/components/run-diagnostics-execution/execution-overview-blockers", () => ({
  RunDiagnosticsExecutionOverviewBlockers: () =>
    createElement("div", { "data-testid": "execution-overview-blockers" }, "blockers")
}));

vi.mock("@/components/run-diagnostics-execution/legacy-auth-governance-card", () => ({
  RunDiagnosticsLegacyAuthGovernanceCard: () =>
    createElement("div", { "data-testid": "legacy-auth-governance-card" }, "legacy auth detail")
}));

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "healthy",
    scheduler_required: true,
    detail: "callback waiting automation healthy",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "scheduler loop is healthy",
    steps: []
  };
}

function buildExecutionView(): RunExecutionView {
  return {
    run_id: "run-123",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    compiled_blueprint_id: null,
    status: "waiting",
    summary: {
      node_run_count: 1,
      waiting_node_count: 0,
      errored_node_count: 0,
      execution_dispatched_node_count: 1,
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
      binding_count: 1,
      workflows: [
        buildLegacyAuthGovernanceWorkflowFixture({
          workflow_id: "workflow-1",
          workflow_name: "Demo Workflow",
          binding_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 0,
          draft_candidate_count: 0
        })
      ]
    }),
    run_snapshot: null,
    run_follow_up: null,
    skill_trace: null,
    nodes: []
  };
}

describe("RunDiagnosticsExecutionOverview", () => {
  it("surfaces shared workflow governance handoff when execution overview still has a catalog gap", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverview, {
        executionView: buildExecutionView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      })
    );

    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("execution overview 对应的 workflow 版本仍有 catalog gap");
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=legacy_publish_auth"');
    expect(html).toContain("legacy binding");
    expect(html).toContain("legacy auth detail");
  });

  it("keeps explicit workflow detail query state on overview governance links", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverview, {
        executionView: buildExecutionView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        workflowDetailHref: "/workflows/workflow-1?starter=starter-openclaw",
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow-1?starter=starter-openclaw&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?starter=starter-openclaw&amp;definition_issue=legacy_publish_auth"'
    );
  });

  it("keeps shared workflow governance handoff visible when only legacy auth remains", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverview, {
        executionView: buildExecutionView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        toolGovernance: {
          referenced_tool_ids: ["native.available-tool"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      })
    );

    expect(html).toContain("Legacy publish auth handoff");
    expect(html).not.toContain("catalog gap ·");
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=legacy_publish_auth"');
    expect(html).toContain("legacy binding");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("legacy auth detail");
  });
});
