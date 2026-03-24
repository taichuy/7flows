import { describe, expect, it } from "vitest";

import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import {
  buildCallbackWaitingAutomationFixture,
  buildCallbackWaitingAutomationStepFixture,
  buildRecentRunEventFixture,
  buildSandboxExecutionClassReadinessFixture,
  buildSandboxReadinessFixture,
  buildSensitiveAccessBlockerFixture,
  buildSensitiveAccessExecutionContextFixture,
  buildSensitiveAccessExecutionFocusNodeFixture,
  buildSensitiveAccessInboxEntryFixture,
  buildSensitiveAccessRequestFixture,
  buildSensitiveAccessResourceFixture,
  buildSensitiveAccessSummaryFixture,
  buildSensitiveAccessTicketFixture
} from "@/lib/workbench-page-test-fixtures";

function buildFocusedBacklogEntry(): SensitiveAccessInboxEntry {
  return buildSensitiveAccessInboxEntryFixture({
    ticket: buildSensitiveAccessTicketFixture({
      run_id: "run-entry",
      node_run_id: "node-entry",
      created_at: "2026-03-22T10:00:00Z"
    }),
    request: buildSensitiveAccessRequestFixture({
      run_id: "run-entry",
      node_run_id: "node-entry",
      requester_type: "ai",
      requester_id: "agent-1",
      resource_id: "resource-prod-secret",
      purpose_text: "read prod secret",
      decision_label: "Require approval",
      reason_code: "sensitive_access",
      reason_label: "Sensitive access",
      policy_summary: "needs approval",
      created_at: "2026-03-22T09:59:00Z"
    }),
    resource: buildSensitiveAccessResourceFixture({
      id: "resource-prod-secret",
      label: "Prod secret",
      description: "production secret",
      sensitivity_level: "L3",
      source: "credential",
      created_at: "2026-03-22T09:00:00Z",
      updated_at: "2026-03-22T09:30:00Z"
    }),
    executionContext: buildSensitiveAccessExecutionContextFixture({
      runId: "run-focus",
      focusNode: buildSensitiveAccessExecutionFocusNodeFixture({
        node_run_id: "node-focus",
        node_id: "approve-node",
        node_name: "Approval gate"
      }),
      focusMatchesEntry: false,
      entryNodeRunId: "node-entry"
    })
  });
}

describe("buildCrossEntryRiskDigest", () => {
  it("prioritizes operator inbox when approval backlog is still blocking resume", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: buildSandboxReadinessFixture({
        enabled_backend_count: 2,
        healthy_backend_count: 1,
        degraded_backend_count: 0,
        offline_backend_count: 1,
        execution_classes: [
          buildSandboxExecutionClassReadinessFixture(),
          buildSandboxExecutionClassReadinessFixture({
            execution_class: "microvm",
            available: false,
            backend_ids: [],
            supported_languages: [],
            supported_profiles: [],
            supported_dependency_modes: [],
            supports_tool_execution: false,
            supports_network_policy: false,
            supports_filesystem_policy: false,
            reason: "microvm backend offline"
          })
        ],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["none"],
        supports_tool_execution: true,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture({
        status: "partial",
        detail: "waiting resume monitor is configured but cleanup is stale",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "cleanup has not finished recently",
        steps: [
          buildCallbackWaitingAutomationStepFixture({
            scheduler_health: {
              last_started_at: "2026-03-22T10:00:00Z",
              last_finished_at: "2026-03-22T10:00:10Z",
              matched_count: 2,
              affected_count: 2
            }
          }),
          buildCallbackWaitingAutomationStepFixture({
            key: "callback_ticket_cleanup",
            label: "Callback ticket cleanup",
            task: "cleanup",
            interval_seconds: 60,
            detail: "clean expired callback tickets",
            scheduler_health: {
              health_status: "stale",
              detail: "cleanup has not run recently",
              last_status: "stale",
              last_started_at: "2026-03-22T09:00:00Z",
              last_finished_at: "2026-03-22T09:00:10Z",
              matched_count: 0,
              affected_count: 0
            }
          })
        ]
      }),
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture({
        ticket_count: 3,
        pending_ticket_count: 2,
        waiting_ticket_count: 2,
        pending_notification_count: 1,
        failed_notification_count: 1,
        affected_run_count: 2,
        affected_workflow_count: 1,
        primary_blocker_kind: "pending_approval",
        blockers: [
          buildSensitiveAccessBlockerFixture({
            item_count: 2,
            affected_run_count: 2,
            affected_workflow_count: 1
          }),
          buildSensitiveAccessBlockerFixture({
            kind: "waiting_resume",
            item_count: 2,
            affected_run_count: 2,
            affected_workflow_count: 1
          }),
          buildSensitiveAccessBlockerFixture({
            kind: "failed_notification",
            item_count: 1
          }),
          buildSensitiveAccessBlockerFixture({
            kind: "pending_notification",
            tone: "degraded",
            item_count: 1
          })
        ]
      }),
      channels: [
        {
          channel: "slack",
          delivery_mode: "worker",
          target_kind: "http_url",
          configured: true,
          health_status: "degraded",
          summary: "slack webhook is timing out",
          target_hint: "provide a webhook URL",
          target_example: "https://hooks.slack.test/abc",
          health_reason: "recent dispatches timed out",
          config_facts: [],
          dispatch_summary: {
            pending_count: 1,
            delivered_count: 0,
            failed_count: 1,
            latest_dispatch_at: "2026-03-22T10:00:00Z",
            latest_delivered_at: null,
            latest_failure_at: "2026-03-22T10:02:00Z",
            latest_failure_error: "timeout",
            latest_failure_target: "ops-slack"
          }
        }
      ]
    });

    expect(digest.tone).toBe("blocked");
    expect(digest.primaryEntryKey).toBe("operatorInbox");
    expect(digest.entryOverrides?.operatorInbox?.href).toBe(
      "/sensitive-access?status=pending"
    );
    expect(digest.entryOverrides?.operatorInbox?.label).toBe("open inbox slice");
    expect(digest.primaryFollowUpEntry).toEqual({
      entryKey: "operatorInbox",
      entryOverride: {
        href: "/sensitive-access?status=pending",
        label: "open inbox slice"
      }
    });
    expect(digest.metrics).toContainEqual({
      label: "Approval",
      value: "2 pending / 2 waiting"
    });
    expect(digest.focusAreas.find((area) => area.id === "operator")).toMatchObject({
      entryKey: "operatorInbox",
      entryOverride: {
        href: "/sensitive-access?status=pending",
        label: "open inbox slice"
      }
    });
    expect(digest.focusAreas.find((area) => area.id === "operator")?.summary).toContain(
      "2 个审批待处理"
    );
    expect(digest.focusAreas.find((area) => area.id === "operator")?.summary).toContain(
      "影响 2 个 run / 1 个 workflow"
    );
    expect(digest.focusAreas.find((area) => area.id === "operator")?.nextStep).toContain(
      "审批票据"
    );
    expect(digest.headline).toContain("Approval & notification backlog");
    expect(digest.metrics).toContainEqual({
      label: "Impacted",
      value: "2 runs / 1 workflows"
    });
  });

  it("stays healthy when cross-entry recovery signals are already aligned", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: buildSandboxReadinessFixture({
        enabled_backend_count: 1,
        healthy_backend_count: 1,
        execution_classes: [buildSandboxExecutionClassReadinessFixture()]
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture(),
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture(),
      channels: []
    });

    expect(digest.tone).toBe("healthy");
    expect(digest.primaryEntryKey).toBe("workflowLibrary");
    expect(digest.headline).toContain("跨入口风险已收敛");
  });

  it("projects primary operator backlog to a focused trace slice when inbox entries carry run and node facts", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: buildSandboxReadinessFixture({
        enabled_backend_count: 1,
        healthy_backend_count: 1
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture(),
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture({
        ticket_count: 1,
        pending_ticket_count: 1,
        waiting_ticket_count: 1,
        affected_run_count: 1,
        affected_workflow_count: 1,
        primary_blocker_kind: "pending_approval",
        blockers: [
          buildSensitiveAccessBlockerFixture()
        ]
      }),
      channels: [],
      sensitiveAccessEntries: [buildFocusedBacklogEntry()]
    });

    expect(digest.primaryEntryKey).toBe("runLibrary");
    expect(digest.primaryFollowUpEntry).toEqual({
      entryKey: "runLibrary",
      entryOverride: {
        href: "/runs/run-focus?node_run_id=node-focus#run-diagnostics-execution-timeline",
        label: "jump to focused trace slice"
      }
    });
    expect(digest.entryOverrides?.operatorInbox).toEqual({
      href: "/sensitive-access?status=pending",
      label: "open inbox slice"
    });
    expect(digest.focusAreas.find((area) => area.id === "operator")).toMatchObject({
      entryKey: "runLibrary",
      entryOverride: {
        href: "/runs/run-focus?node_run_id=node-focus#run-diagnostics-execution-timeline",
        label: "jump to focused trace slice"
      }
    });
    expect(digest.focusAreas.find((area) => area.id === "operator")?.nextStep).toContain(
      "Prod secret"
    );
  });

  it("normalizes shared recommended action entry keys for cross-entry CTA overrides", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: buildSandboxReadinessFixture({
        offline_backend_count: 1,
        execution_classes: [
          buildSandboxExecutionClassReadinessFixture({
            available: false,
            backend_ids: [],
            supported_languages: [],
            supported_profiles: [],
            supported_dependency_modes: [],
            supports_tool_execution: false,
            supports_network_policy: false,
            supports_filesystem_policy: false,
            reason: "sandbox backend offline"
          })
        ],
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "open_workflow_library",
          label: "Open workflow library",
          href: "/workflows?execution=sandbox",
          entry_key: "workflowLibrary"
        }
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture(),
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture(),
      channels: []
    });

    expect(digest.primaryEntryKey).toBe("workflowLibrary");
    expect(digest.focusAreas.find((area) => area.id === "sandbox")).toMatchObject({
      entryKey: "workflowLibrary",
      entryOverride: {
        href: "/workflows?execution=sandbox",
        label: "Open workflow library"
      }
    });
    expect(digest.primaryFollowUpEntry).toEqual({
      entryKey: "workflowLibrary",
      entryOverride: {
        href: "/workflows?execution=sandbox",
        label: "Open workflow library"
      }
    });
    expect(digest.entryOverrides?.workflowLibrary).toEqual({
      href: "/workflows?execution=sandbox",
      label: "Open workflow library"
    });
  });

  it("keeps the shared CTA while exposing sampled sandbox and callback traces as secondary links", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: buildSandboxReadinessFixture({
        offline_backend_count: 1,
        execution_classes: [
          buildSandboxExecutionClassReadinessFixture({
            available: false,
            backend_ids: [],
            supported_languages: [],
            supported_profiles: [],
            supported_dependency_modes: [],
            supports_tool_execution: false,
            supports_network_policy: false,
            supports_filesystem_policy: false,
            reason: "sandbox backend offline"
          })
        ],
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "open_workflow_library",
          label: "Open workflow library",
          href: "/workflows?execution=sandbox",
          entry_key: "workflowLibrary"
        }
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture({
        status: "partial",
        detail: "waiting resume monitor is configured but cleanup is stale",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "cleanup has not finished recently",
        affected_run_count: 2,
        affected_workflow_count: 1,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "open_run_library",
          label: "Open run library",
          href: "/runs?focus=callback-waiting",
          entry_key: "runLibrary"
        }
      }),
      recentEvents: [
        buildRecentRunEventFixture({
          id: 31,
          run_id: "run-sandbox",
          node_run_id: "node-sandbox",
          event_type: "tool.execution.blocked",
          payload_preview: "sandbox blocked",
          payload_size: 22,
          created_at: "2026-03-24T13:10:00Z"
        }),
        buildRecentRunEventFixture({
          id: 32,
          run_id: "run-callback",
          node_run_id: "node-callback",
          event_type: "run.resume.requeued",
          payload_preview: "resume requeued",
          payload_size: 18,
          created_at: "2026-03-24T13:11:00Z"
        })
      ],
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture(),
      channels: []
    });

    expect(digest.focusAreas.find((area) => area.id === "sandbox")).toMatchObject({
      entryKey: "workflowLibrary",
      entryOverride: {
        href: "/workflows?execution=sandbox",
        label: "Open workflow library"
      },
      traceLink: {
        href: "/runs/run-sandbox?event_type=tool.execution.blocked&node_run_id=node-sandbox#run-diagnostics-execution-timeline",
        label: "open sampled sandbox trace"
      }
    });
    expect(digest.focusAreas.find((area) => area.id === "callback")).toMatchObject({
      entryKey: "runLibrary",
      entryOverride: {
        href: "/runs?focus=callback-waiting",
        label: "Open run library"
      },
      traceLink: {
        href: "/runs/run-callback?event_type=run.resume.requeued&node_run_id=node-callback#run-diagnostics-execution-timeline",
        label: "open sampled callback trace"
      }
    });
  });
});
