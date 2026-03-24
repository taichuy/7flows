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

vi.mock("next/navigation", () => ({
  usePathname: () => "/sensitive-access",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
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
      status: "configured",
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
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain(
      "强隔离执行链路当前可用，但仍有 1 个已启用 backend 处于 offline。"
    );
    expect(html).toContain("Sandbox execution chain");
    expect(html).toContain("approval / resume / notification 已经汇到同一条 operator inbox");
  });

  it("surfaces a canonical inbox next step when pending approvals remain", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      entries: [
        {
          ticket: {
            id: "ticket-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            access_request_id: "request-1",
            status: "pending",
            waiting_status: "waiting",
            created_at: "2026-03-23T00:00:00Z",
            decided_at: null,
            expires_at: null,
            approved_by: null
          },
          request: {
            id: "request-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            requester_type: "workflow",
            requester_id: "workflow-1",
            resource_id: "resource-1",
            action_type: "read",
            decision: "require_approval",
            decision_label: "require approval",
            reason_code: "approval_required",
            reason_label: "approval required",
            policy_summary: null,
            created_at: "2026-03-23T00:00:00Z",
            decided_at: null,
            purpose_text: null
          },
          resource: {
            id: "resource-1",
            label: "Sandbox secret",
            description: null,
            sensitivity_level: "L2",
            source: "workflow_context",
            metadata: {},
            created_at: "2026-03-23T00:00:00Z",
            updated_at: "2026-03-23T00:00:00Z"
          },
          notifications: [],
          runSnapshot: null,
          runFollowUp: null,
          callbackWaitingContext: null,
          executionContext: null
        }
      ],
      channels: [],
      resources: [],
      requests: [],
      notifications: [],
      summary: {
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
        failed_notification_count: 0
      }
    });
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open exact inbox slice");
    expect(html).toContain(
      '/sensitive-access?status=pending&amp;waiting_status=waiting&amp;run_id=run-1&amp;node_run_id=node-run-1&amp;access_request_id=request-1&amp;approval_ticket_id=ticket-1'
    );
  });

  it("surfaces workflow legacy auth handoff alongside the inbox backlog", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue({
      entries: [
        {
          ticket: {
            id: "ticket-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            access_request_id: "request-1",
            status: "pending",
            waiting_status: "waiting",
            created_at: "2026-03-24T08:00:00Z",
            decided_at: null,
            expires_at: null,
            approved_by: null
          },
          request: {
            id: "request-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            requester_type: "tool",
            requester_id: "native.search",
            resource_id: "resource-1",
            action_type: "invoke",
            decision: "require_approval",
            decision_label: "require approval",
            reason_code: "approval_required",
            reason_label: "approval required",
            policy_summary: null,
            created_at: "2026-03-24T08:00:00Z",
            decided_at: null,
            purpose_text: null
          },
          resource: {
            id: "resource-1",
            label: "Remote search capability",
            description: null,
            sensitivity_level: "L2",
            source: "local_capability",
            metadata: {},
            created_at: "2026-03-24T08:00:00Z",
            updated_at: "2026-03-24T08:00:00Z"
          },
          notifications: [],
          runSnapshot: {
            workflowId: "workflow-1",
            status: "waiting",
            currentNodeId: "tool-node",
            waitingReason: "waiting approval"
          },
          runFollowUp: null,
          legacyAuthGovernance: {
            generated_at: "2026-03-24T08:00:00Z",
            workflow_count: 1,
            binding_count: 2,
            summary: {
              draft_candidate_count: 1,
              published_blocker_count: 1,
              offline_inventory_count: 0
            },
            checklist: [
              {
                key: "draft_cleanup",
                title: "先批量下线 draft legacy bindings",
                tone: "ready",
                tone_label: "可立即执行",
                count: 1,
                detail: "先处理 draft cleanup。"
              },
              {
                key: "published_follow_up",
                title: "再补发支持鉴权的 replacement bindings",
                tone: "manual",
                tone_label: "人工跟进",
                count: 1,
                detail: "再处理 live legacy published blockers。"
              }
            ],
            workflows: [
              {
                workflow_id: "workflow-1",
                workflow_name: "Demo Workflow",
                binding_count: 2,
                draft_candidate_count: 1,
                published_blocker_count: 1,
                offline_inventory_count: 0
              }
            ],
            buckets: {
              draft_candidates: [],
              published_blockers: [],
              offline_inventory: []
            }
          },
          callbackWaitingContext: null,
          executionContext: null
        }
      ],
      channels: [],
      resources: [],
      requests: [],
      notifications: [],
      summary: {
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
        failed_notification_count: 0
      }
    });
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Legacy publish auth checklist 直接跟到 operator backlog");
    expect(html).toContain("Affected workflows");
    expect(html).toContain("先批量下线 draft legacy bindings");
    expect(html).toContain("再补发支持鉴权的 replacement bindings");
    expect(html).toContain("Demo Workflow");
    expect(html).toContain('href="/workflows/workflow-1"');
  });
});
