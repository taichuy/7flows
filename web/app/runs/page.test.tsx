import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import RunsPage from "@/app/runs/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
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

describe("RunsPage", () => {
  it("renders recent run links and operator follow-up entry", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue({
      status: "ok",
      environment: "local",
      services: [],
      capabilities: [],
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
      callback_waiting_automation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      },
      runtime_activity: {
        summary: {
          recent_run_count: 2,
          recent_event_count: 5,
          run_statuses: {
            completed: 1,
            waiting_callback: 1
          },
          event_types: {
            node_completed: 2,
            callback_waiting: 1
          }
        },
        recent_runs: [
          {
            id: "run-1",
            workflow_id: "workflow-1",
            workflow_version: "1.0.0",
            status: "waiting_callback",
            created_at: "2026-03-22T08:00:00Z",
            finished_at: null,
            event_count: 3
          },
          {
            id: "run-2",
            workflow_id: "workflow-2",
            workflow_version: "2.0.0",
            status: "completed",
            created_at: "2026-03-22T07:00:00Z",
            finished_at: "2026-03-22T07:30:00Z",
            event_count: 2
          }
        ],
        recent_events: []
      }
    });
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      ...buildSensitiveAccessInboxSnapshot(),
      summary: {
        ...buildSensitiveAccessInboxSnapshot().summary,
        ticket_count: 1,
        pending_ticket_count: 1,
        waiting_ticket_count: 1
      }
    });

    const html = renderToStaticMarkup(await RunsPage());

    expect(html).toContain("运行诊断入口收口到独立列表");
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain('/runs/run-1');
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain("回到 workflow 编辑器");
    expect(html).toContain('/sensitive-access');
    expect(html).toContain("打开待处理 inbox");
    expect(html).toContain("callback_waiting · 1");
    expect(html).toContain("completed:1 / waiting_callback:1");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前还没有任何强隔离 execution class ready。");
  });

  it("shows a workflow fallback when there are no recent runs", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue({
      status: "ok",
      environment: "local",
      services: [],
      capabilities: [],
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
      callback_waiting_automation: {
        status: "configured",
        scheduler_required: true,
        detail: "healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "healthy",
        steps: []
      },
      runtime_activity: {
        summary: {
          recent_run_count: 0,
          recent_event_count: 0,
          run_statuses: {},
          event_types: {}
        },
        recent_runs: [],
        recent_events: []
      }
    });
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );

    const html = renderToStaticMarkup(await RunsPage());

    expect(html).toContain("当前还没有历史 run");
    expect(html).toContain('/workflows');
  });
});
