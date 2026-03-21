import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { getCredentials } from "@/lib/get-credentials";
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
        status: "healthy",
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
        status: "healthy",
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
});
