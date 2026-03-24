import { describe, expect, it } from "vitest";

import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

function buildFocusedBacklogEntry(): SensitiveAccessInboxEntry {
  return {
    ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-entry",
      node_run_id: "node-entry",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: null,
      created_at: "2026-03-22T10:00:00Z"
    },
    request: {
      id: "request-1",
      run_id: "run-entry",
      node_run_id: "node-entry",
      requester_type: "ai",
      requester_id: "agent-1",
      resource_id: "resource-prod-secret",
      action_type: "read",
      purpose_text: "read prod secret",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "sensitive_access",
      reason_label: "Sensitive access",
      policy_summary: "needs approval",
      created_at: "2026-03-22T09:59:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-prod-secret",
      label: "Prod secret",
      description: "production secret",
      sensitivity_level: "L3",
      source: "credential",
      metadata: {},
      created_at: "2026-03-22T09:00:00Z",
      updated_at: "2026-03-22T09:30:00Z"
    },
    notifications: [],
    callbackWaitingContext: null,
    executionContext: {
      runId: "run-focus",
      focusNode: {
        node_run_id: "node-focus",
        node_id: "approve-node",
        node_name: "Approval gate",
        node_type: "tool",
        callback_tickets: [],
        sensitive_access_entries: [],
        execution_fallback_count: 0,
        execution_blocked_count: 0,
        execution_unavailable_count: 0,
        artifact_refs: [],
        artifacts: [],
        tool_calls: []
      },
      focusReason: "current_node",
      focusExplanation: null,
      focusMatchesEntry: false,
      entryNodeRunId: "node-entry",
      skillTrace: null
    }
  };
}

describe("buildCrossEntryRiskDigest", () => {
  it("prioritizes operator inbox when approval backlog is still blocking resume", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: {
        enabled_backend_count: 2,
        healthy_backend_count: 1,
        degraded_backend_count: 0,
        offline_backend_count: 1,
        execution_classes: [
          {
            execution_class: "sandbox",
            available: true,
            backend_ids: ["sandbox-default"],
            supported_languages: ["python"],
            supported_profiles: ["default"],
            supported_dependency_modes: ["none"],
            supports_tool_execution: true,
            supports_builtin_package_sets: false,
            supports_backend_extensions: false,
            supports_network_policy: true,
            supports_filesystem_policy: true,
            reason: null
          },
          {
            execution_class: "microvm",
            available: false,
            backend_ids: [],
            supported_languages: [],
            supported_profiles: [],
            supported_dependency_modes: [],
            supports_tool_execution: false,
            supports_builtin_package_sets: false,
            supports_backend_extensions: false,
            supports_network_policy: false,
            supports_filesystem_policy: false,
            reason: "microvm backend offline"
          }
        ],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["none"],
        supports_tool_execution: true,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true
      },
      callbackWaitingAutomation: {
        status: "partial",
        scheduler_required: true,
        detail: "waiting resume monitor is configured but cleanup is stale",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "cleanup has not finished recently",
        steps: [
          {
            key: "waiting_resume_monitor",
            label: "Waiting resume monitor",
            task: "resume",
            source: "scheduler",
            enabled: true,
            interval_seconds: 30,
            detail: "monitor overdue waiting resumes",
            scheduler_health: {
              health_status: "healthy",
              detail: "healthy",
              last_status: "ok",
              last_started_at: "2026-03-22T10:00:00Z",
              last_finished_at: "2026-03-22T10:00:10Z",
              matched_count: 2,
              affected_count: 2
            }
          },
          {
            key: "callback_ticket_cleanup",
            label: "Callback ticket cleanup",
            task: "cleanup",
            source: "scheduler",
            enabled: true,
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
          }
        ]
      },
      sensitiveAccessSummary: {
        ticket_count: 3,
        pending_ticket_count: 2,
        approved_ticket_count: 0,
        rejected_ticket_count: 0,
        expired_ticket_count: 0,
        waiting_ticket_count: 2,
        resumed_ticket_count: 0,
        failed_ticket_count: 0,
        pending_notification_count: 1,
        delivered_notification_count: 0,
        failed_notification_count: 1,
        affected_run_count: 2,
        affected_workflow_count: 1,
        primary_blocker_kind: "pending_approval",
        blockers: [
          {
            kind: "pending_approval",
            tone: "blocked",
            item_count: 2,
            affected_run_count: 2,
            affected_workflow_count: 1
          },
          {
            kind: "waiting_resume",
            tone: "blocked",
            item_count: 2,
            affected_run_count: 2,
            affected_workflow_count: 1
          },
          {
            kind: "failed_notification",
            tone: "blocked",
            item_count: 1,
            affected_run_count: 1,
            affected_workflow_count: 1
          },
          {
            kind: "pending_notification",
            tone: "degraded",
            item_count: 1,
            affected_run_count: 1,
            affected_workflow_count: 1
          }
        ]
      },
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
      sandboxReadiness: {
        enabled_backend_count: 1,
        healthy_backend_count: 1,
        degraded_backend_count: 0,
        offline_backend_count: 0,
        execution_classes: [
          {
            execution_class: "sandbox",
            available: true,
            backend_ids: ["sandbox-default"],
            supported_languages: ["python"],
            supported_profiles: ["default"],
            supported_dependency_modes: ["none"],
            supports_tool_execution: true,
            supports_builtin_package_sets: false,
            supports_backend_extensions: false,
            supports_network_policy: true,
            supports_filesystem_policy: true,
            reason: null
          }
        ],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["none"],
        supports_tool_execution: true,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true
      },
      callbackWaitingAutomation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      },
      sensitiveAccessSummary: {
        ticket_count: 0,
        pending_ticket_count: 0,
        approved_ticket_count: 0,
        rejected_ticket_count: 0,
        expired_ticket_count: 0,
        waiting_ticket_count: 0,
        resumed_ticket_count: 0,
        failed_ticket_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0
      },
      channels: []
    });

    expect(digest.tone).toBe("healthy");
    expect(digest.primaryEntryKey).toBe("workflowLibrary");
    expect(digest.headline).toContain("跨入口风险已收敛");
  });

  it("projects primary operator backlog to a focused trace slice when inbox entries carry run and node facts", () => {
    const digest = buildCrossEntryRiskDigest({
      sandboxReadiness: {
        enabled_backend_count: 1,
        healthy_backend_count: 1,
        degraded_backend_count: 0,
        offline_backend_count: 0,
        execution_classes: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false
      },
      callbackWaitingAutomation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      },
      sensitiveAccessSummary: {
        ticket_count: 1,
        pending_ticket_count: 1,
        approved_ticket_count: 0,
        rejected_ticket_count: 0,
        expired_ticket_count: 0,
        waiting_ticket_count: 1,
        resumed_ticket_count: 0,
        failed_ticket_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0,
        affected_run_count: 1,
        affected_workflow_count: 1,
        primary_blocker_kind: "pending_approval",
        blockers: [
          {
            kind: "pending_approval",
            tone: "blocked",
            item_count: 1,
            affected_run_count: 1,
            affected_workflow_count: 1
          }
        ]
      },
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
      sandboxReadiness: {
        enabled_backend_count: 0,
        healthy_backend_count: 0,
        degraded_backend_count: 0,
        offline_backend_count: 1,
        execution_classes: [
          {
            execution_class: "sandbox",
            available: false,
            backend_ids: [],
            supported_languages: [],
            supported_profiles: [],
            supported_dependency_modes: [],
            supports_tool_execution: false,
            supports_builtin_package_sets: false,
            supports_backend_extensions: false,
            supports_network_policy: false,
            supports_filesystem_policy: false,
            reason: "sandbox backend offline"
          }
        ],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "open_workflow_library",
          label: "Open workflow library",
          href: "/workflows?execution=sandbox",
          entry_key: "workflowLibrary"
        }
      },
      callbackWaitingAutomation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      },
      sensitiveAccessSummary: {
        ticket_count: 0,
        pending_ticket_count: 0,
        approved_ticket_count: 0,
        rejected_ticket_count: 0,
        expired_ticket_count: 0,
        waiting_ticket_count: 0,
        resumed_ticket_count: 0,
        failed_ticket_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0,
        affected_run_count: 0,
        affected_workflow_count: 0,
        primary_blocker_kind: null,
        blockers: []
      },
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
});
