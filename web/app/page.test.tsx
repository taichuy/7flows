import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { getCredentials } from "@/lib/get-credentials";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-automation-panel", () => ({
  CallbackWaitingAutomationPanel: () => createElement("div", { "data-component": "callback-waiting" })
}));

vi.mock("@/components/credential-store-panel", () => ({
  CredentialStorePanel: () => createElement("div", { "data-component": "credential-store" })
}));

vi.mock("@/components/plugin-registry-panel", () => ({
  PluginRegistryPanel: () => createElement("div", { "data-component": "plugin-registry" })
}));

vi.mock("@/components/sandbox-readiness-panel", () => ({
  SandboxReadinessPanel: () => createElement("div", { "data-component": "sandbox-readiness" })
}));

vi.mock("@/components/status-card", () => ({
  StatusCard: () => createElement("div", { "data-component": "status-card" })
}));

vi.mock("@/components/workflow-chip-link", () => ({
  WorkflowChipLink: ({ href }: { href?: string }) =>
    createElement("a", { href: href ?? "#", "data-component": "workflow-chip" })
}));

vi.mock("@/components/workflow-tool-binding-panel", () => ({
  WorkflowToolBindingPanel: () => createElement("div", { "data-component": "workflow-tool-binding" })
}));

vi.mock("@/lib/get-credentials", () => ({
  getCredentials: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflowDetail: vi.fn(),
  getWorkflows: vi.fn()
}));

describe("HomePage", () => {
  it("shows the shared create entry when no workflows exist", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue({
      status: "ok",
      environment: "local",
      services: [],
      capabilities: ["frontend-shell-ready"],
      plugin_adapters: [],
      sandbox_backends: [],
      sandbox_readiness: {
        enabled_backend_count: 0,
        healthy_backend_count: 0,
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
      plugin_tools: [],
      runtime_activity: {
        summary: {
          recent_run_count: 0,
          recent_event_count: 0,
          run_statuses: {},
          event_types: {}
        },
        recent_runs: [],
        recent_events: []
      },
      callback_waiting_automation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      }
    } as Awaited<ReturnType<typeof getSystemOverview>>);

    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
      adapters: [],
      tools: []
    } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);

    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      channels: [],
      resources: [],
      requests: [],
      notifications: [],
      summary: {
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
      entries: []
    } as Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>);

    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("当前还没有可编辑的 workflow");
    expect(html).toContain("进入新建向导");
    expect(html).toContain('/workflows/new');
    expect(html).toContain('/workflows');
    expect(html).toContain('/runs');
    expect(html).toContain('/sensitive-access');
  });

  it("reuses the shared workflow detail contract in editor chips", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue({
      status: "ok",
      environment: "local",
      services: [],
      capabilities: ["frontend-shell-ready"],
      plugin_adapters: [],
      sandbox_backends: [],
      sandbox_readiness: {
        enabled_backend_count: 0,
        healthy_backend_count: 0,
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
      plugin_tools: [],
      runtime_activity: {
        summary: {
          recent_run_count: 0,
          recent_event_count: 0,
          run_statuses: {},
          event_types: {}
        },
        recent_runs: [],
        recent_events: []
      },
      callback_waiting_automation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      }
    } as Awaited<ReturnType<typeof getSystemOverview>>);

    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
      adapters: [],
      tools: []
    } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);

    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "  workflow alpha/beta  ",
        name: "Alpha workflow",
        version: "0.1.0",
        status: "draft",
        node_count: 1,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      }
    ]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      channels: [],
      resources: [],
      requests: [],
      notifications: [],
      summary: {
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
      entries: []
    } as Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>);

    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('href="/workflows/workflow%20alpha%2Fbeta"');
  });

  it("surfaces a shared cross-entry risk digest before separate operator panels", async () => {
    const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

    vi.mocked(getSystemOverview).mockResolvedValue({
      status: "ok",
      environment: "local",
      services: [],
      capabilities: ["frontend-shell-ready"],
      plugin_adapters: [],
      sandbox_backends: [],
      sandbox_readiness: {
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
      plugin_tools: [],
      runtime_activity: {
        summary: {
          recent_run_count: 0,
          recent_event_count: 0,
          run_statuses: {},
          event_types: {}
        },
        recent_runs: [],
        recent_events: []
      },
      callback_waiting_automation: {
        status: "partial",
        scheduler_required: true,
        detail: "cleanup is stale",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "cleanup has not finished recently",
        steps: [
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
              last_started_at: null,
              last_finished_at: null,
              matched_count: 0,
              affected_count: 0
            }
          }
        ]
      }
    } as Awaited<ReturnType<typeof getSystemOverview>>);

    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
      adapters: [],
      tools: []
    } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);

    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
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
            latest_dispatch_at: null,
            latest_delivered_at: null,
            latest_failure_at: null,
            latest_failure_error: null,
            latest_failure_target: null
          }
        }
      ],
      resources: [],
      requests: [],
      notifications: [],
      summary: {
        ticket_count: 2,
        pending_ticket_count: 2,
        approved_ticket_count: 0,
        rejected_ticket_count: 0,
        expired_ticket_count: 0,
        waiting_ticket_count: 1,
        resumed_ticket_count: 0,
        failed_ticket_count: 0,
        pending_notification_count: 1,
        delivered_notification_count: 0,
        failed_notification_count: 1
      },
      entries: [
        {
          ticket: {
            id: "ticket-home-1",
            access_request_id: "request-home-1",
            run_id: "run-home-entry",
            node_run_id: "node-home-entry",
            status: "pending",
            waiting_status: "waiting",
            created_at: "2026-03-22T10:00:00Z"
          },
          request: {
            id: "request-home-1",
            run_id: "run-home-entry",
            node_run_id: "node-home-entry",
            requester_type: "ai",
            requester_id: "agent-home",
            resource_id: "resource-home-secret",
            action_type: "read",
            created_at: "2026-03-22T09:59:00Z"
          },
          resource: {
            id: "resource-home-secret",
            label: "Home secret",
            sensitivity_level: "L3",
            source: "credential",
            metadata: {},
            created_at: "2026-03-22T09:00:00Z",
            updated_at: "2026-03-22T09:30:00Z"
          },
          notifications: [],
          callbackWaitingContext: null,
          executionContext: {
            runId: "run-home-focus",
            focusNode: {
              node_run_id: "node-home-focus",
              node_id: "home-approval-node",
              node_name: "Home Approval",
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
            entryNodeRunId: "node-home-entry",
            skillTrace: null
          }
        }
      ]
    } as Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>);

    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain("jump to focused trace slice");
    expect(html).toContain(
      '/runs/run-home-focus?node_run_id=node-home-focus#run-diagnostics-execution-timeline'
    );
    expect(html).toContain('/sensitive-access?status=pending');
    expect(html).toContain(operatorSurfaceCopy.openInboxSliceLabel);
    expect(html).toContain("Approval &amp; notification backlog");
    expect(html).toContain("2 pending / 1 waiting");
  });
});
