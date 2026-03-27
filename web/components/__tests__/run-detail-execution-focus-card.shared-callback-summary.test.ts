import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RunDetail } from "@/lib/get-run-detail";

const callbackSummaryProps: Record<string, unknown>[] = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement("div", { "data-testid": "callback-summary-card" }, "callback summary");
  }
}));

vi.mock("@/components/operator-focus-evidence-card", () => ({
  OperatorFocusEvidenceCard: () => createElement("div", null, "focus evidence")
}));

vi.mock("@/components/operator-recommended-next-step-card", () => ({
  OperatorRecommendedNextStepCard: () => createElement("div", null, "recommended next step")
}));

vi.mock("@/components/sandbox-execution-readiness-card", () => ({
  SandboxExecutionReadinessCard: () => createElement("div", null, "sandbox readiness")
}));

vi.mock("@/components/skill-reference-load-list", () => ({
  SkillReferenceLoadList: () => createElement("div", null, "skill refs")
}));

import { RunDetailExecutionFocusCard } from "@/components/run-detail-execution-focus-card";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

function buildRunDetail(): RunDetail {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "waiting",
    input_payload: {},
    output_payload: null,
    error_message: null,
    current_node_id: "tool_wait",
    started_at: "2026-03-20T10:00:00Z",
    finished_at: null,
    created_at: "2026-03-20T10:00:00Z",
    event_count: 0,
    event_type_counts: {},
    first_event_at: null,
    last_event_at: null,
    blocking_node_run_id: "node-run-1",
    execution_focus_reason: "current_node",
    execution_focus_node: {
      node_run_id: "node-run-1",
      node_id: "tool_wait",
      node_name: "Tool Wait",
      node_type: "tool",
      status: "waiting",
      callback_waiting_explanation: {
        primary_signal: "当前节点仍在等待 callback。",
        follow_up: "先处理 workflow definition issue。"
      },
      callback_waiting_lifecycle: null,
      phase: "execute",
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      requested_execution_class: "sandbox",
      requested_execution_source: "runtime_policy",
      requested_execution_profile: null,
      requested_execution_timeout_ms: null,
      requested_execution_network_policy: null,
      requested_execution_filesystem_policy: null,
      requested_execution_dependency_mode: null,
      requested_execution_builtin_package_set: null,
      requested_execution_dependency_ref: null,
      requested_execution_backend_extensions: null,
      effective_execution_class: "sandbox",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_id: "sandbox-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_blocking_reason: null,
      execution_fallback_reason: null,
      scheduled_resume_delay_seconds: null,
      scheduled_resume_reason: null,
      scheduled_resume_source: null,
      scheduled_waiting_status: null,
      scheduled_resume_scheduled_at: null,
      scheduled_resume_due_at: null,
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null,
      artifact_refs: [],
      artifacts: [],
      tool_calls: []
    },
    execution_focus_explanation: {
      primary_signal: "当前节点仍在等待 callback。",
      follow_up: "先看当前 tool 实际落在哪个 runner。"
    },
    execution_focus_skill_trace: null,
    tool_governance: {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    },
    legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "workflow-1",
        workflow_name: "Run detail workflow"
      }
    }),
    run_follow_up: {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "sampled run still waiting",
        follow_up: "处理 callback waiting blocker。"
      },
      recommended_action: null,
      sampled_runs: [
        {
          run_id: "run-1",
          snapshot: {
            workflow_id: "workflow-1",
            callback_waiting_explanation: {
              primary_signal: "当前节点仍在等待 callback。",
              follow_up: "先处理 workflow definition issue。"
            }
          },
          callback_tickets: [],
          sensitive_access_entries: [],
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
            binding: {
              workflow_id: "workflow-1",
              workflow_name: "Run detail workflow"
            }
          })
        }
      ]
    },
    node_runs: [
      {
        id: "node-run-1",
        node_id: "tool_wait",
        node_name: "Tool Wait",
        node_type: "tool",
        status: "waiting",
        phase: "execute",
        retry_count: 0,
        input_payload: {},
        checkpoint_payload: {},
        working_context: {},
        evidence_context: null,
        artifact_refs: [],
        output_payload: null,
        error_message: null,
        waiting_reason: "callback pending",
        started_at: "2026-03-20T10:00:00Z",
        phase_started_at: "2026-03-20T10:00:00Z",
        finished_at: null
      }
    ],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    events: []
  } as unknown as RunDetail;
}

describe("RunDetailExecutionFocusCard shared callback summary handoff", () => {
  it("forwards workflow governance handoff into the shared callback summary", () => {
    callbackSummaryProps.length = 0;

    renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run: buildRunDetail(),
        workflowDetailHref:
          "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
      })
    );

    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=legacy_publish_auth",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
  });
});
