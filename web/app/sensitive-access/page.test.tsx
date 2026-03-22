import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import SensitiveAccessInboxPage from "@/app/sensitive-access/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

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
      status: "healthy",
      scheduler_required: true,
      detail: "healthy",
      scheduler_health_status: "healthy",
      scheduler_health_detail: "healthy",
      steps: []
    }
  };
}

describe("SensitiveAccessInboxPage", () => {
  it("surfaces live sandbox readiness before the inbox list", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      entries: [],
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
      }
    });
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("审批、恢复与通知派发统一收口");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain(
      "强隔离执行链路当前可用，但仍有 1 个已启用 backend 处于 offline。"
    );
    expect(html).toContain("approval / resume / notification 已经汇到同一条 operator inbox");
  });
});
