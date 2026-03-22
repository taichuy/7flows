import { describe, expect, it } from "vitest";

import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";

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
        failed_notification_count: 1
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
    expect(digest.metrics).toContainEqual({
      label: "Approval",
      value: "2 pending / 2 waiting"
    });
    expect(digest.focusAreas.find((area) => area.id === "operator")?.summary).toContain(
      "2 个审批待处理"
    );
    expect(digest.headline).toContain("Approval & notification backlog");
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
});
