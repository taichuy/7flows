import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { getCredentialActivity, getCredentials } from "@/lib/get-credentials";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import {
  buildSensitiveAccessExecutionContextFixture,
  buildSensitiveAccessExecutionFocusNodeFixture,
  buildSensitiveAccessInboxEntryFixture,
  buildSensitiveAccessInboxSnapshotFixture,
  buildSensitiveAccessRequestFixture,
  buildSensitiveAccessResourceFixture,
  buildSensitiveAccessTicketFixture,
  buildSystemOverviewFixture
} from "@/lib/workbench-page-test-fixtures";

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
  getCredentialActivity: vi.fn(),
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

function buildPluginRegistrySnapshot(
  overrides: Partial<Awaited<ReturnType<typeof getPluginRegistrySnapshot>>> = {}
) {
  return {
    adapters: [],
    tools: [],
    ...overrides
  } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>;
}

function buildHomeSystemOverview(
  overrides: Parameters<typeof buildSystemOverviewFixture>[0] = {}
) {
  const defaultRuntimeActivity = {
    summary: {
      recent_run_count: 1,
      recent_event_count: 1,
      run_statuses: {
        waiting_callback: 1
      },
      event_types: {
        callback_waiting: 1
      }
    },
    recent_runs: [
      {
        id: "run-home-1",
        workflow_id: "workflow-home-1",
        workflow_version: "1.0.0",
        status: "waiting_callback",
        created_at: "2026-03-22T08:00:00Z",
        finished_at: null,
        event_count: 1
      }
    ],
    recent_events: [
      {
        id: 7,
        run_id: "run-home-1",
        node_run_id: "node-home-1",
        event_type: "callback_waiting",
        payload_keys: ["reason"],
        payload_preview: "callback pending",
        payload_size: 32,
        created_at: "2026-03-22T08:01:00Z"
      }
    ]
  };
  const runtimeActivityOverrides = overrides.runtime_activity;

  return buildSystemOverviewFixture({
    capabilities: ["frontend-shell-ready"],
    ...overrides,
    runtime_activity: {
      ...defaultRuntimeActivity,
      ...runtimeActivityOverrides,
      summary: {
        ...defaultRuntimeActivity.summary,
        ...runtimeActivityOverrides?.summary
      },
      recent_runs: runtimeActivityOverrides?.recent_runs ?? defaultRuntimeActivity.recent_runs,
      recent_events:
        runtimeActivityOverrides?.recent_events ?? defaultRuntimeActivity.recent_events
    }
  });
}

describe("HomePage", () => {
  it("shows the shared create entry when no workflows exist", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildHomeSystemOverview());
    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue(buildPluginRegistrySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getCredentialActivity).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

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
    vi.mocked(getSystemOverview).mockResolvedValue(buildHomeSystemOverview());
    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue(buildPluginRegistrySnapshot());
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
    vi.mocked(getCredentialActivity).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('href="/workflows/workflow%20alpha%2Fbeta"');
  });

  it("surfaces workflow catalog-gap handoff on homepage recent runs", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildHomeSystemOverview({
        runtime_activity: {
          summary: {
            recent_run_count: 1,
            recent_event_count: 0,
            run_statuses: {
              waiting_callback: 1
            },
            event_types: {}
          },
          recent_runs: [
            {
              id: "run-home-gap-1",
              workflow_id: "workflow-home-gap-1",
              workflow_name: "Homepage Catalog Gap Workflow",
              workflow_version: "1.0.0",
              status: "waiting_callback",
              created_at: "2026-03-22T08:00:00Z",
              finished_at: null,
              event_count: 1,
              tool_governance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              }
            }
          ],
          recent_events: []
        }
      })
    );
    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue(buildPluginRegistrySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getCredentialActivity).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Homepage Catalog Gap Workflow");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前 workflow 仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
    );
    expect(html).toContain('/workflows/workflow-home-gap-1?definition_issue=missing_tool');
  });

  it("surfaces a shared cross-entry risk digest before separate operator panels", async () => {
    const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

    vi.mocked(getSystemOverview).mockResolvedValue(
      buildHomeSystemOverview({
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
        callback_waiting_automation: {
          status: "partial",
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
      })
    );
    vi.mocked(getPluginRegistrySnapshot).mockResolvedValue(buildPluginRegistrySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue([]);
    vi.mocked(getCredentialActivity).mockResolvedValue([]);
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
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
        summary: {
          ticket_count: 2,
          pending_ticket_count: 2,
          waiting_ticket_count: 1,
          pending_notification_count: 1,
          failed_notification_count: 1,
          primary_resource: buildSensitiveAccessResourceFixture({
            id: "resource-home-secret",
            label: "Home secret",
            sensitivity_level: "L3",
            source: "credential",
            credential_governance: {
              credential_id: "credential-home-secret",
              credential_name: "Home secret",
              credential_type: "api_key",
              credential_status: "active",
              sensitivity_level: "L3",
              sensitive_resource_id: "resource-home-secret",
              sensitive_resource_label: "Home secret",
              credential_ref: "cred://home/secret",
              summary: "Home secret · L3 治理 · 生效中"
            }
          })
        },
        entries: [
          buildSensitiveAccessInboxEntryFixture({
            ticket: buildSensitiveAccessTicketFixture({
              id: "ticket-home-1",
              access_request_id: "request-home-1",
              run_id: "run-home-entry",
              node_run_id: "node-home-entry",
              created_at: "2026-03-22T10:00:00Z"
            }),
            request: buildSensitiveAccessRequestFixture({
              id: "request-home-1",
              run_id: "run-home-entry",
              node_run_id: "node-home-entry",
              requester_type: "ai",
              requester_id: "agent-home",
              resource_id: "resource-home-secret",
              created_at: "2026-03-22T09:59:00Z"
            }),
            resource: buildSensitiveAccessResourceFixture({
              id: "resource-home-secret",
              label: "Home secret",
              sensitivity_level: "L3",
              source: "credential",
              credential_governance: {
                credential_id: "credential-home-secret",
                credential_name: "Home secret",
                credential_type: "api_key",
                credential_status: "active",
                sensitivity_level: "L3",
                sensitive_resource_id: "resource-home-secret",
                sensitive_resource_label: "Home secret",
                credential_ref: "cred://home/secret",
                summary: "Home secret · L3 治理 · 生效中"
              },
              created_at: "2026-03-22T09:00:00Z",
              updated_at: "2026-03-22T09:30:00Z"
            }),
            executionContext: buildSensitiveAccessExecutionContextFixture({
              runId: "run-home-focus",
              focusNode: buildSensitiveAccessExecutionFocusNodeFixture({
                node_run_id: "node-home-focus",
                node_id: "home-approval-node",
                node_name: "Home Approval"
              }),
              focusMatchesEntry: false,
              entryNodeRunId: "node-home-entry"
            })
          })
        ]
      })
    );

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
    expect(html).toContain("Primary governed resource");
    expect(html).toContain("当前最该追踪的治理资源：Home secret · L3 治理 · 生效中。");
    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("当前 Home secret · L3 治理 · 生效中 的审批票据仍是 operator backlog 首要阻断");
    expect(html).toContain(
      '/runs/run-home-1?event_type=callback_waiting&amp;node_run_id=node-home-1#run-diagnostics-execution-timeline'
    );
    expect(html).toContain("callback pending");
  });
});
