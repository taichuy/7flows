import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows } from "@/lib/get-workflows";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

function buildSensitiveAccessInboxSnapshot() {
  return {
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
  } as Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>;
}

function buildSystemOverview() {
  return {
    status: "ok",
    environment: "local",
    services: [],
    capabilities: [],
    plugin_adapters: [],
    sandbox_backends: [],
    sandbox_readiness: {
      enabled_backend_count: 1,
      healthy_backend_count: 0,
      degraded_backend_count: 1,
      offline_backend_count: 0,
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
          reason: "sandbox-default healthcheck is still degraded."
        }
      ],
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
  };
}

describe("WorkflowsPage", () => {
  it("renders workflow chips and governance summary", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-1",
        name: "Alpha workflow",
        version: "1.0.0",
        status: "draft",
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: ["tool-1", "tool-2"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 2,
          strong_isolation_tool_count: 1
        }
      },
      {
        id: "workflow-2",
        name: "Beta workflow",
        version: "2.0.0",
        status: "published",
        node_count: 3,
        tool_governance: {
          referenced_tool_ids: ["tool-3"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("作者、operator 与运行入口统一收口");
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain('/workflows/new');
    expect(html).toContain('/workspace-starters');
    expect(html).toContain('/runs');
    expect(html).toContain('/sensitive-access');
    expect(html).toContain("draft:1 / published:1");
    expect(html).toContain("Alpha workflow · missing tools");
    expect(html).toContain("Sandbox execution chain");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("强隔离路径会按 execution class fail-closed：sandbox 当前 blocked。");
  });

  it("shows a create entry when no workflows exist", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("当前还没有可编辑的 workflow");
    expect(html).toContain('/workflows/new');
    expect(html).toContain("没有缺失 catalog tool");
  });
});
