import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CallbackWaitingAutomationPanel } from "@/components/callback-waiting-automation-panel";
import type {
  CallbackWaitingAutomationCheck,
  RecentRunEventCheck
} from "@/lib/get-system-overview";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "partial",
    scheduler_required: true,
    detail: "callback automation degraded",
    scheduler_health_status: "degraded",
    scheduler_health_detail: "waiting resume monitor degraded",
    affected_run_count: 3,
    affected_workflow_count: 2,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "open_run_library",
      label: "Open run library",
      href: "/runs?focus=callback-waiting",
      entry_key: "runLibrary"
    },
    steps: [
      {
        key: "resume-monitor",
        label: "Resume monitor",
        task: "requeue due resumes",
        source: "callback_resume_scheduler",
        enabled: true,
        interval_seconds: 30,
        detail: "scheduler is checking overdue callback resumes",
        scheduler_health: {
          health_status: "degraded",
          detail: "last run finished with stale queue state",
          last_status: "failed",
          last_started_at: "2026-03-21T10:00:00Z",
          last_finished_at: "2026-03-21T10:00:30Z",
          matched_count: 2,
          affected_count: 1
        }
      }
    ]
  };
}

function buildRecentEvents(): RecentRunEventCheck[] {
  return [
    {
      id: 1,
      run_id: "run-123",
      node_run_id: "node-run-1",
      event_type: "run.resume.requeued",
      payload_keys: ["resume_reason"],
      payload_preview: "resume queued",
      payload_size: 32,
      created_at: "2026-03-21T10:01:00Z"
    }
  ];
}

describe("CallbackWaitingAutomationPanel", () => {
  it("renders the shared operator next-step card and sampled trace link", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingAutomationPanel, {
        automation: buildAutomation(),
        recentEvents: buildRecentEvents()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("callback recovery");
    expect(html).toContain("Open run library");
    expect(html).toContain("open sampled callback trace");
    expect(html).not.toContain("Primary governed resource");
  });
});
